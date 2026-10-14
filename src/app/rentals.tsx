import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../lib/auth';
import NewRentalModal from '../../lib/NewRentalModal';
import RentalDetailModal, { Rental, formatRate, hostDisplayName } from '../../lib/RentalDetailModal';
import { supabase } from '../../lib/supabase';

const FIRE_RED = '#C8102E';

export default function RentalsScreen() {
  const { session } = useAuth();
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<Rental | null>(null); const [editing, setEditing] = useState<Rental | null>(null);
  const [query, setQuery] = useState('');

  const loadRentals = useCallback(async () => {
    const { data, error } = await supabase
      .from('rentals')
      .select('id, title, description, location, nightly_rate, max_guests, host_name, host_contact, photo_urls, created_at, owner_id, owner:profiles(full_name, station)')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Could not load rentals', error.message);
    } else {
      setRentals((data as any) ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadRentals();
  }, [loadRentals]);

  const filteredRentals = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rentals;
    return rentals.filter((r) =>
      [r.title, r.location ?? '', r.description ?? '', r.owner?.full_name ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [rentals, query]);

  async function hideRental(id: string) {
    setSelected(null);
    const { error } = await supabase.from('rentals').update({ is_active: false }).eq('id', id);
    if (error) Alert.alert('Could not update', error.message);
    loadRentals();
  }

  async function deleteRental(id: string) {
    setSelected(null);
    const { error } = await supabase.from('rentals').delete().eq('id', id);
    if (error) Alert.alert('Could not delete', error.message);
    loadRentals();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={FIRE_RED} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by location, title, or host"
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

      <FlatList
        data={filteredRentals}
        keyExtractor={(item) => item.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={filteredRentals.length === 0 ? styles.emptyContainer : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadRentals();
            }}
            tintColor={FIRE_RED}
          />
        }
        ListEmptyComponent={
          query.trim() ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🔍</Text>
              <Text style={styles.emptyTitle}>No matches</Text>
              <Text style={styles.emptyText}>Try a different location or search term.</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🏡</Text>
              <Text style={styles.emptyTitle}>No rentals yet</Text>
              <Text style={styles.emptyText}>
                Have a cabin, beach house, or getaway? List it for the fire family.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => setSelected(item)}>
            {item.photo_urls && item.photo_urls.length > 0 ? (
              <Image source={{ uri: item.photo_urls[0] }} style={styles.cardImage} />
            ) : (
              <View style={[styles.cardImage, styles.cardImageEmpty]}>
                <Text style={{ fontSize: 44 }}>🏡</Text>
              </View>
            )}
            <View style={styles.cardBody}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.cardRate}>{formatRate(item.nightly_rate)}</Text>
              </View>
              {item.location ? <Text style={styles.cardLocation} numberOfLines={1}>📍 {item.location}</Text> : null}
              <Text style={styles.cardMeta} numberOfLines={1}>
                {item.max_guests ? `Sleeps ${item.max_guests} · ` : ''}
                Host: {hostDisplayName(item)}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setShowNew(true)}>
        <Text style={styles.fabText}>+ List Rental</Text>
      </TouchableOpacity>

      <NewRentalModal visible={showNew || !!editing} existing={editing} onClose={() => { setShowNew(false); setEditing(null); }} onCreated={loadRentals} />

      <RentalDetailModal
        rental={selected}
        isMine={selected?.owner_id === session?.user.id}
        onClose={() => setSelected(null)}
        onHide={hideRental}
        onDelete={deleteRental} onEdit={(item) => { setSelected(null); setTimeout(() => setEditing(item), 800); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f4f4' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    margin: 12, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#ddd',
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#111' },
  clear: { fontSize: 16, color: '#888', paddingHorizontal: 6 },

  list: { paddingHorizontal: 12, paddingBottom: 100 },
  emptyContainer: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: FIRE_RED, marginBottom: 6 },
  emptyText: { fontSize: 15, color: '#666', textAlign: 'center' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  cardImage: { width: '100%', height: 190, backgroundColor: '#eee' },
  cardImageEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: 14 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 17, fontWeight: 'bold', color: '#111', flex: 1, marginRight: 8 },
  cardRate: { fontSize: 15, fontWeight: 'bold', color: FIRE_RED },
  cardLocation: { fontSize: 14, color: '#555', marginTop: 4 },
  cardMeta: { fontSize: 12, color: '#888', marginTop: 6 },

  fab: {
    position: 'absolute', right: 20, bottom: 20, backgroundColor: FIRE_RED,
    paddingVertical: 14, paddingHorizontal: 22, borderRadius: 30,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  fabText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});