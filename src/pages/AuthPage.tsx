import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import recruiterPortrait from '../assets/images/recruiter_login_portrait_1794974368385.jpg';

export function AuthPage({ initialMode }: { initialMode: 'login' | 'signup' }) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get('resetToken');

  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(Boolean(resetToken));

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    companyName: '',
    password: '',
    confirmPassword: '',
  });
  const [forgotEmail, setForgotEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const switchMode = (next: 'login' | 'signup') => {
  setMode(next);
  setError(null);
  setInfoMsg(null);
  setForgotOpen(false);

  navigate(next === 'login' ? '/login' : '/signup', {
    replace: true,
  });
};

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(form.email, form.password, rememberMe);
        navigate('/dashboard');
      } else {
        if (form.password !== form.confirmPassword) {
          throw new Error('Passwords do not match.');
        }
        await register({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          companyName: form.companyName,
          password: form.password,
          confirmPassword: form.confirmPassword,
        });
        navigate('/dashboard');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);
    setLoading(true);
    try {
      if (resetToken) {
        const res = await apiRequest<{ message: string }>('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token: resetToken, password: newPassword }),
        });
        setInfoMsg(res.message);
        setForgotOpen(false);
      } else {
        const res = await apiRequest<{ message: string }>('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email: forgotEmail }),
        });
        setInfoMsg(res.message);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const fillDemoRecruiter = () => {
    setMode('login');
    setForgotOpen(false);
    setForm((prev) => ({
      ...prev,
      email: 'recruiter@hireflow.ai',
      password: 'HireFlow@2026',
    }));
  };

  return (
    <div className="min-h-screen bg-[#10090D] text-white flex items-center justify-center p-4 sm:p-8 relative overflow-hidden">
      {/* Warm burgundy ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/4 w-[540px] h-[540px] rounded-full opacity-40 blur-[120px]"
        style={{ background: 'radial-gradient(circle, #7B2948 0%, transparent 70%)' }}
      />

      <div className="w-full max-w-[1080px] rounded-3xl glass-panel bg-[#1A1017]/85 border border-white/12 shadow-2xl overflow-hidden relative z-10">
        {/* Top Bar: Brand + HOME / JOIN */}
        <div className="flex items-center justify-between px-6 sm:px-9 py-5 border-b border-white/10">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-gradient-to-br from-[#9B395F] to-[#2B0D1A] text-[11px] font-extrabold text-white">
              HF
            </span>
            <span className="text-base font-bold tracking-tight text-white">HireFlow AI</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wider uppercase text-[#C8B9C0] hover:text-white transition-colors"
            >
              HOME
            </Link>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'burgundy-cta text-white'
                  : 'bg-[#4B1528]/60 text-white border border-[#C26A8A]/40 hover:bg-[#7B2948]'
              }`}
            >
              JOIN
            </button>
          </div>
        </div>

        {/* Split Card Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Left Form Column */}
          <div className="lg:col-span-7 p-6 sm:p-10 space-y-6">
            <div className="space-y-2">
              <p className="text-[11px] font-bold tracking-[0.28em] uppercase text-[#C26A8A]">
                START FOR FREE
              </p>
              <h1 className="text-3xl font-bold text-white inline-block border-b-2 border-[#7B2948] pb-1.5">
                {forgotOpen
                  ? resetToken
                    ? 'Set New Password'
                    : 'Reset Password'
                  : mode === 'login'
                    ? 'Sign In'
                    : 'Create New Account'}
              </h1>
              {!forgotOpen && (
                <p className="text-sm text-[#C8B9C0] pt-1">
                  {mode === 'login' ? (
                    <>
                      Don&apos;t have an account?{' '}
                      <button
                        type="button"
                        onClick={() => switchMode('signup')}
                        className="text-[#E69AB5] font-semibold hover:underline cursor-pointer"
                      >
                        Create one
                      </button>
                    </>
                  ) : (
                    <>
                      Already a member?{' '}
                      <button
                        type="button"
                        onClick={() => switchMode('login')}
                        className="text-[#E69AB5] font-semibold hover:underline cursor-pointer"
                      >
                        Log in
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-[#EF6677]/45 bg-[#EF6677]/12 px-4 py-3 text-xs text-[#FFB8C1]"
              >
                {error}
              </div>
            )}
            {infoMsg && (
              <div
                role="status"
                className="rounded-xl border border-[#39C98A]/40 bg-[#39C98A]/10 px-4 py-3 text-xs text-[#9EF0CB]"
              >
                {infoMsg}
              </div>
            )}

            {forgotOpen ? (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                {!resetToken ? (
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-[#C8B9C0]">Work email</span>
                    <div className="flex items-center gap-2.5 bg-white/6 border border-white/12 rounded-xl px-3.5 py-2.5 focus-within:border-[#C26A8A]">
                      <Mail className="w-4 h-4 text-[#8E7E87] shrink-0" />
                      <input
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="recruiter@company.com"
                        className="w-full bg-transparent text-sm text-white placeholder-[#8E7E87] focus:outline-none"
                      />
                    </div>
                  </label>
                ) : (
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-[#C8B9C0]">New password (min 8 chars)</span>
                    <div className="flex items-center gap-2.5 bg-white/6 border border-white/12 rounded-xl px-3.5 py-2.5 focus-within:border-[#C26A8A]">
                      <Lock className="w-4 h-4 text-[#8E7E87] shrink-0" />
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        className="w-full bg-transparent text-sm text-white placeholder-[#8E7E87] focus:outline-none"
                      />
                    </div>
                  </label>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-3 rounded-xl burgundy-cta text-sm font-semibold text-white disabled:opacity-60 cursor-pointer"
                  >
                    {loading ? 'Processing...' : resetToken ? 'Update Password' : 'Send Reset Link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForgotOpen(false)}
                    className="px-4 py-3 rounded-xl border border-white/12 text-xs font-semibold text-[#C8B9C0] hover:text-white cursor-pointer"
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-[#C8B9C0]">First name</span>
                      <div className="flex items-center gap-2.5 bg-white/6 border border-white/12 rounded-xl px-3.5 py-2.5 focus-within:border-[#C26A8A]">
                        <User className="w-4 h-4 text-[#8E7E87] shrink-0" />
                        <input
                          type="text"
                          required
                          value={form.firstName}
                          onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                          placeholder="Ananya"
                          className="w-full bg-transparent text-sm text-white placeholder-[#8E7E87] focus:outline-none"
                        />
                      </div>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-[#C8B9C0]">Last name</span>
                      <div className="flex items-center gap-2.5 bg-white/6 border border-white/12 rounded-xl px-3.5 py-2.5 focus-within:border-[#C26A8A]">
                        <User className="w-4 h-4 text-[#8E7E87] shrink-0" />
                        <input
                          type="text"
                          required
                          value={form.lastName}
                          onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
                          placeholder="Sharma"
                          className="w-full bg-transparent text-sm text-white placeholder-[#8E7E87] focus:outline-none"
                        />
                      </div>
                    </label>
                  </div>
                )}

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#C8B9C0]">Work email</span>
                  <div className="flex items-center gap-2.5 bg-white/6 border border-white/12 rounded-xl px-3.5 py-2.5 focus-within:border-[#C26A8A]">
                    <Mail className="w-4 h-4 text-[#8E7E87] shrink-0" />
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      placeholder="recruiter@company.com"
                      className="w-full bg-transparent text-sm text-white placeholder-[#8E7E87] focus:outline-none"
                    />
                  </div>
                </label>

                {mode === 'signup' && (
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[#C8B9C0]">Company name</span>
                    <div className="flex items-center gap-2.5 bg-white/6 border border-white/12 rounded-xl px-3.5 py-2.5 focus-within:border-[#C26A8A]">
                      <Building2 className="w-4 h-4 text-[#8E7E87] shrink-0" />
                      <input
                        type="text"
                        required
                        value={form.companyName}
                        onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
                        placeholder="HireFlow Tech India"
                        className="w-full bg-transparent text-sm text-white placeholder-[#8E7E87] focus:outline-none"
                      />
                    </div>
                  </label>
                )}

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#C8B9C0]">Password</span>
                  <div className="flex items-center gap-2.5 bg-white/6 border border-white/12 rounded-xl px-3.5 py-2.5 focus-within:border-[#C26A8A]">
                    <Lock className="w-4 h-4 text-[#8E7E87] shrink-0" />
                    <input
                      type={showPass ? 'text' : 'password'}
                      required
                      minLength={mode === 'signup' ? 8 : 1}
                      value={form.password}
                      onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                      placeholder={mode === 'signup' ? 'Minimum 8 characters' : 'Enter password'}
                      className="w-full bg-transparent text-sm text-white placeholder-[#8E7E87] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                      className="text-[#8E7E87] hover:text-white cursor-pointer"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </label>

                {mode === 'signup' && (
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[#C8B9C0]">Confirm password</span>
                    <div className="flex items-center gap-2.5 bg-white/6 border border-white/12 rounded-xl px-3.5 py-2.5 focus-within:border-[#C26A8A]">
                      <Lock className="w-4 h-4 text-[#8E7E87] shrink-0" />
                      <input
                        type={showPass ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={form.confirmPassword}
                        onChange={(e) => setForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                        placeholder="Re-enter password"
                        className="w-full bg-transparent text-sm text-white placeholder-[#8E7E87] focus:outline-none"
                      />
                    </div>
                  </label>
                )}

                {mode === 'login' && (
                  <div className="flex items-center justify-between text-xs pt-1">
                    <label className="inline-flex items-center gap-2 text-[#C8B9C0] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="rounded border-white/25 bg-white/10 accent-[#7B2948]"
                      />
                      Remember me
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotOpen(true);
                        setError(null);
                        setInfoMsg(null);
                      }}
                      className="text-[#E69AB5] hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl burgundy-cta text-sm font-semibold text-white transition-all disabled:opacity-60 cursor-pointer"
                >
                  {loading
                    ? mode === 'login'
                      ? 'Signing in...'
                      : 'Creating account...'
                    : mode === 'login'
                      ? 'Sign In'
                      : 'Create Account'}
                </button>

                {mode === 'login' && (
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs text-[#8E7E87]">
                    <span>Sandbox demo account ready</span>
                    <button
                      type="button"
                      onClick={fillDemoRecruiter}
                      className="text-[#C8B9C0] hover:text-white underline cursor-pointer"
                    >
                      Fill Demo Recruiter
                    </button>
                  </div>
                )}
              </form>
            )}
          </div>

          {/* Right Recruiter Portrait Column (Never Aira on Auth Pages) */}
          <div className="lg:col-span-5 relative min-h-[260px] lg:min-h-full bg-[#2B0D1A]">
            <img
               src={recruiterPortrait}
               alt="Human talent acquisition lead in executive studio"
               referrerPolicy="no-referrer"
               className="w-full h-full object-cover object-center"
                />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(180deg, rgba(43,13,26,0.18) 0%, rgba(16,9,13,0.88) 100%)',
              }}
            />
            <div className="absolute bottom-6 left-6 right-6 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#E69AB5]">
                Recruiter Control Workspace
              </p>
              <p className="text-sm font-medium text-white leading-snug">
                Automated screening and Level 1 interviews with human authority on every shortlist and final decision.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
