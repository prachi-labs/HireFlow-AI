import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '../components/DashboardLayout';
import { apiRequest } from '../lib/api';
import { canTransitionStatus, PIPELINE_STATUSES } from '../lib/recruitmentRules';

interface CandRow {
  id: string;
  name: string;
  status: string;
  job_title: string | null;
  latest_score: number | null;
}

export function PipelinePage() {
  const [candidates, setCandidates] = useState<CandRow[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCandidates = async () => {
    const d = await apiRequest<{ candidates: CandRow[] }>('/api/candidates');
    setCandidates(d.candidates);
  };

  useEffect(() => {
    void loadCandidates();
  }, []);

  const moveCandidate = async (candId: string, toStatus: string) => {
    setError(null);
    const cand = candidates.find((c) => c.id === candId);
    if (!cand || cand.status === toStatus) return;

    if (!canTransitionStatus(cand.status, toStatus)) {
      setError(`Blocked invalid stage transition: "${cand.status}" cannot move directly to "${toStatus}".`);
      return;
    }

    try {
      await apiRequest(`/api/candidates/${candId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: toStatus, statusReason: 'Moved on Pipeline Board' }),
      });
      await loadCandidates();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <DashboardLayout
      title="Pipeline Stage Board"
      subtitle="Drag candidates across valid recruitment stages with server-enforced transition rules and audit history"
    >
      {error && (
        <div className="rounded-xl border border-[#EF6677]/45 bg-[#EF6677]/12 px-4 py-3 text-xs text-[#FFB8C1]">
          {error}
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STATUSES.map((stage) => {
          const stageCands = candidates.filter((c) => c.status === stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (draggedId) void moveCandidate(draggedId, stage);
                setDraggedId(null);
              }}
              className="w-64 shrink-0 glass-panel rounded-2xl p-3.5 flex flex-col gap-3 min-h-[380px]"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs font-bold text-white">{stage}</span>
                <span className="font-mono-num text-xs text-[#C26A8A]">{stageCands.length}</span>
              </div>

              <div className="space-y-2.5 flex-1">
                {stageCands.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={() => setDraggedId(c.id)}
                    className="rounded-xl bg-white/[0.05] border border-white/10 p-3 space-y-2 cursor-grab active:cursor-grabbing"
                  >
                    <Link to={`/candidates/${c.id}`} className="text-xs font-bold text-white hover:text-[#E69AB5] block">
                      {c.name}
                    </Link>
                    <p className="text-[11px] text-[#8E7E87] truncate">{c.job_title || 'Unassigned'}</p>
                    {c.latest_score != null && (
                      <p className="font-mono-num text-[11px] text-[#39C98A]">{c.latest_score}% Match</p>
                    )}
                    <select
                      aria-label={`Change stage for ${c.name}`}
                      value={c.status}
                      onChange={(e) => void moveCandidate(c.id, e.target.value)}
                      className="w-full bg-[#10090D] border border-white/12 rounded-lg px-2 py-1 text-[11px] text-[#C8B9C0]"
                    >
                      {PIPELINE_STATUSES.map((opt) => (
                        <option key={opt} value={opt} disabled={!canTransitionStatus(c.status, opt)}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </DashboardLayout>
  );
}
