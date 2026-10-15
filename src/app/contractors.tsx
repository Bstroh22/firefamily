import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
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
import MapView, { Marker } from 'react-native-maps';
import { useAuth } from '../../lib/auth';
import Avatar from '../../lib/Avatar';
import { timeAgo } from '../../lib/ListingDetailModal';
import NewContractorModal, {
  Contractor,
  ProCategory,
  SPECIALTIES,
  TRADES,
} from '../../lib/NewContractorModal';
import ReportButton from '../../lib/ReportButton';
import { supabase } from '../../lib/supabase';

const FIRE_RED = '#C8102E';
const NAVY = '#031D3C';
const OC_REGION = { latitude: 33.68, longitude: -117.78, latitudeDelta: 0.6, longitudeDelta: 0.6 };
const RADII = [5, 10, 25, 50, 0]; // 0 = Any distance

type Coord = { lat: number; lng: number };
type Origin = Coord & { label: string };
type Row = Contractor & { distance: number | null };

function websiteUrl(site: string) {
  return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}

// "Mission Viejo" -> "Mission Viejo, CA" so it finds the SoCal one
function geocodeText(text: string) {
  const t = text.trim();
  return /,|\bCA\b|california/i.test(t) ? t : `${t}, CA`;
}

function milesBetween(a: Coord, b: Coord) {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatMiles(mi: number) {
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

// Looks up map spots for referrals that don't have one yet, and saves them for everyone
async function fillMissingCoords(
  list: Contractor[],
  known: Record<string, Coord>,
  tried: Set<string>,
  onFound: (id: string, pt: Coord) => void
) {
  let count = 0;
  for (const c of list) {
    if (count >= 10) break;
    const area = c.service_area?.trim();
    if (!area || known[c.id]) continue;
    const key = `${c.id}|${area}`;
    if (tried.has(key)) continue;
    tried.add(key);
    count++;
    try {
      const res = await Location.geocodeAsync(geocodeText(area));
      if (res.length) {
        const pt = { lat: res[0].latitude, lng: res[0].longitude };
        onFound(c.id, pt);
        await supabase.rpc('cache_contractor_location', { p_id: String(c.id), p_lat: pt.lat, p_lng: pt.lng });
      }
    } catch {
      // couldn't find it — it just won't show on the map
    }
  }
}

function RecommendButton({ item, onPress }: { item: Contractor; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.recButton, item.i_recommend && styles.recButtonOn]}
      accessibilityLabel={item.i_recommend ? 'Remove your recommendation' : 'Recommend'}
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

function ProDetail({ item, isMine, onClose, onToggle, onEdit, onDelete }: DetailProps) {
  if (!item) return null;
  const isHealth = item.category === 'health';

  function confirmDelete() {
    Alert.alert('Remove recommendation?', 'This removes it for everyone, including all 👍.', [
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
        <Text style={styles.headerTitle}>{isHealth ? 'Provider' : 'Contractor'}</Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 160 }}>
        <Text style={styles.detailName}>{item.name}</Text>
        <View style={styles.row}>
          <Text style={styles.trade}>{item.trade}</Text>
          {item.service_area ? <Text style={styles.area}>📍 {item.service_area}</Text> : null}
        </View>

        <TouchableOpacity onPress={() => onToggle(item)} style={[styles.bigRec, item.i_recommend && styles.bigRecOn]}>
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
          {item.service_area ? (
            <TouchableOpacity
              style={styles.contactButton}
              onPress={() => Linking.openURL(`http://maps.apple.com/?q=${encodeURIComponent(`${item.name} ${item.service_area}`)}`)}
            >
              <Text style={styles.contactText}>🗺 Directions</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {item.phone ? <Text style={styles.contactDetail}>{item.phone}</Text> : null}
        {item.email ? <Text style={styles.contactDetail}>{item.email}</Text> : null}
        {item.website ? <Text style={styles.contactDetail}>{item.website}</Text> : null}

        {isHealth && item.insurance ? (
          <>
            <Text style={styles.sectionLabel}>Insurance accepted</Text>
            <Text style={styles.notes}>{item.insurance}</Text>
          </>
        ) : null}

        <Text style={styles.sectionLabel}>Recommended by</Text>
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

        {isHealth ? <Text style={styles.disclaimer}>Member recommendations, not medical advice.</Text> : null}

        {isMine ? (
          <View style={{ marginTop: 28 }}>
            <TouchableOpacity style={styles.primaryButton} onPress={() => onEdit(item)}>
              <Text style={styles.primaryButtonText}>✏️ Edit Recommendation</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteButton} onPress={confirmDelete}>
              <Text style={styles.deleteButtonText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ReportButton kind="contractor" targetId={item.id} />
        )}
      </ScrollView>
    </Modal>
  );
}

export default function ProsScreen() {
  const { session } = useAuth();
  const myId = session?.user.id;
  const [items, setItems] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection] = useState<ProCategory>('home');
  const [query, setQuery] = useState('');
  const [trade, setTrade] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Contractor | null>(null);

  // Location features
  const [coords, setCoords] = useState<Record<string, Coord>>({});
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [radius, setRadius] = useState(25);
  const [placeText, setPlaceText] = useState('');
  const [locating, setLocating] = useState(false);
  const [mode, setMode] = useState<'list' | 'map'>('list');
  const tried = useRef(new Set<string>());

  const load = useCallback(async () => {
    const [listRes, locRes] = await Promise.all([
      supabase.rpc('contractors_list'),
      supabase.rpc('contractor_locations'),
    ]);
    if (listRes.error) {
      Alert.alert('Could not load', listRes.error.message);
    } else {
      const list = (listRes.data ?? []) as Contractor[];
      setItems(list);
      const known: Record<string, Coord> = {};
      for (const l of (locRes.data ?? []) as any[]) {
        if (l.lat != null && l.lng != null) known[String(l.id)] = { lat: l.lat, lng: l.lng };
      }
      setCoords(known);
      fillMissingCoords(list, known, tried.current, (id, pt) =>
        setCoords((prev) => ({ ...prev, [id]: pt }))
      );
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isHealth = section === 'health';
  const chipOptions = ['All', ...(isHealth ? SPECIALTIES : TRADES)];

  const filtered: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows: Row[] = items
      .filter((c) => {
        if ((c.category ?? 'home') !== section) return false;
        if (trade !== 'All' && c.trade !== trade) return false;
        if (!q) return true;
        return [c.name, c.trade, c.service_area ?? '', c.insurance ?? '', c.notes ?? '', c.referrer_name ?? '']
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .map((c) => {
        const pt = coords[c.id];
        return { ...c, distance: origin && pt ? milesBetween(origin, pt) : null };
      });

    if (!origin) return rows;
    return rows
      .filter((r) => (radius === 0 ? true : r.distance !== null && r.distance <= radius))
      .sort((a, b) => {
        if (a.distance === null && b.distance === null) return 0;
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
  }, [items, query, trade, section, coords, origin, radius]);

  // Pins for the map — nudges pins apart when several share the same city
  const mapPoints = useMemo(() => {
    const seen: Record<string, number> = {};
    return filtered.flatMap((c) => {
      const pt = coords[c.id];
      if (!pt) return [];
      const key = `${pt.lat.toFixed(4)},${pt.lng.toFixed(4)}`;
      const n = seen[key] ?? 0;
      seen[key] = n + 1;
      const angle = n * 2.4;
      const r = n === 0 ? 0 : 0.003 * Math.sqrt(n);
      return [{ item: c, latitude: pt.lat + r * Math.cos(angle), longitude: pt.lng + r * Math.sin(angle) }];
    });
  }, [filtered, coords]);

  const region = useMemo(() => {
    if (origin) {
      const d = radius ? Math.min(radius / 30, 3) : 1;
      return { latitude: origin.lat, longitude: origin.lng, latitudeDelta: d, longitudeDelta: d };
    }
    if (mapPoints.length === 0) return OC_REGION;
    const lats = mapPoints.map((p) => p.latitude);
    const lngs = mapPoints.map((p) => p.longitude);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.08, (maxLat - minLat) * 1.4),
      longitudeDelta: Math.max(0.08, (maxLng - minLng) * 1.4),
    };
  }, [origin, radius, mapPoints]);

  const selected = items.find((c) => c.id === selectedId) ?? null;

  function switchSection(next: ProCategory) {
    setSection(next);
    setTrade('All');
  }

  async function searchPlace() {
    const t = placeText.trim();
    if (!t) return;
    Keyboard.dismiss();
    setLocating(true);
    try {
      const res = await Location.geocodeAsync(geocodeText(t));
      if (!res.length) {
        Alert.alert('Not found', 'Try a 5-digit ZIP or a city name.');
      } else {
        setOrigin({ lat: res[0].latitude, lng: res[0].longitude, label: t });
      }
    } catch {
      Alert.alert('Not found', 'Try a 5-digit ZIP or a city name.');
    }
    setLocating(false);
  }

  async function locateMe() {
    Keyboard.dismiss();
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location is off',
          'To use Near me, allow location for SoCal FireFamily in your iPhone Settings. You can still search by ZIP.'
        );
      } else {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'you' });
        setPlaceText('');
      }
    } catch {
      Alert.alert('Could not get your location', 'Try searching by ZIP instead.');
    }
    setLocating(false);
  }

  async function toggleRecommend(c: Contractor) {
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

  async function deleteItem(c: Contractor) {
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

  const isFiltering = query.trim() !== '' || trade !== 'All' || !!origin;

  return (
    <View style={styles.container}>
      <View style={styles.segment}>
        <TouchableOpacity style={[styles.segmentItem, !isHealth && styles.segmentActive]} onPress={() => switchSection('home')}>
          <Text style={[styles.segmentText, !isHealth && styles.segmentTextActive]}>🧰 Home & Services</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segmentItem, isHealth && styles.segmentActive]} onPress={() => switchSection('health')}>
          <Text style={[styles.segmentText, isHealth && styles.segmentTextActive]}>🩺 Health & Wellness</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder={isHealth ? 'Search doctor, specialty, insurance' : 'Search name, service, area'}
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

      {/* Location bar */}
      <View style={styles.locRow}>
        {origin ? (
          <View style={styles.originPill}>
            <Text style={styles.originText} numberOfLines={1}>
              📍 Near {origin.label}
            </Text>
            <TouchableOpacity onPress={() => setOrigin(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.originClear}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.zipInput}
              placeholder="ZIP or city"
              placeholderTextColor="#888"
              value={placeText}
              onChangeText={setPlaceText}
              onSubmitEditing={searchPlace}
              returnKeyType="search"
              autoCorrect={false}
            />
            {placeText.trim() ? (
              <TouchableOpacity style={styles.locButton} onPress={searchPlace}>
                <Text style={styles.locButtonText}>Go</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.locButton} onPress={locateMe}>
                <Text style={styles.locButtonText}>📍 Near me</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        {locating ? <ActivityIndicator color={FIRE_RED} style={{ marginLeft: 8 }} /> : null}
        <TouchableOpacity style={styles.viewToggle} onPress={() => setMode((m) => (m === 'list' ? 'map' : 'list'))}>
          <Text style={styles.viewToggleText}>{mode === 'list' ? '🗺 Map' : '☰ List'}</Text>
        </TouchableOpacity>
      </View>

      {origin ? (
        <View style={styles.radiusRow}>
          <Text style={styles.radiusLabel}>Within</Text>
          {RADII.map((r) => (
            <TouchableOpacity key={r} style={[styles.radiusChip, radius === r && styles.chipActive]} onPress={() => setRadius(r)}>
              <Text style={[styles.radiusText, radius === r && styles.chipTextActive]}>{r === 0 ? 'Any' : `${r} mi`}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
          {chipOptions.map((t) => (
            <TouchableOpacity key={t} style={[styles.chip, trade === t && styles.chipActive]} onPress={() => setTrade(t)}>
              <Text style={[styles.chipText, trade === t && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {mode === 'map' ? (
        <View style={{ flex: 1 }}>
          <MapView
            key={origin ? `${origin.lat},${origin.lng},${radius}` : `all-${section}`}
            style={StyleSheet.absoluteFill}
            initialRegion={region}
            showsUserLocation={origin?.label === 'you'}
          >
            {origin && origin.label !== 'you' ? (
              <Marker
                coordinate={{ latitude: origin.lat, longitude: origin.lng }}
                title={`Near ${origin.label}`}
                pinColor={NAVY}
              />
            ) : null}
            {mapPoints.map((p) => (
              <Marker
                key={p.item.id}
                coordinate={{ latitude: p.latitude, longitude: p.longitude }}
                title={p.item.name}
                description={`${p.item.trade}${p.item.distance !== null ? ` · ${formatMiles(p.item.distance)}` : ''} · Tap for details`}
                pinColor={FIRE_RED}
                onCalloutPress={() => setSelectedId(p.item.id)}
              />
            ))}
          </MapView>
          {mapPoints.length === 0 ? (
            <View style={styles.mapNotice}>
              <Text style={styles.mapNoticeText}>
                {origin ? 'No referrals in this area yet. Try a bigger distance.' : 'No referrals with a service area yet.'}
              </Text>
            </View>
          ) : (
            <View style={styles.mapNotice}>
              <Text style={styles.mapNoticeText}>Tap a pin, then tap its name for details</Text>
            </View>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => String(c.id)}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={FIRE_RED} />
          }
          ListHeaderComponent={
            !isFiltering && filtered.length > 0 ? (
              <Text style={styles.intro}>
                {isHealth
                  ? 'Doctors and providers recommended by the fire family. Member recommendations, not medical advice.'
                  : 'Know a plumber, mechanic, realtor, or CPA you trust?'}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 56 }}>{isHealth ? '🩺' : '🧰'}</Text>
              <Text style={styles.emptyTitle}>{isFiltering ? 'No matches' : 'No recommendations yet'}</Text>
              <Text style={styles.emptyText}>
                {origin
                  ? 'Nothing in this area yet. Try a bigger distance or a different ZIP.'
                  : isFiltering
                  ? 'Try a different search or filter.'
                  : isHealth
                  ? 'Know a great ortho, dermatologist, or PT? Recommend them for the fire family.'
                  : 'Know a plumber, mechanic, realtor, or CPA you trust? Recommend them for the fire family.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => setSelectedId(item.id)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                <View style={[styles.row, { marginTop: 6 }]}>
                  <Text style={styles.trade}>{item.trade}</Text>
                  {item.service_area ? (
                    <Text style={styles.area} numberOfLines={1}>
                      📍 {item.service_area}
                      {item.distance !== null ? ` · ${formatMiles(item.distance)}` : ''}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.cardReferrer}>
                  <Avatar uri={item.referrer_avatar} name={item.referrer_name} size={22} />
                  <Text style={styles.cardReferrerText} numberOfLines={1}>
                    Recommended by {item.referrer_name ?? 'Unknown'}
                    {item.referrer_station ? ` · ${item.referrer_station}` : ''}
                  </Text>
                </View>
              </View>
              <RecommendButton item={item} onPress={() => toggleRecommend(item)} />
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setShowNew(true)}>
        <Text style={styles.fabText}>+ Recommend</Text>
      </TouchableOpacity>

      <ProDetail
        item={selected}
        isMine={selected?.referred_by === myId}
        onClose={() => setSelectedId(null)}
        onToggle={toggleRecommend}
        onEdit={(c) => { setSelectedId(null); setTimeout(() => setEditing(c), 800); }}
        onDelete={deleteItem}
      />

      <NewContractorModal
        visible={showNew || !!editing}
        existing={editing}
        defaultCategory={section}
        onClose={() => { setShowNew(false); setEditing(null); }}
        onSaved={load}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f4f4' },
  segment: { flexDirection: 'row', backgroundColor: '#e6e6e6', borderRadius: 12, padding: 4, margin: 12, marginBottom: 0 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  segmentActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  segmentText: { fontSize: 14, color: '#666', fontWeight: '600' },
  segmentTextActive: { color: FIRE_RED },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    margin: 12, marginBottom: 6, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#ddd',
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#111' },
  locRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginTop: 4 },
  zipInput: {
    flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: '#111',
  },
  locButton: { backgroundColor: NAVY, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginLeft: 8 },
  locButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  originPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fdecee',
    borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12,
  },
  originText: { flex: 1, color: FIRE_RED, fontSize: 15, fontWeight: '600' },
  originClear: { color: FIRE_RED, fontSize: 16, paddingLeft: 10 },
  viewToggle: { borderWidth: 1, borderColor: NAVY, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, marginLeft: 8, backgroundColor: '#fff' },
  viewToggleText: { color: NAVY, fontSize: 14, fontWeight: '600' },
  radiusRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginTop: 8 },
  radiusLabel: { fontSize: 13, color: '#666', marginRight: 6 },
  radiusChip: { borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff', borderRadius: 16, paddingVertical: 5, paddingHorizontal: 10, marginRight: 6 },
  radiusText: { fontSize: 13, color: '#333' },
  chipRow: { paddingHorizontal: 12, paddingVertical: 6 },
  chip: { borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff', borderRadius: 20, paddingVertical: 7, paddingHorizontal: 14, marginRight: 8 },
  chipActive: { backgroundColor: FIRE_RED, borderColor: FIRE_RED },
  chipText: { color: '#333', fontSize: 14 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  mapNotice: {
    position: 'absolute', top: 10, left: 12, right: 12, backgroundColor: 'rgba(3,29,60,0.85)',
    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
  },
  mapNoticeText: { color: '#fff', fontSize: 13, textAlign: 'center' },
  list: { padding: 12, paddingBottom: 100 },
  intro: { fontSize: 14, color: '#666', marginBottom: 10, marginLeft: 4, lineHeight: 20 },
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
  recButton: { borderWidth: 1, borderColor: '#ccc', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12, marginLeft: 10, minWidth: 64, alignItems: 'center' },
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
  disclaimer: { fontSize: 12, color: '#888', marginTop: 20, fontStyle: 'italic' },
  primaryButton: { backgroundColor: FIRE_RED, borderRadius: 10, padding: 16, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  deleteButton: { borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: FIRE_RED },
  deleteButtonText: { color: FIRE_RED, fontSize: 17, fontWeight: 'bold' },
});