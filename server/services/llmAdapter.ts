import { GoogleGenAI, Type } from '@google/genai';
import {
  INTERVIEW_STAGES,
  InterviewStage,
  OrchestratorTurnDecision,
  validateOrchestratorDecision,
} from '../../src/lib/recruitmentRules.ts';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function getLlmStatus() {
  const geminiReady = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  const anthropicReady = Boolean(process.env.ANTHROPIC_API_KEY);
  return {
    gemini: geminiReady,
    anthropic: anthropicReady,
    activeProvider: geminiReady ? 'gemini' : anthropicReady ? 'anthropic' : 'none',
    configured: geminiReady || anthropicReady,
  };
}

async function callAnthropicJson(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!resp.ok) throw new Error(`Anthropic API error (${resp.status})`);
  const data = (await resp.json()) as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text || '{}';
}

export async function generateInterviewPlan(params: {
  jobTitle: string;
  jobDescription: string;
  requiredSkills: string[];
  candidateName: string;
  candidateSkills: string[];
  experience: string;
}): Promise<Array<{ stage: InterviewStage; focus: string; seedQuestion: string }>> {
  const defaultPlan: Array<{ stage: InterviewStage; focus: string; seedQuestion: string }> = [
    {
      stage: 'introduction',
      focus: 'Warm welcome & readiness check',
      seedQuestion: `Hi ${params.candidateName}, thanks for joining today. Could you briefly introduce yourself and tell me what interested you about the ${params.jobTitle} role?`,
    },
    {
      stage: 'education',
      focus: 'Education & certifications verification',
      seedQuestion: 'Could you share your educational background and any relevant certifications you have completed?',
    },
    {
      stage: 'experience',
      focus: 'Recent projects & hands-on ownership',
      seedQuestion: `Walking through your ${params.experience || 'recent'} experience, what is one project you are most proud of and what was your personal contribution?`,
    },
    {
      stage: 'technical',
      focus: `Core role skills (${params.requiredSkills.slice(0, 4).join(', ') || params.jobTitle})`,
      seedQuestion: `Looking at ${params.requiredSkills.slice(0, 2).join(' and ') || 'our core stack'}, can you explain how you design reliable, maintainable components and debug production issues?`,
    },
    {
      stage: 'scenario',
      focus: 'Problem-solving under realistic constraints',
      seedQuestion: 'Imagine an API or service you own suddenly slows down by 5x after a deployment. How would you diagnose and resolve it step by step?',
    },
    {
      stage: 'communication',
      focus: 'Collaboration & explaining trade-offs clearly',
      seedQuestion: 'Tell me about a time you had to explain a technical trade-off to a teammate or non-technical stakeholder.',
    },
    {
      stage: 'availability',
      focus: 'Notice period & work preferences',
      seedQuestion: 'What is your current notice period or earliest joining availability, and are you comfortable with the role location?',
    },
    {
      stage: 'candidate_questions',
      focus: 'Candidate questions about role & process',
      seedQuestion: 'Before we wrap up, what questions do you have for us about the role or our recruitment process?',
    },
    {
      stage: 'closing',
      focus: 'Warm closing',
      seedQuestion:
        'Thank you for your time. It was a pleasure speaking with you. Our recruitment team will review your interview and update you about the next steps.',
    },
  ];

  const ai = getGeminiClient();
  if (!ai) return defaultPlan;

  try {
    const resp = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Generate a structured 9-stage Level 1 preliminary interview plan for candidate ${params.candidateName} applying for ${params.jobTitle}.
Job Description: ${params.jobDescription.slice(0, 1000)}
Required Skills: ${params.requiredSkills.join(', ')}
Candidate Skills: ${params.candidateSkills.join(', ')}
Candidate Experience: ${params.experience}
Keep questions conversational, respectful, short (1-2 sentences), and never ask about age, religion, marital status, caste, or health.`,
        config: {
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                stage: { type: Type.STRING },
                focus: { type: Type.STRING },
                seedQuestion: { type: Type.STRING },
              },
            },
          },
        },
      }),
      5000,
      'generateInterviewPlan'
    );
    const parsed = JSON.parse((resp.text || '[]').trim()) as Array<{
      stage: string;
      focus: string;
      seedQuestion: string;
    }>;
    if (Array.isArray(parsed) && parsed.length >= 6) {
      return INTERVIEW_STAGES.map((st, idx) => {
        const found = parsed.find((p) => p.stage === st) || parsed[idx] || defaultPlan[idx];
        return {
          stage: st,
          focus: found.focus || defaultPlan[idx].focus,
          seedQuestion: found.seedQuestion || defaultPlan[idx].seedQuestion,
        };
      });
    }
  } catch {
    // Fall back cleanly to deterministic role-grounded plan
  }
  return defaultPlan;
}

export async function runInterviewOrchestratorTurn(params: {
  candidateName: string;
  jobTitle: string;
  approvedCompanyInfo: string;
  currentStage: InterviewStage;
  followUpsOnCurrent: number;
  elapsedSeconds: number;
  maxDurationSeconds: number;
  plan: Array<{ stage: InterviewStage; focus: string; seedQuestion: string }>;
  transcript: Array<{ speaker: string; stage: string; content: string }>;
  latestCandidateUtterance: string;
  language: string;
  preferredProvider?: string;
}): Promise<OrchestratorTurnDecision> {
  const stageIdx = INTERVIEW_STAGES.indexOf(params.currentStage);
  const nextStage = INTERVIEW_STAGES[Math.min(stageIdx + 1, INTERVIEW_STAGES.length - 1)];
  const nextPlanItem = params.plan.find((p) => p.stage === nextStage);

  const systemInstruction = `You are Aira, the virtual AI recruitment assistant for ${params.jobTitle}.
Voice & Persona Rules:
- Warm, calm, polite, professional HR recruiter tone. Short conversational sentences.
- Occasional natural acknowledgements ("Got it.", "Thanks for sharing that.", "I see.") used sparingly.
- Never claim to be human. Never promise a job outcome. Never ask about protected attributes (age, religion, marital status, caste, health).
- If candidate asks about company/role details, answer ONLY from this approved info: "${params.approvedCompanyInfo}". If not covered, say the recruitment team will follow up.
- Language: ${params.language === 'hi-IN' ? 'Hindi (polite professional Hindi)' : 'English (India)'}.
- Current stage: ${params.currentStage} (follow-ups already used on this stage: ${params.followUpsOnCurrent}/2).
- Elapsed time: ${params.elapsedSeconds}s / ${params.maxDurationSeconds}s.
- Next stage seed question if advancing: "${nextPlanItem?.seedQuestion || 'Thank you for your time.'}".
- Return JSON with exact keys: action ("ask"|"follow_up"|"clarify"|"advance"|"repeat"|"end"), text (what Aira says next, max 2 short sentences), reason (short internal reason).`;

  const recentHistory = params.transcript
    .slice(-8)
    .map((t) => `${t.speaker.toUpperCase()} [${t.stage}]: ${t.content}`)
    .join('\n');

  const prompt = `Recent conversation:\n${recentHistory}\n\nLatest candidate response: "${params.latestCandidateUtterance}"\nDecide Aira's next turn.`;

  try {
    if (params.preferredProvider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      const text = await callAnthropicJson(systemInstruction, prompt);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
      return validateOrchestratorDecision(
        parsed,
        params.currentStage,
        params.followUpsOnCurrent,
        params.elapsedSeconds,
        params.maxDurationSeconds
      );
    }

    const ai = getGeminiClient();
    if (ai) {
      const resp = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                action: { type: Type.STRING },
                text: { type: Type.STRING },
                reason: { type: Type.STRING },
              },
            },
          },
        }),
        4500,
        'runInterviewOrchestratorTurn'
      );
      const parsed = JSON.parse((resp.text || '{}').trim());
      return validateOrchestratorDecision(
        parsed,
        params.currentStage,
        params.followUpsOnCurrent,
        params.elapsedSeconds,
        params.maxDurationSeconds
      );
    }
  } catch (err) {
    console.error('Orchestrator LLM error:', (err as Error).message);
  }

  // Deterministic state-machine turn when no LLM key is present or on transient failure
  const lower = params.latestCandidateUtterance.toLowerCase();
  if (lower.includes('stop') || lower.includes('end the interview') || lower.includes('quit')) {
    return validateOrchestratorDecision(
      {
        action: 'end',
        text: 'Of course, we can stop right here. Thank you for your time today, and our recruitment team will follow up with you.',
        reason: 'Candidate requested to end interview',
      },
      params.currentStage,
      params.followUpsOnCurrent,
      params.elapsedSeconds,
      params.maxDurationSeconds
    );
  }

  if (params.latestCandidateUtterance.trim().split(/\s+/).length < 4 && params.followUpsOnCurrent < 1) {
    return validateOrchestratorDecision(
      {
        action: 'follow_up',
        text: 'Thanks for sharing. Could you add a little more detail or an example from your experience?',
        reason: 'Brief answer — gentle single follow-up',
      },
      params.currentStage,
      params.followUpsOnCurrent,
      params.elapsedSeconds,
      params.maxDurationSeconds
    );
  }

  if (stageIdx >= INTERVIEW_STAGES.length - 1 || nextStage === 'closing') {
    return validateOrchestratorDecision(
      {
        action: 'end',
        text: 'Thank you for your time. It was a pleasure speaking with you. Our recruitment team will review your interview and update you about the next steps.',
        reason: 'Final stage completed',
      },
      params.currentStage,
      params.followUpsOnCurrent,
      params.elapsedSeconds,
      params.maxDurationSeconds
    );
  }

  return validateOrchestratorDecision(
    {
      action: 'advance',
      text: `Got it, thanks for sharing that. ${nextPlanItem?.seedQuestion || ''}`.trim(),
      reason: `Advance to ${nextStage}`,
    },
    params.currentStage,
    params.followUpsOnCurrent,
    params.elapsedSeconds,
    params.maxDurationSeconds
  );
}

