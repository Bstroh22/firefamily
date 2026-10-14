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
import ConversationChat from './ConversationChat';
import { startConversation } from './messages';
import { supabase } from './supabase';

const FIRE_RED = '#C8102E';
const REFRESH_MS = 5000;
const TYPING_SEND_EVERY_MS = 2000;
const TYPING_EXPIRES_MS = 4000;

export type Channel = { id: string; name: string; description: string | null };

type Message = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  author: { full_name: string | null; station: string | null } | null;
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
  onClose: () => void;
};

export default function ChannelChat({ channel, onClose }: Props) {
  const { session, profile } = useAuth();
  const myId = session?.user.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [typers, setTypers] = useState<Record<string, Typer>>({});
  const [directChat, setDirectChat] = useState<{ id: string; name: string } | null>(null);

  const liveRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSentRef = useRef(0);

  const loadMessages = useCallback(async () => {
    if (!channel) return;
    const { data, error } = await supabase
      .from('forum_messages')
      .select('id, body, created_at, author_id, author:profiles(full_name, station)')
      .eq('channel_id', channel.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error) setMessages((data as any) ?? []);
    setLoading(false);
  }, [channel]);

  useEffect(() => {
    if (!channel) return;
    setLoading(true);
    setMessages([]);
    setDirectChat(null);
    loadMessages();
    const timer = setInterval(loadMessages, REFRESH_MS);
    return () => clearInterval(timer);
  }, [channel, loadMessages]);

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

  function confirmDirectMessage(message: Message) {
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

  if (!channel) return null;

  const typingText = typingLabel(Object.values(typers).map((t) => t.name));

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.back}>‹ Back</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.headerTitle}># {channel.name}</Text>
              <ChannelHere channelId={channel.id} />
              {channel.description ? (
                <Text style={styles.headerSub} numberOfLines={1}>{channel.description}</Text>
              ) : null}
            </View>
            <View style={{ width: 70 }} />
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {loading ? (
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
                renderItem={({ item }) => {
                  const mine = item.author_id === myId;
                  return (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onLongPress={mine ? () => confirmDelete(item) : undefined}
                      style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}
                    >
                      <Text
                        style={[styles.author, mine ? styles.authorMine : styles.authorTappable]}
                        onPress={mine ? undefined : () => confirmDirectMessage(item)}
                        suppressHighlighting
                      >
                        {item.author?.full_name ?? 'Unknown'}
                        {item.author?.station ? ` · ${item.author.station}` : ''}
                      </Text>
                      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                        <Text style={[styles.body, mine && styles.bodyMine]}>{item.body}</Text>
                      </View>
                      <Text style={[styles.time, mine && { textAlign: 'right' }]}>{formatTime(item.created_at)}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            {typingText ? (
              <View style={styles.typingBar}>
                <Text style={styles.typingText}>{typingText}</Text>
              </View>
            ) : null}

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
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>

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
  backButton: { width: 70, paddingVertical: 4 },
  back: { color: FIRE_RED, fontSize: 17, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: '#111' },
  headerSub: { fontSize: 12, color: '#888', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 12 },
  emptyContainer: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: FIRE_RED, marginTop: 10 },
  emptyText: { fontSize: 15, color: '#666', marginTop: 4, textAlign: 'center' },
  row: { marginVertical: 5, maxWidth: '80%' },
  rowMine: { alignSelf: 'flex-end' },
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