export const PIPELINE_STATUSES = [
  'Applied',
  'CV Screening',
  'Shortlisted',
  'Needs Review',
  'Level 1 Pending',
  'Level 1 Scheduled',
  'Level 1 Completed',
  'Recruiter Review',
  'Level 2 Invited',
  'Level 2 Scheduled',
  'Selected',
  'Rejected',
  'On Hold',
] as const;

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export const VALID_STATUS_TRANSITIONS: Record<PipelineStatus, PipelineStatus[]> = {
  Applied: ['CV Screening', 'Shortlisted', 'Needs Review', 'On Hold', 'Rejected'],
  'CV Screening': ['Shortlisted', 'Needs Review', 'Level 1 Pending', 'On Hold', 'Rejected'],
  Shortlisted: ['Level 1 Pending', 'Level 1 Scheduled', 'Recruiter Review', 'On Hold', 'Rejected'],
  'Needs Review': ['Shortlisted', 'Level 1 Pending', 'Recruiter Review', 'On Hold', 'Rejected'],
  'Level 1 Pending': ['Level 1 Scheduled', 'Level 1 Completed', 'Recruiter Review', 'On Hold', 'Rejected'],
  'Level 1 Scheduled': ['Level 1 Completed', 'Level 1 Pending', 'Recruiter Review', 'On Hold', 'Rejected'],
  'Level 1 Completed': ['Recruiter Review', 'Level 2 Invited', 'On Hold', 'Rejected'],
  'Recruiter Review': ['Level 2 Invited', 'Level 1 Pending', 'On Hold', 'Rejected', 'Selected'],
  'Level 2 Invited': ['Level 2 Scheduled', 'Recruiter Review', 'Selected', 'On Hold', 'Rejected'],
  'Level 2 Scheduled': ['Selected', 'Recruiter Review', 'On Hold', 'Rejected'],
  Selected: ['On Hold'],
  Rejected: ['Recruiter Review', 'Needs Review', 'On Hold'],
  'On Hold': ['CV Screening', 'Shortlisted', 'Level 1 Pending', 'Recruiter Review', 'Level 2 Invited', 'Rejected'],
};

export function canTransitionStatus(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = VALID_STATUS_TRANSITIONS[from as PipelineStatus];
  if (!allowed) return false;
  return allowed.includes(to as PipelineStatus);
}

export const SKILL_SYNONYMS: Record<string, string[]> = {
  javascript: ['js', 'ecmascript', 'es6', 'es2022', 'vanilla js'],
  typescript: ['ts'],
  python: ['py', 'python3', 'py3'],
  react: ['reactjs', 'react.js'],
  nodejs: ['node', 'node.js', 'node js'],
  nextjs: ['next', 'next.js'],
  postgresql: ['postgres', 'psql', 'pg'],
  mongodb: ['mongo'],
  kubernetes: ['k8s'],
  docker: ['containers', 'containerization'],
  aws: ['amazon web services'],
  gcp: ['google cloud', 'google cloud platform'],
  azure: ['microsoft azure'],
  sql: ['mysql', 'sqlite', 'tsql', 'plsql'],
  fastapi: ['fast api'],
  django: ['django rest framework', 'drf'],
  flask: ['flask api'],
  machinelearning: ['ml', 'machine learning'],
  ai: ['artificial intelligence', 'genai', 'generative ai', 'llm', 'llms'],
  tailwindcss: ['tailwind', 'tailwind css'],
  restapi: ['rest', 'restful', 'rest api', 'restful apis'],
  graphql: ['gql'],
  git: ['github', 'gitlab'],
  cicd: ['ci/cd', 'github actions', 'jenkins'],
  java: ['jdk', 'spring', 'spring boot'],
  cpp: ['c++'],
  csharp: ['c#', '.net', 'dotnet'],
};

const SYNONYM_LOOKUP = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(SKILL_SYNONYMS)) {
  SYNONYM_LOOKUP.set(canonical, canonical);
  for (const alias of aliases) {
    SYNONYM_LOOKUP.set(alias.toLowerCase().replace(/\s+/g, ' ').trim(), canonical);
  }
}

