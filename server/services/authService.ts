import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db, createId, writeAuditLog } from '../db/database.ts';
import { sendEmailMessage } from './adapters/emailAdapter.ts';

const SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : crypto.createHash('sha256').update(process.cwd() + '_hireflow_dev_session').digest('hex');

export interface SessionUser {
  id: string;
  companyId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  companyName: string;
}

export function signSessionToken(userId: string, rememberMe = true): string {
  const exp = Date.now() + (rememberMe ? 7 * 24 : 24) * 3600 * 1000;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined): { uid: string; exp: number } | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid: string;
      exp: number;
    };
    if (!parsed.uid || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getUserById(userId: string): SessionUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.company_id, u.first_name, u.last_name, u.email, u.role, COALESCE(c.name, 'HireFlow Workspace') as company_name
       FROM users u LEFT JOIN companies c ON u.company_id = c.id
       WHERE u.id = ?`
    )
    .get(userId) as
    | {
        id: string;
        company_id: string | null;
        first_name: string;
        last_name: string;
        email: string;
        role: string;
        company_name: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    role: row.role,
    companyName: row.company_name,
  };
}

export function registerRecruiter(input: {
  firstName: string;
  lastName: string;
  email: string;
  companyName: string;
  password: string;
}): { user: SessionUser; token: string } {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(normalizedEmail);
  if (existing) {
    const err = new Error('An account with this work email already exists. Please sign in instead.');
    (err as Error & { status?: number }).status = 409;
    throw err;
  }

  let company = db
    .prepare('SELECT id FROM companies WHERE lower(name) = ?')
    .get(input.companyName.trim().toLowerCase()) as { id: string } | undefined;

  if (!company) {
    const companyId = createId('comp');
    db.prepare(`INSERT INTO companies (id, name, approved_info) VALUES (?, ?, ?)`).run(
      companyId,
      input.companyName.trim(),
      `${input.companyName.trim()} uses HireFlow AI for structured Level 1 candidate screening.`
    );
    company = { id: companyId };
  }

  const userId = createId('usr');
  const passwordHash = bcrypt.hashSync(input.password, 10);
  db.prepare(
    `INSERT INTO users (id, company_id, first_name, last_name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?, 'recruiter')`
  ).run(userId, company.id, input.firstName.trim(), input.lastName.trim(), normalizedEmail, passwordHash);

  writeAuditLog(userId, 'user_registered', 'user', userId, { email: normalizedEmail });
  const user = getUserById(userId)!;
  return { user, token: signSessionToken(userId, true) };
}

export function loginRecruiter(email: string, password: string, rememberMe = true): { user: SessionUser; token: string } {
  const normalizedEmail = email.trim().toLowerCase();
  const row = db
    .prepare('SELECT id, password_hash FROM users WHERE lower(email) = ?')
    .get(normalizedEmail) as { id: string; password_hash: string } | undefined;

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    const err = new Error('Invalid email or password.');
    (err as Error & { status?: number }).status = 401;
    throw err;
  }

  writeAuditLog(row.id, 'user_login', 'user', row.id, { email: normalizedEmail });
  const user = getUserById(row.id)!;
  return { user, token: signSessionToken(row.id, rememberMe) };
}

export async function requestPasswordReset(email: string, origin: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = db
    .prepare('SELECT id, first_name, email FROM users WHERE lower(email) = ?')
    .get(normalizedEmail) as { id: string; first_name: string; email: string } | undefined;

  if (!user) {
    return {
      sent: false,
      configured: true,
      message: 'If an account matches that email, a password reset link will be dispatched when SMTP is configured.',
    };
  }

  const rawToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

  db.prepare(
    `INSERT INTO password_resets (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`
  ).run(createId('rst'), user.id, tokenHash, expiresAt);

  const resetUrl = `${origin}/login?resetToken=${rawToken}`;
  const mailResult = await sendEmailMessage({
    to: user.email,
    subject: 'HireFlow AI — Password Reset Request',
    body: `Hello ${user.first_name},\n\nUse the link below within 1 hour to reset your HireFlow AI password:\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.\n\nHireFlow AI`,
    templateType: 'password_reset',
    sentBy: user.id,
  });

  if (!mailResult.sent) {
    return {
      sent: false,
      configured: mailResult.configured,
      message: mailResult.error || 'Email provider not configured; reset email was not sent.',
    };
  }

  return {
    sent: true,
    configured: true,
    message: 'Password reset instructions sent to your work email.',
  };
}

export function completePasswordReset(rawToken: string, newPassword: string) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const record = db
    .prepare(
      `SELECT id, user_id, expires_at, used_at FROM password_resets WHERE token_hash = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(tokenHash) as { id: string; user_id: string; expires_at: string; used_at: string | null } | undefined;

  if (!record || record.used_at || new Date(record.expires_at).getTime() < Date.now()) {
    const err = new Error('Reset link is invalid or expired.');
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, record.user_id);
  db.prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE id = ?`).run(record.id);
  writeAuditLog(record.user_id, 'password_reset_completed', 'user', record.user_id);
}
