import { Router } from 'express';
import crypto from 'node:crypto';
import {
  createId,
  createNotification,
  db,
  writeAuditLog,
} from '../db/database.ts';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.ts';
import { screenCandidatesForJob } from './coreRoutes.ts';
import {
  evaluateInterviewTranscript,
  generateInterviewPlan,
  runAiraAssistantReply,
  runInterviewOrchestratorTurn,
} from '../services/llmAdapter.ts';
import {
  getTelephonyStatus,
  placeOutboundCall,
  verifyTwilioSignature,
} from '../services/adapters/telephonyAdapter.ts';
import {
  AIRA_VOICE_OPTIONS,
  getVoiceIntegrationStatus,
  synthesizeNeuralSpeech,
} from '../services/adapters/voiceAdapters.ts';
import {
  buildLevel2InvitationTemplate,
  sendEmailMessage,
} from '../services/adapters/emailAdapter.ts';
import { buildInterviewPdfBuffer } from '../services/pdfReportService.ts';
import { syncCandidatesToExcel } from '../services/excelService.ts';
import {
  canTransitionStatus,
  InterviewStage,
} from '../../src/lib/recruitmentRules.ts';

export const interviewRouter = Router();

// --- CAMPAIGNS ---
interviewRouter.get('/campaigns', requireAuth, (_req, res) => {
  const campaigns = db
    .prepare(
      `SELECT camp.*, j.title as job_title,
        (SELECT COUNT(*) FROM interviews i WHERE i.campaign_id = camp.id) as interview_count,
        (SELECT COUNT(*) FROM interviews i WHERE i.campaign_id = camp.id AND i.status = 'completed') as completed_count
       FROM campaigns camp
       JOIN jobs j ON j.id = camp.job_id
       ORDER BY camp.created_at DESC`
    )
    .all();
  res.json({ campaigns, telephony: getTelephonyStatus() });
});

interviewRouter.post('/campaigns/start', requireAuth, async (req: AuthenticatedRequest, res) => {
  const b = req.body as Record<string, unknown>;
  const jobId = String(b.jobId || '').trim();
  const name = String(b.name || '').trim() || 'Screening & Interview Campaign';
  const mode = String(b.mode || 'web_and_phone');
  const threshold = Number(b.threshold || 70);
  const callingStart = Number(b.callingWindowStart ?? 9);
  const callingEnd = Number(b.callingWindowEnd ?? 21);
  const maxConcurrency = Math.max(1, Math.min(10, Number(b.maxConcurrency ?? 2)));
  const maxRetries = Math.max(0, Math.min(5, Number(b.maxRetries ?? 2)));
  const retryDelayHours = Math.max(1, Number(b.retryDelayHours ?? 4));
  const candidateIds = Array.isArray(b.candidateIds) ? (b.candidateIds as string[]) : null;

  if (!jobId) {
    res.status(400).json({ error: 'Please select a Job Description to authorize the campaign.' });
    return;
  }

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as Record<string, unknown> | undefined;
  if (!job) {
    res.status(404).json({ error: 'Job Description not found.' });
    return;
  }

  const campaignId = createId('camp');
  db.prepare(
    `INSERT INTO campaigns (
      id, company_id, job_id, name, threshold, mode, calling_window_start,
      calling_window_end, max_concurrency, max_retries, retry_delay_hours, authorized_by, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
  ).run(
    campaignId,
    req.user!.companyId,
    jobId,
    name,
    threshold,
    mode,
    callingStart,
    callingEnd,
    maxConcurrency,
    maxRetries,
    retryDelayHours,
    req.user!.id
  );

  // Step 1: Run automated screening for target candidates
  const screened = await screenCandidatesForJob(
    jobId,
    candidateIds,
    threshold,
    req.user!.id,
    req.user!.companyId
  );

  const shortlisted = screened.filter((s) => s.shortlisted);
  const reqSkills = JSON.parse(String(job.required_skills || '[]')) as string[];
  const createdInterviews: Array<Record<string, unknown>> = [];

  const plans = await Promise.all(
    shortlisted.map((cand) => {
      const candId = String(cand.candidateId);
      const candRow = db.prepare('SELECT * FROM candidates WHERE id = ?').get(candId) as Record<string, unknown>;
      const skillRows = db
        .prepare('SELECT skill_name FROM candidate_skills WHERE candidate_id = ?')
        .all(candId) as Array<{ skill_name: string }>;
      return generateInterviewPlan({
        jobTitle: String(job.title),
        jobDescription: String(job.description),
        requiredSkills: reqSkills,
        candidateName: String(candRow.name),
        candidateSkills: skillRows.map((s) => s.skill_name),
        experience: String(candRow.experience || ''),
      });
    })
  );

  for (let i = 0; i < shortlisted.length; i++) {
    const cand = shortlisted[i];
    const candId = String(cand.candidateId);
    const candRow = db.prepare('SELECT * FROM candidates WHERE id = ?').get(candId) as Record<string, unknown>;
    const plan = plans[i];

    const interviewId = createId('int');
    const accessToken = crypto.randomBytes(18).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    db.prepare(
      `INSERT INTO interviews (
        id, campaign_id, candidate_id, job_id, mode, access_token, token_expires_at,
        plan_json, current_stage, status, language
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'introduction', 'scheduled', 'en-IN')`
    ).run(interviewId, campaignId, candId, jobId, mode, accessToken, expiresAt, JSON.stringify(plan));

    const insQ = db.prepare(
      `INSERT INTO interview_questions (id, interview_id, stage, question_text, order_index) VALUES (?, ?, ?, ?, ?)`
    );
    plan.forEach((p, idx) => {
      insQ.run(createId('iq'), interviewId, p.stage, p.seedQuestion, idx);
    });

    // Update candidate status -> Level 1 Scheduled
    const prevStatus = String(candRow.status);
    db.prepare(`UPDATE candidates SET status = 'Level 1 Scheduled', updated_at = datetime('now') WHERE id = ?`).run(candId);
    db.prepare(
      `INSERT INTO candidate_status_history (id, candidate_id, from_status, to_status, reason, changed_by) VALUES (?, ?, ?, 'Level 1 Scheduled', ?, ?)`
    ).run(createId('hist'), candId, prevStatus, `Queued in campaign ${name}`, req.user!.id);

    // Queue outbound call if mode includes phone and phone number exists
    let callResult: Record<string, unknown> | null = null;
    if ((mode === 'phone' || mode === 'web_and_phone') && String(candRow.phone || '').trim()) {
      const callId = createId('call');
      const activeCalls = (
        db.prepare(`SELECT COUNT(*) as c FROM calls WHERE status IN ('ringing', 'answered')`).get() as { c: number }
      ).c;

      const placement = await placeOutboundCall({
        callId,
        interviewId,
        toNumber: String(candRow.phone),
        candidateName: String(candRow.name),
        callingStartHour: callingStart,
        callingEndHour: callingEnd,
        activeCallCount: activeCalls,
        maxConcurrency,
        appliedVerified: Boolean(candRow.applied_verified),
        campaignAuthorized: true,
      });

      db.prepare(
        `INSERT INTO calls (
          id, interview_id, candidate_id, provider, provider_call_sid, to_number, status, attempt_number, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
      ).run(
        callId,
        interviewId,
        candId,
        getTelephonyStatus().provider,
        placement.providerCallSid ?? null,
        String(candRow.phone),
        placement.status,
        placement.error ?? null
      );
      callResult = { callId, ...placement };
    }

    createdInterviews.push({
      interviewId,
      candidateId: candId,
      candidateName: candRow.name,
      accessToken,
      webInterviewUrl: `/interview/web/${accessToken}`,
      callResult,
    });
  }

  await syncCandidatesToExcel();
  createNotification(
    req.user!.companyId,
    'campaign_started',
    `Campaign started: ${name}`,
    `Screened ${screened.length} candidate(s); ${shortlisted.length} shortlisted & queued for Level 1 interviews.`,
    '/interviews'
  );
  writeAuditLog(req.user!.id, 'campaign_started', 'campaign', campaignId, {
    jobId,
    shortlisted: shortlisted.length,
  });

  res.status(201).json({
    campaignId,
    screenedCount: screened.length,
    shortlistedCount: shortlisted.length,
    interviews: createdInterviews,
  });
});