export function normalizeSkill(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^\w.+/#\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const compact = cleaned.replace(/[\s.-]/g, '');
  return SYNONYM_LOOKUP.get(cleaned) ?? SYNONYM_LOOKUP.get(compact) ?? cleaned;
}

export function normalizeSkillList(skills: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of skills) {
    const norm = normalizeSkill(s);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

export interface ScreeningWeights {
  requiredSkills: number;
  experience: number;
  qualification: number;
  preferredSkills: number;
  certifications: number;
}

export const DEFAULT_SCREENING_WEIGHTS: ScreeningWeights = {
  requiredSkills: 40,
  experience: 25,
  qualification: 15,
  preferredSkills: 10,
  certifications: 10,
};

export interface ScreeningJobInput {
  id: string;
  title: string;
  requiredSkills: string[];
  preferredSkills?: string[];
  minExperienceYears?: number | null;
  qualification?: string | null;
  certifications?: string[];
}

export interface ScreeningCandidateInput {
  skills: string[];
  experienceYears?: number | null;
  qualification?: string | null;
  certifications?: string[];
  rawText?: string;
}

export interface ScreeningBreakdown {
  overallScore: number;
  skillsMatch: number;
  qualificationMatch: number | null;
  experienceMatch: number | null;
  preferredSkillsMatch: number | null;
  certificationsMatch: number | null;
  matchingSkills: string[];
  missingRequiredSkills: string[];
  matchedPreferredSkills: string[];
  shortlisted: boolean;
  recommendedStatus: 'Shortlisted' | 'Needs Review';
  criteriaVersion: string;
  weightsUsed: Record<string, number>;
  explanation: string;
}

const QUALIFICATION_RANKS: Array<{ keywords: string[]; rank: number }> = [
  { keywords: ['phd', 'doctorate', 'ph.d'], rank: 5 },
  { keywords: ['m.tech', 'mtech', 'm.sc', 'msc', 'master', 'mca', 'mba', 'm.e', 'ms '], rank: 4 },
  { keywords: ['b.tech', 'btech', 'b.e', 'be ', 'b.sc', 'bsc', 'bca', 'bachelor', 'b.eng', 'graduate'], rank: 3 },
  { keywords: ['diploma', 'associate'], rank: 2 },
  { keywords: ['12th', 'high school', 'hsc'], rank: 1 },
];

export function extractQualificationRank(text?: string | null): number | null {
  if (!text || !text.trim()) return null;
  const lower = ` ${text.toLowerCase()} `;
  for (const tier of QUALIFICATION_RANKS) {
    if (tier.keywords.some((kw) => lower.includes(kw))) {
      return tier.rank;
    }
  }
  return null;
}

export function scoreCandidateAgainstJob(
  candidate: ScreeningCandidateInput,
  job: ScreeningJobInput,
  threshold = 70,
  weights: ScreeningWeights = DEFAULT_SCREENING_WEIGHTS,
  criteriaVersion = 'v1.0-deterministic'
): ScreeningBreakdown {
  const rawBlob = (candidate.rawText || '').toLowerCase();
  const candNormSet = new Set(normalizeSkillList(candidate.skills));

  // Also scan raw text for synonyms of JD skills when CV parsing missed a tag
  const checkSkillInCandidate = (jdSkill: string): boolean => {
    const norm = normalizeSkill(jdSkill);
    if (candNormSet.has(norm)) return true;
    if (!rawBlob) return false;
    const aliases = [jdSkill.toLowerCase(), norm, ...(SKILL_SYNONYMS[norm] || [])];
    return aliases.some((alias) => {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(rawBlob);
    });
  };

  // 1. Required Skills
  const reqSkills = job.requiredSkills.filter((s) => s.trim().length > 0);
  const matchingSkills: string[] = [];
  const missingRequiredSkills: string[] = [];
  for (const s of reqSkills) {
    if (checkSkillInCandidate(s)) matchingSkills.push(s);
    else missingRequiredSkills.push(s);
  }
  const skillsMatch = reqSkills.length > 0 ? Math.round((matchingSkills.length / reqSkills.length) * 100) : 100;

  // 2. Experience (exclude & renormalize if unknown on candidate OR not set on JD)
  let experienceMatch: number | null = null;
  if (
    job.minExperienceYears != null &&
    job.minExperienceYears > 0 &&
    candidate.experienceYears != null &&
    !Number.isNaN(candidate.experienceYears)
  ) {
    if (candidate.experienceYears >= job.minExperienceYears) {
      experienceMatch = 100;
    } else {
      experienceMatch = Math.max(
        15,
        Math.round((candidate.experienceYears / job.minExperienceYears) * 100)
      );
    }
  } else if (job.minExperienceYears === 0 && candidate.experienceYears != null) {
    experienceMatch = 100;
  }

  // 3. Qualification (exclude & renormalize if unknown)
  let qualificationMatch: number | null = null;
  const jobQualRank = extractQualificationRank(job.qualification);
  const candQualRank = extractQualificationRank(candidate.qualification);
  if (jobQualRank != null && candQualRank != null) {
    if (candQualRank >= jobQualRank) qualificationMatch = 100;
    else if (candQualRank === jobQualRank - 1) qualificationMatch = 70;
    else qualificationMatch = 40;
  }

  // 4. Preferred Skills (exclude & renormalize if JD has none)
  const prefSkills = (job.preferredSkills || []).filter((s) => s.trim().length > 0);
  const matchedPreferredSkills: string[] = [];
  let preferredSkillsMatch: number | null = null;
  if (prefSkills.length > 0) {
    for (const s of prefSkills) {
      if (checkSkillInCandidate(s)) matchedPreferredSkills.push(s);
    }
    preferredSkillsMatch = Math.round((matchedPreferredSkills.length / prefSkills.length) * 100);
  }

  // 5. Certifications (exclude & renormalize if JD lists none or candidate has unknown)
  const reqCerts = (job.certifications || []).filter((s) => s.trim().length > 0);
  let certificationsMatch: number | null = null;
  if (reqCerts.length > 0 && candidate.certifications && candidate.certifications.length > 0) {
    const candCertBlob = candidate.certifications.join(' ').toLowerCase();
    const matchedCerts = reqCerts.filter((c) => candCertBlob.includes(c.toLowerCase()));
    certificationsMatch = Math.round((matchedCerts.length / reqCerts.length) * 100);
  }

  // Renormalize weights strictly across known components (unknowns are never penalized)
  const activeComponents: Array<{ key: string; weight: number; score: number }> = [];
  if (reqSkills.length > 0) {
    activeComponents.push({ key: 'requiredSkills', weight: weights.requiredSkills, score: skillsMatch });
  }
  if (experienceMatch !== null) {
    activeComponents.push({ key: 'experience', weight: weights.experience, score: experienceMatch });
  }
  if (qualificationMatch !== null) {
    activeComponents.push({ key: 'qualification', weight: weights.qualification, score: qualificationMatch });
  }
  if (preferredSkillsMatch !== null) {
    activeComponents.push({ key: 'preferredSkills', weight: weights.preferredSkills, score: preferredSkillsMatch });
  }
  if (certificationsMatch !== null) {
    activeComponents.push({ key: 'certifications', weight: weights.certifications, score: certificationsMatch });
  }

  const totalWeight = activeComponents.reduce((sum, c) => sum + c.weight, 0);
  const weightsUsed: Record<string, number> = {};
  let overallScore = 0;

  if (totalWeight > 0) {
    for (const c of activeComponents) {
      const normalizedWeight = Number(((c.weight / totalWeight) * 100).toFixed(1));
      weightsUsed[c.key] = normalizedWeight;
      overallScore += (c.score * c.weight) / totalWeight;
    }
    overallScore = Math.round(overallScore);
  }

  const shortlisted = overallScore >= threshold;
  const recommendedStatus: 'Shortlisted' | 'Needs Review' = shortlisted ? 'Shortlisted' : 'Needs Review';

  const parts: string[] = [];
  if (reqSkills.length > 0) {
    parts.push(
      `Matched ${matchingSkills.length} of ${reqSkills.length} required skills (${skillsMatch}%)`
    );
  }
  if (missingRequiredSkills.length > 0) {
    parts.push(`Missing required skills: ${missingRequiredSkills.join(', ')}`);
  }
  if (experienceMatch !== null) {
    parts.push(
      `Experience alignment ${experienceMatch}% (${candidate.experienceYears} yrs vs ${job.minExperienceYears} yrs target)`
    );
  } else {
    parts.push('Experience not penalized (unspecified on CV or JD; weight renormalized)');
  }
  if (qualificationMatch !== null) {
    parts.push(`Qualification alignment ${qualificationMatch}%`);
  }
  parts.push(
    shortlisted
      ? `Overall ${overallScore}% meets the ${threshold}% shortlisting threshold.`
      : `Overall ${overallScore}% is below the ${threshold}% threshold — marked Needs Review for recruiter decision.`
  );

  return {
    overallScore,
    skillsMatch,
    qualificationMatch,
    experienceMatch,
    preferredSkillsMatch,
    certificationsMatch,
    matchingSkills,
    missingRequiredSkills,
    matchedPreferredSkills,
    shortlisted,
    recommendedStatus,
    criteriaVersion,
    weightsUsed,
    explanation: parts.join('. ') + '.',
  };
}

export const INTERVIEW_STAGES = [
  'introduction',
  'education',
  'experience',
  'technical',
  'scenario',
  'communication',
  'availability',
  'candidate_questions',
  'closing',
] as const;

export type InterviewStage = (typeof INTERVIEW_STAGES)[number];

export type InterviewAction = 'ask' | 'follow_up' | 'clarify' | 'advance' | 'repeat' | 'end';

export interface OrchestratorTurnDecision {
  action: InterviewAction;
  text: string;
  reason: string;
  nextStage: InterviewStage;
}

export function validateOrchestratorDecision(
  raw: unknown,
  currentStage: InterviewStage,
  followUpsOnCurrent: number,
  elapsedSeconds: number,
  hardLimitSeconds = 900
): OrchestratorTurnDecision {
  const stageIdx = INTERVIEW_STAGES.indexOf(currentStage);
  const nextIdx = Math.min(stageIdx + 1, INTERVIEW_STAGES.length - 1);
  const fallbackNext = INTERVIEW_STAGES[nextIdx];

  if (elapsedSeconds >= hardLimitSeconds) {
    return {
      action: 'end',
      text: 'Thank you for your time today. We have reached the end of our scheduled session. Our recruitment team will review your interview and update you about the next steps.',
      reason: 'Hard time limit reached',
      nextStage: 'closing',
    };
  }

  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const allowedActions: InterviewAction[] = ['ask', 'follow_up', 'clarify', 'advance', 'repeat', 'end'];
  let action: InterviewAction = allowedActions.includes(obj.action as InterviewAction)
    ? (obj.action as InterviewAction)
    : 'advance';

  // Enforce max 2 follow-ups per question
  if (action === 'follow_up' && followUpsOnCurrent >= 2) {
    action = stageIdx >= INTERVIEW_STAGES.length - 1 ? 'end' : 'advance';
  }

  let nextStage: InterviewStage = currentStage;
  if (action === 'advance') {
    nextStage = fallbackNext;
  } else if (action === 'end') {
    nextStage = 'closing';
  }

  if (elapsedSeconds >= hardLimitSeconds - 120 && currentStage !== 'closing' && action !== 'end') {
    nextStage = 'candidate_questions';
  }

  const text =
    typeof obj.text === 'string' && obj.text.trim().length > 0
      ? obj.text.trim()
      : 'Got it, thank you for sharing that. Let us move on to the next area.';
  const reason =
    typeof obj.reason === 'string' && obj.reason.trim().length > 0
      ? obj.reason.trim()
      : 'Validated orchestrator transition';

  return { action, text, reason, nextStage };
}

export function isWithinCallingWindow(
  date: Date = new Date(),
  startHour = 9,
  endHour = 21,
  timeZone = 'Asia/Kolkata'
): boolean {
  try {
    const hourStr = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone,
    }).format(date);
    const hour = Number.parseInt(hourStr, 10);
    return hour >= startHour && hour < endHour;
  } catch {
    const hour = date.getHours();
    return hour >= startHour && hour < endHour;
  }
}
