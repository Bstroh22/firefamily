import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Linking,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useAuth } from '../../lib/auth';
import Avatar from '../../lib/Avatar';
import { timeAgo } from '../../lib/ListingDetailModal';
import NewContractorModal, { Contractor, TRADES } from '../../lib/NewContractorModal';
import ReportButton from '../../lib/ReportButton';
import { supabase } from '../../lib/supabase';

const FIRE_RED = '#C8102E';

function websiteUrl(site: string) {
  return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}

function RecommendButton({ item, onPress }: { item: Contractor; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.recButton, item.i_recommend && styles.recButtonOn]}
      accessibilityLabel={item.i_recommend ? 'Remove your recommendation' : 'Recommend this contractor'}
    >
      <Text style={[styles.recText, item.i_recommend && styles.recTextOn]}>👍 {item.rec_count}</Text>
    </TouchableOpacity>
  );
}

type DetailProps = {
  item: Contractor | null;
  isMine: boolean;
  onClose: () => void;
  onToggle: (c: Contractor) => void;
  onEdit: (c: Contractor) => void;
  onDelete: (c: Contractor) => void;
};

function ContractorDetail({ item, isMine, onClose, onToggle, onEdit, onDelete }: DetailProps) {
  if (!item) return null;

  function confirmDelete() {
    Alert.alert('Remove contractor?', 'This removes it for everyone, including all recommendations.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => onDelete(item!) },
    ]);
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={{ width: 70 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.done}>Done</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contractor</Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 160 }}>
        <Text style={styles.detailName}>{item.name}</Text>
        <View style={styles.row}>
          <Text style={styles.trade}>{item.trade}</Text>
          {item.service_area ? <Text style={styles.area}>📍 {item.service_area}</Text> : null}
        </View>

        <TouchableOpacity
          onPress={() => onToggle(item)}
          style={[styles.bigRec, item.i_recommend && styles.bigRecOn]}
        >
          <Text style={[styles.bigRecText, item.i_recommend && styles.bigRecTextOn]}>
            👍 {item.i_recommend ? 'You recommend them' : 'I recommend them too'} · {item.rec_count}
          </Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Contact</Text>
        <View style={styles.contactRow}>
          {item.phone ? (
            <>
              <TouchableOpacity style={styles.contactButton} onPress={() => Linking.openURL(`tel:${item.phone!.replace(/[^\d+]/g, '')}`)}>
                <Text style={styles.contactText}>📞 Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.contactButton} onPress={() => Linking.openURL(`sms:${item.phone!.replace(/[^\d+]/g, '')}`)}>
                <Text style={styles.contactText}>💬 Text</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {item.email ? (
            <TouchableOpacity style={styles.contactButton} onPress={() => Linking.openURL(`mailto:${item.email}`)}>
              <Text style={styles.contactText}>✉️ Email</Text>
            </TouchableOpacity>
          ) : null}
          {item.website ? (
            <TouchableOpacity style={styles.contactButton} onPress={() => Linking.openURL(websiteUrl(item.website!))}>
              <Text style={styles.contactText}>🌐 Website</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {item.phone ? <Text style={styles.contactDetail}>{item.phone}</Text> : null}
        {item.email ? <Text style={styles.contactDetail}>{item.email}</Text> : null}
        {item.website ? <Text style={styles.contactDetail}>{item.website}</Text> : null}

        <Text style={styles.sectionLabel}>Referred by</Text>
        <View style={styles.referrer}>
          <Avatar uri={item.referrer_avatar} name={item.referrer_name} size={40} />
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.referrerName}>{item.referrer_name ?? 'Unknown'}</Text>
            <Text style={styles.referrerMeta}>
              {item.referrer_station ? `${item.referrer_station} · ` : ''}{timeAgo(item.created_at)}
            </Text>
          </View>
        </View>

        {item.notes ? (
          <>
            <Text style={styles.sectionLabel}>Their experience</Text>
            <Text style={styles.notes}>{item.notes}</Text>
          </>
        ) : null}

        {isMine ? (
          <View style={{ marginTop: 28 }}>
            <TouchableOpacity style={styles.primaryButton} onPress={() => onEdit(item)}>
              <Text style={styles.primaryButtonText}>✏️ Edit Contractor</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteButton} onPress={confirmDelete}>
              <Text style={styles.deleteButtonText}>Remove Contractor</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ReportButton kind="contractor" targetId={item.id} />
        )}
      </ScrollView>
    </Modal>
  );
}

