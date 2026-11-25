import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import {
  createId,
  createNotification,
  db,
  getStoragePaths,
  writeAuditLog,
} from '../db/database.ts';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.ts';
import {
  buildCandidatesWorkbookBuffer,
  importCandidatesFromExcelBuffer,
  syncCandidatesToExcel,
} from '../services/excelService.ts';
import { parseJobDescriptionFile, parseResumeFile } from '../services/fileParser.ts';
import {
  canTransitionStatus,
  DEFAULT_SCREENING_WEIGHTS,
  PIPELINE_STATUSES,
  scoreCandidateAgainstJob,
  ScreeningWeights,
} from '../../src/lib/recruitmentRules.ts';
import { getLlmStatus } from '../services/llmAdapter.ts';
import { getTelephonyStatus } from '../services/adapters/telephonyAdapter.ts';
import { getVoiceIntegrationStatus } from '../services/adapters/voiceAdapters.ts';
import { isSmtpConfigured } from '../services/adapters/emailAdapter.ts';
import { buildAnalyticsPdfBuffer } from '../services/pdfReportService.ts';

export const coreRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function getScreeningConfig(): { threshold: number; weights: ScreeningWeights } {
  const thRow = db.prepare(`SELECT value FROM settings WHERE key = 'screening.threshold'`).get() as
    | { value: string }
    | undefined;
  const wRow = db.prepare(`SELECT value FROM settings WHERE key = 'screening.weights'`).get() as
    | { value: string }
    | undefined;
  const threshold = thRow ? Number.parseInt(thRow.value, 10) : 70;
  let weights = DEFAULT_SCREENING_WEIGHTS;
  if (wRow) {
    try {
      weights = { ...DEFAULT_SCREENING_WEIGHTS, ...JSON.parse(wRow.value) };
    } catch {
      weights = DEFAULT_SCREENING_WEIGHTS;
    }
  }
  return { threshold: Number.isNaN(threshold) ? 70 : threshold, weights };
}

// --- DASHBOARD STATS ---
coreRouter.get('/dashboard/stats', requireAuth, (_req, res) => {
  const totalCandidates = (db.prepare('SELECT COUNT(*) as c FROM candidates').get() as { c: number }).c;
  const activeJobs = (db.prepare('SELECT COUNT(*) as c FROM jobs WHERE is_active = 1').get() as { c: number }).c;
  const cvsReceived = (db.prepare('SELECT COUNT(*) as c FROM resumes').get() as { c: number }).c;
  const shortlisted = (
    db.prepare(`SELECT COUNT(*) as c FROM candidates WHERE status = 'Shortlisted'`).get() as { c: number }
  ).c;
  const interviewsScheduled = (
    db
      .prepare(`SELECT COUNT(*) as c FROM interviews WHERE status IN ('scheduled', 'in_progress')`)
      .get() as { c: number }
  ).c;
  const completedInterviews = (
    db.prepare(`SELECT COUNT(*) as c FROM interviews WHERE status = 'completed'`).get() as { c: number }
  ).c;

  const recentActivity = db
    .prepare(
      `SELECT id, action, entity_type, entity_id, details, created_at
       FROM audit_logs ORDER BY created_at DESC LIMIT 12`
    )
    .all();

  const statusCounts = db
    .prepare(`SELECT status, COUNT(*) as count FROM candidates GROUP BY status`)
    .all() as Array<{ status: string; count: number }>;

  res.json({
    stats: {
      totalCandidates,
      activeJobs,
      cvsReceived,
      shortlisted,
      interviewsScheduled,
      completedInterviews,
    },
    recentActivity,
    statusCounts,
  });
});

