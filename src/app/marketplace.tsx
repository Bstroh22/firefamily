import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../lib/auth';
import ListingDetailModal, { Listing, formatPrice, timeAgo } from '../../lib/ListingDetailModal';
import NewListingModal, { CATEGORIES } from '../../lib/NewListingModal';
import { supabase } from '../../lib/supabase';

const FIRE_RED = '#C8102E';

export default function MarketplaceScreen() {
  const { session } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNew, setShowNew] = useState(false); const params = useLocalSearchParams<{ new?: string }>(); useEffect(() => { if (params.new) { setShowNew(true); router.setParams({ new: undefined }); } }, [params.new]);
  const [selected, setSelected] = useState<Listing | null>(null); const [editing, setEditing] = useState<Listing | null>(null);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const loadListings = useCallback(async () => {
    const { data, error } = await supabase
      .from('listings')
      .select('id, title, description, price, category, photo_urls, created_at, seller_id, seller:profiles(full_name, station)')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Could not load listings', error.message);
    } else {
      setListings((data as any) ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const filteredListings = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listings.filter((item) => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      const haystack = [
        item.title,
        item.description ?? '',
        item.category ?? '',
        item.seller?.full_name ?? '',
        item.seller?.station ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [listings, query, selectedCategory]);

  async function markSold(id: string) {
    setSelected(null);
    const { error } = await supabase.from('listings').update({ status: 'sold' }).eq('id', id);
    if (error) Alert.alert('Could not update', error.message);
    loadListings();
  }

  async function deleteListing(id: string) {
    setSelected(null);
    const { error } = await supabase.from('listings').delete().eq('id', id);
    if (error) Alert.alert('Could not delete', error.message);
    loadListings();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={FIRE_RED} />
      </View>
    );
  }

  const isFiltering = query.trim() !== '' || selectedCategory !== 'All';

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search listings, sellers, stations"
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

      {/* Category filter chips */}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          keyboardShouldPersistTaps="handled"
        >
          {['All', ...CATEGORIES].map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, selectedCategory === c && styles.chipActive]}
              onPress={() => setSelectedCategory(c)}
            >
              <Text style={[styles.chipText, selectedCategory === c && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredListings}
        keyExtractor={(item) => item.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={filteredListings.length === 0 ? styles.emptyContainer : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadListings();
            }}
            tintColor={FIRE_RED}
          />
        }
        ListEmptyComponent={
          isFiltering ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🔍</Text>
              <Text style={styles.emptyTitle}>No matches</Text>
              <Text style={styles.emptyText}>Try a different search or category.</Text>
              <TouchableOpacity
                onPress={() => {
                  setQuery('');
                  setSelectedCategory('All');
                }}
              >
                <Text style={styles.resetLink}>Clear filters</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🛒</Text>
              <Text style={styles.emptyTitle}>No listings yet</Text>
              <Text style={styles.emptyText}>Be the first to post something for the fire family.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => setSelected(item)}>
            {item.photo_urls && item.photo_urls.length > 0 ? (
              <Image source={{ uri: item.photo_urls[0] }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}>
                <Text style={{ fontSize: 28 }}>📦</Text>
              </View>
            )}
            <View style={styles.cardInfo}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.cardPrice}>{formatPrice(item.price)}</Text>
              </View>
              {item.description ? (
                <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>
              ) : null}
              <View style={styles.cardBottom}>
                <Text style={styles.cardCategory}>{item.category ?? 'Other'}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {item.seller?.full_name ?? 'Unknown'} · {timeAgo(item.created_at)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setShowNew(true)}>
        <Text style={styles.fabText}>+ Sell</Text>
      </TouchableOpacity>

      <NewListingModal visible={showNew || !!editing} existing={editing} onClose={() => { setShowNew(false); setEditing(null); }} onCreated={loadListings} />

      <ListingDetailModal
        listing={selected}
        isMine={selected?.seller_id === session?.user.id}
        onClose={() => setSelected(null)}
        onMarkSold={markSold}
        onDelete={deleteListing} onEdit={(item) => { setSelected(null); setTimeout(() => setEditing(item), 800); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f4f4' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    margin: 12, marginBottom: 6, paddingHorizontal: 12, borderRadius: 12,
    borderWidth: 1, borderColor: '#ddd',
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#111' },
  clear: { fontSize: 16, color: '#888', paddingHorizontal: 6 },

  chipRow: { paddingHorizontal: 12, paddingVertical: 6 },
  chip: {
    borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff', borderRadius: 20,
    paddingVertical: 7, paddingHorizontal: 14, marginRight: 8,
  },
  chipActive: { backgroundColor: FIRE_RED, borderColor: FIRE_RED },
  chipText: { color: '#333', fontSize: 14 },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  list: { padding: 12, paddingBottom: 100 },
  emptyContainer: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: FIRE_RED, marginBottom: 6 },
  emptyText: { fontSize: 15, color: '#666', textAlign: 'center' },
  resetLink: { color: FIRE_RED, fontSize: 15, marginTop: 16, fontWeight: '600' },

  card: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  thumb: { width: 84, height: 84, borderRadius: 10, backgroundColor: '#eee' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1, marginLeft: 12, justifyContent: 'space-between' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#111', flex: 1, marginRight: 8 },
  cardPrice: { fontSize: 16, fontWeight: 'bold', color: FIRE_RED },
  cardDesc: { fontSize: 13, color: '#555', marginTop: 4 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  cardCategory: {
    fontSize: 11, fontWeight: '600', color: FIRE_RED, backgroundColor: '#fdecee',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden',
  },
  cardMeta: { fontSize: 11, color: '#888', flexShrink: 1, marginLeft: 8, textAlign: 'right' },

  fab: {
    position: 'absolute', right: 20, bottom: 20, backgroundColor: FIRE_RED,
    paddingVertical: 14, paddingHorizontal: 22, borderRadius: 30,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  fabText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});