// --- INTERVIEWS ---
interviewRouter.get('/interviews', requireAuth, (_req, res) => {
  const interviews = db
    .prepare(
      `SELECT i.*, c.name as candidate_name, c.email as candidate_email, c.phone as candidate_phone,
              j.title as job_title, ie.overall_score, ie.recommendation,
              (SELECT status FROM calls cl WHERE cl.interview_id = i.id ORDER BY cl.created_at DESC LIMIT 1) as latest_call_status,
              (SELECT error_message FROM calls cl WHERE cl.interview_id = i.id ORDER BY cl.created_at DESC LIMIT 1) as latest_call_error,
              (SELECT attempt_number FROM calls cl WHERE cl.interview_id = i.id ORDER BY cl.created_at DESC LIMIT 1) as call_attempts
       FROM interviews i
       JOIN candidates c ON c.id = i.candidate_id
       JOIN jobs j ON j.id = i.job_id
       LEFT JOIN interview_evaluations ie ON ie.interview_id = i.id
       ORDER BY i.created_at DESC`
    )
    .all();

  res.json({ interviews, telephony: getTelephonyStatus() });
});

interviewRouter.get('/interviews/:id', requireAuth, (req, res) => {
  const interview = db
    .prepare(
      `SELECT i.*, c.name as candidate_name, c.email as candidate_email, c.phone as candidate_phone,
              c.qualifications, c.experience, c.notes as recruiter_notes, c.status as candidate_status,
              j.title as job_title, j.rubric_json
       FROM interviews i
       JOIN candidates c ON c.id = i.candidate_id
       JOIN jobs j ON j.id = i.job_id
       WHERE i.id = ?`
    )
    .get(req.params.id) as Record<string, unknown> | undefined;

  if (!interview) {
    res.status(404).json({ error: 'Interview not found.' });
    return;
  }

  const transcript = db
    .prepare('SELECT * FROM interview_responses WHERE interview_id = ? ORDER BY timestamp ASC, rowid ASC')
    .all(req.params.id);
  const evaluation = db
    .prepare('SELECT * FROM interview_evaluations WHERE interview_id = ?')
    .get(req.params.id) as Record<string, unknown> | undefined;
  const calls = db
    .prepare('SELECT * FROM calls WHERE interview_id = ? ORDER BY created_at DESC')
    .all(req.params.id);
  const consent = db
    .prepare('SELECT * FROM consent_records WHERE interview_id = ? ORDER BY recorded_at DESC LIMIT 1')
    .get(req.params.id);

  res.json({
    interview: {
      ...interview,
      plan: JSON.parse(String(interview.plan_json || '[]')),
    },
    transcript,
    evaluation: evaluation
      ? {
          ...evaluation,
          rubricScores: JSON.parse(String(evaluation.rubric_scores || '[]')),
          strengths: JSON.parse(String(evaluation.strengths || '[]')),
          clarifications: JSON.parse(String(evaluation.clarifications || '[]')),
          followUpQuestions: JSON.parse(String(evaluation.follow_up_questions || '[]')),
          validationPassed: Boolean(evaluation.validation_passed),
        }
      : null,
    calls,
    consent,
  });
});

