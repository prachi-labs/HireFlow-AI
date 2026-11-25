import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  ExternalLink,
  PhoneCall,
  RefreshCw,
} from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout';
import { apiRequest } from '../lib/api';

interface InterviewRow {
  id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string;
  job_title: string;
  mode: string;
  access_token: string;
  status: string;
  current_stage: string;
  duration_seconds: number;
  median_latency_ms: number | null;
  overall_score: number | null;
  recommendation: string | null;
  latest_call_status: string | null;
  latest_call_error: string | null;
  call_attempts: number | null;
  failure_reason: string | null;
}

export function InterviewsPage() {
  const { id } = useParams<{ id: string }>();
  const [interviews, setInterviews] = useState<InterviewRow[]>([]);
  const [telephony, setTelephony] = useState<{
    configured: boolean;
    provider: string;
    reason?: string;
  } | null>(null);
  const [retryFeedback, setRetryFeedback] = useState<string | null>(null);

  const [detail, setDetail] = useState<{
    interview: InterviewRow & { plan: Array<{ stage: string; focus: string; seedQuestion: string }> };
    transcript: Array<{ id: string; speaker: string; stage: string; content: string; latency_ms?: number }>;
    evaluation: {
      overall_score: number;
      recommendation: string;
      summary: string;
      validationPassed: boolean;
      validation_notes: string;
      rubricScores: Array<{ criterion: string; score: number; evidenceQuote: string; rationale: string }>;
      strengths: string[];
      clarifications: string[];
      followUpQuestions: string[];
    } | null;
    calls: Array<{ id: string; status: string; attempt_number: number; error_message?: string; created_at: string }>;
    consent: { identity_confirmed: number; recording_consented: number; preferred_language: string; human_alternative_requested: number } | null;
  } | null>(null);

  const loadList = async () => {
    const d = await apiRequest<{
      interviews: InterviewRow[];
      telephony: { configured: boolean; provider: string; reason?: string };
    }>('/api/interviews');
    setInterviews(d.interviews);
    setTelephony(d.telephony);
  };

  useEffect(() => {
    if (id) {
      apiRequest<typeof detail>(`/api/interviews/${id}`).then(setDetail);
    } else {
      void loadList();
    }
  }, [id]);

  const handleRetryCall = async (interviewId: string) => {
    setRetryFeedback(null);
    try {
      const res = await apiRequest<{ status: string; error?: string }>(
        `/api/interviews/${interviewId}/retry-call`,
        { method: 'POST' }
      );
      setRetryFeedback(res.error || `Call queued (status: ${res.status}).`);
      await loadList();
    } catch (err) {
      setRetryFeedback((err as Error).message);
    }
  };

  if (id) {
    return (
      <DashboardLayout
        title={detail ? `Interview Result — ${detail.interview.candidate_name}` : 'Interview Result'}
        subtitle={
          detail
            ? `${detail.interview.job_title} · Status: ${detail.interview.status} · Duration ${Math.floor(
                detail.interview.duration_seconds / 60
              )}m ${detail.interview.duration_seconds % 60}s`
            : 'Loading interview report...'
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/interviews"
              className="px-3.5 py-2 rounded-xl border border-white/15 text-xs font-semibold text-[#C8B9C0] hover:text-white inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              All Interviews
            </Link>
            {detail?.evaluation && (
              <a
                href={`/api/interviews/${id}/pdf`}
                className="px-4 py-2 rounded-xl burgundy-cta text-xs font-semibold text-white inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Download PDF Report
              </a>
            )}
          </div>
        }
      >
        {detail && (
          <div className="space-y-6">
            {/* Consent & Call Metadata */}
            <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div>
                <span className="text-[#8E7E87] block">Consent Record</span>
                <span className="text-white font-semibold">
                  {detail.consent
                    ? detail.consent.recording_consented
                      ? `Consented (${detail.consent.preferred_language})`
                      : detail.consent.human_alternative_requested
                        ? 'Requested Human Recruiter'
                        : 'Consent Declined (Not Recorded)'
                    : 'Not yet recorded'}
                </span>
              </div>
              <div>
                <span className="text-[#8E7E87] block">Median Turn Latency</span>
                <span className="font-mono-num text-white">
                  {detail.interview.median_latency_ms != null
                    ? `${detail.interview.median_latency_ms} ms`
                    : '—'}
                </span>
              </div>
              <div>
                <Link
                  to={`/interview/web/${detail.interview.access_token}`}
                  className="px-3.5 py-2 rounded-xl border border-white/15 text-white hover:bg-white/10 inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Web Interview Link
                </Link>
              </div>
            </div>

            {detail.evaluation ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <section className="glass-panel rounded-2xl p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-[#C26A8A] font-semibold">
                          Advised Recommendation (Recruiter Decides)
                        </p>
                        <h2 className="text-xl font-bold text-white mt-0.5">
                          {detail.evaluation.overall_score}/5.0 — {detail.evaluation.recommendation}
                        </h2>
                      </div>
                      <span className="text-xs text-[#39C98A]">
                        {detail.evaluation.validation_notes}
                      </span>
                    </div>
                    <p className="text-sm text-[#E6D8DE] leading-relaxed">{detail.evaluation.summary}</p>

                    <div className="space-y-3 pt-2 border-t border-white/10">
                      {detail.evaluation.rubricScores.map((r) => (
                        <div key={r.criterion} className="rounded-xl bg-white/[0.04] p-4 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-white">{r.criterion}</span>
                            <span className="font-mono-num text-sm font-bold text-[#E69AB5]">
                              {r.score} / 5
                            </span>
                          </div>
                          <p className="text-xs text-[#C8B9C0] italic">Evidence: &ldquo;{r.evidenceQuote}&rdquo;</p>
                          <p className="text-xs text-[#8E7E87]">{r.rationale}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="glass-panel rounded-2xl p-6 space-y-3">
                    <h2 className="text-base font-bold text-white">Transcript</h2>
                    {detail.transcript.length === 0 ? (
                      <p className="text-xs text-[#8E7E87]">No transcript recorded.</p>
                    ) : (
                      <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-2">
                        {detail.transcript.map((t) => (
                          <div key={t.id} className="text-xs leading-relaxed">
                            <span
                              className={`font-bold ${
                                t.speaker === 'aira' ? 'text-[#C26A8A]' : 'text-[#39C98A]'
                              }`}
                            >
                              {t.speaker === 'aira' ? 'Aira' : detail.interview.candidate_name} [{t.stage}]:
                            </span>{' '}
                            <span className="text-[#E6D8DE]">{t.content}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>

                <div className="space-y-6">
                  <section className="glass-panel rounded-2xl p-5 space-y-3">
                    <h3 className="text-sm font-bold text-white">Strengths</h3>
                    <ul className="space-y-1.5 text-xs text-[#C8B9C0] list-disc pl-4">
                      {detail.evaluation.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </section>
                  <section className="glass-panel rounded-2xl p-5 space-y-3">
                    <h3 className="text-sm font-bold text-white">Areas Needing Clarification</h3>
                    <ul className="space-y-1.5 text-xs text-[#C8B9C0] list-disc pl-4">
                      {detail.evaluation.clarifications.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </section>
                  <section className="glass-panel rounded-2xl p-5 space-y-3">
                    <h3 className="text-sm font-bold text-white">Recommended Level 2 Follow-Ups</h3>
                    <ul className="space-y-1.5 text-xs text-[#C8B9C0] list-disc pl-4">
                      {detail.evaluation.followUpQuestions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                    <Link
                      to="/level2"
                      className="block w-full text-center py-2.5 rounded-xl burgundy-cta text-xs font-semibold text-white mt-3"
                    >
                      Decide in Level 2 Console
                    </Link>
                  </section>
                </div>
              </div>
            ) : (
              <div className="glass-panel rounded-2xl p-8 text-center space-y-3">
                <p className="text-sm text-[#C8B9C0]">
                  {detail.interview.failure_reason ||
                    'This interview has not been completed yet. Open the Web Interview link to conduct it in test or candidate mode.'}
                </p>
                <Link
                  to={`/interview/web/${detail.interview.access_token}`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl burgundy-cta text-xs font-semibold text-white"
                >
                  Launch Web Interview
                </Link>
              </div>
            )}
          </div>
        )}
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Interview Center"
      subtitle="Campaign queue, honest telephony provider status, retry control, and browser Web Interview links"
      actions={
        <Link
          to="/screening"
          className="px-4 py-2 rounded-xl burgundy-cta text-xs font-semibold text-white"
        >
          New Screening Campaign
        </Link>
      }
    >
      {telephony && (
        <div
          className={`rounded-2xl border p-4 text-xs flex flex-wrap items-center justify-between gap-3 ${
            telephony.configured
              ? 'border-[#39C98A]/35 bg-[#39C98A]/10 text-[#9EF0CB]'
              : 'border-[#E8B45C]/35 bg-[#E8B45C]/10 text-[#F7D794]'
          }`}
        >
          <div>
            <span className="font-bold">
              Telephony Status: {telephony.configured ? `Connected (${telephony.provider})` : 'Not configured (Needs credentials)'}
            </span>
            <p className="mt-0.5 opacity-90">
              {telephony.reason ||
                'Calling window 09:00–21:00 IST active. Browser Web Interview test mode is ready for zero-cost testing.'}
            </p>
          </div>
          <Link to="/settings" className="underline font-semibold text-white">
            Check Integration Settings
          </Link>
        </div>
      )}

      {retryFeedback && (
        <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs text-[#E6D8DE]">
          {retryFeedback}
        </div>
      )}

      <div className="glass-panel rounded-2xl overflow-hidden">
        {interviews.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <PhoneCall className="w-8 h-8 text-[#8E7E87] mx-auto" />
            <p className="text-sm text-[#C8B9C0]">
              No interviews queued yet. Authorize a campaign in AI Screening to queue shortlisted candidates.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-data">
              <thead className="bg-white/5 text-[#C8B9C0] border-b border-white/10">
                <tr>
                  <th className="py-3 px-4">Candidate</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Interview Status</th>
                  <th className="py-3 px-4">Call Status</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {interviews.map((iv) => (
                  <tr key={iv.id} className="hover:bg-white/[0.03]">
                    <td className="py-3 px-4">
                      <Link to={`/candidates/${iv.candidate_id}`} className="font-semibold text-white hover:text-[#E69AB5]">
                        {iv.candidate_name}
                      </Link>
                      <span className="block text-[11px] text-[#8E7E87]">{iv.candidate_phone || iv.candidate_email}</span>
                    </td>
                    <td className="py-3 px-4 text-[#C8B9C0]">{iv.job_title}</td>
                    <td className="py-3 px-4 text-white font-medium">{iv.status}</td>
                    <td className="py-3 px-4 text-[#C8B9C0]">
                      {iv.latest_call_status ? `${iv.latest_call_status} (try #${iv.call_attempts})` : 'Web Mode'}
                      {iv.latest_call_error && (
                        <span className="block text-[10px] text-[#E8B45C] max-w-[220px] truncate">
                          {iv.latest_call_error}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono-num text-white">
                      {iv.overall_score != null ? `${iv.overall_score}/5.0` : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/interview/web/${iv.access_token}`}
                          className="px-2.5 py-1.5 rounded-lg burgundy-cta text-white font-semibold whitespace-nowrap"
                        >
                          Web Interview
                        </Link>
                        <Link
                          to={`/interviews/${iv.id}`}
                          className="px-2.5 py-1.5 rounded-lg border border-white/15 text-[#E6D8DE] hover:text-white whitespace-nowrap"
                        >
                          Result
                        </Link>
                        {iv.candidate_phone && iv.status !== 'completed' && (
                          <button
                            type="button"
                            onClick={() => void handleRetryCall(iv.id)}
                            title="Retry outbound call"
                            className="p-1.5 rounded-lg border border-white/15 text-[#C8B9C0] hover:text-white cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
