import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';

type ForumUnreadContextType = {
  counts: Record<string, number>;
  total: number;
  refresh: () => Promise<void>;
};

const ForumUnreadContext = createContext<ForumUnreadContextType>({
  counts: {},
  total: 0,
  refresh: async () => {},
});

export function ForumUnreadProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('forum_unread_counts');
    if (error || !data) return;
    const next: Record<string, number> = {};
    for (const row of data as { channel_id: string; unread: number }[]) {
      next[row.channel_id] = row.unread;
    }
    setCounts(next);
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 20000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [refresh]);

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <ForumUnreadContext.Provider value={{ counts, total, refresh }}>
      {children}
    </ForumUnreadContext.Provider>
  );
}

export const useForumUnread = () => useContext(ForumUnreadContext);