interviewRouter.put('/interviews/:id/plan', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!Array.isArray(req.body?.plan)) {
    res.status(400).json({ error: 'Plan must be an array of interview stages.' });
    return;
  }
  db.prepare('UPDATE interviews SET plan_json = ? WHERE id = ?').run(
    JSON.stringify(req.body.plan),
    req.params.id
  );
  writeAuditLog(req.user!.id, 'interview_plan_updated', 'interview', req.params.id);
  res.json({ ok: true });
});

interviewRouter.post('/interviews/:id/retry-call', requireAuth, async (req: AuthenticatedRequest, res) => {
  const interview = db
    .prepare(
      `SELECT i.*, c.name as candidate_name, c.phone as candidate_phone, c.applied_verified,
              camp.calling_window_start, camp.calling_window_end, camp.max_concurrency, camp.max_retries
       FROM interviews i
       JOIN candidates c ON c.id = i.candidate_id
       LEFT JOIN campaigns camp ON camp.id = i.campaign_id
       WHERE i.id = ?`
    )
    .get(req.params.id) as Record<string, unknown> | undefined;

  if (!interview) {
    res.status(404).json({ error: 'Interview not found.' });
    return;
  }

  const prevAttempts = (
    db.prepare('SELECT COUNT(*) as c FROM calls WHERE interview_id = ?').get(req.params.id) as { c: number }
  ).c;
  const maxRetries = Number(interview.max_retries ?? 2);
  if (prevAttempts > maxRetries) {
    res.status(400).json({
      error: `Retry limit reached (${maxRetries} retries maximum). Use the Web Interview link as an alternative.`,
    });
    return;
  }

  const phone = String(interview.candidate_phone || '').trim();
  if (!phone) {
    res.status(400).json({ error: 'Candidate has no phone number on record.' });
    return;
  }

  const callId = createId('call');
  const activeCalls = (
    db.prepare(`SELECT COUNT(*) as c FROM calls WHERE status IN ('ringing', 'answered')`).get() as { c: number }
  ).c;

  const placement = await placeOutboundCall({
    callId,
    interviewId: String(interview.id),
    toNumber: phone,
    candidateName: String(interview.candidate_name),
    callingStartHour: Number(interview.calling_window_start ?? 9),
    callingEndHour: Number(interview.calling_window_end ?? 21),
    activeCallCount: activeCalls,
    maxConcurrency: Number(interview.max_concurrency ?? 2),
    appliedVerified: Boolean(interview.applied_verified),
    campaignAuthorized: true,
  });

  db.prepare(
    `INSERT INTO calls (
      id, interview_id, candidate_id, provider, provider_call_sid, to_number, status, attempt_number, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    callId,
    interview.id,
    interview.candidate_id,
    getTelephonyStatus().provider,
    placement.providerCallSid ?? null,
    phone,
    placement.status,
    prevAttempts + 1,
    placement.error ?? null
  );

  writeAuditLog(req.user!.id, 'call_retried', 'interview', String(interview.id), {
    attempt: prevAttempts + 1,
    status: placement.status,
  });

  res.json({ callId, ...placement });
});

interviewRouter.get('/interviews/:id/pdf', requireAuth, async (req, res) => {
  const interview = db
    .prepare(
      `SELECT i.*, c.name as candidate_name, c.email as candidate_email, c.phone as candidate_phone,
              c.qualifications, c.experience, c.notes as recruiter_notes, j.title as job_title
       FROM interviews i
       JOIN candidates c ON c.id = i.candidate_id
       JOIN jobs j ON j.id = i.job_id
       WHERE i.id = ?`
    )
    .get(req.params.id) as Record<string, unknown> | undefined;

  if (!interview) {
    res.status(404).json({ error: 'Interview not found.' });
    return;
  }

  const evalRow = db
    .prepare('SELECT * FROM interview_evaluations WHERE interview_id = ?')
    .get(req.params.id) as Record<string, unknown> | undefined;
  if (!evalRow) {
    res.status(400).json({ error: 'No evaluation has been generated for this interview yet.' });
    return;
  }

  const transcript = db
    .prepare('SELECT speaker, stage, content FROM interview_responses WHERE interview_id = ? ORDER BY rowid ASC')
    .all(req.params.id) as Array<{ speaker: string; stage: string; content: string }>;

  const buf = await buildInterviewPdfBuffer({
    candidateName: String(interview.candidate_name),
    candidateEmail: String(interview.candidate_email || ''),
    candidatePhone: String(interview.candidate_phone || ''),
    qualifications: String(interview.qualifications || ''),
    experience: String(interview.experience || ''),
    jobTitle: String(interview.job_title),
    interviewDate: String(interview.started_at || interview.created_at),
    durationSeconds: Number(interview.duration_seconds || 0),
    status: String(interview.status),
    overallScore: Number(evalRow.overall_score),
    recommendation: String(evalRow.recommendation),
    summary: String(evalRow.summary),
    rubricScores: JSON.parse(String(evalRow.rubric_scores || '[]')),
    strengths: JSON.parse(String(evalRow.strengths || '[]')),
    clarifications: JSON.parse(String(evalRow.clarifications || '[]')),
    followUpQuestions: JSON.parse(String(evalRow.follow_up_questions || '[]')),
    recruiterNotes: String(interview.recruiter_notes || ''),
    transcript,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="HireFlow-Interview-${String(interview.candidate_name).replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`
  );
  res.send(buf);
});

