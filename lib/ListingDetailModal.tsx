import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ConversationChat from './ConversationChat';
import { startConversation } from './messages';

const FIRE_RED = '#C8102E';
const SCREEN_WIDTH = Dimensions.get('window').width;

export type Listing = {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  category: string | null;
  photo_urls: string[];
  created_at: string;
  seller_id: string;
  seller: { full_name: string | null; station: string | null } | null;
};

export function formatPrice(price: number | null) {
  if (price === null) return 'Make an offer';
  if (Number(price) === 0) return 'Free';
  return `$${Number(price).toLocaleString()}`;
}

export function timeAgo(dateString: string) {
  const minutes = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

type Props = {
  listing: Listing | null;
  isMine: boolean;
  onClose: () => void;
  onEdit: (listing: Listing) => void;
  onMarkSold: (id: string) => void;
  onDelete: (id: string) => void;
};

export default function ListingDetailModal({ listing, isMine, onClose, onEdit, onMarkSold, onDelete }: Props) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    setChatId(null);
  }, [listing?.id]);

  if (!listing) return null;
  const photos = listing.photo_urls ?? [];

  function confirmDelete() {
    Alert.alert('Delete listing?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(listing!.id) },
    ]);
  }

  async function messageSeller() {
    setStarting(true);
    try {
      setChatId(await startConversation(listing!.seller_id, 'listing', listing!.id, listing!.title));
    } catch (e: any) {
      Alert.alert('Could not start chat', e.message);
    } finally {
      setStarting(false);
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.headerSide} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.done}>Done</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Listing</Text>
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
            <Text style={{ fontSize: 56 }}>📦</Text>
            <Text style={{ color: '#888', marginTop: 8 }}>No photos</Text>
          </View>
        )}
        {photos.length > 1 && <Text style={styles.swipeHint}>Swipe to see all {photos.length} photos</Text>}

        <View style={styles.body}>
          <Text style={styles.title}>{listing.title}</Text>
          <Text style={styles.price}>{formatPrice(listing.price)}</Text>

          <View style={styles.row}>
            <Text style={styles.category}>{listing.category ?? 'Other'}</Text>
            <Text style={styles.posted}>Posted {timeAgo(listing.created_at)}</Text>
          </View>

          <Text style={styles.sectionLabel}>Description</Text>
          <Text style={styles.description}>{listing.description || 'No description.'}</Text>

          <Text style={styles.sectionLabel}>Seller</Text>
          <Text style={styles.seller}>
            {listing.seller?.full_name ?? 'Unknown'}
            {listing.seller?.station ? ` · ${listing.seller.station}` : ''}
          </Text>

          {!isMine && (
            <TouchableOpacity style={[styles.primaryButton, { marginTop: 28 }]} onPress={messageSeller} disabled={starting}>
              {starting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>💬 Message Seller</Text>
              )}
            </TouchableOpacity>
          )}

          {isMine && (
            <View style={{ marginTop: 28 }}>
              <TouchableOpacity style={styles.primaryButton} onPress={() => onEdit(listing)}>
                <Text style={styles.primaryButtonText}>✏️ Edit Listing</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => onMarkSold(listing.id)}>
                <Text style={styles.secondaryButtonText}>Mark as Sold</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={confirmDelete}>
                <Text style={styles.deleteButtonText}>Delete Listing</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      <ConversationChat
        conversationId={chatId}
        otherName={listing.seller?.full_name ?? 'Seller'}
        initialText={`Hi! Is your "${listing.title}" still available?`}
        subtitle={`🛒 Marketplace · ${listing.title}`} onClose={() => setChatId(null)}
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
  title: { fontSize: 24, fontWeight: 'bold', color: '#111' },
  price: { fontSize: 22, fontWeight: 'bold', color: FIRE_RED, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  category: {
    fontSize: 13, fontWeight: '600', color: FIRE_RED, backgroundColor: '#fdecee',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, overflow: 'hidden',
  },
  posted: { fontSize: 13, color: '#888' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#999', marginTop: 24, marginBottom: 6, textTransform: 'uppercase' },
  description: { fontSize: 16, color: '#333', lineHeight: 23 },
  seller: { fontSize: 16, color: '#111', fontWeight: '600' },
  primaryButton: { backgroundColor: FIRE_RED, borderRadius: 10, padding: 16, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  secondaryButton: { borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: '#bbb' },
  secondaryButtonText: { color: '#333', fontSize: 17, fontWeight: '600' },
  deleteButton: { borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: FIRE_RED },
  deleteButtonText: { color: FIRE_RED, fontSize: 17, fontWeight: 'bold' },
});