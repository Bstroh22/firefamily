import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text, TextInput, TouchableOpacity,
    View,
} from 'react-native';
import { useAuth } from '../../lib/auth';
import { RANKS } from '../../lib/ranks';
import { supabase } from '../../lib/supabase';

const FIRE_RED = '#C8102E';

export default function ProfileScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const [station, setStation] = useState('');
  const [selectedRank, setSelectedRank] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStation(profile?.station ?? '');
    setSelectedRank(profile?.requested_rank ?? profile?.rank ?? null);
  }, [profile]);

  if (!profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={FIRE_RED} />
      </View>
    );
  }

  const hasPendingRequest = !!profile.requested_rank && profile.requested_rank !== profile.rank;

  async function save() {
    if (!profile) return;
    const updates: Record<string, any> = { station: station.trim() || null };

    let requestedChange = false;
    if (selectedRank && selectedRank !== profile.rank) {
      updates.requested_rank = selectedRank;
      requestedChange = selectedRank !== profile.requested_rank;
    } else if (selectedRank === profile.rank && profile.requested_rank) {
      updates.requested_rank = null; // cancels a pending request
    }

    setSaving(true);
    const { error } = await supabase.from('profiles').update(updates).eq('id', profile.id);
    setSaving(false);

    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    await refreshProfile();
    Alert.alert(
      'Saved',
      requestedChange
        ? `Your request to change to ${selectedRank} was sent to an admin. You'll keep your current channels until it's approved.`
        : 'Your profile was updated.'
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
      <View style={styles.card}>
        <Text style={styles.name}>{profile.full_name ?? 'Unknown'}</Text>
        <Text style={styles.sub}>{session?.user.email}</Text>
        {profile.is_admin && <Text style={styles.adminBadge}>ADMIN</Text>}

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Employee ID</Text>
          <Text style={styles.infoValue}>{profile.employee_id ?? '—'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Current position</Text>
          <Text style={styles.infoValue}>{profile.rank ?? 'Not set'}</Text>
        </View>
      </View>

      {hasPendingRequest && (
        <View style={styles.pendingBox}>
          <Text style={styles.pendingText}>
            ⏳ Position change to <Text style={{ fontWeight: 'bold' }}>{profile.requested_rank}</Text> is waiting for admin approval.
          </Text>
        </View>
      )}

      <Text style={styles.label}>Station</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor="#888"
        placeholder="e.g. Station 21"
        value={station}
        onChangeText={setStation}
      />

      <Text style={styles.label}>Position</Text>
      <Text style={styles.helper}>Promoted? Select your new position. An admin will confirm the change.</Text>
      <View style={styles.chips}>
        {RANKS.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.chip, selectedRank === r && styles.chipActive]}
            onPress={() => setSelectedRank(r)}
          >
            <Text style={[styles.chipText, selectedRank === r && styles.chipTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.button} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.signOut} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f4f4' },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  name: { fontSize: 22, fontWeight: 'bold', color: '#111' },
  sub: { fontSize: 14, color: '#777', marginTop: 2 },
  adminBadge: {
    alignSelf: 'flex-start', marginTop: 8, fontSize: 11, fontWeight: 'bold', color: '#fff',
    backgroundColor: FIRE_RED, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden',
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  infoLabel: { fontSize: 15, color: '#777' },
  infoValue: { fontSize: 15, color: '#111', fontWeight: '600' },
  pendingBox: { backgroundColor: '#fff6e0', borderRadius: 10, padding: 12, marginBottom: 16 },
  pendingText: { fontSize: 14, color: '#7a5a00' },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6, marginTop: 8 },
  helper: { fontSize: 13, color: '#777', marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 14,
    fontSize: 16, marginBottom: 8, backgroundColor: '#fff', color: '#111',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  chip: {
    borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff', borderRadius: 20,
    paddingVertical: 9, paddingHorizontal: 16, marginRight: 8, marginBottom: 8,
  },
  chipActive: { backgroundColor: FIRE_RED, borderColor: FIRE_RED },
  chipText: { color: '#333', fontSize: 15 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  button: { backgroundColor: FIRE_RED, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  signOut: { alignItems: 'center', marginTop: 24 },
  signOutText: { color: FIRE_RED, fontSize: 16, fontWeight: '600' },
});