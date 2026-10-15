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
import { supabase } from './supabase';

const FIRE_RED = '#C8102E';

export const TRADES = [
  'General Contractor', 'Plumbing', 'Electrical', 'HVAC', 'Roofing', 'Painting', 'Solar',
  'Landscaping', 'Pool', 'Flooring', 'Handyman', 'Pest Control', 'Auto Repair', 'Real Estate', 'Mortgage', 'Insurance', 'Financial / CPA', 'Legal', 'Veterinary', 'Moving', 'Other',
];

export const SPECIALTIES = [
  'Primary Care', 'Orthopedics', 'Sports Medicine', 'Physical Therapy', 'Chiropractic',
  'Dermatology', 'Dental', 'Eye Care', 'Mental Health', 'Cardiology', 'ENT', 'Pediatrics', "Women's Health", 'Podiatry', 'Pain Management', 'Massage', 'Nutrition', 'Urgent Care', 'Other',
];

export type ProCategory = 'home' | 'health';

export type Contractor = {
  id: string;
  name: string;
  trade: string;
  category: ProCategory;
  phone: string | null;
  email: string | null;
  website: string | null;
  service_area: string | null;
  insurance: string | null;
  notes: string | null;
  created_at: string;
  referred_by: string;
  referrer_name: string | null;
  referrer_station: string | null;
  referrer_avatar: string | null;
  rec_count: number;
  i_recommend: boolean;
};

type Props = {
  visible: boolean;
  existing?: Contractor | null;
  defaultCategory: ProCategory;
  onClose: () => void;
  onSaved: () => void;
};

export default function NewContractorModal({ visible, existing, defaultCategory, onClose, onSaved }: Props) {
  const [category, setCategory] = useState<ProCategory>('home');
  const [name, setName] = useState('');
  const [trade, setTrade] = useState('General');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [area, setArea] = useState('');
  const [insurance, setInsurance] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const isEditing = !!existing;
  const isHealth = category === 'health';
  const options = isHealth ? SPECIALTIES : TRADES;

  useEffect(() => {
    if (!visible) return;
    const cat = existing?.category ?? defaultCategory;
    setCategory(cat);
    setName(existing?.name ?? '');
    setTrade(existing?.trade ?? (cat === 'health' ? SPECIALTIES[0] : TRADES[0]));
    setPhone(existing?.phone ?? '');
    setEmail(existing?.email ?? '');
    setWebsite(existing?.website ?? '');
    setArea(existing?.service_area ?? '');
    setInsurance(existing?.insurance ?? '');
    setNotes(existing?.notes ?? '');
  }, [visible, existing, defaultCategory]);

  function switchCategory(next: ProCategory) {
    if (next === category) return;
    setCategory(next);
    setTrade(next === 'health' ? SPECIALTIES[0] : TRADES[0]);
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Missing name', isHealth ? "Enter the doctor's or practice's name." : "Enter the contractor's or company's name.");
      return;
    }
    if (!phone.trim() && !email.trim() && !website.trim()) {
      Alert.alert('Add a way to reach them', 'Enter at least a phone number, email, or website.');
      return;
    }

    const payload = {
      category,
      name: name.trim(),
      trade,
      phone: phone.trim() || null,
      email: email.trim() || null,
      website: website.trim() || null,
      service_area: area.trim() || null,
      insurance: isHealth ? insurance.trim() || null : null,
      notes: notes.trim() || null,
    };

    setBusy(true);
    const { error } = existing
      ? await supabase.from('contractors').update(payload).eq('id', existing.id)
      : await supabase.from('contractors').insert(payload);
    setBusy(false);

    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} disabled={busy} style={{ width: 70 }}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEditing ? 'Edit Recommendation' : 'Recommend a Pro'}</Text>
          <View style={{ width: 70 }} />
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.segment}>
            <TouchableOpacity style={[styles.segmentItem, !isHealth && styles.segmentActive]} onPress={() => switchCategory('home')}>
              <Text style={[styles.segmentText, !isHealth && styles.segmentTextActive]}>🧰 Home & Services</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.segmentItem, isHealth && styles.segmentActive]} onPress={() => switchCategory('health')}>
              <Text style={[styles.segmentText, isHealth && styles.segmentTextActive]}>🩺 Health & Wellness</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>{isHealth ? 'Doctor or practice' : 'Name or company'}</Text>
          <TextInput
            style={styles.input}
            placeholderTextColor="#888"
            placeholder={isHealth ? 'e.g. Dr. Jane Smith, OC Orthopedics' : 'e.g. Smith Plumbing'}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <Text style={styles.label}>{isHealth ? 'Specialty' : 'Trade or service'}</Text>
          <View style={styles.chips}>
            {options.map((t) => (
              <TouchableOpacity key={t} style={[styles.chip, trade === t && styles.chipActive]} onPress={() => setTrade(t)}>
                <Text style={[styles.chipText, trade === t && styles.chipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Phone</Text>
          <TextInput style={styles.input} placeholderTextColor="#888" placeholder="(714) 555-0123" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

          <Text style={styles.label}>Email (optional)</Text>
          <TextInput style={styles.input} placeholderTextColor="#888" placeholder="name@practice.com" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />

          <Text style={styles.label}>Website (optional)</Text>
          <TextInput style={styles.input} placeholderTextColor="#888" placeholder="example.com" value={website} onChangeText={setWebsite} autoCapitalize="none" keyboardType="url" />

          <Text style={styles.label}>{isHealth ? 'Office location (optional)' : 'Service area (optional)'}</Text>
          <TextInput
            style={styles.input}
            placeholderTextColor="#888"
            placeholder={isHealth ? 'e.g. Mission Viejo' : 'e.g. South Orange County'}
            value={area}
            onChangeText={setArea}
          />

          {isHealth && (
            <>
              <Text style={styles.label}>Insurance accepted (optional)</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor="#888"
                placeholder="e.g. Kaiser, Blue Shield, workers' comp"
                value={insurance}
                onChangeText={setInsurance}
              />
            </>
          )}

          <Text style={styles.label}>Your experience</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholderTextColor="#888"
            placeholder={
              isHealth
                ? 'What they treated, how they listened, wait times, would you go back?'
                : 'What they did for you, pricing, timeliness, would you hire them again?'
            }
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          <TouchableOpacity style={styles.button} onPress={handleSave} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{isEditing ? 'Save Changes' : 'Add Recommendation'}</Text>}
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
  cancel: { color: FIRE_RED, fontSize: 16 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  body: { padding: 20, paddingBottom: 80 },
  segment: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 12, padding: 4, marginBottom: 8 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  segmentActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  segmentText: { fontSize: 14, color: '#666', fontWeight: '600' },
  segmentTextActive: { color: FIRE_RED },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 14,
    fontSize: 16, marginBottom: 8, backgroundColor: '#fafafa', color: '#111',
  },
  textArea: { height: 110, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, marginBottom: 8 },
  chipActive: { backgroundColor: FIRE_RED, borderColor: FIRE_RED },
  chipText: { color: '#333', fontSize: 14 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  button: { backgroundColor: FIRE_RED, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});