// --- WEB INTERVIEW (PUBLIC EXPIRING TOKEN FLOW) ---
interviewRouter.get('/web-interview/:token', (req, res) => {
  const row = db
    .prepare(
      `SELECT i.*, c.name as candidate_name, j.title as job_title, COALESCE(comp.name, 'HireFlow Tech India') as company_name
       FROM interviews i
       JOIN candidates c ON c.id = i.candidate_id
       JOIN jobs j ON j.id = i.job_id
       LEFT JOIN companies comp ON comp.id = c.company_id
       WHERE i.access_token = ?`
    )
    .get(req.params.token) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Interview link not found.' });
    return;
  }
  if (new Date(String(row.token_expires_at)).getTime() < Date.now()) {
    res.status(410).json({ error: 'This Web Interview link has expired.' });
    return;
  }

  const transcript = db
    .prepare('SELECT speaker, stage, content, timestamp FROM interview_responses WHERE interview_id = ? ORDER BY rowid ASC')
    .all(row.id);

  res.json({
    interview: {
      id: row.id,
      candidateName: row.candidate_name,
      jobTitle: row.job_title,
      companyName: row.company_name,
      status: row.status,
      currentStage: row.current_stage,
      language: row.language,
      plan: JSON.parse(String(row.plan_json || '[]')),
    },
    transcript,
  });
});

interviewRouter.post('/web-interview/:token/consent', async (req, res) => {
  const row = db
    .prepare(
      `SELECT i.*, c.name as candidate_name, c.company_id, j.title as job_title
       FROM interviews i JOIN candidates c ON c.id = i.candidate_id JOIN jobs j ON j.id = i.job_id
       WHERE i.access_token = ?`
    )
    .get(req.params.token) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Interview link not found.' });
    return;
  }

  const identityConfirmed = Boolean(req.body?.identityConfirmed);
  const recordingConsented = Boolean(req.body?.recordingConsented);
  const humanAlternativeRequested = Boolean(req.body?.humanAlternativeRequested);
  const language = req.body?.language === 'hi-IN' ? 'hi-IN' : 'en-IN';

  db.prepare(
    `INSERT INTO consent_records (
      id, interview_id, candidate_id, identity_confirmed, recording_consented, preferred_language, human_alternative_requested
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    createId('cons'),
    row.id,
    row.candidate_id,
    identityConfirmed ? 1 : 0,
    recordingConsented ? 1 : 0,
    language,
    humanAlternativeRequested ? 1 : 0
  );

  if (!identityConfirmed || !recordingConsented || humanAlternativeRequested) {
    const endStatus = humanAlternativeRequested ? 'declined' : 'consent_denied';
    db.prepare(`UPDATE interviews SET status = ?, ended_at = datetime('now'), failure_reason = ? WHERE id = ?`).run(
      endStatus,
      humanAlternativeRequested
        ? 'Candidate requested a human recruiter interview'
        : 'Candidate declined consent or identity check',
      row.id
    );
    db.prepare(`UPDATE candidates SET status = 'Recruiter Review', updated_at = datetime('now') WHERE id = ?`).run(
      row.candidate_id
    );
    createNotification(
      (row.company_id as string) || null,
      'consent_outcome',
      `Follow-up needed: ${row.candidate_name}`,
      humanAlternativeRequested
        ? `${row.candidate_name} requested a human recruiter alternative for ${row.job_title}.`
        : `${row.candidate_name} declined recording consent; flagged for manual recruiter follow-up.`,
      `/candidates/${row.candidate_id}`
    );
    await syncCandidatesToExcel();
    res.json({
      proceed: false,
      message:
        'Thank you for letting us know. We have not recorded anything and have notified our recruitment team to follow up with you directly.',
    });
    return;
  }

  const plan = JSON.parse(String(row.plan_json || '[]')) as Array<{
    stage: InterviewStage;
    focus: string;
    seedQuestion: string;
  }>;
  const openingText =
    language === 'hi-IN'
      ? `Namaste ${row.candidate_name}! HireFlow AI mein aapka swagat hai. Main Aira hoon. Kya aap ${row.job_title} role ke liye apna brief introduction de sakte hain?`
      : plan[0]?.seedQuestion ||
        `Hello ${row.candidate_name}! I'm Aira, your virtual recruitment assistant. Could you briefly introduce yourself and tell me what interested you about the ${row.job_title} role?`;

  db.prepare(
    `UPDATE interviews SET status = 'in_progress', language = ?, started_at = COALESCE(started_at, datetime('now')) WHERE id = ?`
  ).run(language, row.id);

  // Save opening turn only if no turns exist yet
  const existingTurns = (
    db.prepare('SELECT COUNT(*) as c FROM interview_responses WHERE interview_id = ?').get(row.id) as { c: number }
  ).c;
  if (existingTurns === 0) {
    db.prepare(
      `INSERT INTO interview_responses (id, interview_id, speaker, stage, content, action) VALUES (?, ?, 'aira', 'introduction', ?, 'ask')`
    ).run(createId('resp'), row.id, openingText);
  }

  res.json({ proceed: true, openingText, stage: 'introduction', language });
});