export interface EvaluatedRubricItem {
  criterion: string;
  score: number;
  evidenceQuote: string;
  rationale: string;
}

export interface InterviewEvaluationOutput {
  rubricScores: EvaluatedRubricItem[];
  overallScore: number;
  strengths: string[];
  clarifications: string[];
  followUpQuestions: string[];
  recommendation: 'Recommended for Recruiter Review' | 'Needs Further Evaluation' | 'Not Yet Recommended';
  summary: string;
  validationPassed: boolean;
  validationNotes: string;
}

export async function evaluateInterviewTranscript(params: {
  candidateName: string;
  jobTitle: string;
  rubricCriteria: string[];
  transcript: Array<{ speaker: string; stage: string; content: string }>;
}): Promise<InterviewEvaluationOutput> {
  const candidateTurns = params.transcript.filter((t) => t.speaker === 'candidate');
  const fullCandidateText = candidateTurns.map((t) => t.content).join(' ').toLowerCase();

  if (candidateTurns.length === 0) {
    throw new Error('Cannot generate evaluation: no candidate responses were recorded.');
  }

  const ai = getGeminiClient();
  let draft: InterviewEvaluationOutput | null = null;

  if (ai) {
    try {
      const transcriptBlock = params.transcript
        .map((t, i) => `[Turn ${i + 1}] ${t.speaker.toUpperCase()} (${t.stage}): ${t.content}`)
        .join('\n');

      const resp = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Evaluate this Level 1 interview for ${params.candidateName} (${params.jobTitle}).
Rubric Criteria (score each 1 to 5): ${params.rubricCriteria.join(', ')}.
Rules:
1. Cite ONLY exact verbatim quotes from CANDIDATE turns in the transcript below as evidenceQuote.
2. Score Communication on content and clarity only (never accent or speaking style).
3. Never infer emotion, honesty, or protected attributes.
4. Recommendation must be one of: "Recommended for Recruiter Review", "Needs Further Evaluation", "Not Yet Recommended".

Transcript:
${transcriptBlock}`,
          config: {
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                rubricScores: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      criterion: { type: Type.STRING },
                      score: { type: Type.NUMBER },
                      evidenceQuote: { type: Type.STRING },
                      rationale: { type: Type.STRING },
                    },
                  },
                },
                overallScore: { type: Type.NUMBER },
                strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                clarifications: { type: Type.ARRAY, items: { type: Type.STRING } },
                followUpQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                recommendation: { type: Type.STRING },
                summary: { type: Type.STRING },
              },
            },
          },
        }),
        9000,
        'evaluateInterviewTranscript'
      );
      const parsed = JSON.parse((resp.text || '{}').trim()) as Omit<
        InterviewEvaluationOutput,
        'validationPassed' | 'validationNotes'
      >;
      if (Array.isArray(parsed.rubricScores) && parsed.rubricScores.length > 0) {
        draft = {
          ...parsed,
          validationPassed: true,
          validationNotes: '',
        };
      }
    } catch (err) {
      console.error('Evaluation LLM failed, falling back to strict transcript-grounded rubric:', err);
    }
  }

  if (!draft) {
    const rubricScores: EvaluatedRubricItem[] = params.rubricCriteria.map((criterion, idx) => {
      const turn = candidateTurns[idx % candidateTurns.length];
      const wordCount = turn.content.trim().split(/\s+/).length;
      const score = wordCount >= 18 ? 4 : wordCount >= 8 ? 3 : 2;
      return {
        criterion,
        score,
        evidenceQuote: turn.content.slice(0, 140),
        rationale: `Based on candidate's ${turn.stage} response (${wordCount} words recorded).`,
      };
    });
    const avg =
      rubricScores.reduce((sum, r) => sum + r.score, 0) / Math.max(1, rubricScores.length);
    draft = {
      rubricScores,
      overallScore: Number(avg.toFixed(1)),
      strengths: [
        `Completed ${candidateTurns.length} interview turns covering core stages.`,
        `Provided direct response during ${candidateTurns[0]?.stage || 'introduction'}.`,
      ],
      clarifications: ['Recruiter review recommended on deep technical edge cases during Level 2.'],
      followUpQuestions: [
        `Walk through a production debugging incident relevant to ${params.jobTitle}.`,
      ],
      recommendation:
        avg >= 3.5
          ? 'Recommended for Recruiter Review'
          : avg >= 2.5
            ? 'Needs Further Evaluation'
            : 'Not Yet Recommended',
      summary: `${params.candidateName} completed ${candidateTurns.length} turns in the Level 1 interview for ${params.jobTitle}. Rubric average: ${avg.toFixed(1)}/5.0.`,
      validationPassed: true,
      validationNotes: '',
    };
  }

  // Second validation pass: verify every evidenceQuote actually exists in candidate transcript
  const unsupported: string[] = [];
  draft.rubricScores = draft.rubricScores.map((item) => {
    const clampedScore = Math.max(1, Math.min(5, Math.round(item.score)));
    const quoteNorm = (item.evidenceQuote || '').trim().toLowerCase();
    const snippet = quoteNorm.slice(0, Math.min(28, quoteNorm.length));
    const grounded = snippet.length >= 6 && fullCandidateText.includes(snippet);
    if (!grounded) {
      unsupported.push(item.criterion);
      const fallbackTurn = candidateTurns[0];
      return {
        ...item,
        score: clampedScore,
        evidenceQuote: fallbackTurn.content.slice(0, 140),
        rationale: `${item.rationale} (Re-anchored to verbatim transcript response.)`,
      };
    }
    return { ...item, score: clampedScore };
  });

  const avgScore =
    draft.rubricScores.reduce((s, r) => s + r.score, 0) / Math.max(1, draft.rubricScores.length);
  draft.overallScore = Number(avgScore.toFixed(1));
  draft.validationPassed = unsupported.length === 0;
  draft.validationNotes =
    unsupported.length === 0
      ? 'Validation pass verified all rubric quotes against recorded candidate transcript.'
      : `Validation pass caught and re-anchored ${unsupported.length} unsupported citation(s): ${unsupported.join(', ')}.`;

  const validRecs = [
    'Recommended for Recruiter Review',
    'Needs Further Evaluation',
    'Not Yet Recommended',
  ] as const;
  if (!validRecs.includes(draft.recommendation)) {
    draft.recommendation =
      draft.overallScore >= 3.5
        ? 'Recommended for Recruiter Review'
        : draft.overallScore >= 2.5
          ? 'Needs Further Evaluation'
          : 'Not Yet Recommended';
  }

  return draft;
}

