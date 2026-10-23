import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  Platform,
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
import NewRentalModal from '../../lib/NewRentalModal';
import RentalDetailModal, {
  RENTAL_TYPES,
  Rental,
  RentalType,
  formatRate,
  hostDisplayName,
  rentalDetails,
} from '../../lib/RentalDetailModal';
import { supabase } from '../../lib/supabase';

const FIRE_RED = '#C8102E';
const NAVY = '#031D3C';
const OC_REGION = { latitude: 33.68, longitude: -117.78, latitudeDelta: 0.8, longitudeDelta: 0.8 };
const RADII = [5, 10, 25, 50, 0]; // 0 = Any distance

type Coord = { lat: number; lng: number };
type Origin = Coord & { label: string };
type Row = Rental & { distance: number | null };
type Filters = { furnished: boolean; pets: boolean; place: 'any' | 'whole' | 'room'; beds: number; guests: number };
const NO_FILTERS: Filters = { furnished: false, pets: false, place: 'any', beds: 0, guests: 0 };

const INTRO: Record<RentalType, string> = {
  vacation: 'Nightly and weekend getaways from the fire family.',
  short: 'Furnished stays of about 1–6 months: between homes, relocating, or a remodel.',
  long: 'Leases of 6+ months, rooms for rent, and roommates.',
};

const EMPTY: Record<RentalType, string> = {
  vacation: 'Have a cabin, beach house, or getaway? List it for the fire family.',
  short: 'Have a furnished place for a few weeks or months? List it for members between homes.',
  long: 'Renting out a house, condo, or room? List it here first.',
};

