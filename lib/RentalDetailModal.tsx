import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ConversationChat from './ConversationChat';
import { startConversation } from './messages';
import ReportButton from './ReportButton';

const FIRE_RED = '#C8102E';
const SCREEN_WIDTH = Dimensions.get('window').width;

export type RentalType = 'vacation' | 'short' | 'long';
export type RatePeriod = 'night' | 'week' | 'month';

export const RENTAL_TYPES: { key: RentalType; label: string; icon: string }[] = [
  { key: 'vacation', label: 'Vacation', icon: '🏖️' },
  { key: 'short', label: 'Short-term', icon: '📅' },
  { key: 'long', label: 'Long-term', icon: '🏠' },
];

export function typeLabel(t?: RentalType | null) {
  const found = RENTAL_TYPES.find((x) => x.key === (t ?? 'vacation'));
  return found ? `${found.icon} ${found.label}` : '🏖️ Vacation';
}

export type Rental = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  nightly_rate: number | null;
  rate_period?: RatePeriod | null;
  rental_type?: RentalType | null;
  max_guests: number | null;
  bedrooms?: number | null;
  furnished?: boolean | null;
  pets_ok?: boolean | null;
  room_only?: boolean | null;
  lat?: number | null;
  lng?: number | null;
  host_name: string | null;
  host_contact: string | null;
  photo_urls: string[];
  created_at: string;
  owner_id: string;
  owner: { full_name: string | null; station: string | null } | null;
};

export function formatRate(rate: number | null, period: RatePeriod | null | undefined = 'night') {
  if (rate === null || rate === undefined) return 'Contact for rate';
  return `$${Number(rate).toLocaleString()}/${period ?? 'night'}`;
}

export function hostDisplayName(rental: Rental) {
  return rental.host_name || rental.owner?.full_name || 'Unknown';
}

// "2 bd · Furnished · Pets OK" or "Sleeps 6"
export function rentalDetails(r: Rental) {
  if ((r.rental_type ?? 'vacation') === 'vacation') return r.max_guests ? `Sleeps ${r.max_guests}` : '';
  const parts: string[] = [];
  if (r.room_only) parts.push('Room for rent');
  else if (r.bedrooms !== null && r.bedrooms !== undefined) parts.push(r.bedrooms === 0 ? 'Studio' : `${r.bedrooms} bd`);
  if (r.furnished === true) parts.push('Furnished');
  if (r.furnished === false) parts.push('Unfurnished');
  if (r.pets_ok === true) parts.push('Pets OK');
  return parts.join(' · ');
}

function openContact(contact: string) {
  const trimmed = contact.trim();
  if (trimmed.includes('@')) {
    Linking.openURL(`mailto:${trimmed}`);
  } else {
    const digits = trimmed.replace(/[^\d+]/g, '');
    if (digits.length >= 7) Linking.openURL(`tel:${digits}`);
  }
}

type Props = {
  rental: Rental | null;
  isMine: boolean;
  onClose: () => void;
  onEdit: (rental: Rental) => void;
  onHide: (id: string) => void;
  onDelete: (id: string) => void;
};