export default function ContractorsScreen() {
  const { session } = useAuth();
  const myId = session?.user.id;
  const [items, setItems] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [trade, setTrade] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Contractor | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('contractors_list');
    if (error) {
      Alert.alert('Could not load contractors', error.message);
    } else {
      setItems((data ?? []) as Contractor[]);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((c) => {
      if (trade !== 'All' && c.trade !== trade) return false;
      if (!q) return true;
      return [c.name, c.trade, c.service_area ?? '', c.notes ?? '', c.referrer_name ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [items, query, trade]);

  const selected = items.find((c) => c.id === selectedId) ?? null;

  async function toggleRecommend(c: Contractor) {
    // Update the screen right away, then save
    setItems((prev) =>
      prev.map((x) =>
        x.id === c.id
          ? { ...x, i_recommend: !x.i_recommend, rec_count: x.rec_count + (x.i_recommend ? -1 : 1) }
          : x
      )
    );
    const { error } = c.i_recommend
      ? await supabase.from('contractor_recommendations').delete().eq('contractor_id', c.id).eq('user_id', myId)
      : await supabase.from('contractor_recommendations').insert({ contractor_id: c.id });
    if (error) Alert.alert('Could not update', error.message);
    load();
  }

  async function deleteContractor(c: Contractor) {
    setSelectedId(null);
    const { error } = await supabase.from('contractors').delete().eq('id', c.id);
    if (error) Alert.alert('Could not remove', error.message);
    load();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={FIRE_RED} />
      </View>
    );
  }

  const isFiltering = query.trim() !== '' || trade !== 'All';

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, trade, area"
          placeholderTextColor="#888"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Text style={{ fontSize: 16, color: '#888', paddingHorizontal: 6 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
          {['All', ...TRADES].map((t) => (
            <TouchableOpacity key={t} style={[styles.chip, trade === t && styles.chipActive]} onPress={() => setTrade(t)}>
              <Text style={[styles.chipText, trade === t && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={FIRE_RED} />
        }
        ListHeaderComponent={
          !isFiltering && items.length > 0 ? (
            <Text style={styles.intro}>Trusted pros for your home and property, recommended by the fire family.</Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 56 }}>🧰</Text>
            <Text style={styles.emptyTitle}>{isFiltering ? 'No matches' : 'No contractors yet'}</Text>
            <Text style={styles.emptyText}>
              {isFiltering
                ? 'Try a different search or trade.'
                : 'Know a plumber, electrician, or roofer you trust? Refer them for the fire family.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => setSelectedId(item.id)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
              <View style={[styles.row, { marginTop: 6 }]}>
                <Text style={styles.trade}>{item.trade}</Text>
                {item.service_area ? <Text style={styles.area} numberOfLines={1}>📍 {item.service_area}</Text> : null}
              </View>
              <View style={styles.cardReferrer}>
                <Avatar uri={item.referrer_avatar} name={item.referrer_name} size={22} />
                <Text style={styles.cardReferrerText} numberOfLines={1}>
                  Referred by {item.referrer_name ?? 'Unknown'}
                  {item.referrer_station ? ` · ${item.referrer_station}` : ''}
                </Text>
              </View>
            </View>
            <RecommendButton item={item} onPress={() => toggleRecommend(item)} />
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setShowNew(true)}>
        <Text style={styles.fabText}>+ Refer a Pro</Text>
      </TouchableOpacity>

      <ContractorDetail
        item={selected}
        isMine={selected?.referred_by === myId}
        onClose={() => setSelectedId(null)}
        onToggle={toggleRecommend}
        onEdit={(c) => { setSelectedId(null); setTimeout(() => setEditing(c), 800); }}
        onDelete={deleteContractor}
      />

      <NewContractorModal
        visible={showNew || !!editing}
        existing={editing}
        onClose={() => { setShowNew(false); setEditing(null); }}
        onSaved={load}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f4f4' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    margin: 12, marginBottom: 6, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#ddd',
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#111' },
  chipRow: { paddingHorizontal: 12, paddingVertical: 6 },
  chip: { borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff', borderRadius: 20, paddingVertical: 7, paddingHorizontal: 14, marginRight: 8 },
  chipActive: { backgroundColor: FIRE_RED, borderColor: FIRE_RED },
  chipText: { color: '#333', fontSize: 14 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  list: { padding: 12, paddingBottom: 100 },
  intro: { fontSize: 14, color: '#666', marginBottom: 10, marginLeft: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: FIRE_RED, marginTop: 10 },
  emptyText: { fontSize: 15, color: '#666', marginTop: 6, textAlign: 'center', lineHeight: 21 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardName: { fontSize: 17, fontWeight: 'bold', color: '#111' },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  trade: {
    fontSize: 12, fontWeight: '600', color: FIRE_RED, backgroundColor: '#fdecee',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', marginRight: 8,
  },
  area: { fontSize: 13, color: '#666', flexShrink: 1 },
  cardReferrer: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  cardReferrerText: { fontSize: 12, color: '#777', marginLeft: 6, flexShrink: 1 },
  recButton: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12,
    marginLeft: 10, minWidth: 64, alignItems: 'center',
  },
  recButtonOn: { backgroundColor: FIRE_RED, borderColor: FIRE_RED },
  recText: { fontSize: 15, color: '#333', fontWeight: '600' },
  recTextOn: { color: '#fff' },
  fab: {
    position: 'absolute', right: 20, bottom: 20, backgroundColor: FIRE_RED,
    paddingVertical: 14, paddingHorizontal: 22, borderRadius: 30,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  fabText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  done: { color: FIRE_RED, fontSize: 17, fontWeight: '600' },
  detailName: { fontSize: 26, fontWeight: 'bold', color: '#111', marginBottom: 10 },
  bigRec: { borderWidth: 1, borderColor: FIRE_RED, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 18 },
  bigRecOn: { backgroundColor: FIRE_RED },
  bigRecText: { color: FIRE_RED, fontSize: 16, fontWeight: 'bold' },
  bigRecTextOn: { color: '#fff' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#999', marginTop: 24, marginBottom: 8, textTransform: 'uppercase' },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap' },
  contactButton: { backgroundColor: '#f2f2f2', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, marginRight: 8, marginBottom: 8 },
  contactText: { fontSize: 15, fontWeight: '600', color: '#222' },
  contactDetail: { fontSize: 14, color: '#555', marginTop: 2 },
  referrer: { flexDirection: 'row', alignItems: 'center' },
  referrerName: { fontSize: 16, fontWeight: '600', color: '#111' },
  referrerMeta: { fontSize: 13, color: '#777', marginTop: 2 },
  notes: { fontSize: 16, color: '#333', lineHeight: 23 },
  primaryButton: { backgroundColor: FIRE_RED, borderRadius: 10, padding: 16, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  deleteButton: { borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: FIRE_RED },
  deleteButtonText: { color: FIRE_RED, fontSize: 17, fontWeight: 'bold' },
});