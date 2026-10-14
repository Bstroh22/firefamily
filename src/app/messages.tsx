import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator, Alert,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import ConversationChat from '../../lib/ConversationChat';
import { timeAgo } from '../../lib/ListingDetailModal';
import {
    ConversationSummary, fetchConversations, subjectLabel, useUnreadMessages,
} from '../../lib/messages';

const FIRE_RED = '#C8102E';

function initials(name: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export default function MessagesScreen() {
  const { refresh: refreshUnread } = useUnreadMessages();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<ConversationSummary | null>(null);

  const load = useCallback(async () => {
    try {
      setConversations(await fetchConversations());
    } catch (e: any) {
      Alert.alert('Could not load messages', e.message);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, 15000);
      return () => clearInterval(timer);
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={FIRE_RED} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        contentContainerStyle={conversations.length === 0 ? styles.emptyContainer : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
              refreshUnread();
            }}
            tintColor={FIRE_RED}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 56 }}>✉️</Text>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyText}>
              Message a seller or host from their listing, or tap someone's name in the Forums.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => setOpen(item)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(item.other_name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.topRow}>
                <Text style={[styles.name, item.unread > 0 && styles.bold]} numberOfLines={1}>
                  {item.other_name ?? 'Unknown'}
                  {item.other_station ? <Text style={styles.station}>  ·  {item.other_station}</Text> : null}
                </Text>
                <Text style={styles.time}>{timeAgo(item.last_message_at)}</Text>
              </View>
              <Text style={styles.subject} numberOfLines={1}>
                {subjectLabel(item.kind, item.subject_title)}
              </Text>
              <View style={styles.bottomRow}>
                <Text style={[styles.preview, item.unread > 0 && styles.previewUnread]} numberOfLines={1}>
                  {item.last_message ?? ''}
                </Text>
                {item.unread > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.unread}</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
      />

      <ConversationChat
        conversationId={open?.id ?? null}
        otherName={open?.other_name ?? ''}
        subtitle={open ? subjectLabel(open.kind, open.subject_title) : undefined}
        onClose={() => {
          setOpen(null);
          load();
          refreshUnread();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f4f4' },
  list: { padding: 12 },
  emptyContainer: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: FIRE_RED, marginTop: 10 },
  emptyText: { fontSize: 15, color: '#666', marginTop: 6, textAlign: 'center', lineHeight: 21 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  avatar: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: '#fdecee',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarText: { color: FIRE_RED, fontSize: 17, fontWeight: 'bold' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, color: '#111', fontWeight: '600', flex: 1, marginRight: 8 },
  bold: { fontWeight: 'bold' },
  station: { fontSize: 12, color: '#888', fontWeight: '400' },
  time: { fontSize: 12, color: '#999' },
  subject: { fontSize: 13, color: FIRE_RED, fontWeight: '600', marginTop: 3 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  preview: { fontSize: 14, color: '#777', flex: 1 },
  previewUnread: { color: '#111', fontWeight: '600' },
  badge: {
    backgroundColor: FIRE_RED, borderRadius: 11, minWidth: 22, height: 22,
    paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
});