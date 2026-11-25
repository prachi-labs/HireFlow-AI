import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Mail, RefreshCw, X } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout';
import { apiRequest } from '../lib/api';

interface Level2Candidate {
  id: string;
  name: string;
  email: string;
  status: string;
  job_title: string | null;
  interview_id: string | null;
  interview_score: number | null;
  recommendation: string | null;
}

interface EmailLogRow {
  id: string;
  candidate_name: string | null;
  recipient_email: string;
  subject: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

export function Level2Page() {
  const [candidates, setCandidates] = useState<Level2Candidate[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLogRow[]>([]);
  const [selectedCandId, setSelectedCandId] = useState('');
  const [confirmReject, setConfirmReject] = useState<Level2Candidate | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const [schedule, setSchedule] = useState({
    date: '',
    time: '11:00',
    timeZone: 'IST (Asia/Kolkata)',
    mode: 'Google Meet Video Call',
    interviewerName: '',
    interviewerEmail: '',
    meetingLink: '',
    instructions: 'Please join 5 minutes early and keep a brief system design example ready.',
  });

  const loadData = async () => {
    const d = await apiRequest<{ candidates: Level2Candidate[]; emailLogs: EmailLogRow[] }>(
      '/api/level2/data'
    );
    setCandidates(d.candidates);
    setEmailLogs(d.emailLogs);
    if (!selectedCandId && d.candidates[0]) setSelectedCandId(d.candidates[0].id);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleDecision = async (candidateId: string, decision: 'approve' | 'review' | 'hold' | 'reject') => {
    setFeedback(null);
    try {
      const res = await apiRequest<{ status: string }>('/api/level2/decision', {
        method: 'POST',
        body: JSON.stringify({ candidateId, decision }),
      });
      setFeedback({ ok: true, text: `Candidate moved to ${res.status}.` });
      setConfirmReject(null);
      await loadData();
    } catch (err) {
      setFeedback({ ok: false, text: (err as Error).message });
    }
  };

  const handleScheduleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiRequest<{ sent: boolean; status: string; error?: string }>(
        '/api/level2/schedule',
        {
          method: 'POST',
          body: JSON.stringify({ candidateId: selectedCandId, ...schedule }),
        }
      );
      setFeedback({
        ok: res.sent,
        text: res.sent
          ? 'Level 2 invitation sent and confirmed by SMTP provider.'
          : res.error || `Email status: ${res.status}`,
      });
      await loadData();
    } catch (err) {
      setFeedback({ ok: false, text: (err as Error).message });
    }
  };

  const handleRetryEmail = async (logId: string) => {
    const res = await apiRequest<{ sent: boolean; error?: string }>(
      `/api/level2/retry-email/${logId}`,
      { method: 'POST' }
    );
    setFeedback({
      ok: res.sent,
      text: res.sent ? 'Retry email delivered.' : res.error || 'Email retry failed.',
    });
    await loadData();
  };

  return (
    <DashboardLayout
      title="Level 2 Decisions & Email Invitations"
      subtitle="Human recruiter approval, Level 2 interview scheduling, and verified SMTP invitation logs"
    >
      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs ${
            feedback.ok
              ? 'border-[#39C98A]/35 bg-[#39C98A]/10 text-[#9EF0CB]'
              : 'border-[#E8B45C]/40 bg-[#E8B45C]/10 text-[#F7D794]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Candidate Decision Queue */}
        <section className="lg:col-span-7 glass-panel rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-bold text-white">Recruiter Review & Approval Queue</h2>
          {candidates.length === 0 ? (
            <p className="text-sm text-[#8E7E87]">
              No shortlisted or Level 1 evaluated candidates in queue yet.
            </p>
          ) : (
            <div className="space-y-3">
              {candidates.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Link to={`/candidates/${c.id}`} className="text-sm font-bold text-white hover:text-[#E69AB5]">
                        {c.name}
                      </Link>
                      <p className="text-xs text-[#8E7E87]">
                        {c.job_title || 'Unassigned'} · {c.status}
                        {c.interview_score != null ? ` · L1 Score ${c.interview_score}/5.0` : ''}
                      </p>
                    </div>
                    {c.interview_id && (
                      <Link to={`/interviews/${c.interview_id}`} className="text-xs text-[#E69AB5] hover:underline">
                        View L1 Report
                      </Link>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCandId(c.id);
                        void handleDecision(c.id, 'approve');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#39C98A]/20 border border-[#39C98A]/40 text-xs font-semibold text-[#9EF0CB] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Approve for Level 2
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDecision(c.id, 'review')}
                      className="px-3 py-1.5 rounded-lg border border-white/15 text-xs text-[#C8B9C0] hover:text-white cursor-pointer"
                    >
                      Additional Review
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDecision(c.id, 'hold')}
                      className="px-3 py-1.5 rounded-lg border border-[#E8B45C]/35 text-xs text-[#E8B45C] cursor-pointer"
                    >
                      Keep On Hold
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReject(c)}
                      className="px-3 py-1.5 rounded-lg border border-[#EF6677]/35 text-xs text-[#EF6677] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Level 2 Scheduling Form */}
        <section className="lg:col-span-5 glass-panel rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-bold text-white">Schedule Level 2 & Send Invite</h2>
          <form onSubmit={handleScheduleSend} className="space-y-3">
            <select
              aria-label="Select candidate to schedule"
              value={selectedCandId}
              onChange={(e) => setSelectedCandId(e.target.value)}
              required
              className="w-full bg-[#1A1017] border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white"
            >
              <option value="">Select candidate...</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email || 'No email'})
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                required
                value={schedule.date}
                onChange={(e) => setSchedule((p) => ({ ...p, date: e.target.value }))}
                className="bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-xs text-white"
              />
              <input
                type="time"
                required
                value={schedule.time}
                onChange={(e) => setSchedule((p) => ({ ...p, time: e.target.value }))}
                className="bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Time zone"
                value={schedule.timeZone}
                onChange={(e) => setSchedule((p) => ({ ...p, timeZone: e.target.value }))}
                className="bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-xs text-white"
              />
              <input
                type="text"
                placeholder="Mode (Video / Onsite)"
                value={schedule.mode}
                onChange={(e) => setSchedule((p) => ({ ...p, mode: e.target.value }))}
                className="bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                required
                placeholder="Interviewer Name"
                value={schedule.interviewerName}
                onChange={(e) => setSchedule((p) => ({ ...p, interviewerName: e.target.value }))}
                className="bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-xs text-white"
              />
              <input
                type="email"
                placeholder="Interviewer Email"
                value={schedule.interviewerEmail}
                onChange={(e) => setSchedule((p) => ({ ...p, interviewerEmail: e.target.value }))}
                className="bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <input
              type="text"
              placeholder="Meeting Link / Location"
              value={schedule.meetingLink}
              onChange={(e) => setSchedule((p) => ({ ...p, meetingLink: e.target.value }))}
              className="w-full bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-xs text-white"
            />
            <textarea
              rows={2}
              placeholder="Candidate instructions"
              value={schedule.instructions}
              onChange={(e) => setSchedule((p) => ({ ...p, instructions: e.target.value }))}
              className="w-full bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-xs text-white"
            />
            <button
              type="submit"
              disabled={!selectedCandId}
              className="w-full py-2.5 rounded-xl burgundy-cta text-xs font-semibold text-white inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Mail className="w-3.5 h-3.5" />
              Schedule & Send Level 2 Invitation
            </button>
          </form>
        </section>
      </div>

      {/* Email Invitation Delivery Log */}
      <section className="glass-panel rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-white">Invitation Delivery History</h2>
        {emailLogs.length === 0 ? (
          <p className="text-xs text-[#8E7E87]">No Level 2 emails attempted yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-data">
              <thead className="text-[#8E7E87] border-b border-white/10">
                <tr>
                  <th className="py-2.5 pr-4">Recipient</th>
                  <th className="py-2.5 pr-4">Subject</th>
                  <th className="py-2.5 pr-4">Status</th>
                  <th className="py-2.5 pr-4">Provider Note</th>
                  <th className="py-2.5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {emailLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 pr-4 text-white">{log.recipient_email}</td>
                    <td className="py-2.5 pr-4 text-[#C8B9C0]">{log.subject}</td>
                    <td
                      className={`py-2.5 pr-4 font-semibold ${
                        log.status === 'sent'
                          ? 'text-[#39C98A]'
                          : log.status === 'not_configured'
                            ? 'text-[#E8B45C]'
                            : 'text-[#EF6677]'
                      }`}
                    >
                      {log.status}
                    </td>
                    <td className="py-2.5 pr-4 text-[#8E7E87] max-w-xs truncate">
                      {log.error_message || 'Delivered'}
                    </td>
                    <td className="py-2.5">
                      {log.status !== 'sent' && (
                        <button
                          type="button"
                          onClick={() => void handleRetryEmail(log.id)}
                          className="text-[#E69AB5] hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Rejection Confirmation Modal */}
      {confirmReject && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="glass-panel bg-[#1A1017] rounded-2xl p-6 max-w-md space-y-4">
            <h3 className="text-lg font-bold text-white">Confirm Rejection</h3>
            <p className="text-xs text-[#C8B9C0]">
              Are you sure you want to mark <strong>{confirmReject.name}</strong> as Rejected? This action is logged in the candidate audit trail.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmReject(null)}
                className="px-4 py-2 rounded-xl border border-white/15 text-xs text-[#C8B9C0] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDecision(confirmReject.id, 'reject')}
                className="px-4 py-2 rounded-xl bg-[#EF6677] text-xs font-semibold text-white cursor-pointer"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
