import { useCallback, useEffect, useState } from 'react';
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
import { useAuth } from './auth';
import { useUnreadMessages } from './messages';
import { supabase } from './supabase';

const FIRE_RED = '#C8102E';
const REFRESH_MS = 4000;

type DirectMessage = {
  id: string;
  body: string;
  created_at: string;
  sender_id: string;
};

function formatTime(dateString: string) {
  const d = new Date(dateString);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

type Props = {
  conversationId: string | null;
  otherName: string;
  subtitle?: string;
  initialText?: string;
  onClose: () => void;
};

export default function ConversationChat({ conversationId, otherName, subtitle, initialText, onClose }: Props) {
  const { session } = useAuth();
  const myId = session?.user.id;
  const { refresh: refreshUnread } = useUnreadMessages();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!conversationId) return;
    const { data, error } = await supabase
      .from('direct_messages')
      .select('id, body, created_at, sender_id')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error) setMessages((data as DirectMessage[]) ?? []);
    setLoading(false);
    await supabase.rpc('mark_conversation_read', { conv: conversationId });
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    setLoading(true);
    setMessages([]);
    setText(initialText ?? '');
    load().then(() => refreshUnread());
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      clearInterval(timer);
      refreshUnread();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  async function send() {
    const body = text.trim();
    if (!body || !conversationId) return;
    setSending(true);
    const { error } = await supabase.from('direct_messages').insert({ conversation_id: conversationId, body });
    setSending(false);
    if (error) {
      Alert.alert('Could not send', error.message);
      return;
    }
    setText('');
    load();
  }

  function confirmDelete(message: DirectMessage) {
    Alert.alert('Delete message?', 'This removes it for both of you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('direct_messages').delete().eq('id', message.id);
          if (error) Alert.alert('Could not delete', error.message);
          load();
        },
      },
    ]);
  }

  if (!conversationId) return null;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.back}>‹ Back</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.headerTitle} numberOfLines={1}>{otherName}</Text>
              <Text style={styles.headerSub} numberOfLines={1}>{subtitle ?? '✉️ Direct message'}</Text>
            </View>
            <View style={{ width: 70 }} />
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
                    <Text style={{ fontSize: 48 }}>✉️</Text>
                    <Text style={styles.emptyTitle}>Start the conversation</Text>
                    <Text style={styles.emptyText}>Only you and {otherName} can see these messages.</Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const mine = item.sender_id === myId;
                  return (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onLongPress={mine ? () => confirmDelete(item) : undefined}
                      style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}
                    >
                      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                        <Text style={[styles.body, mine && styles.bodyMine]}>{item.body}</Text>
                      </View>
                      <Text style={[styles.time, mine && { textAlign: 'right' }]}>{formatTime(item.created_at)}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            <View style={styles.inputBar}>
              <TextInput
                style={styles.input}
                placeholder={`Message ${otherName}`}
                placeholderTextColor="#888"
                value={text}
                onChangeText={setText}
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
  headerSub: { fontSize: 12, color: FIRE_RED, marginTop: 2, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 12 },
  emptyContainer: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: FIRE_RED, marginTop: 10 },
  emptyText: { fontSize: 15, color: '#666', marginTop: 4, textAlign: 'center' },
  row: { marginVertical: 4, maxWidth: '80%' },
  rowMine: { alignSelf: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start' },
  bubble: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18 },
  bubbleMine: { backgroundColor: FIRE_RED, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: '#efefef', borderBottomLeftRadius: 4 },
  body: { fontSize: 16, color: '#111', lineHeight: 21 },
  bodyMine: { color: '#fff' },
  time: { fontSize: 11, color: '#999', marginTop: 3, marginHorizontal: 4 },
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