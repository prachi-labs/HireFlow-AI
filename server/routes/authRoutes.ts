
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import {
  completePasswordReset,
  loginRecruiter,
  registerRecruiter,
  requestPasswordReset,
} from '../services/authService.ts';

import {
  AuthenticatedRequest,
  extractSessionUser,
  requireAuth,
} from '../middleware/auth.ts';

import { db, writeAuditLog } from '../db/database.ts';

export const authRouter = Router();

// Cookie configuration shared by registration, login and logout.
const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
  path: '/',
};

// Registration validation
const registerSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid work email is required'),
  companyName: z.string().min(1, 'Company name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
});

// Login validation
const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

// Register recruiter
authRouter.post('/register', (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid registration data',
    });
    return;
  }

  if (parsed.data.password !== parsed.data.confirmPassword) {
    res.status(400).json({ error: 'Passwords do not match.' });
    return;
  }

  try {
    const { user, token } = registerRecruiter(parsed.data);

    res.cookie('hf_session', token, {
      ...sessionCookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({ user });
  } catch (err) {
    const status = (err as Error & { status?: number }).status || 400;

    res.status(status).json({
      error: (err as Error).message,
    });
  }
});

// Login recruiter
authRouter.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid credentials',
    });
    return;
  }

  try {
    const rememberMe = parsed.data.rememberMe ?? true;

    const { user, token } = loginRecruiter(
      parsed.data.email,
      parsed.data.password,
      rememberMe
    );

    res.cookie('hf_session', token, {
      ...sessionCookieOptions,
      maxAge: (rememberMe ? 7 * 24 : 24) * 60 * 60 * 1000,
    });

    res.json({ user });
  } catch (err) {
    const status = (err as Error & { status?: number }).status || 401;

    res.status(status).json({
      error: (err as Error).message,
    });
  }
});

// Logout recruiter
authRouter.post('/logout', (_req, res) => {
  res.clearCookie('hf_session', sessionCookieOptions);

  res.json({ ok: true });
});

// Get current authenticated user
authRouter.get('/me', (req, res) => {
  const user = extractSessionUser(req);

  res.json({ user: user ?? null });
});

// Request password reset
authRouter.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim();

  if (!email) {
    res.status(400).json({
      error: 'Work email is required.',
    });
    return;
  }

  try {
    const origin = `${req.protocol}://${req.get('host')}`;
    const result = await requestPasswordReset(email, origin);

    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: (err as Error).message || 'Unable to process password reset request.',
    });
  }
});

// Complete password reset
authRouter.post('/reset-password', (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');

  if (!token || password.length < 8) {
    res.status(400).json({
      error: 'Valid reset token and password (min 8 chars) required.',
    });
    return;
  }

  try {
    completePasswordReset(token, password);

    res.json({
      ok: true,
      message: 'Password updated. You may now sign in.',
    });
  } catch (err) {
    res.status(400).json({
      error: (err as Error).message,
    });
  }
});

// Change authenticated user's password
authRouter.post(
  '/change-password',
  requireAuth,
  (req: AuthenticatedRequest, res) => {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (newPassword.length < 8) {
      res.status(400).json({
        error: 'New password must be at least 8 characters.',
      });
      return;
    }

    const row = db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(req.user!.id) as { password_hash: string } | undefined;

    if (!row || !bcrypt.compareSync(currentPassword, row.password_hash)) {
      res.status(400).json({
        error: 'Current password is incorrect.',
      });
      return;
    }

    const nextHash = bcrypt.hashSync(newPassword, 10);

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      nextHash,
      req.user!.id
    );

    writeAuditLog(
      req.user!.id,
      'password_changed',
      'user',
      req.user!.id
    );

    res.json({ ok: true });
  }
);
