import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type ConversationKind = 'direct' | 'listing' | 'rental';

export type ConversationSummary = {
  id: string;
  other_id: string;
  other_name: string | null;
  other_station: string | null;
  kind: ConversationKind;
  subject_title: string | null;
  last_message: string | null;
  last_message_at: string;
  unread: number;
};

export function subjectLabel(kind: ConversationKind, title: string | null) {
  if (kind === 'listing') return `🛒 Marketplace · ${title ?? 'Item'}`;
  if (kind === 'rental') return `🏡 Rental · ${title ?? 'Rental'}`;
  return '✉️ Direct message';
}

export async function startConversation(
  otherId: string,
  kind: ConversationKind = 'direct',
  subjectId: string | null = null,
  title: string | null = null
): Promise<string> {
  const { data, error } = await supabase.rpc('start_conversation', {
    other: otherId,
    conv_kind: kind,
    subject: subjectId,
    title,
  });
  if (error) throw error;
  return data as string;
}

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const { data, error } = await supabase.rpc('my_conversations');
  if (error) throw error;
  return (data ?? []) as ConversationSummary[];
}

type UnreadContextType = { count: number; refresh: () => Promise<void> };

const UnreadContext = createContext<UnreadContextType>({
  count: 0,
  refresh: async () => {},
});

export function UnreadMessagesProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_unread_count');
    if (!error && typeof data === 'number') setCount(data);
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 20000);
    return () => clearInterval(timer);
  }, [refresh]);

  return <UnreadContext.Provider value={{ count, refresh }}>{children}</UnreadContext.Provider>;
}

export const useUnreadMessages = () => useContext(UnreadContext);