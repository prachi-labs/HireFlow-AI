import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Plus, Search, Trash2, Upload } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout';
import { apiRequest } from '../lib/api';

interface CandidateItem {
  id: string;
  name: string;
  phone: string;
  email: string;
  qualifications: string;
  passing_year: string;
  experience: string;
  feedback: string;
  status: string;
  job_title?: string;
  latest_score?: number | null;
}

export function CandidatesPage() {
  const { id } = useParams<{ id: string }>();
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    qualifications: '',
    passingYear: '',
    experience: '',
    skillsText: '',
    feedback: '',
  });

  const [detail, setDetail] = useState<{
    candidate: CandidateItem & { notes?: string };
    skills: Array<{ skill_name: string }>;
    resumes: Array<{ id: string; original_filename: string; created_at: string }>;
    screenings: Array<Record<string, unknown>>;
    interviews: Array<Record<string, unknown>>;
    history: Array<{ id: string; from_status: string | null; to_status: string; reason: string; created_at: string }>;
    emails: Array<{ id: string; subject: string; status: string; created_at: string }>;
  } | null>(null);
  const [notesEdit, setNotesEdit] = useState('');

  const loadList = async () => {
    const data = await apiRequest<{ candidates: CandidateItem[]; statuses: string[] }>(
      `/api/candidates?q=${encodeURIComponent(query)}&status=${encodeURIComponent(statusFilter)}`
    );
    setCandidates(data.candidates);
    setStatuses(data.statuses);
  };

  useEffect(() => {
    if (id) {
      apiRequest<typeof detail>(`/api/candidates/${id}`)
        .then((d) => {
          setDetail(d);
          setNotesEdit(d?.candidate.notes || '');
        })
        .catch((err) => setError((err as Error).message));
    } else {
      void loadList();
    }
  }, [id, query, statusFilter]);

  const handleAddCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/candidates', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          skills: form.skillsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      setModalOpen(false);
      setForm({
        name: '',
        phone: '',
        email: '',
        qualifications: '',
        passingYear: '',
        experience: '',
        skillsText: '',
        feedback: '',
      });
      await loadList();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (candId: string) => {
    await apiRequest(`/api/candidates/${candId}`, { method: 'DELETE' });
    await loadList();
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await apiRequest<{ imported: number; skipped: number; errors: string[] }>(
        '/api/candidates/import/xlsx',
        { method: 'POST', body: fd }
      );
      setImportNote(`Excel import: ${res.imported} imported, ${res.skipped} skipped.`);
      await loadList();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSaveNotes = async () => {
    if (!id) return;
    await apiRequest(`/api/candidates/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ notes: notesEdit }),
    });
    const d = await apiRequest<typeof detail>(`/api/candidates/${id}`);
    setDetail(d);
  };

  if (id) {
    return (
      <DashboardLayout
        title={detail?.candidate.name || 'Candidate Profile'}
        subtitle={
          detail
            ? `${detail.candidate.email || 'No email'} · ${detail.candidate.phone || 'No phone'} · Status: ${detail.candidate.status}`
            : 'Loading profile...'
        }
        actions={
          <Link
            to="/candidates"
            className="px-3.5 py-2 rounded-xl border border-white/15 text-xs font-semibold text-[#C8B9C0] hover:text-white inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Candidates
          </Link>
        }
      >
        {detail && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <section className="glass-panel rounded-2xl p-6 space-y-4">
                <h2 className="text-base font-bold text-white">Candidate Profile & Skills</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-data">
                  <div>
                    <span className="text-[#8E7E87] block">Qualifications</span>
                    <span className="text-white">{detail.candidate.qualifications || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[#8E7E87] block">Passing Year</span>
                    <span className="text-white">{detail.candidate.passing_year || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[#8E7E87] block">Experience</span>
                    <span className="text-white">{detail.candidate.experience || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[#8E7E87] block">Role</span>
                    <span className="text-white">{detail.candidate.job_title || 'Unassigned'}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-white/10 text-xs">
                  <span className="text-[#8E7E87] block mb-1">Extracted Skills</span>
                  <span className="text-[#E6D8DE]">
                    {detail.skills.map((s) => s.skill_name).join(' · ') || 'No skills recorded'}
                  </span>
                </div>
                <div className="pt-2 border-t border-white/10 text-xs">
                  <span className="text-[#8E7E87] block mb-1">Latest Feedback</span>
                  <span className="text-[#C8B9C0]">{detail.candidate.feedback || '—'}</span>
                </div>
              </section>

              <section className="glass-panel rounded-2xl p-6 space-y-3">
                <h2 className="text-base font-bold text-white">Screening & Interview History</h2>
                {detail.interviews.length === 0 && detail.screenings.length === 0 ? (
                  <p className="text-xs text-[#8E7E87]">No screening or interview records yet.</p>
                ) : (
                  <div className="space-y-3 text-xs">
                    {detail.screenings.map((sr) => (
                      <div key={String(sr.id)} className="rounded-xl bg-white/5 p-3.5 space-y-1">
                        <div className="flex justify-between font-semibold text-white">
                          <span>Screening — {String(sr.job_title)}</span>
                          <span className="font-mono-num">{String(sr.overall_score)}%</span>
                        </div>
                        <p className="text-[#C8B9C0]">{String(sr.explanation)}</p>
                      </div>
                    ))}
                    {detail.interviews.map((iv) => (
                      <div key={String(iv.id)} className="rounded-xl bg-white/5 p-3.5 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">
                            Level 1 Interview ({String(iv.mode)}) · {String(iv.status)}
                          </p>
                          <p className="text-[#C8B9C0]">
                            {iv.overall_score != null
                              ? `Score ${iv.overall_score}/5.0 — ${iv.recommendation}`
                              : 'Pending completion'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/interview/web/${iv.access_token}`}
                            className="px-3 py-1.5 rounded-lg border border-white/15 text-white hover:bg-white/10"
                          >
                            Web Interview
                          </Link>
                          <Link
                            to={`/interviews/${iv.id}`}
                            className="px-3 py-1.5 rounded-lg burgundy-cta text-white font-semibold"
                          >
                            Report
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="space-y-6">
              <section className="glass-panel rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-bold text-white">Recruiter Notes</h2>
                <textarea
                  rows={4}
                  value={notesEdit}
                  onChange={(e) => setNotesEdit(e.target.value)}
                  placeholder="Add private recruiter observations..."
                  className="w-full bg-white/5 border border-white/12 rounded-xl p-3 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => void handleSaveNotes()}
                  className="w-full py-2 rounded-xl burgundy-cta text-xs font-semibold text-white cursor-pointer"
                >
                  Save Notes
                </button>
              </section>

              <section className="glass-panel rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-bold text-white">Status Audit Trail</h2>
                <div className="space-y-2.5 text-xs">
                  {detail.history.map((h) => (
                    <div key={h.id} className="border-b border-white/8 pb-2">
                      <p className="font-semibold text-white">
                        {h.from_status ? `${h.from_status} → ` : ''}
                        {h.to_status}
                      </p>
                      <p className="text-[#8E7E87]">{h.reason}</p>
                      <p className="font-mono-num text-[10px] text-[#8E7E87] mt-0.5">{h.created_at}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Candidates & Excel Sync"
      subtitle="Search, filter, manage candidate records, and export Candidate.xlsx with all 9 preserved columns"
      actions={
        <div className="flex items-center gap-2">
          <a
            href="/api/candidates/export/xlsx"
            className="px-3.5 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </a>
          <label className="px-3.5 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
            <Upload className="w-3.5 h-3.5" />
            Import Excel
            <input type="file" accept=".xlsx" onChange={handleExcelImport} className="hidden" />
          </label>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 rounded-xl burgundy-cta text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Candidate
          </button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5 bg-white/5 border border-white/12 rounded-xl px-3.5 py-2 flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-[#8E7E87]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, phone, or qualification..."
            aria-label="Search candidates"
            className="w-full bg-transparent text-sm text-white placeholder-[#8E7E87] focus:outline-none"
          />
        </div>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-[#1A1017] border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white"
        >
          <option value="ALL">All Statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {importNote && <p className="text-xs text-[#39C98A]">{importNote}</p>}
      {error && <p className="text-xs text-[#EF6677]">{error}</p>}

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-data">
            <thead className="bg-white/5 text-[#C8B9C0] border-b border-white/10">
              <tr>
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Phone</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Qualification</th>
                <th className="py-3 px-4">Experience</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {candidates.map((c) => (
                <tr key={c.id} className="hover:bg-white/[0.03]">
                  <td className="py-3 px-4 font-mono-num text-[#8E7E87]">{c.id}</td>
                  <td className="py-3 px-4 font-semibold text-white">
                    <Link to={`/candidates/${c.id}`} className="hover:text-[#E69AB5]">
                      {c.name}
                    </Link>
                  </td>
                  <td className="py-3 px-4 font-mono-num text-[#C8B9C0]">{c.phone || '—'}</td>
                  <td className="py-3 px-4 text-[#C8B9C0]">{c.email || '—'}</td>
                  <td className="py-3 px-4 text-[#C8B9C0]">
                    {c.qualifications || '—'} {c.passing_year ? `(${c.passing_year})` : ''}
                  </td>
                  <td className="py-3 px-4 text-[#C8B9C0]">{c.experience || '—'}</td>
                  <td className="py-3 px-4 font-semibold text-[#E6D8DE]">{c.status}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Link to={`/candidates/${c.id}`} className="text-[#E69AB5] hover:underline">
                        Profile
                      </Link>
                      <button
                        type="button"
                        aria-label={`Delete ${c.name}`}
                        onClick={() => void handleDelete(c.id)}
                        className="text-[#8E7E87] hover:text-[#EF6677] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-lg glass-panel bg-[#1A1017] rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Add Candidate</h2>
            <form onSubmit={handleAddCandidate} className="space-y-3">
              <input
                type="text"
                required
                placeholder="Full Name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2 text-sm text-white"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Phone No."
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  className="bg-white/5 border border-white/12 rounded-xl px-3.5 py-2 text-sm text-white"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className="bg-white/5 border border-white/12 rounded-xl px-3.5 py-2 text-sm text-white"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Qualifications"
                  value={form.qualifications}
                  onChange={(e) => setForm((p) => ({ ...p, qualifications: e.target.value }))}
                  className="bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-sm text-white"
                />
                <input
                  type="text"
                  placeholder="Passing Year"
                  value={form.passingYear}
                  onChange={(e) => setForm((p) => ({ ...p, passingYear: e.target.value }))}
                  className="bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-sm text-white"
                />
                <input
                  type="text"
                  placeholder="Experience (e.g. 3 yrs)"
                  value={form.experience}
                  onChange={(e) => setForm((p) => ({ ...p, experience: e.target.value }))}
                  className="bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>
              <input
                type="text"
                placeholder="Skills (comma separated)"
                value={form.skillsText}
                onChange={(e) => setForm((p) => ({ ...p, skillsText: e.target.value }))}
                className="w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2 text-sm text-white"
              />
              <input
                type="text"
                placeholder="Initial Feedback"
                value={form.feedback}
                onChange={(e) => setForm((p) => ({ ...p, feedback: e.target.value }))}
                className="w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2 text-sm text-white"
              />
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
                  Save Candidate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