interviewRouter.post('/web-interview/:token/turn', async (req, res) => {
  const startMs = Date.now();
  const row = db
    .prepare(
      `SELECT i.*, c.name as candidate_name, c.company_id, j.title as job_title, COALESCE(comp.approved_info, '') as approved_info
       FROM interviews i
       JOIN candidates c ON c.id = i.candidate_id
       JOIN jobs j ON j.id = i.job_id
       LEFT JOIN companies comp ON comp.id = c.company_id
       WHERE i.access_token = ?`
    )
    .get(req.params.token) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Interview not found.' });
    return;
  }

  const message = String(req.body?.message || '').trim();
  const elapsedSeconds = Number(req.body?.elapsedSeconds ?? 0);
  if (!message) {
    res.status(400).json({ error: 'Response text is empty.' });
    return;
  }

  const currentStage = (row.current_stage as InterviewStage) || 'introduction';
  db.prepare(
    `INSERT INTO interview_responses (id, interview_id, speaker, stage, content) VALUES (?, ?, 'candidate', ?, ?)`
  ).run(createId('resp'), row.id, currentStage, message);

  const transcript = db
    .prepare('SELECT speaker, stage, content, action FROM interview_responses WHERE interview_id = ? ORDER BY rowid ASC')
    .all(row.id) as Array<{ speaker: string; stage: string; content: string; action?: string }>;

  const followUpsOnCurrent = transcript.filter(
    (t) => t.speaker === 'aira' && t.stage === currentStage && t.action === 'follow_up'
  ).length;

  const plan = JSON.parse(String(row.plan_json || '[]')) as Array<{
    stage: InterviewStage;
    focus: string;
    seedQuestion: string;
  }>;

  const decision = await runInterviewOrchestratorTurn({
    candidateName: String(row.candidate_name),
    jobTitle: String(row.job_title),
    approvedCompanyInfo: String(row.approved_info || ''),
    currentStage,
    followUpsOnCurrent,
    elapsedSeconds,
    maxDurationSeconds: 900,
    plan,
    transcript,
    latestCandidateUtterance: message,
    language: String(row.language || 'en-IN'),
  });

  const latencyMs = Date.now() - startMs;

  db.prepare(
    `INSERT INTO interview_responses (id, interview_id, speaker, stage, content, action, latency_ms) VALUES (?, ?, 'aira', ?, ?, ?, ?)`
  ).run(createId('resp'), row.id, decision.nextStage, decision.text, decision.action, latencyMs);

  db.prepare(`UPDATE interviews SET current_stage = ?, duration_seconds = ? WHERE id = ?`).run(
    decision.nextStage,
    elapsedSeconds,
    row.id
  );

  res.json({
    reply: decision.text,
    action: decision.action,
    stage: decision.nextStage,
    latencyMs,
    ended: decision.action === 'end',
  });
});