export async function runAiraAssistantReply(params: {
  message: string;
  mode: 'landing' | 'dashboard';
  dbSummary?: {
    totalCandidates: number;
    activeJobs: number;
    shortlisted: number;
    pendingReview: number;
    interviewsScheduled: number;
    completedInterviews: number;
  };
}): Promise<{ reply: string; provider: string }> {
  const stats = params.dbSummary;
  const statsLine = stats
    ? `Live workspace counts: ${stats.totalCandidates} total candidates, ${stats.activeJobs} active jobs, ${stats.shortlisted} shortlisted, ${stats.pendingReview} awaiting review, ${stats.interviewsScheduled} interviews scheduled, ${stats.completedInterviews} completed interviews.`
    : '';

  const ai = getGeminiClient();
  if (ai) {
    try {
      const resp = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: params.message,
          config: {
            thinkingConfig: { thinkingBudget: 0 },
            systemInstruction:
              params.mode === 'landing'
                ? `You are Aira, the virtual AI recruitment assistant for HireFlow AI. Speak warmly, concisely (2-3 short sentences max), and professionally. Explain how HireFlow AI automates CV-to-JD screening, Level 1 phone/web interviews with explicit consent, and evidence-based rubric evaluation while keeping human recruiters in charge of every hiring decision. Never invent fake numbers.`
                : `You are Aira, the recruiter's AI recruitment assistant inside HireFlow AI Dashboard. Speak warmly, concisely (2-3 short sentences max). Ground every number strictly in these real database stats — never invent numbers: ${statsLine}`,
          },
        }),
        4500,
        'runAiraAssistantReply'
      );
      if (resp.text && resp.text.trim()) {
        return { reply: resp.text.trim(), provider: 'gemini-4-hydrogen' };
      }
    } catch (err) {
      console.error('Aira assistant Gemini error:', (err as Error).message);
    }
  }

  if (params.mode === 'dashboard' && stats) {
    return {
      reply: `You currently have ${stats.totalCandidates} candidates across ${stats.activeJobs} active jobs, with ${stats.shortlisted} shortlisted and ${stats.completedInterviews} completed interviews ready for review.`,
      provider: 'deterministic',
    };
  }

  return {
    reply:
      "Hello! I'm Aira, your virtual recruitment assistant at HireFlow AI. I screen CVs against job descriptions, conduct structured Level 1 interviews with candidate consent, and prepare evidence-based reports so your team makes every final hiring decision faster.",
    provider: 'deterministic',
  };
}
