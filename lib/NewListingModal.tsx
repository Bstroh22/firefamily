import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View,
} from 'react-native';
import type { Listing } from './ListingDetailModal';
import PhotoPicker, { LocalPhoto, toPhotoList, uploadPhotos } from './PhotoPicker';
import { supabase } from './supabase';

const FIRE_RED = '#C8102E';
export const CATEGORIES = ['Gear', 'Tools', 'Vehicles', 'Outdoors', 'Home', 'Other'];

type Props = {
  visible: boolean;
  existing?: Listing | null;
  onClose: () => void;
  onCreated: () => void;
};

export default function NewListingModal({ visible, existing, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Gear');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [busy, setBusy] = useState(false);

  const isEditing = !!existing;

  useEffect(() => {
    if (!visible) return;
    if (existing) {
      setTitle(existing.title);
      setPrice(existing.price === null ? '' : String(existing.price));
      setCategory(existing.category ?? 'Gear');
      setDescription(existing.description ?? '');
      setPhotos(toPhotoList(existing.photo_urls));
    } else {
      setTitle('');
      setPrice('');
      setCategory('Gear');
      setDescription('');
      setPhotos([]);
    }
  }, [visible, existing]);

  async function handleSave() {
    if (!title.trim()) {
      Alert.alert('Missing title', 'Give your item a title.');
      return;
    }

    const cleaned = price.replace(/[$,\s]/g, '');
    const priceNumber = cleaned === '' ? null : Number(cleaned);
    if (priceNumber !== null && (isNaN(priceNumber) || priceNumber < 0)) {
      Alert.alert('Check the price', 'Enter a number like 150, or leave it blank for "make an offer."');
      return;
    }

    setBusy(true);
    try {
      const photoUrls = await uploadPhotos(photos, 'listings');

      const payload = {
        title: title.trim(),
        price: priceNumber,
        category,
        description: description.trim() || null,
        photo_urls: photoUrls,
      };

      const { error } = existing
        ? await supabase.from('listings').update(payload).eq('id', existing.id)
        : await supabase.from('listings').insert(payload);
      if (error) throw error;

      onCreated();
      onClose();
    } catch (e: any) {
      Alert.alert(isEditing ? 'Could not save' : 'Could not post', e.message);
    } finally {
      setBusy(false);
    }
  }

  const hasNewPhotos = photos.some((p) => !p.remote);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} disabled={busy}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEditing ? 'Edit Listing' : 'Sell an Item'}</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <PhotoPicker photos={photos} onChange={setPhotos} max={5} />

          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholderTextColor="#888"
            placeholder="e.g. Turnout boots, size 11"
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.label}>Price</Text>
          <TextInput
            style={styles.input}
            placeholderTextColor="#888"
            placeholder="e.g. 150 (blank = make an offer, 0 = free)"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Category</Text>
          <View style={styles.chips}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, category === c && styles.chipActive]}
                onPress={() => setCategory(c)}
              >
                <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholderTextColor="#888"
            placeholder="Condition, pickup location, anything a buyer should know"
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <TouchableOpacity style={styles.button} onPress={handleSave} disabled={busy}>
            {busy ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator color="#fff" />
                <Text style={[styles.buttonText, { marginLeft: 10 }]}>
                  {hasNewPhotos ? 'Uploading photos...' : 'Saving...'}
                </Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>{isEditing ? 'Save Changes' : 'Post Listing'}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  cancel: { color: FIRE_RED, fontSize: 16, width: 60 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  body: { padding: 20, paddingBottom: 60 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 14,
    fontSize: 16, marginBottom: 8, backgroundColor: '#fafafa', color: '#111',
  },
  textArea: { height: 110, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  chip: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, marginBottom: 8,
  },
  chipActive: { backgroundColor: FIRE_RED, borderColor: FIRE_RED },
  chipText: { color: '#333', fontSize: 14 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  button: { backgroundColor: FIRE_RED, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});