// ZIP or city typed in the search box: "92630" -> "92630, CA"
function searchText(text: string) {
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

// Android needs location permission before it can look up addresses
async function geocodeAllowed(ask: boolean) {
  if (Platform.OS !== 'android') return true;
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  if (!ask) return false;
  const req = await Location.requestForegroundPermissionsAsync();
  return req.granted;
}

// Looks up map spots for rentals that don't have one yet, and saves them for everyone
async function fillMissingCoords(
  list: Rental[],
  tried: Set<string>,
  onFound: (id: string, pt: Coord) => void
) {
  if (!(await geocodeAllowed(false))) return;
  let count = 0;
  for (const r of list) {
    if (count >= 10) break;
    const place = r.location?.trim();
    if (!place || (r.lat != null && r.lng != null)) continue;
    const key = `${r.id}|${place}`;
    if (tried.has(key)) continue;
    tried.add(key);
    count++;
    try {
      const res = await Location.geocodeAsync(place);
      if (res.length) {
        const pt = { lat: res[0].latitude, lng: res[0].longitude };
        onFound(String(r.id), pt);
        await supabase.rpc('cache_rental_location', { p_id: String(r.id), p_lat: pt.lat, p_lng: pt.lng });
      }
    } catch {
      // couldn't find it — it just won't show on the map
    }
  }
}

export default function RentalsScreen() {
  const { session, profile } = useAuth();
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const params = useLocalSearchParams<{ new?: string }>();
  const [selected, setSelected] = useState<Rental | null>(null);
  const [editing, setEditing] = useState<Rental | null>(null);
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<RentalType>('vacation');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);

  // Location features
  const [coords, setCoords] = useState<Record<string, Coord>>({});
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [radius, setRadius] = useState(25);
  const [placeText, setPlaceText] = useState('');
  const [locating, setLocating] = useState(false);
  const [mode, setMode] = useState<'list' | 'map'>('list');
  const tried = useRef(new Set<string>());

  useEffect(() => {
    if (params.new) {
      setShowNew(true);
      router.setParams({ new: undefined });
    }
  }, [params.new]);

  const loadRentals = useCallback(async () => {
    const { data, error } = await supabase
      .from('rentals')
      .select(
        'id, title, description, location, nightly_rate, rate_period, rental_type, max_guests, bedrooms, furnished, pets_ok, room_only, lat, lng, host_name, host_contact, photo_urls, created_at, owner_id, owner:profiles(full_name, station)'
      )
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Could not load rentals', error.message);
    } else {
      const list = ((data as any) ?? []) as Rental[];
      setRentals(list);
      const known: Record<string, Coord> = {};
      for (const r of list) {
        if (r.lat != null && r.lng != null) known[String(r.id)] = { lat: r.lat, lng: r.lng };
      }
      setCoords(known);
      fillMissingCoords(list, tried.current, (id, pt) => setCoords((prev) => ({ ...prev, [id]: pt })));
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadRentals();
  }, [loadRentals]);

  const isVacation = section === 'vacation';

  const filtered: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows: Row[] = rentals
      .filter((r) => (r.rental_type ?? 'vacation') === section)
      .filter((r) => {
        if (isVacation) {
          return !filters.guests || (r.max_guests ?? 0) >= filters.guests;
        }
        if (filters.furnished && r.furnished !== true) return false;
        if (filters.pets && r.pets_ok !== true) return false;
        if (filters.place === 'whole' && r.room_only) return false;
        if (filters.place === 'room' && !r.room_only) return false;
        if (filters.beds && (r.room_only || (r.bedrooms ?? 0) < filters.beds)) return false;
        return true;
      })
      .filter((r) => {
        if (!q) return true;
        return [r.title, r.location ?? '', r.description ?? '', r.owner?.full_name ?? '', r.host_name ?? '']
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .map((r) => {
        const pt = coords[String(r.id)];
        return { ...r, distance: origin && pt ? milesBetween(origin, pt) : null };
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
  }, [rentals, query, section, filters, coords, origin, radius, isVacation]);

  // Pins for the map — nudges pins apart when several share the same spot
  const mapPoints = useMemo(() => {
    const seen: Record<string, number> = {};
    return filtered.flatMap((r) => {
      const pt = coords[String(r.id)];
      if (!pt) return [];
      const key = `${pt.lat.toFixed(4)},${pt.lng.toFixed(4)}`;
      const n = seen[key] ?? 0;
      seen[key] = n + 1;
      const angle = n * 2.4;
      const d = n === 0 ? 0 : 0.003 * Math.sqrt(n);
      return [{ item: r, latitude: pt.lat + d * Math.cos(angle), longitude: pt.lng + d * Math.sin(angle) }];
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
      latitudeDelta: Math.max(0.1, (maxLat - minLat) * 1.4),
      longitudeDelta: Math.max(0.1, (maxLng - minLng) * 1.4),
    };
  }, [origin, radius, mapPoints]);

  function switchSection(next: RentalType) {
    setSection(next);
    setFilters(NO_FILTERS);
  }

  async function searchPlace() {
    const t = placeText.trim();
    if (!t) return;
    Keyboard.dismiss();
    setLocating(true);
    try {
      if (!(await geocodeAllowed(true))) {
        Alert.alert('Location needed', 'Android needs location permission to search by ZIP or city.');
        setLocating(false);
        return;
      }
      const res = await Location.geocodeAsync(searchText(t));
      if (!res.length) Alert.alert('Not found', 'Try a 5-digit ZIP or a city name.');
      else setOrigin({ lat: res[0].latitude, lng: res[0].longitude, label: t });
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

  // Filter chips change with the section
  const chips: { label: string; active: boolean; onPress: () => void }[] = isVacation
    ? [2, 4, 6, 8].map((n) => ({
        label: `${n}+ guests`,
        active: filters.guests === n,
        onPress: () => setFilters((f) => ({ ...f, guests: f.guests === n ? 0 : n })),
      }))
    : [
        { label: '🛋️ Furnished', active: filters.furnished, onPress: () => setFilters((f) => ({ ...f, furnished: !f.furnished })) },
        { label: '🐾 Pets OK', active: filters.pets, onPress: () => setFilters((f) => ({ ...f, pets: !f.pets })) },
        {
          label: 'Whole place',
          active: filters.place === 'whole',
          onPress: () => setFilters((f) => ({ ...f, place: f.place === 'whole' ? 'any' : 'whole' })),
        },
        {
          label: 'Room for rent',
          active: filters.place === 'room',
          onPress: () => setFilters((f) => ({ ...f, place: f.place === 'room' ? 'any' : 'room' })),
        },
        ...[1, 2, 3, 4].map((n) => ({
          label: `${n}+ bd`,
          active: filters.beds === n,
          onPress: () => setFilters((f) => ({ ...f, beds: f.beds === n ? 0 : n })),
        })),
      ];

  const hasFilters = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const isFiltering = query.trim() !== '' || !!origin || hasFilters;

  return (
    <View style={styles.container}>
      <View style={styles.segment}>
        {RENTAL_TYPES.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.segmentItem, section === t.key && styles.segmentActive]}
            onPress={() => switchSection(t.key)}
          >
            <Text style={[styles.segmentText, section === t.key && styles.segmentTextActive]}>
              {t.icon} {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search title, location, or host"
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

      {/* Location bar */}
      <View style={styles.locRow}>
        {origin ? (
          <View style={styles.originPill}>
            <Text style={styles.originText} numberOfLines={1}>📍 Near {origin.label}</Text>
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
          {chips.map((c) => (
            <TouchableOpacity key={c.label} style={[styles.chip, c.active && styles.chipActive]} onPress={c.onPress}>
              <Text style={[styles.chipText, c.active && styles.chipTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
          {hasFilters ? (
            <TouchableOpacity style={styles.chip} onPress={() => setFilters(NO_FILTERS)}>
              <Text style={styles.chipText}>✕ Clear</Text>
            </TouchableOpacity>
          ) : null}
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
              <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} title={`Near ${origin.label}`} pinColor={NAVY} />
            ) : null}
            {mapPoints.map((p) => (
              <Marker
                key={String(p.item.id)}
                coordinate={{ latitude: p.latitude, longitude: p.longitude }}
                title={p.item.title}
                description={`${formatRate(p.item.nightly_rate, p.item.rate_period)}${
                  p.item.distance !== null ? ` · ${formatMiles(p.item.distance)}` : ''
                } · Tap for details`}
                pinColor={FIRE_RED}
                onCalloutPress={() => setSelected(p.item)}
              />
            ))}
          </MapView>
          <View style={styles.mapNotice}>
            <Text style={styles.mapNoticeText}>
              {mapPoints.length === 0
                ? origin
                  ? 'No rentals in this area yet. Try a bigger distance.'
                  : 'No rentals with a location yet.'
                : 'Tap a pin, then tap its name for details'}
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : styles.list}
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
          ListHeaderComponent={!isFiltering && filtered.length > 0 ? <Text style={styles.intro}>{INTRO[section]}</Text> : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>{isFiltering ? '🔍' : RENTAL_TYPES.find((t) => t.key === section)?.icon}</Text>
              <Text style={styles.emptyTitle}>{isFiltering ? 'No matches' : 'Nothing listed yet'}</Text>
              <Text style={styles.emptyText}>
                {origin
                  ? 'Nothing in this area yet. Try a bigger distance or a different ZIP.'
                  : isFiltering
                  ? 'Try a different search or fewer filters.'
                  : EMPTY[section]}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const details = rentalDetails(item);
            return (
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
                    <Text style={styles.cardRate}>{formatRate(item.nightly_rate, item.rate_period)}</Text>
                  </View>
                  {item.location ? (
                    <Text style={styles.cardLocation} numberOfLines={1}>
                      📍 {item.location}
                      {item.distance !== null ? ` · ${formatMiles(item.distance)}` : ''}
                    </Text>
                  ) : null}
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {details ? `${details} · ` : ''}Host: {hostDisplayName(item)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setShowNew(true)}>
        <Text style={styles.fabText}>+ List Rental</Text>
      </TouchableOpacity>

      <NewRentalModal
        visible={showNew || !!editing}
        existing={editing}
        defaultType={section}
        onClose={() => {
          setShowNew(false);
          setEditing(null);
        }}
        onCreated={loadRentals}
      />

      <RentalDetailModal
        rental={selected}
        isMine={selected?.owner_id === session?.user.id}
        isAdmin={!!profile?.is_admin}
        onClose={() => setSelected(null)}
        onHide={hideRental}
        onDelete={deleteRental}
        onEdit={(item) => {
          setSelected(null);
          setTimeout(() => setEditing(item), 800);
        }}
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
  segmentText: { fontSize: 13, color: '#666', fontWeight: '600' },
  segmentTextActive: { color: FIRE_RED },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    margin: 12, marginBottom: 6, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#ddd',
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#111' },
  clear: { fontSize: 16, color: '#888', paddingHorizontal: 6 },
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
  intro: { fontSize: 14, color: '#666', marginBottom: 10, marginLeft: 4, lineHeight: 20 },
  list: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 100 },
  emptyContainer: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: FIRE_RED, marginBottom: 6 },
  emptyText: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 21 },
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