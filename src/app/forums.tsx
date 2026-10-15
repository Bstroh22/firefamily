import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Avatar from '../../lib/Avatar';
import ChannelChat, { Channel } from '../../lib/ChannelChat';
import { timeAgo } from '../../lib/ListingDetailModal';
import { ActiveNow } from '../../lib/activity';
import { useForumUnread } from '../../lib/forumUnread';
import { supabase } from '../../lib/supabase';

const FIRE_RED = '#C8102E';

type SearchHit = {
  id: string;
  body: string;
  created_at: string;
  channel_id: string;
  author: { full_name: string | null; avatar_url: string | null } | null;
  channel: { name: string } | null;
};

export default function ForumsScreen() {
  const { counts, refresh: refreshUnread } = useForumUnread();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openChannel, setOpenChannel] = useState<Channel | null>(null);
  const [openQuery, setOpenQuery] = useState<string | undefined>(undefined);

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const loadChannels = useCallback(async () => {
    const { data, error } = await supabase
      .from('forum_channels')
      .select('id, name, description')
      .order('created_at', { ascending: true });

    if (error) {
      Alert.alert('Could not load channels', error.message);
    } else {
      setChannels(data ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  useFocusEffect(
    useCallback(() => {
      refreshUnread();
    }, [refreshUnread])
  );

  // Search messages across every channel this member can see
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('forum_messages')
        .select('id, body, created_at, channel_id, author:profiles(full_name, avatar_url), channel:forum_channels(name)')
        .ilike('body', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(40);
      if (!error) setHits((data as any) ?? []);
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const isSearching = query.trim().length > 0;

  const matchingChannels = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q)
    );
  }, [channels, query]);

  function openFromHit(hit: SearchHit) {
    const channel = channels.find((c) => c.id === hit.channel_id);
    if (!channel) return;
    setOpenQuery(query.trim());
    setOpenChannel(channel);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={FIRE_RED} />
      </View>
    );
  }

  function renderChannel(item: Channel) {
    const unread = counts[item.id] ?? 0;
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.card}
        onPress={() => {
          setOpenQuery(undefined);
          setOpenChannel(item);
        }}
      >
        <View style={styles.hashBox}>
          <Text style={styles.hash}>#</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.channelName, unread > 0 && styles.channelNameUnread]}>{item.name}</Text>
          {item.description ? (
            <Text style={styles.channelDesc} numberOfLines={1}>{item.description}</Text>
          ) : null}
        </View>
        {unread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        ) : (
          <Text style={styles.chevron}>›</Text>
        )}
      </TouchableOpacity>
    );
  }

  const searchBar = (
    <View style={styles.searchWrap}>
      <Text style={styles.searchIcon}>🔍</Text>
      <TextInput
        style={styles.searchInput}
        placeholder="Search channels and messages"
        placeholderTextColor="#888"
        value={query}
        onChangeText={setQuery}
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
  );

  return (
    <View style={styles.container}>
      {isSearching ? (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {searchBar}

          {matchingChannels.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Channels</Text>
              {matchingChannels.map(renderChannel)}
            </>
          )}

          <Text style={styles.sectionLabel}>Messages</Text>
          {searching ? (
            <ActivityIndicator color={FIRE_RED} style={{ marginTop: 12 }} />
          ) : query.trim().length < 2 ? (
            <Text style={styles.hint}>Type at least 2 letters to search messages.</Text>
          ) : hits.length === 0 ? (
            <Text style={styles.hint}>No messages match "{query.trim()}".</Text>
          ) : (
            hits.map((hit) => (
              <TouchableOpacity key={hit.id} style={styles.hitCard} onPress={() => openFromHit(hit)}>
                <Avatar uri={hit.author?.avatar_url} name={hit.author?.full_name} size={36} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={styles.hitTop}>
                    <Text style={styles.hitChannel}># {hit.channel?.name ?? 'channel'}</Text>
                    <Text style={styles.hitTime}>{timeAgo(hit.created_at)}</Text>
                  </View>
                  <Text style={styles.hitAuthor}>{hit.author?.full_name ?? 'Unknown'}</Text>
                  <Text style={styles.hitBody} numberOfLines={2}>{hit.body}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={channels}
          keyExtractor={(c) => c.id}
          contentContainerStyle={channels.length === 0 ? styles.emptyContainer : styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadChannels();
                refreshUnread();
              }}
              tintColor={FIRE_RED}
            />
          }
          ListHeaderComponent={
            <View>
              {searchBar}
              <ActiveNow />
              {channels.length > 0 ? <Text style={styles.sectionLabel}>Channels</Text> : null}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 56 }}>💬</Text>
              <Text style={styles.emptyTitle}>No channels yet</Text>
              <Text style={styles.emptyText}>An admin can add channels in Supabase.</Text>
            </View>
          }
          renderItem={({ item }) => renderChannel(item)}
        />
      )}

      <ChannelChat
        channel={openChannel}
        initialQuery={openQuery}
        onClose={() => {
          setOpenChannel(null);
          setOpenQuery(undefined);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f4f4' },
  list: { padding: 12, paddingBottom: 40 },
  emptyContainer: { flexGrow: 1 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    marginBottom: 12, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#ddd',
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#111' },
  clear: { fontSize: 16, color: '#888', paddingHorizontal: 6 },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: '#999', textTransform: 'uppercase',
    marginTop: 4, marginBottom: 8, marginLeft: 4,
  },
  hint: { fontSize: 14, color: '#888', marginLeft: 4, marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: FIRE_RED, marginTop: 10 },
  emptyText: { fontSize: 15, color: '#666', marginTop: 4, textAlign: 'center' },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  hashBox: {
    width: 42, height: 42, borderRadius: 10, backgroundColor: '#fdecee',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  hash: { fontSize: 22, fontWeight: 'bold', color: FIRE_RED },
  channelName: { fontSize: 17, fontWeight: '600', color: '#111' },
  channelNameUnread: { fontWeight: '800' },
  channelDesc: { fontSize: 13, color: '#777', marginTop: 2 },
  chevron: { fontSize: 26, color: '#ccc', marginLeft: 8 },
  badge: {
    backgroundColor: FIRE_RED, borderRadius: 12, minWidth: 24, height: 24,
    paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  hitCard: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  hitTop: { flexDirection: 'row', justifyContent: 'space-between' },
  hitChannel: { fontSize: 13, fontWeight: '700', color: FIRE_RED },
  hitTime: { fontSize: 12, color: '#999' },
  hitAuthor: { fontSize: 13, color: '#555', fontWeight: '600', marginTop: 2 },
  hitBody: { fontSize: 15, color: '#222', marginTop: 3 },
});