export default function RentalDetailModal({ rental, isMine, onClose, onEdit, onHide, onDelete }: Props) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    setChatId(null);
  }, [rental?.id]);

  if (!rental) return null;
  const photos = rental.photo_urls ?? [];
  const postedBySomeoneElse = !!rental.host_name;
  const isVacation = (rental.rental_type ?? 'vacation') === 'vacation';

  function confirmDelete() {
    Alert.alert('Delete rental?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(rental!.id) },
    ]);
  }

  async function messageOwner() {
    setStarting(true);
    try {
      setChatId(await startConversation(rental!.owner_id, 'rental', rental!.id, rental!.title));
    } catch (e: any) {
      Alert.alert('Could not start chat', e.message);
    } finally {
      setStarting(false);
    }
  }

  const bedsValue = rental.room_only
    ? 'Room'
    : rental.bedrooms === 0
    ? 'Studio'
    : rental.bedrooms ?? '—';

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.headerSide} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.done}>Done</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rental</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
        {photos.length > 0 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {photos.map((url) => (
              <Image key={url} source={{ uri: url }} style={styles.photo} />
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.photo, styles.noPhoto]}>
            <Text style={{ fontSize: 56 }}>🏡</Text>
            <Text style={{ color: '#888', marginTop: 8 }}>No photos</Text>
          </View>
        )}
        {photos.length > 1 && <Text style={styles.swipeHint}>Swipe to see all {photos.length} photos</Text>}

        <View style={styles.body}>
          <Text style={styles.typeBadge}>{typeLabel(rental.rental_type)}</Text>
          <Text style={styles.title}>{rental.title}</Text>
          {rental.location ? (
            <TouchableOpacity
              onPress={() => Linking.openURL(`http://maps.apple.com/?q=${encodeURIComponent(rental.location!)}`)}
            >
              <Text style={styles.location}>📍 {rental.location}  ›</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{formatRate(rental.nightly_rate, rental.rate_period)}</Text>
              <Text style={styles.statLabel}>Rate</Text>
            </View>
            {isVacation ? (
              <View style={styles.stat}>
                <Text style={styles.statValue}>{rental.max_guests ?? '—'}</Text>
                <Text style={styles.statLabel}>Max guests</Text>
              </View>
            ) : (
              <View style={styles.stat}>
                <Text style={styles.statValue}>{bedsValue}</Text>
                <Text style={styles.statLabel}>{rental.room_only ? 'Room for rent' : 'Bedrooms'}</Text>
              </View>
            )}
          </View>

          {!isVacation && (rental.furnished !== null || rental.pets_ok !== null) ? (
            <View style={styles.tags}>
              {rental.furnished === true ? <Text style={styles.tag}>🛋️ Furnished</Text> : null}
              {rental.furnished === false ? <Text style={styles.tag}>Unfurnished</Text> : null}
              {rental.pets_ok === true ? <Text style={styles.tag}>🐾 Pets OK</Text> : null}
              {rental.pets_ok === false ? <Text style={styles.tag}>No pets</Text> : null}
            </View>
          ) : null}

          <Text style={styles.sectionLabel}>About this place</Text>
          <Text style={styles.description}>{rental.description || 'No description.'}</Text>

          <Text style={styles.sectionLabel}>{isVacation ? 'Host' : 'Landlord / Host'}</Text>
          <Text style={styles.host}>
            {hostDisplayName(rental)}
            {!postedBySomeoneElse && rental.owner?.station ? ` · ${rental.owner.station}` : ''}
          </Text>
          {postedBySomeoneElse && (
            <Text style={styles.postedBy}>
              Posted by {rental.owner?.full_name ?? 'Unknown'}
              {rental.owner?.station ? ` · ${rental.owner.station}` : ''}
            </Text>
          )}

          {rental.host_contact ? (
            <>
              <Text style={styles.sectionLabel}>Contact</Text>
              <TouchableOpacity onPress={() => openContact(rental.host_contact!)}>
                <Text style={styles.contact}>{rental.host_contact}</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {!isMine && (
            <TouchableOpacity style={[styles.primaryButton, { marginTop: 28 }]} onPress={messageOwner} disabled={starting}>
              {starting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  💬 {postedBySomeoneElse ? 'Message Poster' : 'Message Host'}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {!isMine && <ReportButton kind="rental" targetId={rental.id} />}
          {isMine && (
            <View style={{ marginTop: 28 }}>
              <TouchableOpacity style={styles.primaryButton} onPress={() => onEdit(rental)}>
                <Text style={styles.primaryButtonText}>✏️ Edit Rental</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => onHide(rental.id)}>
                <Text style={styles.secondaryButtonText}>Hide from Listings</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={confirmDelete}>
                <Text style={styles.deleteButtonText}>Delete Rental</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      <ConversationChat
        conversationId={chatId}
        otherName={rental.owner?.full_name ?? 'Host'}
        initialText={`Hi! I'm interested in "${rental.title}". Is it available?`}
        subtitle={`🏡 Rental · ${rental.title}`}
        onClose={() => setChatId(null)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  headerSide: { width: 70 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  done: { color: FIRE_RED, fontSize: 17, fontWeight: '600' },
  photo: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.6, backgroundColor: '#eee' },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  swipeHint: { textAlign: 'center', color: '#888', fontSize: 13, marginTop: 8 },
  body: { padding: 20 },
  typeBadge: {
    alignSelf: 'flex-start', fontSize: 12, fontWeight: '700', color: FIRE_RED, backgroundColor: '#fdecee',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', marginBottom: 8,
  },
  title: { fontSize: 24, fontWeight: 'bold', color: '#111' },
  location: { fontSize: 16, color: '#031D3C', marginTop: 6 },
  statsRow: { flexDirection: 'row', marginTop: 18 },
  stat: {
    flex: 1, backgroundColor: '#f6f6f6', borderRadius: 12, padding: 14,
    marginRight: 10, alignItems: 'center',
  },
  statValue: { fontSize: 17, fontWeight: 'bold', color: FIRE_RED, textAlign: 'center' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  tag: {
    fontSize: 14, color: '#333', backgroundColor: '#f0f0f0', borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, marginBottom: 8, overflow: 'hidden',
  },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#999', marginTop: 24, marginBottom: 6, textTransform: 'uppercase' },
  description: { fontSize: 16, color: '#333', lineHeight: 23 },
  host: { fontSize: 16, color: '#111', fontWeight: '600' },
  postedBy: { fontSize: 14, color: '#777', marginTop: 4 },
  contact: { fontSize: 16, color: FIRE_RED, fontWeight: '600', textDecorationLine: 'underline' },
  primaryButton: { backgroundColor: FIRE_RED, borderRadius: 10, padding: 16, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  secondaryButton: { borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: '#bbb' },
  secondaryButtonText: { color: '#333', fontSize: 17, fontWeight: '600' },
  deleteButton: { borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: FIRE_RED },
  deleteButtonText: { color: FIRE_RED, fontSize: 17, fontWeight: 'bold' },
});