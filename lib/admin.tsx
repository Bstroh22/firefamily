import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type PendingMember = {
  id: string;
  full_name: string | null;
  station: string | null;
  employee_id: string | null;
  rank: string | null;
  requested_rank: string | null;
  created_at: string;
};

type PendingRow = PendingMember & { kind: 'member' | 'rank' };

export type OpenReport = {
  id: string;
  target_kind: 'listing' | 'rental' | 'forum_message' | 'direct_message';
  target_id: string;
  content_snapshot: string | null;
  reason: string;
  details: string | null;
  created_at: string;
  reporter_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  owner_station: string | null;
  report_count: number;
};

export async function fetchPending() {
  const { data, error } = await supabase.rpc('admin_pending');
  if (error) throw error;
  const rows = (data ?? []) as PendingRow[];
  return {
    newMembers: rows.filter((r) => r.kind === 'member'),
    rankRequests: rows.filter((r) => r.kind === 'rank'),
  };
}

export async function fetchReports(): Promise<OpenReport[]> {
  const { data, error } = await supabase.rpc('admin_open_reports');
  if (error) throw error;
  return (data ?? []) as OpenReport[];
}

type AdminCountContextType = { count: number; refresh: () => Promise<void> };

const AdminCountContext = createContext<AdminCountContextType>({
  count: 0,
  refresh: async () => {},
});

export function AdminCountProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const pending = await fetchPending();
      const { data: reportCount } = await supabase.rpc('admin_open_report_count');
      setCount(
        pending.newMembers.length +
          pending.rankRequests.length +
          (typeof reportCount === 'number' ? reportCount : 0)
      );
    } catch {
      // ignore; the badge will try again on the next refresh
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [enabled, refresh]);

  return (
    <AdminCountContext.Provider value={{ count, refresh }}>
      {children}
    </AdminCountContext.Provider>
  );
}

export const useAdminCount = () => useContext(AdminCountContext);