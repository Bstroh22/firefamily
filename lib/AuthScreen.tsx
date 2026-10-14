import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './auth';
import { RANKS } from './ranks';
import { supabase } from './supabase';

const FIRE_RED = '#C8102E';
const BLOCKED_EMAIL_DOMAINS = ['ocfa.org'];

export default function AuthScreen() {
  const { refreshProfile } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [station, setStation] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [rank, setRank] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      Alert.alert('Missing info', 'Enter your email and password.');
      return;
    }

    if (mode === 'signUp') {
      if (!firstName.trim() || !lastName.trim() || !station.trim() || !employeeId.trim()) {
        Alert.alert('Missing info', 'Fill in your first name, last name, station, and employee ID.');
        return;
      }
      if (!rank) {
        Alert.alert('Choose your position', 'Select your current position.');
        return;
      }
      if (BLOCKED_EMAIL_DOMAINS.some((d) => cleanEmail.endsWith('@' + d))) {
        Alert.alert('Use a personal email', 'Please sign up with your personal email, not your OCFA work email.');
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { full_name: `${firstName.trim()} ${lastName.trim()}` },
          },
        });
        if (error) throw error;
        if (data.user) {
          const { error: profileError } = await supabase
            .from('profiles')
            .update({ station: station.trim(), employee_id: employeeId.trim(), requested_rank: rank })
            .eq('id', data.user.id);
          if (profileError) throw profileError;
          await refreshProfile();
        }
      }
    } catch (e: any) {
      Alert.alert('Something went wrong', e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.logo}>🔥 FireFamily</Text>
          <Text style={styles.tagline}>The verified OCFA marketplace & community</Text>

          {mode === 'signUp' && (
            <>
              <TextInput style={styles.input} placeholderTextColor="#888" placeholder="First name" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
              <TextInput style={styles.input} placeholderTextColor="#888" placeholder="Last name" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
              <TextInput style={styles.input} placeholderTextColor="#888" placeholder="Station (e.g. Station 21)" value={station} onChangeText={setStation} />
              <TextInput style={styles.input} placeholderTextColor="#888" placeholder="OCFA employee ID" value={employeeId} onChangeText={setEmployeeId} autoCapitalize="none" />

              <Text style={styles.label}>Current position</Text>
              <View style={styles.chips}>
                {RANKS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.chip, rank === r && styles.chipActive]}
                    onPress={() => setRank(r)}
                  >
                    <Text style={[styles.chipText, rank === r && styles.chipTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <TextInput
            style={styles.input}
            placeholderTextColor="#888"
            placeholder={mode === 'signUp' ? 'Personal email' : 'Email'}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          {mode === 'signUp' && (
            <Text style={styles.hint}>Use your personal email, not your OCFA work email.</Text>
          )}

          <TextInput
            style={styles.input}
            placeholderTextColor="#888"
            placeholder="Password (6+ characters)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{mode === 'signIn' ? 'Sign In' : 'Create Account'}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
            <Text style={styles.switchText}>
              {mode === 'signIn' ? 'New here? Create an account' : 'Already have an account? Sign in'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { fontSize: 36, fontWeight: 'bold', color: FIRE_RED, textAlign: 'center' },
  tagline: { fontSize: 15, color: '#555', textAlign: 'center', marginTop: 6, marginBottom: 32 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 4, marginLeft: 4 },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 10,
    padding: 14, fontSize: 16, marginBottom: 12, backgroundColor: '#fafafa', color: '#111',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  chip: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 20,
    paddingVertical: 9, paddingHorizontal: 16, marginRight: 8, marginBottom: 8,
  },
  chipActive: { backgroundColor: FIRE_RED, borderColor: FIRE_RED },
  chipText: { color: '#333', fontSize: 15 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  hint: { fontSize: 13, color: '#777', marginTop: -6, marginBottom: 12, marginLeft: 4 },
  button: { backgroundColor: FIRE_RED, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  switchText: { color: FIRE_RED, textAlign: 'center', marginTop: 20, fontSize: 15 },
});