import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Play, Sparkles, Upload } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout';
import { apiRequest } from '../lib/api';

interface ScreeningResultRow {
  id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_status: string;
  job_title: string;
  overall_score: number;
  skills_match: number;
  qualification_match: number | null;
  experience_match: number | null;
  matchingSkills: string[];
  missingRequiredSkills: string[];
  shortlisted: boolean;
  explanation: string;
  criteria_version: string;
}

export function ScreeningPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Array<{ id: string; title: string; shortlist_threshold: number }>>([]);
  const [selectedJobId, setSelectedJobId] = useState(searchParams.get('jobId') || '');
  const [threshold, setThreshold] = useState(70);
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<ScreeningResultRow[]>([]);
  const [running, setRunning] = useState(false);
  const [campaignLaunching, setCampaignLaunching] = useState(false);
  const [campaignMode, setCampaignMode] = useState<'web_and_phone' | 'web' | 'phone'>('web_and_phone');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadJobsAndResults = async (jobIdToLoad?: string) => {
    const jData = await apiRequest<{
      jobs: Array<{ id: string; title: string; shortlist_threshold: number }>;
    }>('/api/jobs');
    setJobs(jData.jobs);
    const activeId = jobIdToLoad || selectedJobId || jData.jobs[0]?.id || '';
    if (activeId && activeId !== selectedJobId) {
      setSelectedJobId(activeId);
      const found = jData.jobs.find((j) => j.id === activeId);
      if (found) setThreshold(found.shortlist_threshold || 70);
    }
    if (activeId) {
      const rData = await apiRequest<{ results: ScreeningResultRow[] }>(
        `/api/screening/results?jobId=${encodeURIComponent(activeId)}`
      );
      setResults(rData.results);
    }
  };

  useEffect(() => {
    void loadJobsAndResults(searchParams.get('jobId') || undefined);
  }, []);

  const handleRunScreening = async () => {
    if (!selectedJobId) return;
    setRunning(true);
    setError(null);
    setStatusMsg(null);
    const fd = new FormData();
    fd.append('jobId', selectedJobId);
    fd.append('threshold', String(threshold));
    files.forEach((f) => fd.append('files', f));

    try {
      const res = await apiRequest<{
        results: Array<Record<string, unknown>>;
        fileErrors: Array<{ filename: string; error: string }>;
      }>('/api/screening/run', { method: 'POST', body: fd });
      setFiles([]);
      await loadJobsAndResults(selectedJobId);
      const errNote =
        res.fileErrors.length > 0
          ? ` (${res.fileErrors.length} file error: ${res.fileErrors[0].error})`
          : '';
      setStatusMsg(`Screened ${res.results.length} candidate(s) at ${threshold}% threshold.${errNote}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const handleOverride = async (id: string, decision: 'Shortlisted' | 'Needs Review') => {
    await apiRequest(`/api/screening/${id}/override`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason: `Recruiter manual override to ${decision}` }),
    });
    await loadJobsAndResults(selectedJobId);
  };

  const handleStartCampaign = async () => {
    if (!selectedJobId) return;
    setCampaignLaunching(true);
    setError(null);
    setStatusMsg(null);
    const jobTitle = jobs.find((j) => j.id === selectedJobId)?.title || 'Role';

    try {
      const res = await apiRequest<{
        screenedCount: number;
        shortlistedCount: number;
        interviews: Array<{ interviewId: string }>;
      }>('/api/campaigns/start', {
        method: 'POST',
        body: JSON.stringify({
          jobId: selectedJobId,
          name: `${jobTitle} — Automated Campaign`,
          threshold,
          mode: campaignMode,
        }),
      });
      setStatusMsg(
        `Campaign authorized & started: ${res.screenedCount} screened, ${res.shortlistedCount} shortlisted, ${res.interviews.length} Level 1 interview(s) queued.`
      );
      await loadJobsAndResults(selectedJobId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCampaignLaunching(false);
    }
  };

  return (
    <DashboardLayout
      title="AI Screening & Campaign Automation"
      subtitle="Match CVs against a Job Description with explainable weights, threshold shortlisting, and one-click Level 1 campaign launch"
    >
      {/* Controls Panel */}
      <div className="glass-panel rounded-2xl p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="space-y-1.5 block">
            <span className="text-xs font-semibold text-[#C8B9C0]">1. Select Job Description</span>
            <select
              value={selectedJobId}
              onChange={(e) => {
                setSelectedJobId(e.target.value);
                void loadJobsAndResults(e.target.value);
              }}
              className="w-full bg-[#1A1017] border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white"
            >
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 block">
            <span className="text-xs font-semibold text-[#C8B9C0]">
              2. Shortlist Threshold ({threshold}%)
            </span>
            <input
              type="range"
              min={40}
              max={95}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full accent-[#C26A8A] mt-2"
            />
            <span className="block text-[11px] text-[#8E7E87]">
              Weights: Required Skills 40% · Experience 25% · Qualification 15% · Preferred 10% · Certs 10%
            </span>
          </label>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-[#C8B9C0] block">3. Upload CVs (optional batch)</span>
            <label className="flex items-center justify-center gap-2 border border-dashed border-white/25 rounded-xl px-3.5 py-2.5 text-xs text-[#E6D8DE] hover:border-[#C26A8A] cursor-pointer">
              <Upload className="w-4 h-4 text-[#C26A8A]" />
              {files.length > 0 ? `${files.length} file(s) selected` : 'Select PDF / DOCX / TXT CVs'}
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.txt"
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={running || !selectedJobId}
              onClick={() => void handleRunScreening()}
              className="px-5 py-2.5 rounded-xl border border-[#C26A8A]/45 bg-[#4B1528]/50 hover:bg-[#4B1528] text-xs font-semibold text-white inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {running ? 'Screening...' : 'Run Explainable Screening'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Campaign interview mode"
              value={campaignMode}
              onChange={(e) => setCampaignMode(e.target.value as 'web_and_phone' | 'web' | 'phone')}
              className="bg-[#1A1017] border border-white/15 rounded-xl px-3 py-2 text-xs text-white"
            >
              <option value="web_and_phone">Phone + Web Interview Fallback</option>
              <option value="web">Web Interview Only (Test Mode)</option>
              <option value="phone">Outbound Phone Call Only</option>
            </select>
            <button
              type="button"
              disabled={campaignLaunching || !selectedJobId}
              onClick={() => void handleStartCampaign()}
              className="px-5 py-2.5 rounded-xl burgundy-cta text-xs font-semibold text-white inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {campaignLaunching ? 'Launching Campaign...' : 'Authorize & Start Campaign'}
            </button>
          </div>
        </div>

        {statusMsg && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#39C98A]/35 bg-[#39C98A]/10 px-4 py-2.5 text-xs text-[#9EF0CB]">
            <span>{statusMsg}</span>
            <button
              type="button"
              onClick={() => navigate('/interviews')}
              className="underline font-semibold text-white cursor-pointer"
            >
              Open Interview Center
            </button>
          </div>
        )}
        {error && <p className="text-xs text-[#EF6677]">{error}</p>}
      </div>

      {/* Ranked Results */}
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Ranked Screening Results ({results.length})</h2>
          <span className="text-xs text-[#8E7E87]">
            Below threshold = Needs Review (never auto-rejected)
          </span>
        </div>

        {results.length === 0 ? (
          <p className="text-sm text-[#8E7E87] py-6 text-center">
            No screening results for this JD yet. Upload CVs or click Run Explainable Screening above.
          </p>
        ) : (
          <div className="space-y-3">
            {results.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      to={`/candidates/${r.candidate_id}`}
                      className="text-base font-bold text-white hover:text-[#E69AB5]"
                    >
                      {r.candidate_name}
                    </Link>
                    <span className="font-mono-num text-sm font-bold text-white">
                      {r.overall_score}% Match
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        r.shortlisted ? 'text-[#39C98A]' : 'text-[#E8B45C]'
                      }`}
                    >
                      {r.candidate_status}
                    </span>
                  </div>
                  <p className="text-xs text-[#C8B9C0] font-data">
                    Skills: {r.skills_match}% · Qualification:{' '}
                    {r.qualification_match != null ? `${r.qualification_match}%` : 'Renormalized'} · Experience:{' '}
                    {r.experience_match != null ? `${r.experience_match}%` : 'Renormalized'} · Criteria {r.criteria_version}
                  </p>
                  <p className="text-xs text-[#E6D8DE] leading-relaxed">{r.explanation}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs pt-1">
                    <span className="text-[#39C98A]">
                      Matching: {r.matchingSkills.join(', ') || 'None'}
                    </span>
                    {r.missingRequiredSkills.length > 0 && (
                      <span className="text-[#EF6677]">
                        Missing Required: {r.missingRequiredSkills.join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {r.shortlisted ? (
                    <button
                      type="button"
                      onClick={() => void handleOverride(r.id, 'Needs Review')}
                      className="px-3 py-1.5 rounded-lg border border-white/15 text-xs text-[#C8B9C0] hover:text-white cursor-pointer"
                    >
                      Move to Needs Review
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleOverride(r.id, 'Shortlisted')}
                      className="px-3 py-1.5 rounded-lg border border-[#39C98A]/45 bg-[#39C98A]/15 text-xs font-semibold text-[#9EF0CB] hover:bg-[#39C98A]/25 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Override: Shortlist
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
