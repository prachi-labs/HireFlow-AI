import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const STORAGE_DIR = path.resolve(process.cwd(), 'storage');
const RESUMES_DIR = path.join(STORAGE_DIR, 'resumes');
const JDS_DIR = path.join(STORAGE_DIR, 'jds');
const DB_PATH = path.join(STORAGE_DIR, 'hireflow.db');

fs.mkdirSync(RESUMES_DIR, { recursive: true });
fs.mkdirSync(JDS_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function getStoragePaths() {
  return {
    storageDir: STORAGE_DIR,
    resumesDir: RESUMES_DIR,
    jdsDir: JDS_DIR,
    excelPath: path.join(STORAGE_DIR, 'Candidate.xlsx'),
  };
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      approved_info TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'recruiter',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      department TEXT NOT NULL DEFAULT 'Engineering',
      location TEXT NOT NULL DEFAULT 'Bengaluru / Hybrid',
      employment_type TEXT NOT NULL DEFAULT 'Full-Time',
      description TEXT NOT NULL,
      required_skills TEXT NOT NULL DEFAULT '[]',
      preferred_skills TEXT NOT NULL DEFAULT '[]',
      min_experience_years REAL,
      qualification TEXT,
      certifications TEXT NOT NULL DEFAULT '[]',
      rubric_json TEXT NOT NULL DEFAULT '[]',
      shortlist_threshold INTEGER NOT NULL DEFAULT 70,
      is_active INTEGER NOT NULL DEFAULT 1,
      source_file TEXT,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY,
      company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
      job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      qualifications TEXT NOT NULL DEFAULT '',
      passing_year TEXT NOT NULL DEFAULT '',
      experience TEXT NOT NULL DEFAULT '',
      experience_years REAL,
      feedback TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Applied',
      notes TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual',
      applied_verified INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS resumes (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      original_filename TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_hash TEXT NOT NULL,
      extracted_text TEXT NOT NULL,
      parsed_json TEXT NOT NULL DEFAULT '{}',
      parse_status TEXT NOT NULL DEFAULT 'parsed',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS candidate_skills (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      skill_name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'cv'
    );

    CREATE TABLE IF NOT EXISTS screening_results (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      overall_score INTEGER NOT NULL,
      skills_match INTEGER NOT NULL,
      qualification_match INTEGER,
      experience_match INTEGER,
      preferred_skills_match INTEGER,
      certifications_match INTEGER,
      matching_skills TEXT NOT NULL DEFAULT '[]',
      missing_required_skills TEXT NOT NULL DEFAULT '[]',
      matched_preferred_skills TEXT NOT NULL DEFAULT '[]',
      weights_used TEXT NOT NULL DEFAULT '{}',
      criteria_version TEXT NOT NULL DEFAULT 'v1.0',
      shortlisted INTEGER NOT NULL DEFAULT 0,
      overridden_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      override_reason TEXT,
      explanation TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      threshold INTEGER NOT NULL DEFAULT 70,
      mode TEXT NOT NULL DEFAULT 'web_and_phone',
      calling_window_start INTEGER NOT NULL DEFAULT 9,
      calling_window_end INTEGER NOT NULL DEFAULT 21,
      max_concurrency INTEGER NOT NULL DEFAULT 2,
      max_retries INTEGER NOT NULL DEFAULT 2,
      retry_delay_hours INTEGER NOT NULL DEFAULT 4,
      authorized_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      authorized_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS interviews (
      id TEXT PRIMARY KEY,
      campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
      candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      mode TEXT NOT NULL DEFAULT 'web',
      access_token TEXT NOT NULL UNIQUE,
      token_expires_at TEXT NOT NULL,
      plan_json TEXT NOT NULL DEFAULT '[]',
      current_stage TEXT NOT NULL DEFAULT 'introduction',
      status TEXT NOT NULL DEFAULT 'scheduled',
      language TEXT NOT NULL DEFAULT 'en-IN',
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      median_latency_ms INTEGER,
      started_at TEXT,
      ended_at TEXT,
      failure_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS interview_questions (
      id TEXT PRIMARY KEY,
      interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      question_text TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      asked INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS interview_responses (
      id TEXT PRIMARY KEY,
      interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
      speaker TEXT NOT NULL,
      stage TEXT NOT NULL,
      content TEXT NOT NULL,
      action TEXT,
      latency_ms INTEGER,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS interview_evaluations (
      id TEXT PRIMARY KEY,
      interview_id TEXT NOT NULL UNIQUE REFERENCES interviews(id) ON DELETE CASCADE,
      candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      rubric_scores TEXT NOT NULL DEFAULT '[]',
      overall_score REAL NOT NULL,
      strengths TEXT NOT NULL DEFAULT '[]',
      clarifications TEXT NOT NULL DEFAULT '[]',
      follow_up_questions TEXT NOT NULL DEFAULT '[]',
      recommendation TEXT NOT NULL,
      summary TEXT NOT NULL,
      validation_passed INTEGER NOT NULL DEFAULT 1,
      validation_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
      candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'twilio',
      provider_call_sid TEXT,
      to_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      attempt_number INTEGER NOT NULL DEFAULT 1,
      next_retry_at TEXT,
      error_message TEXT,
      started_at TEXT,
      ended_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS consent_records (
      id TEXT PRIMARY KEY,
      interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
      candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      identity_confirmed INTEGER NOT NULL DEFAULT 0,
      recording_consented INTEGER NOT NULL DEFAULT 0,
      preferred_language TEXT NOT NULL DEFAULT 'en-IN',
      human_alternative_requested INTEGER NOT NULL DEFAULT 0,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS email_logs (
      id TEXT PRIMARY KEY,
      candidate_id TEXT REFERENCES candidates(id) ON DELETE SET NULL,
      job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      template_type TEXT NOT NULL DEFAULT 'level2_invite',
      meeting_details TEXT NOT NULL DEFAULT '{}',
      provider TEXT NOT NULL DEFAULT 'smtp',
      status TEXT NOT NULL,
      provider_message_id TEXT,
      error_message TEXT,
      sent_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT NOT NULL DEFAULT '/dashboard',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS candidate_status_history (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status);
    CREATE INDEX IF NOT EXISTS idx_candidates_job ON candidates(job_id);
    CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email);
    CREATE INDEX IF NOT EXISTS idx_resumes_hash ON resumes(file_hash);
    CREATE INDEX IF NOT EXISTS idx_screening_job ON screening_results(job_id);
    CREATE INDEX IF NOT EXISTS idx_interviews_token ON interviews(access_token);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
  `);

  seedInitialData();
}

function seedInitialData() {
  const companyCount = db.prepare('SELECT COUNT(*) as cnt FROM companies').get() as { cnt: number };
  if (companyCount.cnt > 0) return;

  const companyId = 'comp_hireflow_default';
  db.prepare(
    `INSERT INTO companies (id, name, approved_info) VALUES (?, ?, ?)`
  ).run(
    companyId,
    'HireFlow Tech India',
    'HireFlow Tech India is a product-focused engineering organization headquartered in Bengaluru with hybrid remote flexibility, structured 2-round technical interviews, and comprehensive health & learning benefits.'
  );

  const userId = 'user_recruiter_demo';
  const passwordHash = bcrypt.hashSync('HireFlow@2026', 10);
  db.prepare(
    `INSERT INTO users (id, company_id, first_name, last_name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, companyId, 'Ananya', 'Sharma', 'recruiter@hireflow.ai', passwordHash, 'admin');

  const defaultSettings: Record<string, string> = {
    'aira.voice': 'en-IN-NeerjaNeural',
    'aira.language': 'en-IN',
    'aira.speechRate': '0.95',
    'aira.maxDurationMinutes': '15',
    'screening.threshold': '70',
    'screening.weights': JSON.stringify({
      requiredSkills: 40,
      experience: 25,
      qualification: 15,
      preferredSkills: 10,
      certifications: 10,
    }),
    'llm.provider': 'gemini',
    'telephony.callingStartHour': '9',
    'telephony.callingEndHour': '21',
    'telephony.maxRetries': '2',
    'telephony.retryDelayHours': '4',
    'retention.days': '90',
  };

  const upsertSetting = db.prepare(
    `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`
  );
  for (const [k, v] of Object.entries(defaultSettings)) {
    upsertSetting.run(k, v);
  }

  // Realistic active JDs so Step 1 ("Job Descriptions already exist in the system") works immediately
  const jobs = [
    {
      id: 'job_python_backend',
      title: 'Senior Python Backend Engineer',
      department: 'Platform Engineering',
      location: 'Bengaluru / Hybrid',
      employment_type: 'Full-Time',
      description:
        'Design and operate scalable Python APIs using FastAPI/Django, PostgreSQL, Docker, and AWS. Lead code reviews, optimize SQL queries, and mentor mid-level engineers.',
      required_skills: JSON.stringify(['Python', 'FastAPI', 'PostgreSQL', 'SQL', 'Docker', 'REST API']),
      preferred_skills: JSON.stringify(['AWS', 'Kubernetes', 'CI/CD']),
      min_experience_years: 3,
      qualification: 'B.Tech / B.E. in Computer Science or equivalent',
      certifications: JSON.stringify([]),
      rubric_json: JSON.stringify([
        'Technical Knowledge',
        'Job-Relevant Experience',
        'Problem-Solving',
        'Communication',
        'Role-Specific Knowledge',
        'Qualification Relevance',
      ]),
      shortlist_threshold: 70,
    },
    {
      id: 'job_fullstack_react',
      title: 'Full-Stack React & TypeScript Engineer',
      department: 'Product Engineering',
      location: 'Remote (India)',
      employment_type: 'Full-Time',
      description:
        'Build responsive web applications with React, TypeScript, Node.js, and PostgreSQL. Own end-to-end feature delivery, testing, and API contracts.',
      required_skills: JSON.stringify(['React', 'TypeScript', 'JavaScript', 'NodeJS', 'PostgreSQL', 'TailwindCSS']),
      preferred_skills: JSON.stringify(['NextJS', 'GraphQL', 'Docker']),
      min_experience_years: 2,
      qualification: 'B.Tech / BCA / B.Sc Computer Science',
      certifications: JSON.stringify([]),
      rubric_json: JSON.stringify([
        'Technical Knowledge',
        'Job-Relevant Experience',
        'Problem-Solving',
        'Communication',
        'Role-Specific Knowledge',
        'Qualification Relevance',
      ]),
      shortlist_threshold: 70,
    },
    {
      id: 'job_ai_engineer',
      title: 'Applied AI & LLM Engineer',
      department: 'AI Systems',
      location: 'Hyderabad / Hybrid',
      employment_type: 'Full-Time',
      description:
        'Develop production RAG pipelines, structured prompt evaluation harnesses, and conversational voice/text workflows using Python, TypeScript, and modern LLM APIs.',
      required_skills: JSON.stringify(['Python', 'AI', 'Machine Learning', 'REST API', 'SQL']),
      preferred_skills: JSON.stringify(['TypeScript', 'Docker', 'AWS']),
      min_experience_years: 2,
      qualification: 'B.Tech / M.Tech in CS/AI',
      certifications: JSON.stringify([]),
      rubric_json: JSON.stringify([
        'Technical Knowledge',
        'Job-Relevant Experience',
        'Problem-Solving',
        'Communication',
        'Role-Specific Knowledge',
        'Qualification Relevance',
      ]),
      shortlist_threshold: 75,
    },
  ];

  const insertJob = db.prepare(`
    INSERT INTO jobs (
      id, company_id, title, department, location, employment_type,
      description, required_skills, preferred_skills, min_experience_years,
      qualification, certifications, rubric_json, shortlist_threshold, is_active, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  for (const j of jobs) {
    insertJob.run(
      j.id,
      companyId,
      j.title,
      j.department,
      j.location,
      j.employment_type,
      j.description,
      j.required_skills,
      j.preferred_skills,
      j.min_experience_years,
      j.qualification,
      j.certifications,
      j.rubric_json,
      j.shortlist_threshold,
      userId
    );
  }

  // Two clean Applied candidates (no fabricated scores/interviews) so Candidates & Candidate.xlsx work immediately
  const sampleCandidates = [
    {
      id: 'cand_1001',
      job_id: 'job_python_backend',
      name: 'Rohan Kulkarni',
      phone: '+91 98450 11223',
      email: 'rohan.kulkarni@example.com',
      qualifications: 'B.Tech Computer Science',
      passing_year: '2021',
      experience: '4 years',
      experience_years: 4,
      skills: ['Python', 'FastAPI', 'PostgreSQL', 'Docker', 'AWS'],
      feedback: 'Applied via career portal',
      status: 'Applied',
    },
    {
      id: 'cand_1002',
      job_id: 'job_fullstack_react',
      name: 'Meera Nair',
      phone: '+91 98801 44556',
      email: 'meera.nair@example.com',
      qualifications: 'B.E. Information Technology',
      passing_year: '2022',
      experience: '3 years',
      experience_years: 3,
      skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'TailwindCSS'],
      feedback: 'Applied via referral',
      status: 'Applied',
    },
  ];

  const insertCand = db.prepare(`
    INSERT INTO candidates (
      id, company_id, job_id, name, phone, email, qualifications, passing_year,
      experience, experience_years, feedback, status, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed')
  `);
  const insertSkill = db.prepare(
    `INSERT INTO candidate_skills (id, candidate_id, skill_name, normalized_name, source) VALUES (?, ?, ?, ?, 'seed')`
  );
  const insertHist = db.prepare(
    `INSERT INTO candidate_status_history (id, candidate_id, from_status, to_status, reason) VALUES (?, ?, NULL, ?, 'Application recorded')`
  );

  for (const c of sampleCandidates) {
    insertCand.run(
      c.id,
      companyId,
      c.job_id,
      c.name,
      c.phone,
      c.email,
      c.qualifications,
      c.passing_year,
      c.experience,
      c.experience_years,
      c.feedback,
      c.status
    );
    for (const s of c.skills) {
      insertSkill.run(`sk_${crypto.randomUUID().slice(0, 8)}`, c.id, s, s.toLowerCase());
    }
    insertHist.run(`hist_${crypto.randomUUID().slice(0, 8)}`, c.id, c.status);
  }

  db.prepare(
    `INSERT INTO notifications (id, company_id, type, title, message, link) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    'notif_welcome',
    companyId,
    'system',
    'Workspace ready',
    '3 active job descriptions and 2 initial applications are ready. Upload CVs or start a screening campaign to begin.',
    '/screening'
  );
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function writeAuditLog(
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {}
) {
  db.prepare(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(createId('aud'), userId, action, entityType, entityId, JSON.stringify(details));
}

export function createNotification(
  companyId: string | null,
  type: string,
  title: string,
  message: string,
  link = '/dashboard'
) {
  db.prepare(
    `INSERT INTO notifications (id, company_id, type, title, message, link) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(createId('notif'), companyId, type, title, message, link);
}