// --- JOBS ---
coreRouter.get('/jobs', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const rows = db
    .prepare(
      `SELECT j.*,
        (SELECT COUNT(*) FROM candidates c WHERE c.job_id = j.id) as candidate_count,
        (SELECT COUNT(*) FROM candidates c WHERE c.job_id = j.id AND c.status = 'Shortlisted') as shortlisted_count
       FROM jobs j ORDER BY j.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const filtered = q
    ? rows.filter(
        (r) =>
          String(r.title || '').toLowerCase().includes(q) ||
          String(r.department || '').toLowerCase().includes(q) ||
          String(r.location || '').toLowerCase().includes(q)
      )
    : rows;

  res.json({
    jobs: filtered.map((r) => ({
      ...r,
      requiredSkills: JSON.parse(String(r.required_skills || '[]')),
      preferredSkills: JSON.parse(String(r.preferred_skills || '[]')),
      certifications: JSON.parse(String(r.certifications || '[]')),
      rubric: JSON.parse(String(r.rubric_json || '[]')),
      isActive: Boolean(r.is_active),
    })),
  });
});

coreRouter.get('/jobs/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Job description not found.' });
    return;
  }
  const candidates = db
    .prepare(
      `SELECT c.*, sr.overall_score, sr.skills_match, sr.explanation
       FROM candidates c
       LEFT JOIN screening_results sr ON sr.id = (
         SELECT id FROM screening_results s2 WHERE s2.candidate_id = c.id AND s2.job_id = ? ORDER BY s2.created_at DESC LIMIT 1
       )
       WHERE c.job_id = ? ORDER BY COALESCE(sr.overall_score, -1) DESC, c.created_at DESC`
    )
    .all(req.params.id, req.params.id);

  res.json({
    job: {
      ...row,
      requiredSkills: JSON.parse(String(row.required_skills || '[]')),
      preferredSkills: JSON.parse(String(row.preferred_skills || '[]')),
      certifications: JSON.parse(String(row.certifications || '[]')),
      rubric: JSON.parse(String(row.rubric_json || '[]')),
      isActive: Boolean(row.is_active),
    },
    candidates,
  });
});

coreRouter.post('/jobs/parse', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Please select a PDF, DOCX, or TXT job description file.' });
    return;
  }
  try {
    const parsed = await parseJobDescriptionFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    res.json({ parsed });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const jobSchema = z.object({
  title: z.string().min(2),
  department: z.string().optional().default('Engineering'),
  location: z.string().optional().default('Bengaluru / Hybrid'),
  employmentType: z.string().optional().default('Full-Time'),
  description: z.string().min(10),
  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  minExperienceYears: z.number().nullable().optional(),
  qualification: z.string().optional().default(''),
  certifications: z.array(z.string()).default([]),
  shortlistThreshold: z.number().min(30).max(95).optional().default(70),
});

coreRouter.post('/jobs', requireAuth, (req: AuthenticatedRequest, res) => {
  const parsed = jobSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid job data' });
    return;
  }
  const id = createId('job');
  const d = parsed.data;
  const defaultRubric = [
    'Technical Knowledge',
    'Job-Relevant Experience',
    'Problem-Solving',
    'Communication',
    'Role-Specific Knowledge',
    'Qualification Relevance',
  ];
  db.prepare(
    `INSERT INTO jobs (
      id, company_id, title, department, location, employment_type, description,
      required_skills, preferred_skills, min_experience_years, qualification,
      certifications, rubric_json, shortlist_threshold, is_active, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    id,
    req.user!.companyId,
    d.title.trim(),
    d.department.trim(),
    d.location.trim(),
    d.employmentType.trim(),
    d.description.trim(),
    JSON.stringify(d.requiredSkills),
    JSON.stringify(d.preferredSkills),
    d.minExperienceYears ?? null,
    d.qualification.trim(),
    JSON.stringify(d.certifications),
    JSON.stringify(defaultRubric),
    d.shortlistThreshold,
    req.user!.id
  );
  writeAuditLog(req.user!.id, 'job_created', 'job', id, { title: d.title });
  res.status(201).json({ id });
});

