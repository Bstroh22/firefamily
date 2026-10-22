import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ChannelHere } from './activity';
import { useAuth } from './auth';
import Avatar from './Avatar';
import ConversationChat from './ConversationChat';
import { useForumUnread } from './forumUnread';
import { startConversation } from './messages';
import { ReportModal } from './ReportButton';
import { supabase } from './supabase';

const FIRE_RED = '#C8102E';
const REFRESH_MS = 5000;
const TYPING_SEND_EVERY_MS = 2000;
const TYPING_EXPIRES_MS = 4000;
const MESSAGE_FIELDS = 'id, body, created_at, author_id, author:profiles(full_name, station, avatar_url)';

export type Channel = { id: string; name: string; description: string | null };

type Message = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author: { full_name: string | null; station: string | null; avatar_url: string | null } | null;
};

type Typer = { name: string; at: number };

function formatTime(dateString: string) {
  const d = new Date(dateString);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

function typingLabel(names: string[]) {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return 'Several people are typing…';
}

type Props = {
  channel: Channel | null;
  initialQuery?: string;
  onClose: () => void;
};

export default function ChannelChat({ channel, initialQuery, onClose }: Props) {
  const { session, profile } = useAuth();
  const { refresh: refreshUnread } = useForumUnread();
  const myId = session?.user.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [typers, setTypers] = useState<Record<string, Typer>>({});
  const [directChat, setDirectChat] = useState<{ id: string; name: string } | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);

  const liveRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSentRef = useRef(0);

  const loadMessages = useCallback(async () => {
    if (!channel) return;
    const { data, error } = await supabase
      .from('forum_messages')
      .select(MESSAGE_FIELDS)
      .eq('channel_id', channel.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error) setMessages((data as any) ?? []);
    setLoading(false);
  }, [channel]);

  // Open the channel: remember where I left off, then mark it read
  useEffect(() => {
    if (!channel) return;
    const channelId = channel.id;
    setLoading(true);
    setMessages([]);
    setDirectChat(null);
    setLastRead(null);
    setSearchOpen(!!initialQuery);
    setQuery(initialQuery ?? '');
    setResults([]);

    (async () => {
      const { data } = await supabase.rpc('channel_last_read', { ch: channelId });
      if (typeof data === 'string') setLastRead(data);
      await supabase.rpc('mark_channel_read', { ch: channelId });
      refreshUnread();
    })();

    loadMessages();
    const timer = setInterval(loadMessages, REFRESH_MS);
    return () => {
      clearInterval(timer);
      // Mark read again on the way out, so messages seen while open don't count
      supabase.rpc('mark_channel_read', { ch: channelId }).then(() => refreshUnread());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, initialQuery, loadMessages]);

  // Search this channel's full history
  useEffect(() => {
    if (!channel || !searchOpen) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('forum_messages')
        .select(MESSAGE_FIELDS)
        .eq('channel_id', channel.id)
        .ilike('body', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error) setResults((data as any) ?? []);
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [query, searchOpen, channel]);

  // Live "is typing" signals
  useEffect(() => {
    if (!channel) return;

    const live = supabase.channel(`typing-${channel.id}`, {
      config: { broadcast: { self: false } },
    });

    live
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload?.userId || payload.userId === myId) return;
        setTypers((prev) => ({ ...prev, [payload.userId]: { name: payload.name, at: Date.now() } }));
      })
      .on('broadcast', { event: 'stop' }, ({ payload }) => {
        if (!payload?.userId) return;
        setTypers((prev) => {
          if (!prev[payload.userId]) return prev;
          const next = { ...prev };
          delete next[payload.userId];
          return next;
        });
      })
      .subscribe();

    liveRef.current = live;

    const sweeper = setInterval(() => {
      setTypers((prev) => {
        const now = Date.now();
        let changed = false;
        const next: Record<string, Typer> = {};
        for (const [id, t] of Object.entries(prev)) {
          if (now - t.at < TYPING_EXPIRES_MS) next[id] = t;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);

    return () => {
      clearInterval(sweeper);
      supabase.removeChannel(live);
      liveRef.current = null;
      setTypers({});
    };
  }, [channel, myId]);

  function handleTextChange(value: string) {
    setText(value);
    const now = Date.now();
    if (value.trim() && now - lastTypingSentRef.current > TYPING_SEND_EVERY_MS && liveRef.current) {
      lastTypingSentRef.current = now;
      liveRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: myId, name: profile?.full_name ?? 'Someone' },
      });
    }
  }

  function sendStopTyping() {
    lastTypingSentRef.current = 0;
    liveRef.current?.send({ type: 'broadcast', event: 'stop', payload: { userId: myId } });
  }

  async function send() {
    const body = text.trim();
    if (!body || !channel) return;
    setSending(true);
    const { error } = await supabase.from('forum_messages').insert({ channel_id: channel.id, body });
    setSending(false);
    if (error) {
      Alert.alert('Could not send', error.message);
      return;
    }
    setText('');
    sendStopTyping();
    loadMessages();
  }

  function confirmDelete(message: Message) {
    Alert.alert('Delete message?', 'This removes it for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('forum_messages').delete().eq('id', message.id);
          if (error) Alert.alert('Could not delete', error.message);
          loadMessages();
        },
      },
    ]);
  }

    // Long-press someone else's message: members report it; admins can also remove it
  function moderate(message: Message) {
    if (!profile?.is_admin) {
      setReportId(message.id);
      return;
    }
    Alert.alert('Moderate message', message.author?.full_name ?? undefined, [
      { text: '🛡️ Remove (admin)', style: 'destructive', onPress: () => confirmDelete(message) },
      { text: 'Report', onPress: () => setReportId(message.id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }function confirmDirectMessage(message: Message) {
    const name = message.author?.full_name ?? 'this member';
    Alert.alert(`Message ${name}?`, 'Start a private conversation.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Message',
        onPress: async () => {
          try {
            const id = await startConversation(message.author_id, 'direct');
            setDirectChat({ id, name });
          } catch (e: any) {
            Alert.alert('Could not start chat', e.message);
          }
        },
      },
    ]);
  }

  function toggleSearch() {
    if (searchOpen) {
      setSearchOpen(false);
      setQuery('');
      setResults([]);
    } else {
      setSearchOpen(true);
    }
  }

  if (!channel) return null;

  const typingText = typingLabel(Object.values(typers).map((t) => t.name));

  // The oldest message from someone else that arrived after I last read
  const lastReadTime = lastRead ? new Date(lastRead).getTime() : null;
  const unreadOthers = lastReadTime
    ? messages.filter((m) => m.author_id !== myId && new Date(m.created_at).getTime() > lastReadTime)
    : [];
  const firstUnreadId = unreadOthers.length ? unreadOthers[unreadOthers.length - 1].id : null;

  function renderMessage({ item }: { item: Message }) {
    const mine = item.author_id === myId;
    const authorLine = `${item.author?.full_name ?? 'Unknown'}${item.author?.station ? ` · ${item.author.station}` : ''}`;

    const content = mine ? (
      <TouchableOpacity
        activeOpacity={0.8}
        onLongPress={() => confirmDelete(item)}
        style={[styles.row, styles.rowMine]}
      >
        <Text style={[styles.author, styles.authorMine]}>{authorLine}</Text>
        <View style={[styles.bubble, styles.bubbleMine]}>
          <Text style={[styles.body, styles.bodyMine]}>{item.body}</Text>
        </View>
        <Text style={[styles.time, { textAlign: 'right' }]}>{formatTime(item.created_at)}</Text>
      </TouchableOpacity>
    ) : (
      <View style={styles.theirsWrap}>
        <TouchableOpacity onPress={() => confirmDirectMessage(item)} style={styles.avatarTap}>
          <Avatar uri={item.author?.avatar_url} name={item.author?.full_name} size={34} />
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.8}
          onLongPress={() => moderate(item)}
          style={[styles.row, styles.rowTheirs]}
        >
          <Text
            style={[styles.author, styles.authorTappable]}
            onPress={() => confirmDirectMessage(item)}
            suppressHighlighting
          >
            {authorLine}
          </Text>
          <View style={[styles.bubble, styles.bubbleTheirs]}>
            <Text style={styles.body}>{item.body}</Text>
          </View>
          <Text style={styles.time}>{formatTime(item.created_at)}</Text>
        </TouchableOpacity>
      </View>
    );

    if (!searchOpen && item.id === firstUnreadId) {
      return (
        <View>
          <View style={styles.newDivider}>
            <View style={styles.newLine} />
            <Text style={styles.newText}>New messages</Text>
            <View style={styles.newLine} />
          </View>
          {content}
        </View>
      );
    }
    return content;
  }

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.headerSide} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.back}>‹ Back</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.headerTitle}># {channel.name}</Text>
              <ChannelHere channelId={channel.id} />
              {channel.description ? (
                <Text style={styles.headerSub} numberOfLines={1}>{channel.description}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={toggleSearch} style={[styles.headerSide, { alignItems: 'flex-end' }]} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.searchToggle}>{searchOpen ? 'Done' : '🔍'}</Text>
            </TouchableOpacity>
          </View>

          {searchOpen && (
            <View style={styles.searchWrap}>
              <TextInput
                style={styles.searchInput}
                placeholder={`Search #${channel.name}`}
                placeholderTextColor="#888"
                value={query}
                onChangeText={setQuery}
                autoFocus={!initialQuery}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')}>
                  <Text style={styles.clear}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {searchOpen ? (
              <FlatList
                data={results}
                keyExtractor={(m) => m.id}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={results.length === 0 ? styles.emptyContainer : styles.list}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    {searching ? (
                      <ActivityIndicator color={FIRE_RED} />
                    ) : (
                      <>
                        <Text style={{ fontSize: 40 }}>🔍</Text>
                        <Text style={styles.emptyText}>
                          {query.trim().length < 2
                            ? 'Type at least 2 letters to search this channel.'
                            : 'No messages match your search.'}
                        </Text>
                      </>
                    )}
                  </View>
                }
                renderItem={renderMessage}
              />
            ) : loading ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={FIRE_RED} />
              </View>
            ) : (
              <FlatList
                data={messages}
                keyExtractor={(m) => m.id}
                inverted
                contentContainerStyle={messages.length === 0 ? styles.emptyContainer : styles.list}
                keyboardDismissMode="on-drag"
                ListEmptyComponent={
                  <View style={[styles.empty, { transform: [{ scaleY: -1 }] }]}>
                    <Text style={{ fontSize: 48 }}>💬</Text>
                    <Text style={styles.emptyTitle}>No messages yet</Text>
                    <Text style={styles.emptyText}>Start the conversation in #{channel.name}.</Text>
                  </View>
                }
                renderItem={renderMessage}
              />
            )}

            {!searchOpen && typingText ? (
              <View style={styles.typingBar}>
                <Text style={styles.typingText}>{typingText}</Text>
              </View>
            ) : null}

            {!searchOpen && (
              <View style={styles.inputBar}>
                <TextInput
                  style={styles.input}
                  placeholder={`Message #${channel.name}`}
                  placeholderTextColor="#888"
                  value={text}
                  onChangeText={handleTextChange}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.sendButton, (!text.trim() || sending) && { opacity: 0.4 }]}
                  onPress={send}
                  disabled={!text.trim() || sending}
                >
                  {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Send</Text>}
                </TouchableOpacity>
              </View>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>

      <ReportModal kind="forum_message" targetId={reportId} onClose={() => setReportId(null)} />

      <ConversationChat
        conversationId={directChat?.id ?? null}
        otherName={directChat?.name ?? ''}
        subtitle="✉️ Direct message"
        onClose={() => setDirectChat(null)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fff',
  },
  headerSide: { width: 70, paddingVertical: 4 },
  back: { color: FIRE_RED, fontSize: 17, fontWeight: '600' },
  searchToggle: { color: FIRE_RED, fontSize: 18, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: '#111' },
  headerSub: { fontSize: 12, color: '#888', marginTop: 2 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', margin: 10, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fafafa',
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 16, color: '#111' },
  clear: { fontSize: 16, color: '#888', paddingHorizontal: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 12 },
  emptyContainer: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: FIRE_RED, marginTop: 10 },
  emptyText: { fontSize: 15, color: '#666', marginTop: 6, textAlign: 'center' },
  newDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 10 },
  newLine: { flex: 1, height: 1, backgroundColor: FIRE_RED, opacity: 0.5 },
  newText: { color: FIRE_RED, fontSize: 12, fontWeight: '700', marginHorizontal: 8, textTransform: 'uppercase' },
  theirsWrap: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 5 },
  avatarTap: { marginRight: 8, marginBottom: 18 },
  row: { maxWidth: '78%' },
  rowMine: { alignSelf: 'flex-end', marginVertical: 5 },
  rowTheirs: { alignSelf: 'flex-start' },
  author: { fontSize: 12, color: '#666', fontWeight: '600', marginBottom: 3, marginLeft: 4 },
  authorMine: { textAlign: 'right', marginLeft: 0, marginRight: 4 },
  authorTappable: { color: '#444', textDecorationLine: 'underline' },
  bubble: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18 },
  bubbleMine: { backgroundColor: FIRE_RED, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: '#efefef', borderBottomLeftRadius: 4 },
  body: { fontSize: 16, color: '#111', lineHeight: 21 },
  bodyMine: { color: '#fff' },
  time: { fontSize: 11, color: '#999', marginTop: 3, marginHorizontal: 4 },
  typingBar: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: '#fff' },
  typingText: { fontSize: 13, color: '#777', fontStyle: 'italic' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 10,
    borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff',
  },
  input: {
    flex: 1, maxHeight: 120, borderWidth: 1, borderColor: '#ddd', borderRadius: 20,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 16,
    backgroundColor: '#fafafa', color: '#111',
  },
  sendButton: {
    backgroundColor: FIRE_RED, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 11,
    marginLeft: 8, justifyContent: 'center', alignItems: 'center',
  },
  sendText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});