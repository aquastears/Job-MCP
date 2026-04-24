// frontend/hooks/useDashboard.ts
import { useState, useEffect, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

// Matches the DB row returned by GET /apply/jobs/{user_id}
export interface JobApplicationRow {
  id: string;
  user_id: string;
  company: string;
  title: string;
  location: string | null;
  source: string | null;
  auto_applied_at: string;
  requires_follow_up: boolean;
  follow_up_confirmed: boolean;
  status: 'auto_applied' | 'follow_up_required' | 'completed';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface DashboardState {
  rows: JobApplicationRow[];
  loading: boolean;
  error: string | null;
  // Per-job loading/error keyed by job id
  followUpLoading: Record<string, boolean>;
  followUpError: Record<string, string | null>;
}

export function useDashboard(userId: string) {
  const [state, setState] = useState<DashboardState>({
    rows: [],
    loading: true,
    error: null,
    followUpLoading: {},
    followUpError: {},
  });

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchJobs = useCallback(async () => {
    if (!userId) return;
    setState(s => ({ ...s, loading: true, error: null }));

    try {
      const res = await fetch(`${API_BASE}/apply/jobs/${userId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);

      // Response shape: { status: "ok", rows: [...] }
      const data: { status: string; rows: JobApplicationRow[] } = await res.json();
      setState(s => ({ ...s, rows: data.rows ?? [], loading: false }));
    } catch (err) {
      setState(s => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load jobs',
      }));
    }
  }, [userId]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // ── Follow-up ─────────────────────────────────────────────────────────────
  // PATCH /apply/jobs/{job_id}/follow-up  body: { follow_up_confirmed: bool }
  // Response shape: { status: "ok", row: JobApplicationRow }
  const sendFollowUp = useCallback(async (jobId: string, confirmed: boolean) => {
    setState(s => ({
      ...s,
      followUpLoading: { ...s.followUpLoading, [jobId]: true },
      followUpError: { ...s.followUpError, [jobId]: null },
    }));

    try {
      const res = await fetch(`${API_BASE}/apply/jobs/${jobId}/follow-up`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ follow_up_confirmed: confirmed }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);

      const data: { status: string; row: JobApplicationRow } = await res.json();

      // Patch the updated row back into the list without a full refetch
      setState(s => ({
        ...s,
        rows: s.rows.map(r => r.id === jobId ? data.row : r),
        followUpLoading: { ...s.followUpLoading, [jobId]: false },
      }));
    } catch (err) {
      setState(s => ({
        ...s,
        followUpLoading: { ...s.followUpLoading, [jobId]: false },
        followUpError: {
          ...s.followUpError,
          [jobId]: err instanceof Error ? err.message : 'Follow-up failed',
        },
      }));
    }
  }, []);

  return {
    rows: state.rows,
    loading: state.loading,
    error: state.error,
    followUpLoading: state.followUpLoading,
    followUpError: state.followUpError,
    refresh: fetchJobs,
    sendFollowUp,
  };
}
