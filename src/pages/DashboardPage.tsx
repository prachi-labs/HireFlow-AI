import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Briefcase, CheckCircle2, FileText, PhoneCall, Users } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout';
import { AiraHero } from '../components/AiraHero';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

interface DashboardData {
  stats: {
    totalCandidates: number;
    activeJobs: number;
    cvsReceived: number;
    shortlisted: number;
    interviewsScheduled: number;
    completedInterviews: number;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    details: string;
    created_at: string;
  }>;
  statusCounts: Array<{ status: string; count: number }>;
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<DashboardData>('/api/dashboard/stats')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats = data?.stats || {
    totalCandidates: 0,
    activeJobs: 0,
    cvsReceived: 0,
    shortlisted: 0,
    interviewsScheduled: 0,
    completedInterviews: 0,
  };

  const kpiCards = [
    { label: 'Total Candidates', value: stats.totalCandidates, icon: Users, to: '/candidates' },
    { label: 'Active Jobs', value: stats.activeJobs, icon: Briefcase, to: '/jobs' },
    { label: 'CVs Received', value: stats.cvsReceived, icon: FileText, to: '/resumes' },
    { label: 'Shortlisted', value: stats.shortlisted, icon: CheckCircle2, to: '/screening' },
    { label: 'Interviews Scheduled', value: stats.interviewsScheduled, icon: PhoneCall, to: '/interviews' },
    { label: 'Completed Interviews', value: stats.completedInterviews, icon: CheckCircle2, to: '/interviews' },
  ];

  return (
    <DashboardLayout
      title="Recruiter Dashboard"
      subtitle="Live pipeline counts, Aira assistant, and recent recruitment activity"
      actions={
        <Link
          to="/screening"
          className="px-4 py-2 rounded-xl burgundy-cta text-xs font-semibold text-white whitespace-nowrap shrink-0"
        >
          Start Screening Campaign
        </Link>
      }
    >
      {/* Compact Aira Panel */}
      <AiraHero
        variant="compact"
        recruiterName={user?.firstName || 'Recruiter'}
        stats={stats}
        onQuickAction={(p) => navigate(p)}
      />

      {/* Live Stats Grid (All from real DB) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((k) => {
          const Icon = k.icon;
          return (
            <Link
              key={k.label}
              to={k.to}
              className="glass-panel rounded-2xl p-4 hover:border-[#C26A8A]/40 transition-colors space-y-2"
            >
              <div className="flex items-center justify-between text-[#C8B9C0]">
                <span className="text-xs font-medium">{k.label}</span>
                <Icon className="w-4 h-4 text-[#C26A8A]" />
              </div>
              <p className="text-2xl font-bold font-data text-white">
                {loading ? '—' : k.value}
              </p>
            </Link>
          );
        })}
      </div>

      {/* Pipeline Distribution + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="glass-panel rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Pipeline Stage Distribution</h2>
            <Link to="/pipeline" className="text-xs text-[#E69AB5] hover:underline inline-flex items-center gap-1">
              Open Board <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {!data || data.statusCounts.length === 0 ? (
            <p className="text-sm text-[#8E7E87]">No candidates recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {data.statusCounts.map((s) => {
                const pct = stats.totalCandidates > 0 ? Math.round((s.count / stats.totalCandidates) * 100) : 0;
                return (
                  <div key={s.status} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#E6D8DE] font-medium">{s.status}</span>
                      <span className="font-mono-num text-[#C8B9C0]">
                        {s.count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#7B2948] to-[#C26A8A]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="glass-panel rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Recent Audit Activity</h2>
            <Link to="/notifications" className="text-xs text-[#E69AB5] hover:underline">
              Notifications
            </Link>
          </div>
          {!data || data.recentActivity.length === 0 ? (
            <p className="text-sm text-[#8E7E87]">No activity logged yet.</p>
          ) : (
            <div className="divide-y divide-white/8">
              {data.recentActivity.slice(0, 7).map((act) => {
                let readableDetails = act.details;
                if (act.details && act.details.trim().startsWith('{')) {
                  try {
                    const parsed = JSON.parse(act.details) as Record<string, unknown>;
                    readableDetails = Object.entries(parsed)
                      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                      .join(' · ');
                  } catch {
                    readableDetails = act.details;
                  }
                }
                return (
                  <div key={act.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium text-white truncate">
                        {act.action.replace(/_/g, ' ')} · {act.entity_type}
                      </p>
                      <p className="text-[#8E7E87] truncate">{readableDetails || 'Recorded'}</p>
                    </div>
                    <span className="font-mono-num text-[11px] text-[#8E7E87] shrink-0">
                      {act.created_at.slice(0, 16)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
