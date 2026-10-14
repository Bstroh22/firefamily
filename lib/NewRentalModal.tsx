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
import PhotoPicker, { LocalPhoto, toPhotoList, uploadPhotos } from './PhotoPicker';
import type { Rental } from './RentalDetailModal';
import { supabase } from './supabase';

const FIRE_RED = '#C8102E';

type Props = {
  visible: boolean;
  existing?: Rental | null;
  onClose: () => void;
  onCreated: () => void;
};

export default function NewRentalModal({ visible, existing, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [rate, setRate] = useState('');
  const [guests, setGuests] = useState('');
  const [description, setDescription] = useState('');
  const [hostIsMe, setHostIsMe] = useState(true);
  const [hostName, setHostName] = useState('');
  const [hostContact, setHostContact] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [busy, setBusy] = useState(false);

  const isEditing = !!existing;

  useEffect(() => {
    if (!visible) return;
    if (existing) {
      setTitle(existing.title);
      setLocation(existing.location ?? '');
      setRate(existing.nightly_rate === null ? '' : String(existing.nightly_rate));
      setGuests(existing.max_guests === null ? '' : String(existing.max_guests));
      setDescription(existing.description ?? '');
      setHostIsMe(!existing.host_name);
      setHostName(existing.host_name ?? '');
      setHostContact(existing.host_contact ?? '');
      setPhotos(toPhotoList(existing.photo_urls));
    } else {
      setTitle('');
      setLocation('');
      setRate('');
      setGuests('');
      setDescription('');
      setHostIsMe(true);
      setHostName('');
      setHostContact('');
      setPhotos([]);
    }
  }, [visible, existing]);

  async function handleSave() {
    if (!title.trim() || !location.trim()) {
      Alert.alert('Missing info', 'Add a title and a location.');
      return;
    }
    if (!hostIsMe && !hostName.trim()) {
      Alert.alert('Missing host name', "Enter the host's name, or switch to \"I'm the host.\"");
      return;
    }

    const cleanedRate = rate.replace(/[$,\s]/g, '');
    const rateNumber = cleanedRate === '' ? null : Number(cleanedRate);
    if (rateNumber !== null && (isNaN(rateNumber) || rateNumber < 0)) {
      Alert.alert('Check the rate', 'Enter a nightly rate like 250, or leave it blank.');
      return;
    }

    const guestsNumber = guests.trim() === '' ? null : parseInt(guests, 10);
    if (guestsNumber !== null && (isNaN(guestsNumber) || guestsNumber < 1)) {
      Alert.alert('Check max guests', 'Enter a whole number like 6, or leave it blank.');
      return;
    }

    setBusy(true);
    try {
      const photoUrls = await uploadPhotos(photos, 'rentals');

      const payload = {
        title: title.trim(),
        location: location.trim(),
        nightly_rate: rateNumber,
        max_guests: guestsNumber,
        description: description.trim() || null,
        host_name: hostIsMe ? null : hostName.trim(),
        host_contact: hostContact.trim() || null,
        photo_urls: photoUrls,
      };

      const { error } = existing
        ? await supabase.from('rentals').update(payload).eq('id', existing.id)
        : await supabase.from('rentals').insert(payload);
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
          <Text style={styles.headerTitle}>{isEditing ? 'Edit Rental' : 'List a Rental'}</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <PhotoPicker photos={photos} onChange={setPhotos} max={8} />

          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholderTextColor="#888"
            placeholder="e.g. Big Bear cabin with hot tub"
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            placeholderTextColor="#888"
            placeholder="e.g. Big Bear Lake, CA"
            value={location}
            onChangeText={setLocation}
          />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Nightly rate</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor="#888"
                placeholder="e.g. 250"
                value={rate}
                onChangeText={setRate}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.label}>Max guests</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor="#888"
                placeholder="e.g. 6"
                value={guests}
                onChangeText={setGuests}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <Text style={styles.label}>Who is the host?</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggle, hostIsMe && styles.toggleActive]}
              onPress={() => setHostIsMe(true)}
            >
              <Text style={[styles.toggleText, hostIsMe && styles.toggleTextActive]}>I'm the host</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggle, !hostIsMe && styles.toggleActive]}
              onPress={() => setHostIsMe(false)}
            >
              <Text style={[styles.toggleText, !hostIsMe && styles.toggleTextActive]}>Someone else</Text>
            </TouchableOpacity>
          </View>

          {!hostIsMe && (
            <>
              <Text style={styles.label}>Host's name</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor="#888"
                placeholder="e.g. Mike Johnson"
                value={hostName}
                onChangeText={setHostName}
                autoCapitalize="words"
              />
            </>
          )}

          <Text style={styles.label}>Booking contact (optional)</Text>
          <TextInput
            style={styles.input}
            placeholderTextColor="#888"
            placeholder="Phone or email for booking"
            value={hostContact}
            onChangeText={setHostContact}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholderTextColor="#888"
            placeholder="Bedrooms, amenities, minimum stay, firefighter discount, how to book"
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
              <Text style={styles.buttonText}>{isEditing ? 'Save Changes' : 'Post Rental'}</Text>
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
  row: { flexDirection: 'row' },
  toggleRow: { flexDirection: 'row', marginBottom: 8 },
  toggle: {
    flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', marginRight: 8,
  },
  toggleActive: { backgroundColor: FIRE_RED, borderColor: FIRE_RED },
  toggleText: { fontSize: 15, color: '#333' },
  toggleTextActive: { color: '#fff', fontWeight: '600' },
  textArea: { height: 130, textAlignVertical: 'top' },
  button: { backgroundColor: FIRE_RED, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});