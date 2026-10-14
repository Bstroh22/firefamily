import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ChannelChat, { Channel } from '../../lib/ChannelChat';
import { ActiveNow } from '../../lib/activity';
import { supabase } from '../../lib/supabase';

const FIRE_RED = '#C8102E';

export default function ForumsScreen() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openChannel, setOpenChannel] = useState<Channel | null>(null);

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
        data={channels}
        keyExtractor={(c) => c.id}
        contentContainerStyle={channels.length === 0 ? styles.emptyContainer : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadChannels();
            }}
            tintColor={FIRE_RED}
          />
        }
        ListHeaderComponent={
          <View>
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
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => setOpenChannel(item)}>
            <View style={styles.hashBox}>
              <Text style={styles.hash}>#</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.channelName}>{item.name}</Text>
              {item.description ? (
                <Text style={styles.channelDesc} numberOfLines={1}>{item.description}</Text>
              ) : null}
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
      />

      <ChannelChat channel={openChannel} onClose={() => setOpenChannel(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f4f4' },
  list: { padding: 12 },
  emptyContainer: { flexGrow: 1 },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: '#999', textTransform: 'uppercase',
    marginBottom: 8, marginLeft: 4,
  },
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
  channelName: { fontSize: 17, fontWeight: 'bold', color: '#111' },
  channelDesc: { fontSize: 13, color: '#777', marginTop: 2 },
  chevron: { fontSize: 26, color: '#ccc', marginLeft: 8 },
});