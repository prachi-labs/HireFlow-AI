import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, FileText, Upload } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout';
import { apiRequest } from '../lib/api';

interface ResumeRow {
  id: string;
  candidate_id: string;
  original_filename: string;
  file_size: number;
  parse_status: string;
  created_at: string;
  candidate_name: string;
  candidate_email: string;
  candidate_status: string;
  job_title: string | null;
}

export function ResumesPage() {
  const [resumes, setResumes] = useState<ResumeRow[]>([]);
  const [jobs, setJobs] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [outcomes, setOutcomes] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    const [r, j] = await Promise.all([
      apiRequest<{ resumes: ResumeRow[] }>('/api/resumes'),
      apiRequest<{ jobs: Array<{ id: string; title: string }> }>('/api/jobs'),
    ]);
    setResumes(r.resumes);
    setJobs(j.jobs);
    if (!selectedJobId && j.jobs[0]) setSelectedJobId(j.jobs[0].id);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    if (selectedJobId) fd.append('jobId', selectedJobId);
    Array.from(files).forEach((f) => fd.append('files', f));

    try {
      const res = await apiRequest<{ results: Array<Record<string, unknown>> }>('/api/resumes/upload', {
        method: 'POST',
        body: fd,
      });
      setOutcomes(res.results);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <DashboardLayout
      title="CV Management"
      subtitle="Single and bulk PDF, DOCX, and TXT upload with private storage and duplicate detection"
    >
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-white">Upload Candidate CVs</h2>
            <p className="text-xs text-[#C8B9C0]">
              Files are parsed server-side, hashed for duplicate prevention, and stored privately outside public routes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Target job description"
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="bg-[#1A1017] border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white"
            >
              <option value="">Assign later</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
            <label className="px-4 py-2 rounded-xl burgundy-cta text-xs font-semibold text-white inline-flex items-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" />
              {uploading ? 'Parsing CVs...' : 'Upload Single / Bulk CVs'}
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.txt"
                onChange={handleBulkUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {error && <p className="text-xs text-[#EF6677]">{error}</p>}

        {outcomes.length > 0 && (
          <div className="space-y-2 border-t border-white/10 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#C8B9C0]">Latest Upload Batch</p>
            {outcomes.map((o, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 text-xs bg-white/5 rounded-xl px-3.5 py-2.5"
              >
                <span className="font-medium text-white">{String(o.filename)}</span>
                {o.status === 'created' ? (
                  <span className="text-[#39C98A] inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Parsed & saved
                  </span>
                ) : o.status === 'duplicate' ? (
                  <span className="text-[#E8B45C] inline-flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Duplicate: {String(o.reason)}
                  </span>
                ) : (
                  <span className="text-[#EF6677] inline-flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {String(o.error)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-white">Parsed CV Repository ({resumes.length})</h2>
        {resumes.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <FileText className="w-8 h-8 text-[#8E7E87] mx-auto" />
            <p className="text-sm text-[#8E7E87]">No uploaded CV files yet. Upload PDF, DOCX, or TXT resumes above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-data">
              <thead className="text-[#8E7E87] border-b border-white/10">
                <tr>
                  <th className="py-2.5 pr-4">File</th>
                  <th className="py-2.5 pr-4">Candidate</th>
                  <th className="py-2.5 pr-4">Role</th>
                  <th className="py-2.5 pr-4">Size</th>
                  <th className="py-2.5 pr-4">Status</th>
                  <th className="py-2.5">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {resumes.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 pr-4 text-white font-medium">{r.original_filename}</td>
                    <td className="py-2.5 pr-4 text-[#C8B9C0]">{r.candidate_name}</td>
                    <td className="py-2.5 pr-4 text-[#C8B9C0]">{r.job_title || 'Unassigned'}</td>
                    <td className="py-2.5 pr-4 font-mono-num text-[#8E7E87]">
                      {Math.max(1, Math.round(r.file_size / 1024))} KB
                    </td>
                    <td className="py-2.5 pr-4 text-[#39C98A]">{r.parse_status}</td>
                    <td className="py-2.5">
                      <Link to={`/candidates/${r.candidate_id}`} className="text-[#E69AB5] hover:underline">
                        Open
                      </Link>
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