interviewRouter.post('/web-interview/:token/complete', async (req, res) => {
  const row = db
    .prepare(
      `SELECT i.*, c.name as candidate_name, c.company_id, c.status as candidate_status, j.title as job_title, j.rubric_json
       FROM interviews i
       JOIN candidates c ON c.id = i.candidate_id
       JOIN jobs j ON j.id = i.job_id
       WHERE i.access_token = ?`
    )
    .get(req.params.token) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Interview not found.' });
    return;
  }

  const durationSeconds = Number(req.body?.durationSeconds ?? row.duration_seconds ?? 0);
  const transcript = db
    .prepare('SELECT speaker, stage, content, latency_ms FROM interview_responses WHERE interview_id = ? ORDER BY rowid ASC')
    .all(row.id) as Array<{ speaker: string; stage: string; content: string; latency_ms?: number }>;

  const candidateTurns = transcript.filter((t) => t.speaker === 'candidate');
  if (candidateTurns.length === 0) {
    db.prepare(
      `UPDATE interviews SET status = 'failed', ended_at = datetime('now'), failure_reason = 'No candidate responses recorded' WHERE id = ?`
    ).run(row.id);
    res.status(400).json({ error: 'Interview ended with no candidate responses; no evaluation generated.' });
    return;
  }

  const latencies = transcript.map((t) => t.latency_ms).filter((n): n is number => typeof n === 'number');
  latencies.sort((a, b) => a - b);
  const medianLatency = latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : null;

  const rubric = JSON.parse(String(row.rubric_json || '[]')) as string[];
  const evalResult = await evaluateInterviewTranscript({
    candidateName: String(row.candidate_name),
    jobTitle: String(row.job_title),
    rubricCriteria:
      rubric.length > 0
        ? rubric
        : [
            'Technical Knowledge',
            'Job-Relevant Experience',
            'Problem-Solving',
            'Communication',
            'Role-Specific Knowledge',
            'Qualification Relevance',
          ],
    transcript,
  });

  db.prepare(
    `INSERT OR REPLACE INTO interview_evaluations (
      id, interview_id, candidate_id, job_id, rubric_scores, overall_score,
      strengths, clarifications, follow_up_questions, recommendation, summary,
      validation_passed, validation_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    createId('eval'),
    row.id,
    row.candidate_id,
    row.job_id,
    JSON.stringify(evalResult.rubricScores),
    evalResult.overallScore,
    JSON.stringify(evalResult.strengths),
    JSON.stringify(evalResult.clarifications),
    JSON.stringify(evalResult.followUpQuestions),
    evalResult.recommendation,
    evalResult.summary,
    evalResult.validationPassed ? 1 : 0,
    evalResult.validationNotes
  );

  db.prepare(
    `UPDATE interviews SET status = 'completed', duration_seconds = ?, median_latency_ms = ?, ended_at = datetime('now') WHERE id = ?`
  ).run(durationSeconds, medianLatency, row.id);

  const prevStatus = String(row.candidate_status);
  const nextStatus = 'Level 1 Completed';
  if (canTransitionStatus(prevStatus, nextStatus)) {
    db.prepare(
      `UPDATE candidates SET status = ?, feedback = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(nextStatus, `Level 1 Score ${evalResult.overallScore}/5.0 (${evalResult.recommendation})`, row.candidate_id);
    db.prepare(
      `INSERT INTO candidate_status_history (id, candidate_id, from_status, to_status, reason) VALUES (?, ?, ?, ?, 'Level 1 interview completed & evaluated')`
    ).run(createId('hist'), row.candidate_id, prevStatus, nextStatus);
  }

  await syncCandidatesToExcel();
  createNotification(
    (row.company_id as string) || null,
    'interview_completed',
    `Interview completed: ${row.candidate_name}`,
    `Level 1 evaluation ready (${evalResult.overallScore}/5.0 — ${evalResult.recommendation}).`,
    `/interviews/${row.id}`
  );

  res.json({ ok: true, interviewId: row.id, evaluation: evalResult });
});

