'use client';

// frontend/app/dashboard/page.tsx
// Replaces the static demo version with live data from the FastAPI backend.
// Auth pattern matches the rest of the app (supabase.auth.getSession).
// API shape matches backend/app/routers/apply.py exactly.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useDashboard, JobApplicationRow } from '@/hooks/useDashboard';

// ── Status helpers ────────────────────────────────────────────────────────────

type StatusKey = JobApplicationRow['status'];

const STATUS_BADGE: Record<StatusKey, { label: string; className: string }> = {
  auto_applied: {
    label: 'Auto-Applied',
    className:
      'px-2.5 py-1 rounded-full text-xs bg-sky-400/20 text-sky-300 border border-sky-300/20',
  },
  follow_up_required: {
    label: 'Needs Follow-Up',
    className:
      'px-2.5 py-1 rounded-full text-xs bg-amber-300/20 text-amber-200 border border-amber-300/20',
  },
  completed: {
    label: 'Completed',
    className:
      'px-2.5 py-1 rounded-full text-xs bg-emerald-400/20 text-emerald-300 border border-emerald-300/20',
  },
};

function StatusBadge({ status }: { status: StatusKey }) {
  const cfg = STATUS_BADGE[status] ?? STATUS_BADGE.auto_applied;
  return <span className={cfg.className}>{cfg.label}</span>;
}

function fmt(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {[...Array(4)].map((_, i) => (
        <tr key={i} className="animate-pulse">
          {[...Array(8)].map((_, j) => (
            <td key={j} className="px-4 py-3 border-b border-white/5">
              <div className="h-3 bg-white/10 rounded w-24" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── Follow-up cell ────────────────────────────────────────────────────────────

interface FollowUpCellProps {
  job: JobApplicationRow;
  loading: boolean;
  error: string | null;
  onToggle: (confirmed: boolean) => void;
}

function FollowUpCell({ job, loading, error, onToggle }: FollowUpCellProps) {
  const [confirming, setConfirming] = useState(false);
  const next = !job.follow_up_confirmed;

  if (loading) {
    return <span className="text-white/40 text-xs">Saving…</span>;
  }

  // Inline confirm/cancel before firing the PATCH
  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-white/60 text-xs">
          {next ? 'Mark confirmed?' : 'Unmark?'}
        </span>
        <button
          onClick={() => { setConfirming(false); onToggle(next); }}
          className="text-xs px-2 py-1 rounded bg-white text-black font-semibold hover:bg-white/90 transition-colors"
        >
          Yes
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs px-2 py-1 rounded text-white/60 hover:text-white transition-colors"
        >
          No
        </button>
        {error && <span className="text-red-400 text-xs ml-1">{error}</span>}
      </div>
    );
  }

  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none group">
      <input
        type="checkbox"
        checked={job.follow_up_confirmed}
        onChange={() => setConfirming(true)}
        className="h-4 w-4 rounded border-white/30 bg-transparent accent-white cursor-pointer"
      />
      <span className="text-white/80 text-sm group-hover:text-white transition-colors">
        {job.follow_up_confirmed ? 'Confirmed' : 'Confirm'}
      </span>
      {error && <span className="text-red-400 text-xs">!</span>}
    </label>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [userEmail, setUserEmail] = useState('');

  // Auth — matches existing pattern in the codebase
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return; }
      setUserId(session.user.id);
      setUserEmail(session.user.email ?? '');
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) { router.push('/login'); return; }
      setUserId(session.user.id);
      setUserEmail(session.user.email ?? '');
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const { rows, loading, error, followUpLoading, followUpError, refresh, sendFollowUp } =
    useDashboard(userId);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: rows.length,
    autoApplied: rows.filter(r => r.status === 'auto_applied').length,
    followUpRequired: rows.filter(r => r.status === 'follow_up_required').length,
    completed: rows.filter(r => r.status === 'completed').length,
  }), [rows]);

  if (authLoading) {
    return (
      <main className="min-h-screen bg-black flex items-center justify-center">
        <span className="text-white/60">Loading…</span>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white pt-24 px-4 md:px-6 pb-10">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-bold mb-1">Application Grid</h1>
            <p className="text-white/60">
              Live applications for <span className="text-white/80">{userEmail}</span>
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="text-sm font-medium px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all disabled:opacity-40"
          >
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Rows',      value: stats.total,           sub: 'All tracked applications' },
            { label: 'Auto-Applied',    value: stats.autoApplied,     sub: 'No action needed yet'     },
            { label: 'Needs Follow-Up', value: stats.followUpRequired, sub: 'Pending manual step'      },
            { label: 'Completed',       value: stats.completed,       sub: 'Follow-up confirmed'      },
          ].map(({ label, value, sub }) => (
            <div
              key={label}
              className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6"
            >
              <div className="text-white/60 text-sm mb-2">{label}</div>
              <div className="text-3xl font-bold mb-1">{value}</div>
              <div className="text-white/40 text-xs">{sub}</div>
            </div>
          ))}
        </div>

        {/* API error banner */}
        {error && (
          <div className="mb-4 p-3 rounded-lg border border-red-400/30 bg-red-400/10 text-red-300 text-sm flex items-center justify-between gap-4">
            <span>{error}</span>
            <button
              onClick={refresh}
              className="underline text-red-200 hover:text-white transition-colors shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 text-sm text-white/60">
            Jobs are fetched live from{' '}
            <code className="text-white/80 font-mono text-xs">GET /apply/jobs/{'{user_id}'}</code>.
            Confirming follow-up calls{' '}
            <code className="text-white/80 font-mono text-xs">PATCH /apply/jobs/{'{job_id}'}/follow-up</code>.
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-white/5 text-white/60">
                <tr>
                  {[
                    'Company', 'Role', 'Location', 'Source',
                    'Auto-Applied At', 'Status', 'Requires Follow-Up', 'Follow-Up Confirmed',
                  ].map(h => (
                    <th key={h} className="text-left font-medium px-4 py-3 border-b border-white/10">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {/* Loading skeletons on first load */}
                {loading && rows.length === 0 && <SkeletonRows />}

                {/* Empty state */}
                {!loading && !error && rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-white/50">
                      No applications yet. Auto-applied jobs will appear here automatically.
                    </td>
                  </tr>
                )}

                {rows.map(job => (
                  <tr key={job.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3 border-b border-white/5 font-medium">
                      {job.company}
                    </td>
                    <td className="px-4 py-3 border-b border-white/5">
                      {job.title}
                    </td>
                    <td className="px-4 py-3 border-b border-white/5 text-white/70">
                      {job.location ?? '—'}
                    </td>
                    <td className="px-4 py-3 border-b border-white/5 text-white/70">
                      {job.source ?? '—'}
                    </td>
                    <td className="px-4 py-3 border-b border-white/5 text-white/70 whitespace-nowrap">
                      {fmt(job.auto_applied_at)}
                    </td>
                    <td className="px-4 py-3 border-b border-white/5">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3 border-b border-white/5">
                      <span className={job.requires_follow_up ? 'text-amber-200' : 'text-white/40'}>
                        {job.requires_follow_up ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-b border-white/5">
                      <FollowUpCell
                        job={job}
                        loading={!!followUpLoading[job.id]}
                        error={followUpError[job.id] ?? null}
                        onToggle={(confirmed) => sendFollowUp(job.id, confirmed)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
