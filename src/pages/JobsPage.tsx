import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout';
import { apiRequest } from '../lib/api';

interface JobItem {
  id: string;
  title: string;
  department: string;
  location: string;
  employment_type: string;
  description: string;
  requiredSkills: string[];
  preferredSkills: string[];
  min_experience_years: number | null;
  qualification: string;
  shortlist_threshold: number;
  isActive: boolean;
  candidate_count?: number;
  shortlisted_count?: number;
}

export function JobsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [parseMessage, setParseMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [detailData, setDetailData] = useState<{
    job: JobItem;
    candidates: Array<Record<string, unknown>>;
  } | null>(null);

  const [form, setForm] = useState({
    title: '',
    department: 'Engineering',
    location: 'Bengaluru / Hybrid',
    employmentType: 'Full-Time',
    description: '',
    requiredSkillsText: '',
    preferredSkillsText: '',
    minExperienceYears: '2',
    qualification: 'B.Tech / Bachelor',
    shortlistThreshold: 70,
  });

  const loadJobs = async (q = '') => {
    setLoading(true);
    try {
      const data = await apiRequest<{ jobs: JobItem[] }>(`/api/jobs?q=${encodeURIComponent(q)}`);
      setJobs(data.jobs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      apiRequest<{ job: JobItem; candidates: Array<Record<string, unknown>> }>(`/api/jobs/${id}`)
        .then(setDetailData)
        .catch((err) => setError((err as Error).message));
    } else {
      void loadJobs(query);
    }
  }, [id, query]);

  const handleJdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setParseMessage('Parsing JD file...');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await apiRequest<{
        parsed: {
          title: string;
          description: string;
          requiredSkills: string[];
          preferredSkills: string[];
          minExperienceYears: number | null;
          qualification: string;
        };
      }>('/api/jobs/parse', { method: 'POST', body: fd });

      setForm({
        title: res.parsed.title,
        department: 'Engineering',
        location: 'Bengaluru / Hybrid',
        employmentType: 'Full-Time',
        description: res.parsed.description,
        requiredSkillsText: res.parsed.requiredSkills.join(', '),
        preferredSkillsText: res.parsed.preferredSkills.join(', '),
        minExperienceYears:
          res.parsed.minExperienceYears != null ? String(res.parsed.minExperienceYears) : '',
        qualification: res.parsed.qualification || '',
        shortlistThreshold: 70,
      });
      setParseMessage(`Parsed "${file.name}" — please verify extracted fields before saving.`);
      setModalOpen(true);
    } catch (err) {
      setParseMessage(null);
      setError((err as Error).message);
    }
  };

  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const payload = {
      title: form.title,
      department: form.department,
      location: form.location,
      employmentType: form.employmentType,
      description: form.description,
      requiredSkills: form.requiredSkillsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      preferredSkills: form.preferredSkillsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      minExperienceYears: form.minExperienceYears ? Number.parseFloat(form.minExperienceYears) : null,
      qualification: form.qualification,
      shortlistThreshold: form.shortlistThreshold,
    };

    try {
      if (editingId) {
        await apiRequest(`/api/jobs/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiRequest('/api/jobs', { method: 'POST', body: JSON.stringify(payload) });
      }
      setModalOpen(false);
      setEditingId(null);
      setParseMessage(null);
      await loadJobs(query);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggleActive = async (job: JobItem) => {
    await apiRequest(`/api/jobs/${job.id}`, {
      method: 'PUT',
      body: JSON.stringify({ isActive: !job.isActive }),
    });
    await loadJobs(query);
  };

  const deleteJob = async (jobId: string) => {
    await apiRequest(`/api/jobs/${jobId}`, { method: 'DELETE' });
    await loadJobs(query);
  };

  const startCampaignForJob = async (job: JobItem) => {
    navigate(`/screening?jobId=${job.id}`);
  };

  // --- DETAIL VIEW ---
  if (id) {
    return (
      <DashboardLayout
        title={detailData?.job.title || 'Job Description'}
        subtitle={
          detailData
            ? `${detailData.job.department} · ${detailData.job.location} · Threshold ${detailData.job.shortlist_threshold}%`
            : 'Loading role...'
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/jobs"
              className="px-3.5 py-2 rounded-xl border border-white/15 text-xs font-semibold text-[#C8B9C0] hover:text-white inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              All Jobs
            </Link>
            {detailData && (
              <button
                type="button"
                onClick={() => void startCampaignForJob(detailData.job)}
                className="px-4 py-2 rounded-xl burgundy-cta text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Start Campaign
              </button>
            )}
          </div>
        }
      >
        {error && <p className="text-sm text-[#EF6677]">{error}</p>}
        {detailData && (
          <div className="space-y-6">
            <div className="glass-panel rounded-2xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <span className="text-xs font-semibold uppercase tracking-widest text-[#C26A8A]">
                  {detailData.job.isActive ? 'Active Role' : 'Inactive Role'} ·{' '}
                  {detailData.job.employment_type}
                </span>
                <span className="text-xs font-data text-[#C8B9C0]">
                  Min Experience: {detailData.job.min_experience_years ?? 'Unspecified'} yrs · Qualification:{' '}
                  {detailData.job.qualification || 'Any'}
                </span>
              </div>
              <p className="text-sm text-[#E6D8DE] leading-relaxed whitespace-pre-line">
                {detailData.job.description}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/10 text-xs">
                <div>
                  <span className="text-[#8E7E87] block mb-1">Required Skills</span>
                  <span className="text-white font-medium">
                    {detailData.job.requiredSkills.join(' · ') || 'None specified'}
                  </span>
                </div>
                <div>
                  <span className="text-[#8E7E87] block mb-1">Preferred Skills</span>
                  <span className="text-[#C8B9C0]">
                    {detailData.job.preferredSkills.join(' · ') || 'None specified'}
                  </span>
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-6 space-y-4">
              <h2 className="text-base font-bold text-white">
                Associated Candidates ({detailData.candidates.length})
              </h2>
              {detailData.candidates.length === 0 ? (
                <p className="text-sm text-[#8E7E87]">
                  No candidates assigned to this role yet. Upload CVs in AI Screening to evaluate applicants.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-data">
                    <thead className="text-[#8E7E87] border-b border-white/10">
                      <tr>
                        <th className="py-2.5 pr-4">Name</th>
                        <th className="py-2.5 pr-4">Experience</th>
                        <th className="py-2.5 pr-4">Match Score</th>
                        <th className="py-2.5 pr-4">Status</th>
                        <th className="py-2.5">Profile</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/8">
                      {detailData.candidates.map((c) => (
                        <tr key={String(c.id)}>
                          <td className="py-2.5 pr-4 font-semibold text-white">{String(c.name)}</td>
                          <td className="py-2.5 pr-4 text-[#C8B9C0]">{String(c.experience || '—')}</td>
                          <td className="py-2.5 pr-4 font-mono-num text-white">
                            {c.overall_score != null ? `${c.overall_score}%` : 'Unscreened'}
                          </td>
                          <td className="py-2.5 pr-4 text-[#C8B9C0]">{String(c.status)}</td>
                          <td className="py-2.5">
                            <Link to={`/candidates/${c.id}`} className="text-[#E69AB5] hover:underline">
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </DashboardLayout>
    );
  }

  // --- LIST VIEW ---
  return (
    <DashboardLayout
      title="Job Descriptions"
      subtitle="Manage active roles, upload JD documents for verification, and start screening campaigns"
      actions={
        <div className="flex items-center gap-2">
          <label className="px-3.5 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
            <Upload className="w-3.5 h-3.5" />
            Upload JD
            <input type="file" accept=".pdf,.docx,.txt" onChange={handleJdUpload} className="hidden" />
          </label>
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setParseMessage(null);
              setForm({
                title: '',
                department: 'Engineering',
                location: 'Bengaluru / Hybrid',
                employmentType: 'Full-Time',
                description: '',
                requiredSkillsText: '',
                preferredSkillsText: '',
                minExperienceYears: '2',
                qualification: 'B.Tech / Bachelor',
                shortlistThreshold: 70,
              });
              setModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl burgundy-cta text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Job
          </button>
        </div>
      }
    >
      <div className="flex items-center gap-3 bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 max-w-md">
        <Search className="w-4 h-4 text-[#8E7E87]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search jobs by title, department, or location..."
          aria-label="Search job descriptions"
          className="w-full bg-transparent text-sm text-white placeholder-[#8E7E87] focus:outline-none"
        />
      </div>

      {error && <p className="text-sm text-[#EF6677]">{error}</p>}

      {loading ? (
        <p className="text-sm text-[#8E7E87]">Loading job descriptions...</p>
      ) : jobs.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center space-y-2">
          <Briefcase className="w-8 h-8 text-[#C26A8A] mx-auto" />
          <p className="text-sm text-[#C8B9C0]">No matching job descriptions found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {jobs.map((job) => (
            <article key={job.id} className="glass-panel rounded-2xl p-5 flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className={job.isActive ? 'text-[#39C98A] font-semibold' : 'text-[#8E7E87]'}>
                    {job.isActive ? 'Active' : 'Paused'} · {job.department}
                  </span>
                  <span className="font-mono-num text-[#C8B9C0]">Threshold {job.shortlist_threshold}%</span>
                </div>

                <Link to={`/jobs/${job.id}`} className="block text-lg font-bold text-white hover:text-[#E69AB5]">
                  {job.title}
                </Link>
                <p className="text-xs text-[#8E7E87]">
                  {job.location} · {job.min_experience_years ?? 0}+ yrs · {job.candidate_count ?? 0} candidates
                </p>
                <p className="text-xs text-[#C8B9C0] line-clamp-2 leading-relaxed">{job.description}</p>
                <p className="text-xs text-[#E6D8DE] pt-1">
                  Skills: <span className="text-[#C8B9C0]">{job.requiredSkills.join(' · ') || 'General'}</span>
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void toggleActive(job)}
                    className="px-2.5 py-1.5 rounded-lg border border-white/12 text-xs text-[#C8B9C0] hover:text-white cursor-pointer"
                  >
                    {job.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(job.id);
                      setForm({
                        title: job.title,
                        department: job.department,
                        location: job.location,
                        employmentType: job.employment_type,
                        description: job.description,
                        requiredSkillsText: job.requiredSkills.join(', '),
                        preferredSkillsText: job.preferredSkills.join(', '),
                        minExperienceYears: job.min_experience_years != null ? String(job.min_experience_years) : '',
                        qualification: job.qualification || '',
                        shortlistThreshold: job.shortlist_threshold,
                      });
                      setModalOpen(true);
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-white/12 text-xs text-[#C8B9C0] hover:text-white cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${job.title}`}
                    onClick={() => void deleteJob(job.id)}
                    className="p-1.5 rounded-lg border border-white/12 text-[#8E7E87] hover:text-[#EF6677] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => void startCampaignForJob(job)}
                  className="px-3 py-1.5 rounded-lg burgundy-cta text-xs font-semibold text-white inline-flex items-center gap-1 cursor-pointer"
                >
                  <Play className="w-3 h-3" />
                  Campaign
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Add / Edit / Verify Parsed JD Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-xl glass-panel bg-[#1A1017] rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                {editingId ? 'Edit Job Description' : 'Verify & Save Job Description'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-xs text-[#C8B9C0] hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
            {parseMessage && (
              <p className="text-xs text-[#39C98A] bg-[#39C98A]/10 border border-[#39C98A]/30 rounded-lg px-3 py-2">
                {parseMessage}
              </p>
            )}
            <form onSubmit={handleSaveJob} className="space-y-3">
              <input
                type="text"
                required
                placeholder="Job Title"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                className="w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Department"
                  value={form.department}
                  onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                  className="bg-white/5 border border-white/12 rounded-xl px-3.5 py-2 text-sm text-white"
                />
                <input
                  type="text"
                  placeholder="Location"
                  value={form.location}
                  onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                  className="bg-white/5 border border-white/12 rounded-xl px-3.5 py-2 text-sm text-white"
                />
              </div>
              <textarea
                required
                rows={4}
                placeholder="Role responsibilities and summary..."
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                className="w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white"
              />
              <input
                type="text"
                placeholder="Required Skills (comma separated)"
                value={form.requiredSkillsText}
                onChange={(e) => setForm((p) => ({ ...p, requiredSkillsText: e.target.value }))}
                className="w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2 text-sm text-white"
              />
              <input
                type="text"
                placeholder="Preferred Skills (comma separated)"
                value={form.preferredSkillsText}
                onChange={(e) => setForm((p) => ({ ...p, preferredSkillsText: e.target.value }))}
                className="w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2 text-sm text-white"
              />
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="number"
                  step="0.5"
                  placeholder="Min Years"
                  value={form.minExperienceYears}
                  onChange={(e) => setForm((p) => ({ ...p, minExperienceYears: e.target.value }))}
                  className="bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-sm text-white"
                />
                <input
                  type="text"
                  placeholder="Qualification"
                  value={form.qualification}
                  onChange={(e) => setForm((p) => ({ ...p, qualification: e.target.value }))}
                  className="bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-sm text-white"
                />
                <input
                  type="number"
                  min={30}
                  max={95}
                  placeholder="Threshold %"
                  value={form.shortlistThreshold}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, shortlistThreshold: Number(e.target.value || 70) }))
                  }
                  className="bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-white/15 text-xs text-[#C8B9C0] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl burgundy-cta text-xs font-semibold text-white cursor-pointer"
                >
                  Save Job Description
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
