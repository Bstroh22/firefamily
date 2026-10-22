import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import PhotoPicker, { LocalPhoto, toPhotoList, uploadPhotos } from './PhotoPicker';
import { RENTAL_TYPES, type RatePeriod, type Rental, type RentalType } from './RentalDetailModal';
import { supabase } from './supabase';

const FIRE_RED = '#C8102E';

type Props = {
  visible: boolean;
  existing?: Rental | null;
  defaultType?: RentalType;
  onClose: () => void;
  onCreated: () => void;
};

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <View style={styles.toggleRow}>
      {[
        { label: 'Yes', v: true },
        { label: 'No', v: false },
      ].map((o) => (
        <TouchableOpacity
          key={o.label}
          style={[styles.toggle, value === o.v && styles.toggleActive]}
          onPress={() => onChange(value === o.v ? null : o.v)}
        >
          <Text style={[styles.toggleText, value === o.v && styles.toggleTextActive]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function NewRentalModal({ visible, existing, defaultType = 'vacation', onClose, onCreated }: Props) {
  const [type, setType] = useState<RentalType>('vacation');
  const [period, setPeriod] = useState<RatePeriod>('night');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [rate, setRate] = useState('');
  const [guests, setGuests] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [furnished, setFurnished] = useState<boolean | null>(null);
  const [petsOk, setPetsOk] = useState<boolean | null>(null);
  const [roomOnly, setRoomOnly] = useState(false);
  const [description, setDescription] = useState('');
  const [hostIsMe, setHostIsMe] = useState(true);
  const [hostName, setHostName] = useState('');
  const [hostContact, setHostContact] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [busy, setBusy] = useState(false);

  const isEditing = !!existing;
  const isVacation = type === 'vacation';

  useEffect(() => {
    if (!visible) return;
    if (existing) {
      setType(existing.rental_type ?? 'vacation');
      setPeriod(existing.rate_period ?? 'night');
      setTitle(existing.title);
      setLocation(existing.location ?? '');
      setRate(existing.nightly_rate === null ? '' : String(existing.nightly_rate));
      setGuests(existing.max_guests === null ? '' : String(existing.max_guests));
      setBedrooms(existing.bedrooms === null || existing.bedrooms === undefined ? '' : String(existing.bedrooms));
      setFurnished(existing.furnished ?? null);
      setPetsOk(existing.pets_ok ?? null);
      setRoomOnly(!!existing.room_only);
      setDescription(existing.description ?? '');
      setHostIsMe(!existing.host_name);
      setHostName(existing.host_name ?? '');
      setHostContact(existing.host_contact ?? '');
      setPhotos(toPhotoList(existing.photo_urls));
    } else {
      setType(defaultType);
      setPeriod(defaultType === 'vacation' ? 'night' : 'month');
      setTitle('');
      setLocation('');
      setRate('');
      setGuests('');
      setBedrooms('');
      setFurnished(null);
      setPetsOk(null);
      setRoomOnly(false);
      setDescription('');
      setHostIsMe(true);
      setHostName('');
      setHostContact('');
      setPhotos([]);
    }
  }, [visible, existing, defaultType]);

  function switchType(next: RentalType) {
    setType(next);
    setPeriod(next === 'vacation' ? 'night' : 'month');
  }

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
      Alert.alert('Check the rate', 'Enter a number like 250, or leave it blank.');
      return;
    }

    const guestsNumber = guests.trim() === '' ? null : parseInt(guests, 10);
    if (isVacation && guestsNumber !== null && (isNaN(guestsNumber) || guestsNumber < 1)) {
      Alert.alert('Check max guests', 'Enter a whole number like 6, or leave it blank.');
      return;
    }

    const bedsNumber = bedrooms.trim() === '' ? null : parseInt(bedrooms, 10);
    if (!isVacation && !roomOnly && bedsNumber !== null && (isNaN(bedsNumber) || bedsNumber < 0)) {
      Alert.alert('Check bedrooms', 'Enter a whole number (0 for a studio), or leave it blank.');
      return;
    }

    setBusy(true);
    try {
      const photoUrls = await uploadPhotos(photos, 'rentals');

      const payload = {
        rental_type: type,
        rate_period: period,
        title: title.trim(),
        location: location.trim(),
        nightly_rate: rateNumber,
        max_guests: isVacation ? guestsNumber : null,
        bedrooms: isVacation || roomOnly ? null : bedsNumber,
        furnished: isVacation ? null : furnished,
        pets_ok: isVacation ? null : petsOk,
        room_only: isVacation ? false : roomOnly,
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

  const titlePlaceholder =
    type === 'vacation'
      ? 'e.g. Big Bear cabin with hot tub'
      : type === 'short'
      ? 'e.g. Furnished 2 bd condo, 3-month minimum'
      : 'e.g. 3 bd house for lease in Mission Viejo';

  const rateLabel = type === 'vacation' ? 'Nightly rate' : type === 'long' ? 'Monthly rent' : 'Rate';

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
          <Text style={styles.label}>Type of rental</Text>
          <View style={styles.segment}>
            {RENTAL_TYPES.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.segmentItem, type === t.key && styles.segmentActive]}
                onPress={() => switchType(t.key)}
              >
                <Text style={[styles.segmentText, type === t.key && styles.segmentTextActive]}>
                  {t.icon} {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>
            {type === 'vacation'
              ? 'Nightly or weekend getaways.'
              : type === 'short'
              ? 'Furnished stays of about 1–6 months: between homes, relocating, a remodel.'
              : 'Leases of 6+ months, rooms for rent, roommates.'}
          </Text>

          <PhotoPicker photos={photos} onChange={setPhotos} max={8} />

          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholderTextColor="#888"
            placeholder={titlePlaceholder}
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            placeholderTextColor="#888"
            placeholder="City and state, or full address (e.g. Big Bear Lake, CA)"
            value={location}
            onChangeText={setLocation}
          />

          {type === 'short' ? (
            <>
              <Text style={styles.label}>Priced per</Text>
              <View style={styles.toggleRow}>
                {(['week', 'month'] as RatePeriod[]).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.toggle, period === p && styles.toggleActive]}
                    onPress={() => setPeriod(p)}
                  >
                    <Text style={[styles.toggleText, period === p && styles.toggleTextActive]}>
                      {p === 'week' ? 'Week' : 'Month'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>{rateLabel}</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor="#888"
                placeholder={type === 'vacation' ? 'e.g. 250' : 'e.g. 2800'}
                value={rate}
                onChangeText={setRate}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              {isVacation ? (
                <>
                  <Text style={styles.label}>Max guests</Text>
                  <TextInput
                    style={styles.input}
                    placeholderTextColor="#888"
                    placeholder="e.g. 6"
                    value={guests}
                    onChangeText={setGuests}
                    keyboardType="number-pad"
                  />
                </>
              ) : !roomOnly ? (
                <>
                  <Text style={styles.label}>Bedrooms</Text>
                  <TextInput
                    style={styles.input}
                    placeholderTextColor="#888"
                    placeholder="0 = studio"
                    value={bedrooms}
                    onChangeText={setBedrooms}
                    keyboardType="number-pad"
                  />
                </>
              ) : null}
            </View>
          </View>

          {!isVacation ? (
            <>
              <Text style={styles.label}>What's for rent?</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggle, !roomOnly && styles.toggleActive]}
                  onPress={() => setRoomOnly(false)}
                >
                  <Text style={[styles.toggleText, !roomOnly && styles.toggleTextActive]}>Whole place</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggle, roomOnly && styles.toggleActive]}
                  onPress={() => setRoomOnly(true)}
                >
                  <Text style={[styles.toggleText, roomOnly && styles.toggleTextActive]}>Room for rent</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Furnished?</Text>
              <YesNo value={furnished} onChange={setFurnished} />

              <Text style={styles.label}>Pets OK?</Text>
              <YesNo value={petsOk} onChange={setPetsOk} />
            </>
          ) : null}

          <Text style={styles.label}>{isVacation ? 'Who is the host?' : 'Who is the landlord / host?'}</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggle, hostIsMe && styles.toggleActive]}
              onPress={() => setHostIsMe(true)}
            >
              <Text style={[styles.toggleText, hostIsMe && styles.toggleTextActive]}>It's me</Text>
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
              <Text style={styles.label}>Their name</Text>
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

          <Text style={styles.label}>Contact (optional)</Text>
          <TextInput
            style={styles.input}
            placeholderTextColor="#888"
            placeholder="Phone or email"
            value={hostContact}
            onChangeText={setHostContact}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholderTextColor="#888"
            placeholder={
              isVacation
                ? 'Bedrooms, amenities, minimum stay, firefighter discount, how to book'
                : 'Available date, lease length, utilities, parking, deposit, firefighter discount'
            }
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
  hint: { fontSize: 12, color: '#888', marginBottom: 10, lineHeight: 17 },
  segment: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 12, padding: 4, marginBottom: 6 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  segmentActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  segmentText: { fontSize: 13, color: '#666', fontWeight: '600' },
  segmentTextActive: { color: FIRE_RED },
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