coreRouter.put('/jobs/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const existing = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Job not found.' });
    return;
  }
  const d = req.body as Record<string, unknown>;
  db.prepare(
    `UPDATE jobs SET
      title = COALESCE(?, title),
      department = COALESCE(?, department),
      location = COALESCE(?, location),
      employment_type = COALESCE(?, employment_type),
      description = COALESCE(?, description),
      required_skills = COALESCE(?, required_skills),
      preferred_skills = COALESCE(?, preferred_skills),
      min_experience_years = ?,
      qualification = COALESCE(?, qualification),
      shortlist_threshold = COALESCE(?, shortlist_threshold),
      is_active = COALESCE(?, is_active),
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    d.title ?? null,
    d.department ?? null,
    d.location ?? null,
    d.employmentType ?? null,
    d.description ?? null,
    Array.isArray(d.requiredSkills) ? JSON.stringify(d.requiredSkills) : null,
    Array.isArray(d.preferredSkills) ? JSON.stringify(d.preferredSkills) : null,
    d.minExperienceYears === undefined ? null : (d.minExperienceYears as number | null),
    d.qualification ?? null,
    typeof d.shortlistThreshold === 'number' ? d.shortlistThreshold : null,
    typeof d.isActive === 'boolean' ? (d.isActive ? 1 : 0) : null,
    req.params.id
  );
  writeAuditLog(req.user!.id, 'job_updated', 'job', req.params.id);
  res.json({ ok: true });
});

coreRouter.delete('/jobs/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
  writeAuditLog(req.user!.id, 'job_deleted', 'job', req.params.id);
  res.json({ ok: true });
});

// --- CANDIDATES & EXCEL ---
coreRouter.get('/candidates', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const status = String(req.query.status || '').trim();
  const jobId = String(req.query.jobId || '').trim();

  const rows = db
    .prepare(
      `SELECT c.*, j.title as job_title,
        (SELECT overall_score FROM screening_results sr WHERE sr.candidate_id = c.id ORDER BY sr.created_at DESC LIMIT 1) as latest_score
       FROM candidates c
       LEFT JOIN jobs j ON j.id = c.job_id
       ORDER BY c.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const filtered = rows.filter((r) => {
    if (status && status !== 'ALL' && r.status !== status) return false;
    if (jobId && jobId !== 'ALL' && r.job_id !== jobId) return false;
    if (q) {
      const hay = `${r.name} ${r.email} ${r.phone} ${r.qualifications} ${r.job_title || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  res.json({ candidates: filtered, statuses: PIPELINE_STATUSES });
});

coreRouter.get('/candidates/export/xlsx', requireAuth, async (_req, res) => {
  const buf = await buildCandidatesWorkbookBuffer();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="Candidate.xlsx"');
  res.send(buf);
});

coreRouter.post('/candidates/import/xlsx', requireAuth, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Please upload a .xlsx file.' });
    return;
  }
  const result = await importCandidatesFromExcelBuffer(req.file.buffer, req.user!.companyId);
  writeAuditLog(req.user!.id, 'excel_imported', 'candidate', null, result);
  res.json(result);
});

coreRouter.get('/candidates/:id', requireAuth, (req, res) => {
  const candidate = db
    .prepare(
      `SELECT c.*, j.title as job_title FROM candidates c LEFT JOIN jobs j ON j.id = c.job_id WHERE c.id = ?`
    )
    .get(req.params.id) as Record<string, unknown> | undefined;

  if (!candidate) {
    res.status(404).json({ error: 'Candidate not found.' });
    return;
  }

  const skills = db
    .prepare('SELECT skill_name, normalized_name, source FROM candidate_skills WHERE candidate_id = ?')
    .all(req.params.id);
  const resumes = db
    .prepare('SELECT id, original_filename, mime_type, file_size, parse_status, parsed_json, created_at FROM resumes WHERE candidate_id = ? ORDER BY created_at DESC')
    .all(req.params.id);
  const screenings = db
    .prepare(
      `SELECT sr.*, j.title as job_title FROM screening_results sr LEFT JOIN jobs j ON j.id = sr.job_id WHERE sr.candidate_id = ? ORDER BY sr.created_at DESC`
    )
    .all(req.params.id);
  const interviews = db
    .prepare(
      `SELECT i.*, j.title as job_title, ie.overall_score, ie.recommendation
       FROM interviews i
       LEFT JOIN jobs j ON j.id = i.job_id
       LEFT JOIN interview_evaluations ie ON ie.interview_id = i.id
       WHERE i.candidate_id = ? ORDER BY i.created_at DESC`
    )
    .all(req.params.id);
  const history = db
    .prepare('SELECT * FROM candidate_status_history WHERE candidate_id = ? ORDER BY created_at DESC')
    .all(req.params.id);
  const emails = db
    .prepare('SELECT * FROM email_logs WHERE candidate_id = ? ORDER BY created_at DESC')
    .all(req.params.id);

  res.json({ candidate, skills, resumes, screenings, interviews, history, emails });
});

coreRouter.post('/candidates', requireAuth, async (req: AuthenticatedRequest, res) => {
  const b = req.body as Record<string, unknown>;
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const phone = String(b.phone || '').trim();
  if (!name) {
    res.status(400).json({ error: 'Candidate name is required.' });
    return;
  }

  if (email) {
    const dup = db.prepare('SELECT id FROM candidates WHERE lower(email) = ?').get(email);
    if (dup) {
      res.status(409).json({ error: 'A candidate with this email already exists.' });
      return;
    }
  }

  const id = createId('cand');
  const expStr = String(b.experience || '').trim();
  const expMatch = expStr.match(/(\d+(?:\.\d+)?)/);
  const expYears = typeof b.experienceYears === 'number' ? b.experienceYears : expMatch ? Number.parseFloat(expMatch[1]) : null;
  const status = PIPELINE_STATUSES.includes(b.status as (typeof PIPELINE_STATUSES)[number])
    ? String(b.status)
    : 'Applied';

  db.prepare(
    `INSERT INTO candidates (
      id, company_id, job_id, name, phone, email, qualifications, passing_year,
      experience, experience_years, feedback, status, notes, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`
  ).run(
    id,
    req.user!.companyId,
    b.jobId || null,
    name,
    phone,
    email,
    String(b.qualifications || ''),
    String(b.passingYear || ''),
    expStr,
    expYears,
    String(b.feedback || ''),
    status,
    String(b.notes || '')
  );

  if (Array.isArray(b.skills)) {
    const insSkill = db.prepare(
      'INSERT INTO candidate_skills (id, candidate_id, skill_name, normalized_name, source) VALUES (?, ?, ?, ?, ?)'
    );
    for (const s of b.skills) {
      const label = String(s).trim();
      if (label) insSkill.run(createId('sk'), id, label, label.toLowerCase(), 'manual');
    }
  }

  db.prepare(
    `INSERT INTO candidate_status_history (id, candidate_id, from_status, to_status, reason, changed_by) VALUES (?, ?, NULL, ?, 'Candidate created', ?)`
  ).run(createId('hist'), id, status, req.user!.id);

  await syncCandidatesToExcel();
  writeAuditLog(req.user!.id, 'candidate_created', 'candidate', id, { name });
  res.status(201).json({ id });
});

coreRouter.put('/candidates/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const existing = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id) as
    | { id: string; status: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Candidate not found.' });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const nextStatus = b.status ? String(b.status) : existing.status;

  if (nextStatus !== existing.status) {
    if (!canTransitionStatus(existing.status, nextStatus)) {
      res.status(400).json({
        error: `Invalid pipeline transition from "${existing.status}" to "${nextStatus}".`,
      });
      return;
    }
    db.prepare(
      `INSERT INTO candidate_status_history (id, candidate_id, from_status, to_status, reason, changed_by) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      createId('hist'),
      req.params.id,
      existing.status,
      nextStatus,
      String(b.statusReason || 'Recruiter status update'),
      req.user!.id
    );
  }

  db.prepare(
    `UPDATE candidates SET
      name = COALESCE(?, name),
      phone = COALESCE(?, phone),
      email = COALESCE(?, email),
      qualifications = COALESCE(?, qualifications),
      passing_year = COALESCE(?, passing_year),
      experience = COALESCE(?, experience),
      feedback = COALESCE(?, feedback),
      notes = COALESCE(?, notes),
      job_id = COALESCE(?, job_id),
      status = ?,
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    b.name ?? null,
    b.phone ?? null,
    b.email ?? null,
    b.qualifications ?? null,
    b.passingYear ?? null,
    b.experience ?? null,
    b.feedback ?? null,
    b.notes ?? null,
    b.jobId ?? null,
    nextStatus,
    req.params.id
  );

  await syncCandidatesToExcel();
  writeAuditLog(req.user!.id, 'candidate_updated', 'candidate', req.params.id, { status: nextStatus });
  res.json({ ok: true });
});

coreRouter.delete('/candidates/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM candidates WHERE id = ?').run(req.params.id);
  await syncCandidatesToExcel();
  writeAuditLog(req.user!.id, 'candidate_deleted', 'candidate', req.params.id);
  res.json({ ok: true });
});

// --- RESUME UPLOAD & PARSING ---
coreRouter.get('/resumes', requireAuth, (_req, res) => {
  const resumes = db
    .prepare(
      `SELECT r.id, r.candidate_id, r.original_filename, r.mime_type, r.file_size, r.file_hash, r.parse_status, r.parsed_json, r.created_at,
              c.name as candidate_name, c.email as candidate_email, c.status as candidate_status, j.title as job_title
       FROM resumes r
       JOIN candidates c ON c.id = r.candidate_id
       LEFT JOIN jobs j ON j.id = c.job_id
       ORDER BY r.created_at DESC`
    )
    .all();
  res.json({ resumes });
});

async function ingestResumeFile(
  file: Express.Multer.File,
  jobId: string | null,
  companyId: string | null,
  userId: string
) {
  const parsed = await parseResumeFile(file.buffer, file.originalname, file.mimetype);

  // Duplicate detection by file hash, email, or phone
  const dupHash = db
    .prepare('SELECT id, candidate_id FROM resumes WHERE file_hash = ?')
    .get(parsed.fileHash) as { id: string; candidate_id: string } | undefined;
  if (dupHash) {
    return { status: 'duplicate' as const, reason: 'Identical file already uploaded', candidateId: dupHash.candidate_id, filename: file.originalname };
  }

  if (parsed.email) {
    const dupEmail = db
      .prepare('SELECT id, name FROM candidates WHERE lower(email) = ?')
      .get(parsed.email) as { id: string; name: string } | undefined;
    if (dupEmail) {
      return { status: 'duplicate' as const, reason: `Duplicate email (${parsed.email}) matches ${dupEmail.name}`, candidateId: dupEmail.id, filename: file.originalname };
    }
  }

  if (parsed.phone && parsed.phone.replace(/\D/g, '').length >= 10) {
    const digits = parsed.phone.replace(/\D/g, '').slice(-10);
    const allCands = db
      .prepare("SELECT id, name, phone FROM candidates WHERE phone IS NOT NULL AND phone != ''")
      .all() as Array<{
      id: string;
      name: string;
      phone: string;
    }>;
    const matchPhone = allCands.find((c) => c.phone.replace(/\D/g, '').endsWith(digits));
    if (matchPhone) {
      return { status: 'duplicate' as const, reason: `Duplicate phone matches ${matchPhone.name}`, candidateId: matchPhone.id, filename: file.originalname };
    }
  }

  const { resumesDir } = getStoragePaths();
  const safeName = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const storedPath = path.join(resumesDir, safeName);
  fs.writeFileSync(storedPath, file.buffer);

  const candidateId = createId('cand');
  db.prepare(
    `INSERT INTO candidates (
      id, company_id, job_id, name, phone, email, qualifications, passing_year,
      experience, experience_years, feedback, status, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CV Screening', 'cv_upload')`
  ).run(
    candidateId,
    companyId,
    jobId,
    parsed.name,
    parsed.phone,
    parsed.email,
    parsed.qualifications,
    parsed.passingYear,
    parsed.experience,
    parsed.experienceYears,
    `CV parsed (${parsed.skills.length} skills extracted)`,
  );

  const resumeId = createId('res');
  db.prepare(
    `INSERT INTO resumes (
      id, candidate_id, original_filename, stored_path, mime_type, file_size, file_hash, extracted_text, parsed_json, parse_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'parsed')`
  ).run(
    resumeId,
    candidateId,
    file.originalname,
    storedPath,
    file.mimetype || 'application/octet-stream',
    file.size,
    parsed.fileHash,
    parsed.rawText,
    JSON.stringify({
      skills: parsed.skills,
      certifications: parsed.certifications,
      projects: parsed.projects,
    })
  );

  const insSkill = db.prepare(
    'INSERT INTO candidate_skills (id, candidate_id, skill_name, normalized_name, source) VALUES (?, ?, ?, ?, ?)'
  );
  for (const s of parsed.skills) {
    insSkill.run(createId('sk'), candidateId, s, s.toLowerCase(), 'cv');
  }

  db.prepare(
    `INSERT INTO candidate_status_history (id, candidate_id, from_status, to_status, reason, changed_by) VALUES (?, ?, NULL, 'CV Screening', ?, ?)`
  ).run(createId('hist'), candidateId, `Uploaded CV: ${file.originalname}`, userId);

  return { status: 'created' as const, candidateId, resumeId, parsed, filename: file.originalname };
}

coreRouter.post('/resumes/upload', requireAuth, upload.array('files', 25), async (req: AuthenticatedRequest, res) => {
  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) {
    res.status(400).json({ error: 'Please select at least one PDF, DOCX, or TXT CV file.' });
    return;
  }

  const jobId = req.body?.jobId ? String(req.body.jobId) : null;
  const results: Array<Record<string, unknown>> = [];

  for (const f of files) {
    try {
      const outcome = await ingestResumeFile(f, jobId, req.user!.companyId, req.user!.id);
      results.push(outcome);
    } catch (err) {
      results.push({
        status: 'error',
        filename: f.originalname,
        error: (err as Error).message,
      });
    }
  }

  await syncCandidatesToExcel();
  const createdCount = results.filter((r) => r.status === 'created').length;
  if (createdCount > 0) {
    createNotification(
      req.user!.companyId,
      'cv_upload',
      `${createdCount} new CV(s) parsed`,
      `Uploaded and parsed ${createdCount} candidate resume(s). Ready for screening.`,
      '/screening'
    );
  }
  writeAuditLog(req.user!.id, 'resumes_uploaded', 'resume', null, { count: files.length, createdCount });
  res.json({ results });
});

// --- SCREENING ENGINE ---
coreRouter.get('/screening/results', requireAuth, (req, res) => {
  const jobId = String(req.query.jobId || '').trim();
  const sql = jobId
    ? `SELECT sr.*, c.name as candidate_name, c.email as candidate_email, c.phone as candidate_phone, c.status as candidate_status, c.experience, c.qualifications, j.title as job_title
       FROM screening_results sr
       JOIN candidates c ON c.id = sr.candidate_id
       JOIN jobs j ON j.id = sr.job_id
       WHERE sr.job_id = ?
       ORDER BY sr.overall_score DESC, sr.created_at DESC`
    : `SELECT sr.*, c.name as candidate_name, c.email as candidate_email, c.phone as candidate_phone, c.status as candidate_status, c.experience, c.qualifications, j.title as job_title
       FROM screening_results sr
       JOIN candidates c ON c.id = sr.candidate_id
       JOIN jobs j ON j.id = sr.job_id
       ORDER BY sr.overall_score DESC, sr.created_at DESC`;

  const rows = (jobId ? db.prepare(sql).all(jobId) : db.prepare(sql).all()) as Array<Record<string, unknown>>;
  res.json({
    results: rows.map((r) => ({
      ...r,
      matchingSkills: JSON.parse(String(r.matching_skills || '[]')),
      missingRequiredSkills: JSON.parse(String(r.missing_required_skills || '[]')),
      matchedPreferredSkills: JSON.parse(String(r.matched_preferred_skills || '[]')),
      weightsUsed: JSON.parse(String(r.weights_used || '{}')),
      shortlisted: Boolean(r.shortlisted),
    })),
  });
});

export async function screenCandidatesForJob(
  jobId: string,
  candidateIds: string[] | null,
  thresholdOverride: number | null,
  userId: string,
  companyId: string | null
) {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as Record<string, unknown> | undefined;
  if (!job) throw new Error('Selected Job Description not found.');

  const cfg = getScreeningConfig();
  const threshold = thresholdOverride ?? Number(job.shortlist_threshold || cfg.threshold);
  const jobInput = {
    id: String(job.id),
    title: String(job.title),
    requiredSkills: JSON.parse(String(job.required_skills || '[]')) as string[],
    preferredSkills: JSON.parse(String(job.preferred_skills || '[]')) as string[],
    minExperienceYears: job.min_experience_years as number | null,
    qualification: String(job.qualification || ''),
    certifications: JSON.parse(String(job.certifications || '[]')) as string[],
  };

  const targetCandidates = (
    candidateIds && candidateIds.length > 0
      ? db
          .prepare(
            `SELECT * FROM candidates WHERE id IN (${candidateIds.map(() => '?').join(',')})`
          )
          .all(...candidateIds)
      : db.prepare('SELECT * FROM candidates WHERE job_id = ? OR job_id IS NULL').all(jobId)
  ) as Array<Record<string, unknown>>;

  const screened: Array<Record<string, unknown>> = [];

  for (const c of targetCandidates) {
    const candId = String(c.id);
    const skillRows = db
      .prepare('SELECT skill_name FROM candidate_skills WHERE candidate_id = ?')
      .all(candId) as Array<{ skill_name: string }>;
    const resumeRow = db
      .prepare('SELECT extracted_text, parsed_json FROM resumes WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(candId) as { extracted_text: string; parsed_json: string } | undefined;

    let certs: string[] = [];
    if (resumeRow?.parsed_json) {
      try {
        certs = (JSON.parse(resumeRow.parsed_json).certifications as string[]) || [];
      } catch {
        certs = [];
      }
    }

    const breakdown = scoreCandidateAgainstJob(
      {
        skills: skillRows.map((s) => s.skill_name),
        experienceYears: c.experience_years as number | null,
        qualification: String(c.qualifications || ''),
        certifications: certs,
        rawText: resumeRow?.extracted_text || '',
      },
      jobInput,
      threshold,
      cfg.weights
    );

    const srId = createId('scr');
    db.prepare(
      `INSERT INTO screening_results (
        id, candidate_id, job_id, overall_score, skills_match, qualification_match,
        experience_match, preferred_skills_match, certifications_match,
        matching_skills, missing_required_skills, matched_preferred_skills,
        weights_used, criteria_version, shortlisted, explanation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      srId,
      candId,
      jobId,
      breakdown.overallScore,
      breakdown.skillsMatch,
      breakdown.qualificationMatch,
      breakdown.experienceMatch,
      breakdown.preferredSkillsMatch,
      breakdown.certificationsMatch,
      JSON.stringify(breakdown.matchingSkills),
      JSON.stringify(breakdown.missingRequiredSkills),
      JSON.stringify(breakdown.matchedPreferredSkills),
      JSON.stringify(breakdown.weightsUsed),
      breakdown.criteriaVersion,
      breakdown.shortlisted ? 1 : 0,
      breakdown.explanation
    );

    const prevStatus = String(c.status);
    const nextStatus = breakdown.recommendedStatus;
    db.prepare(
      `UPDATE candidates SET job_id = ?, status = ?, feedback = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(jobId, nextStatus, `Screening ${breakdown.overallScore}%: ${breakdown.explanation}`, candId);

    if (prevStatus !== nextStatus) {
      db.prepare(
        `INSERT INTO candidate_status_history (id, candidate_id, from_status, to_status, reason, changed_by) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(createId('hist'), candId, prevStatus, nextStatus, `Automated CV screening (${breakdown.overallScore}%)`, userId);
    }

    screened.push({
      id: srId,
      candidateId: candId,
      candidateName: c.name,
      candidateEmail: c.email,
      status: nextStatus,
      ...breakdown,
    });
  }

  await syncCandidatesToExcel();
  const shortlistedCount = screened.filter((s) => s.shortlisted).length;
  createNotification(
    companyId,
    'screening_complete',
    `Screening completed for ${jobInput.title}`,
    `Evaluated ${screened.length} candidate(s): ${shortlistedCount} Shortlisted (≥${threshold}%), ${screened.length - shortlistedCount} Needs Review.`,
    '/screening'
  );
  writeAuditLog(userId, 'screening_run', 'job', jobId, {
    threshold,
    total: screened.length,
    shortlistedCount,
  });

  return screened.sort((a, b) => Number(b.overallScore) - Number(a.overallScore));
}

coreRouter.post('/screening/run', requireAuth, upload.array('files', 25), async (req: AuthenticatedRequest, res) => {
  const jobId = String(req.body?.jobId || '').trim();
  const threshold = req.body?.threshold ? Number.parseInt(String(req.body.threshold), 10) : null;
  if (!jobId) {
    res.status(400).json({ error: 'Please select a Job Description.' });
    return;
  }

  const files = (req.files as Express.Multer.File[]) || [];
  const uploadedCandidateIds: string[] = [];
  const fileErrors: Array<{ filename: string; error: string }> = [];

  for (const f of files) {
    try {
      const outcome = await ingestResumeFile(f, jobId, req.user!.companyId, req.user!.id);
      if (outcome.candidateId) uploadedCandidateIds.push(outcome.candidateId);
    } catch (err) {
      fileErrors.push({ filename: f.originalname, error: (err as Error).message });
    }
  }

  const bodyIds = Array.isArray(req.body?.candidateIds)
    ? (req.body.candidateIds as string[])
    : typeof req.body?.candidateIds === 'string' && req.body.candidateIds.trim()
      ? JSON.parse(req.body.candidateIds)
      : null;

  const targetIds = uploadedCandidateIds.length > 0 ? uploadedCandidateIds : bodyIds;
  try {
    const results = await screenCandidatesForJob(jobId, targetIds, threshold, req.user!.id, req.user!.companyId);
    res.json({ results, fileErrors });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

coreRouter.post('/screening/:id/override', requireAuth, async (req: AuthenticatedRequest, res) => {
  const row = db.prepare('SELECT * FROM screening_results WHERE id = ?').get(req.params.id) as
    | { id: string; candidate_id: string }
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'Screening result not found.' });
    return;
  }
  const decision = String(req.body?.decision || '');
  const reason = String(req.body?.reason || 'Recruiter manual override').trim();
  if (decision !== 'Shortlisted' && decision !== 'Needs Review') {
    res.status(400).json({ error: 'Override decision must be Shortlisted or Needs Review.' });
    return;
  }

  const cand = db.prepare('SELECT status FROM candidates WHERE id = ?').get(row.candidate_id) as { status: string };
  db.prepare(
    `UPDATE screening_results SET shortlisted = ?, overridden_by = ?, override_reason = ? WHERE id = ?`
  ).run(decision === 'Shortlisted' ? 1 : 0, req.user!.id, reason, req.params.id);
  db.prepare(`UPDATE candidates SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
    decision,
    row.candidate_id
  );
  db.prepare(
    `INSERT INTO candidate_status_history (id, candidate_id, from_status, to_status, reason, changed_by) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(createId('hist'), row.candidate_id, cand.status, decision, reason, req.user!.id);

  await syncCandidatesToExcel();
  writeAuditLog(req.user!.id, 'screening_overridden', 'screening_result', req.params.id, { decision, reason });
  res.json({ ok: true });
});

// --- ANALYTICS ---
coreRouter.get('/analytics', requireAuth, (_req, res) => {
  const applicationsOverTime = db
    .prepare(
      `SELECT substr(created_at, 1, 10) as date, COUNT(*) as count
       FROM candidates GROUP BY substr(created_at, 1, 10) ORDER BY date ASC LIMIT 30`
    )
    .all();

  const statusDistribution = db
    .prepare(`SELECT status, COUNT(*) as count FROM candidates GROUP BY status ORDER BY count DESC`)
    .all();

  const jobMatching = db
    .prepare(
      `SELECT j.id, j.title,
        COUNT(DISTINCT c.id) as applicants,
        COUNT(DISTINCT CASE WHEN c.status = 'Shortlisted' THEN c.id END) as shortlisted,
        ROUND(AVG(sr.overall_score), 1) as avg_score,
        COUNT(DISTINCT CASE WHEN i.status = 'completed' THEN i.id END) as completed_interviews
       FROM jobs j
       LEFT JOIN candidates c ON c.job_id = j.id
       LEFT JOIN screening_results sr ON sr.job_id = j.id AND sr.candidate_id = c.id
       LEFT JOIN interviews i ON i.job_id = j.id
       GROUP BY j.id`
    )
    .all();

  const totalInterviews = (db.prepare('SELECT COUNT(*) as c FROM interviews').get() as { c: number }).c;
  const completedInterviews = (
    db.prepare(`SELECT COUNT(*) as c FROM interviews WHERE status = 'completed'`).get() as { c: number }
  ).c;
  const level2Invited = (
    db
      .prepare(`SELECT COUNT(*) as c FROM candidates WHERE status IN ('Level 2 Invited', 'Level 2 Scheduled', 'Selected')`)
      .get() as { c: number }
  ).c;

  res.json({
    applicationsOverTime,
    statusDistribution,
    jobMatching,
    rates: {
      interviewCompletionRate:
        totalInterviews > 0 ? Math.round((completedInterviews / totalInterviews) * 100) : 0,
      level1ToLevel2Rate:
        completedInterviews > 0 ? Math.round((level2Invited / completedInterviews) * 100) : 0,
      totalInterviews,
      completedInterviews,
      level2Invited,
    },
  });
});

coreRouter.get('/analytics/export/pdf', requireAuth, async (req: AuthenticatedRequest, res) => {
  const totalCandidates = (db.prepare('SELECT COUNT(*) as c FROM candidates').get() as { c: number }).c;
  const activeJobs = (db.prepare('SELECT COUNT(*) as c FROM jobs WHERE is_active = 1').get() as { c: number }).c;
  const completed = (
    db.prepare(`SELECT COUNT(*) as c FROM interviews WHERE status = 'completed'`).get() as { c: number }
  ).c;
  const statusBreakdown = db
    .prepare('SELECT status, COUNT(*) as count FROM candidates GROUP BY status')
    .all() as Array<{ status: string; count: number }>;
  const jobPerformance = db
    .prepare(
      `SELECT j.title,
        COUNT(DISTINCT c.id) as candidates,
        COUNT(DISTINCT CASE WHEN c.status = 'Shortlisted' THEN c.id END) as shortlisted,
        COUNT(DISTINCT CASE WHEN i.status = 'completed' THEN i.id END) as completed
       FROM jobs j LEFT JOIN candidates c ON c.job_id = j.id LEFT JOIN interviews i ON i.job_id = j.id GROUP BY j.id`
    )
    .all() as Array<{ title: string; candidates: number; shortlisted: number; completed: number }>;

  const buf = await buildAnalyticsPdfBuffer({
    companyName: req.user!.companyName,
    totals: {
      'Total Candidates': totalCandidates,
      'Active Jobs': activeJobs,
      'Completed Interviews': completed,
    },
    statusBreakdown,
    jobPerformance,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="HireFlow-Analytics.pdf"');
  res.send(buf);
});

// --- NOTIFICATIONS ---
coreRouter.get('/notifications', requireAuth, (_req, res) => {
  const items = db
    .prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50')
    .all();
  const unreadCount = (
    db.prepare('SELECT COUNT(*) as c FROM notifications WHERE is_read = 0').get() as { c: number }
  ).c;
  res.json({ notifications: items, unreadCount });
});

coreRouter.post('/notifications/:id/read', requireAuth, (req, res) => {
  if (req.params.id === 'all') {
    db.prepare('UPDATE notifications SET is_read = 1').run();
  } else {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
  }
  res.json({ ok: true });
});

// --- SETTINGS & INTEGRATIONS ---
coreRouter.get('/settings', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const settingsMap: Record<string, string> = {};
  for (const r of rows) settingsMap[r.key] = r.value;

  const llm = getLlmStatus();
  const telephony = getTelephonyStatus();
  const voice = getVoiceIntegrationStatus();
  const smtp = isSmtpConfigured();

  res.json({
    user: req.user,
    settings: settingsMap,
    integrations: {
      database: { configured: true, status: 'Connected', detail: 'SQLite + Candidate.xlsx sync active' },
      llm: {
        configured: llm.configured,
        status: llm.configured ? `Connected (${llm.activeProvider})` : 'Not configured',
        detail: llm.gemini
          ? 'Gemini API configured via server environment'
          : llm.anthropic
            ? 'Anthropic Claude API configured'
            : 'No LLM API key configured (deterministic fallback active)',
      },
      telephony: {
        configured: telephony.configured,
        status: telephony.configured ? `Connected (${telephony.provider})` : 'Not configured',
        detail: telephony.reason || 'Outbound Voice + Media Streams ready',
      },
      stt: {
        configured: voice.stt.configured,
        status: voice.stt.configured ? 'Connected' : 'Not configured',
        detail: voice.stt.label,
      },
      tts: {
        configured: voice.tts.configured,
        status: voice.tts.configured ? 'Connected' : 'Not configured',
        detail: voice.tts.label,
      },
      email: {
        configured: smtp,
        status: smtp ? 'Connected (SMTP)' : 'Not configured',
        detail: smtp
          ? 'SMTP transport configured for Level 2 invitations'
          : 'Set SMTP_HOST, SMTP_USER, SMTP_PASS in environment variables',
      },
    },
  });
});

coreRouter.put('/settings', requireAuth, (req: AuthenticatedRequest, res) => {
  const updates = req.body as Record<string, unknown>;
  const upsert = db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  );
  for (const [k, v] of Object.entries(updates)) {
    if (typeof k === 'string' && k.length > 0 && k.length < 80) {
      upsert.run(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
  }
  writeAuditLog(req.user!.id, 'settings_updated', 'settings', null, { keys: Object.keys(updates) });
  res.json({ ok: true });
});

coreRouter.post('/settings/retention-purge', requireAuth, (req: AuthenticatedRequest, res) => {
  const days = Math.max(1, Number.parseInt(String(req.body?.days || '90'), 10));
  const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const expiredResumes = db
    .prepare('SELECT id, stored_path FROM resumes WHERE created_at < ?')
    .all(cutoff) as Array<{ id: string; stored_path: string }>;

  let deletedFiles = 0;
  for (const r of expiredResumes) {
    if (r.stored_path && fs.existsSync(r.stored_path)) {
      fs.unlinkSync(r.stored_path);
      deletedFiles++;
    }
    db.prepare('DELETE FROM resumes WHERE id = ?').run(r.id);
  }
  writeAuditLog(req.user!.id, 'retention_purge', 'resumes', null, { days, deletedFiles });
  res.json({ purgedResumes: expiredResumes.length, deletedFiles });
});
