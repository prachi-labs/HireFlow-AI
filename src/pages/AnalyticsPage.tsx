import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout';
import { apiRequest } from '../lib/api';

interface AnalyticsPayload {
  applicationsOverTime: Array<{ date: string; count: number }>;
  statusDistribution: Array<{ status: string; count: number }>;
  jobMatching: Array<{
    id: string;
    title: string;
    applicants: number;
    shortlisted: number;
    avg_score: number | null;
    completed_interviews: number;
  }>;
  rates: {
    interviewCompletionRate: number;
    level1ToLevel2Rate: number;
    totalInterviews: number;
    completedInterviews: number;
    level2Invited: number;
  };
}

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);

  useEffect(() => {
    apiRequest<AnalyticsPayload>('/api/analytics').then(setData).catch(() => {});
  }, []);

  const maxStatusCount = Math.max(1, ...(data?.statusDistribution.map((s) => s.count) || [1]));

  return (
    <DashboardLayout
      title="Analytics & Reports"
      subtitle="Database-backed hiring funnel metrics, job performance, and Excel / PDF exports"
      actions={
        <div className="flex items-center gap-2">
          <a
            href="/api/candidates/export/xlsx"
            className="px-3.5 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </a>
          <a
            href="/api/analytics/export/pdf"
            className="px-4 py-2 rounded-xl burgundy-cta text-xs font-semibold text-white inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export PDF
          </a>
        </div>
      }
    >
      {/* Conversion KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-5 space-y-1">
          <span className="text-xs text-[#C8B9C0]">Interview Completion Rate</span>
          <p className="text-2xl font-bold font-data text-white">
            {data ? `${data.rates.interviewCompletionRate}%` : '—'}
          </p>
          <span className="text-[11px] text-[#8E7E87]">
            {data?.rates.completedInterviews ?? 0} of {data?.rates.totalInterviews ?? 0} interviews
          </span>
        </div>
        <div className="glass-panel rounded-2xl p-5 space-y-1">
          <span className="text-xs text-[#C8B9C0]">Level 1 to Level 2 Conversion</span>
          <p className="text-2xl font-bold font-data text-white">
            {data ? `${data.rates.level1ToLevel2Rate}%` : '—'}
          </p>
          <span className="text-[11px] text-[#8E7E87]">
            {data?.rates.level2Invited ?? 0} invited to Level 2
          </span>
        </div>
        <div className="glass-panel rounded-2xl p-5 space-y-1">
          <span className="text-xs text-[#C8B9C0]">Active Roles Tracked</span>
          <p className="text-2xl font-bold font-data text-white">{data?.jobMatching.length ?? 0}</p>
          <span className="text-[11px] text-[#8E7E87]">Live JD performance rows</span>
        </div>
        <div className="glass-panel rounded-2xl p-5 space-y-1">
          <span className="text-xs text-[#C8B9C0]">Application Days Logged</span>
          <p className="text-2xl font-bold font-data text-white">
            {data?.applicationsOverTime.length ?? 0}
          </p>
          <span className="text-[11px] text-[#8E7E87]">Daily intake records</span>
        </div>
      </div>

      {/* Funnel & Daily Intake */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="glass-panel rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-bold text-white">Recruitment Funnel Distribution</h2>
          <div className="space-y-3">
            {(data?.statusDistribution || []).map((row) => (
              <div key={row.status} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-[#E6D8DE]">{row.status}</span>
                  <span className="font-mono-num text-white font-semibold">{row.count}</span>
                </div>
                <div className="h-2.5 rounded-full bg-white/8 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#7B2948] to-[#C26A8A]"
                    style={{ width: `${Math.round((row.count / maxStatusCount) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-panel rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-bold text-white">Applications Over Time</h2>
          {!data || data.applicationsOverTime.length === 0 ? (
            <p className="text-xs text-[#8E7E87]">No applications recorded yet.</p>
          ) : (
            <div className="space-y-2.5">
              {data.applicationsOverTime.map((d) => (
                <div key={d.date} className="flex items-center justify-between text-xs border-b border-white/8 pb-2">
                  <span className="font-mono-num text-[#C8B9C0]">{d.date}</span>
                  <span className="font-mono-num font-bold text-white">{d.count} candidate(s)</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Job-Wise Performance Table */}
      <section className="glass-panel rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-white">Job-Wise Screening & Interview Performance</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-data">
            <thead className="text-[#8E7E87] border-b border-white/10">
              <tr>
                <th className="py-2.5 pr-4">Job Title</th>
                <th className="py-2.5 pr-4">Applicants</th>
                <th className="py-2.5 pr-4">Shortlisted</th>
                <th className="py-2.5 pr-4">Avg Match Score</th>
                <th className="py-2.5">Completed Interviews</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {(data?.jobMatching || []).map((j) => (
                <tr key={j.id}>
                  <td className="py-2.5 pr-4 font-semibold text-white">{j.title}</td>
                  <td className="py-2.5 pr-4 font-mono-num text-[#C8B9C0]">{j.applicants}</td>
                  <td className="py-2.5 pr-4 font-mono-num text-[#39C98A]">{j.shortlisted}</td>
                  <td className="py-2.5 pr-4 font-mono-num text-white">
                    {j.avg_score != null ? `${j.avg_score}%` : '—'}
                  </td>
                  <td className="py-2.5 font-mono-num text-[#C8B9C0]">{j.completed_interviews}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardLayout>
  );
}