// --- TELEPHONY WEBHOOKS ---
interviewRouter.post('/telephony/twilio/twiml/:interviewId', (req, res) => {
  const row = db
    .prepare(
      `SELECT i.id, c.name as candidate_name, j.title as job_title
       FROM interviews i JOIN candidates c ON c.id = i.candidate_id JOIN jobs j ON j.id = i.job_id
       WHERE i.id = ?`
    )
    .get(req.params.interviewId) as { id: string; candidate_name: string; job_title: string } | undefined;

  const baseUrl = (process.env.APP_URL || '').replace(/^https?:\/\//, '');
  res.setHeader('Content-Type', 'text/xml');
  if (!row) {
    res.send('<Response><Say>Sorry, this interview session is unavailable.</Say><Hangup/></Response>');
    return;
  }

  res.send(
    `<Response>
      <Say voice="Polly.Aditi">Hello, am I speaking with ${row.candidate_name}? My name is Aira, the virtual AI recruitment assistant calling about your application for ${row.job_title}.</Say>
      <Connect><Stream url="wss://${baseUrl}/ws/media?interviewId=${row.id}"/></Connect>
    </Response>`
  );
});

interviewRouter.post('/telephony/twilio/status/:callId', async (req, res) => {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (token) {
    const fullUrl = `${process.env.APP_URL || ''}${req.originalUrl}`;
    const valid = verifyTwilioSignature(
      token,
      req.headers['x-twilio-signature'] as string | undefined,
      fullUrl,
      req.body as Record<string, string>
    );
    if (!valid) {
      res.status(403).json({ error: 'Invalid Twilio signature.' });
      return;
    }
  }

  const callStatus = String(req.body?.CallStatus || 'failed').toLowerCase();
  const mappedStatus =
    callStatus === 'no-answer'
      ? 'no-answer'
      : callStatus === 'busy'
        ? 'busy'
        : callStatus === 'completed'
          ? 'completed'
          : callStatus === 'in-progress'
            ? 'answered'
            : callStatus;

  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(req.params.callId) as
    | { id: string; interview_id: string; candidate_id: string }
    | undefined;
  if (call) {
    db.prepare(`UPDATE calls SET status = ?, ended_at = datetime('now') WHERE id = ?`).run(mappedStatus, call.id);
    if (mappedStatus === 'no-answer' || mappedStatus === 'busy' || mappedStatus === 'failed') {
      db.prepare(`UPDATE interviews SET status = 'missed', failure_reason = ? WHERE id = ?`).run(
        `Call ended with status: ${mappedStatus}`,
        call.interview_id
      );
      createNotification(
        null,
        'call_missed',
        'Candidate call missed',
        `Call ended (${mappedStatus}). Retry or share the Web Interview link.`,
        '/interviews'
      );
    }
  }
  res.sendStatus(200);
});

// --- LEVEL 2 & EMAIL ---
interviewRouter.get('/level2/data', requireAuth, (_req, res) => {
  const candidates = db
    .prepare(
      `SELECT c.*, j.title as job_title,
              (SELECT ie.overall_score
               FROM interviews i2
               JOIN interview_evaluations ie ON ie.interview_id = i2.id
               WHERE i2.candidate_id = c.id
               ORDER BY ie.created_at DESC LIMIT 1) as interview_score,
              (SELECT ie.recommendation
               FROM interviews i2
               JOIN interview_evaluations ie ON ie.interview_id = i2.id
               WHERE i2.candidate_id = c.id
               ORDER BY ie.created_at DESC LIMIT 1) as recommendation,
              (SELECT i2.id
               FROM interviews i2
               WHERE i2.candidate_id = c.id
               ORDER BY i2.created_at DESC LIMIT 1) as interview_id
       FROM candidates c
       LEFT JOIN jobs j ON j.id = c.job_id
       WHERE c.status IN ('Level 1 Completed', 'Recruiter Review', 'Level 2 Invited', 'Level 2 Scheduled', 'On Hold', 'Selected', 'Rejected', 'Shortlisted')
       ORDER BY c.updated_at DESC`
    )
    .all();

  const emailLogs = db
    .prepare(
      `SELECT el.*, c.name as candidate_name, j.title as job_title
       FROM email_logs el
       LEFT JOIN candidates c ON c.id = el.candidate_id
       LEFT JOIN jobs j ON j.id = el.job_id
       ORDER BY el.created_at DESC LIMIT 40`
    )
    .all();

  res.json({ candidates, emailLogs });
});

interviewRouter.post('/level2/decision', requireAuth, async (req: AuthenticatedRequest, res) => {
  const candidateId = String(req.body?.candidateId || '');
  const decision = String(req.body?.decision || '');
  const notes = String(req.body?.notes || '').trim();

  const targetStatusMap: Record<string, string> = {
    approve: 'Level 2 Invited',
    review: 'Recruiter Review',
    hold: 'On Hold',
    reject: 'Rejected',
    select: 'Selected',
  };
  const nextStatus = targetStatusMap[decision];
  if (!nextStatus) {
    res.status(400).json({ error: 'Invalid Level 2 decision.' });
    return;
  }

  const cand = db.prepare('SELECT * FROM candidates WHERE id = ?').get(candidateId) as
    | { id: string; status: string; name: string }
    | undefined;
  if (!cand) {
    res.status(404).json({ error: 'Candidate not found.' });
    return;
  }

  db.prepare(`UPDATE candidates SET status = ?, notes = COALESCE(NULLIF(?, ''), notes), updated_at = datetime('now') WHERE id = ?`).run(
    nextStatus,
    notes,
    candidateId
  );
  db.prepare(
    `INSERT INTO candidate_status_history (id, candidate_id, from_status, to_status, reason, changed_by) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(createId('hist'), candidateId, cand.status, nextStatus, notes || `Recruiter decision: ${decision}`, req.user!.id);

  await syncCandidatesToExcel();
  writeAuditLog(req.user!.id, 'level2_decision', 'candidate', candidateId, { decision, nextStatus });
  res.json({ ok: true, status: nextStatus });
});

interviewRouter.post('/level2/schedule', requireAuth, async (req: AuthenticatedRequest, res) => {
  const b = req.body as Record<string, unknown>;
  const candidateId = String(b.candidateId || '');
  const date = String(b.date || '');
  const time = String(b.time || '');
  const timeZone = String(b.timeZone || 'IST (Asia/Kolkata)');
  const mode = String(b.mode || 'Video Call');
  const interviewerName = String(b.interviewerName || '');
  const interviewerEmail = String(b.interviewerEmail || '');
  const meetingLink = String(b.meetingLink || '');
  const instructions = String(b.instructions || '');

  if (!candidateId || !date || !time || !interviewerName) {
    res.status(400).json({ error: 'Candidate, date, time, and interviewer name are required.' });
    return;
  }

  const cand = db
    .prepare(
      `SELECT c.*, j.title as job_title FROM candidates c LEFT JOIN jobs j ON j.id = c.job_id WHERE c.id = ?`
    )
    .get(candidateId) as Record<string, unknown> | undefined;

  if (!cand) {
    res.status(404).json({ error: 'Candidate not found.' });
    return;
  }
  if (!cand.email) {
    res.status(400).json({ error: 'Candidate does not have an email address.' });
    return;
  }

  const { subject, body } = buildLevel2InvitationTemplate({
    candidateName: String(cand.name),
    jobTitle: String(cand.job_title || 'Open Position'),
    companyName: req.user!.companyName,
    date,
    time,
    timeZone,
    mode,
    interviewerName,
    meetingLink,
    instructions,
  });

  const emailOutcome = await sendEmailMessage({
    candidateId,
    jobId: (cand.job_id as string) || null,
    to: String(cand.email),
    subject,
    body,
    templateType: 'level2_invite',
    meetingDetails: { date, time, timeZone, mode, interviewerName, interviewerEmail, meetingLink },
    sentBy: req.user!.id,
  });

  if (emailOutcome.sent) {
    db.prepare(`UPDATE candidates SET status = 'Level 2 Scheduled', updated_at = datetime('now') WHERE id = ?`).run(
      candidateId
    );
    db.prepare(
      `INSERT INTO candidate_status_history (id, candidate_id, from_status, to_status, reason, changed_by) VALUES (?, ?, ?, 'Level 2 Scheduled', ?, ?)`
    ).run(createId('hist'), candidateId, String(cand.status), `Level 2 scheduled on ${date} at ${time}`, req.user!.id);
    await syncCandidatesToExcel();
  } else {
    createNotification(
      req.user!.companyId,
      'email_failed',
      `Level 2 email not sent for ${cand.name}`,
      emailOutcome.error || 'SMTP delivery failed.',
      '/level2'
    );
  }

  writeAuditLog(req.user!.id, 'level2_schedule_attempt', 'candidate', candidateId, {
    sent: emailOutcome.sent,
    status: emailOutcome.status,
  });

  res.json(emailOutcome);
});

interviewRouter.post('/level2/retry-email/:logId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const log = db.prepare('SELECT * FROM email_logs WHERE id = ?').get(req.params.logId) as
    | Record<string, unknown>
    | undefined;
  if (!log) {
    res.status(404).json({ error: 'Email log not found.' });
    return;
  }
  const outcome = await sendEmailMessage({
    candidateId: (log.candidate_id as string) || null,
    jobId: (log.job_id as string) || null,
    to: String(log.recipient_email),
    subject: String(log.subject),
    body: String(log.body),
    templateType: String(log.template_type),
    sentBy: req.user!.id,
  });
  res.json(outcome);
});

// --- AIRA CONVERSATIONAL ASSISTANT & VOICE ---
interviewRouter.post('/aira/chat', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  const mode = req.body?.mode === 'dashboard' ? 'dashboard' : 'landing';
  if (!message) {
    res.status(400).json({ error: 'Message is required.' });
    return;
  }

  let dbSummary:
    | {
        totalCandidates: number;
        activeJobs: number;
        shortlisted: number;
        pendingReview: number;
        interviewsScheduled: number;
        completedInterviews: number;
      }
    | undefined;

  if (mode === 'dashboard') {
    dbSummary = {
      totalCandidates: (db.prepare('SELECT COUNT(*) as c FROM candidates').get() as { c: number }).c,
      activeJobs: (db.prepare('SELECT COUNT(*) as c FROM jobs WHERE is_active = 1').get() as { c: number }).c,
      shortlisted: (
        db.prepare(`SELECT COUNT(*) as c FROM candidates WHERE status = 'Shortlisted'`).get() as { c: number }
      ).c,
      pendingReview: (
        db.prepare(`SELECT COUNT(*) as c FROM candidates WHERE status = 'Needs Review'`).get() as { c: number }
      ).c,
      interviewsScheduled: (
        db.prepare(`SELECT COUNT(*) as c FROM interviews WHERE status = 'scheduled'`).get() as { c: number }
      ).c,
      completedInterviews: (
        db.prepare(`SELECT COUNT(*) as c FROM interviews WHERE status = 'completed'`).get() as { c: number }
      ).c,
    };
  }

  const out = await runAiraAssistantReply({ message, mode, dbSummary });
  res.json(out);
});

interviewRouter.get('/voice/options', (_req, res) => {
  const voiceStatus = getVoiceIntegrationStatus();
  res.json({ voices: AIRA_VOICE_OPTIONS, cloudTtsConfigured: voiceStatus.tts.configured });
});

interviewRouter.post('/voice/tts', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  const voiceId = String(req.body?.voiceId || 'en-IN-NeerjaNeural');
  const speechRate = Number(req.body?.speechRate ?? 0.95);
  if (!text) {
    res.status(400).json({ error: 'Text is required.' });
    return;
  }

  const out = await synthesizeNeuralSpeech({ text, voiceId, speechRate });
  if (!out.ok) {
    res.status(503).json({ configured: out.configured, error: out.error });
    return;
  }

  res.setHeader('Content-Type', out.mimeType);
  res.setHeader('X-TTS-Provider', out.provider);
  res.send(out.audioBuffer);
});
