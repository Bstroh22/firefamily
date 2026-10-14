import { useState } from 'react';
import {
  ActivityIndicator,
  Alert, Image,
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
const NAVY = '#031D3C';
const BLOCKED_EMAIL_DOMAINS = ['ocfa.org'];

type Mode = 'signIn' | 'signUp' | 'forgot' | 'reset';

export default function AuthScreen() {
  const { refreshProfile } = useAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [station, setStation] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [rank, setRank] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const cleanEmail = email.trim().toLowerCase();

  async function handleSubmit() {
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
        Alert.alert('Use a personal email', 'Please sign up with your personal email, not your department work email.');
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
          options: { data: { full_name: `${firstName.trim()} ${lastName.trim()}` } },
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

  async function sendResetCode() {
    if (!cleanEmail) {
      Alert.alert('Enter your email', 'Type the email you signed up with.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
    setBusy(false);
    if (error) {
      Alert.alert('Could not send code', error.message);
      return;
    }
    setCode('');
    setNewPassword('');
    setMode('reset');
    Alert.alert('Check your email', `If an account exists for ${cleanEmail}, a 6-digit code is on its way.`);
  }

  async function confirmReset() {
    if (code.trim().length < 6) {
      Alert.alert('Enter the code', 'Type the 6-digit code from the email.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: code.trim(),
        type: 'recovery',
      });
      if (verifyError) throw verifyError;
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      Alert.alert('Password updated', "You're signed in with your new password.");
    } catch (e: any) {
      Alert.alert('Could not reset password', e.message);
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === 'forgot' ? 'Reset your password' : mode === 'reset' ? 'Enter your code' : null;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Image source={require('../assets/images/logo-mark.png')} style={styles.logoImage} resizeMode="contain" />
          <Text style={styles.logo}>
            SoCal <Text style={{ color: FIRE_RED }}>Fire</Text>Family
          </Text>
          <Text style={styles.tagline}>
            {title ?? 'The verified SoCal firefighter marketplace & community'}
          </Text>

          {mode === 'signUp' && (
            <>
              <TextInput style={styles.input} placeholderTextColor="#888" placeholder="First name" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
              <TextInput style={styles.input} placeholderTextColor="#888" placeholder="Last name" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
              <TextInput style={styles.input} placeholderTextColor="#888" placeholder="Station (e.g. Station 21)" value={station} onChangeText={setStation} />
              <TextInput style={styles.input} placeholderTextColor="#888" placeholder="Employee ID" value={employeeId} onChangeText={setEmployeeId} autoCapitalize="none" />

              <Text style={styles.label}>Current position</Text>
              <View style={styles.chips}>
                {RANKS.map((r) => (
                  <TouchableOpacity key={r} style={[styles.chip, rank === r && styles.chipActive]} onPress={() => setRank(r)}>
                    <Text style={[styles.chipText, rank === r && styles.chipTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {mode !== 'reset' && (
            <TextInput
              style={styles.input}
              placeholderTextColor="#888"
              placeholder={mode === 'signUp' ? 'Personal email' : 'Email'}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          )}
          {mode === 'signUp' && (
            <Text style={styles.hint}>Use your personal email, not your department work email.</Text>
          )}

          {(mode === 'signIn' || mode === 'signUp') && (
            <>
              <TextInput
                style={styles.input}
                placeholderTextColor="#888"
                placeholder="Password (6+ characters)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
              <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{mode === 'signIn' ? 'Sign In' : 'Create Account'}</Text>}
              </TouchableOpacity>
            </>
          )}

          {mode === 'signIn' && (
            <TouchableOpacity onPress={() => setMode('forgot')} style={{ alignSelf: 'center', marginTop: 16 }}>
              <Text style={styles.forgot}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          {mode === 'forgot' && (
            <>
              <Text style={styles.help}>We'll email you a 6-digit code to reset your password.</Text>
              <TouchableOpacity style={styles.button} onPress={sendResetCode} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send Code</Text>}
              </TouchableOpacity>
            </>
          )}

          {mode === 'reset' && (
            <>
              <Text style={styles.help}>Code sent to {cleanEmail}</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholderTextColor="#888"
                placeholder="6-digit code"
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
              />
              <TextInput
                style={styles.input}
                placeholderTextColor="#888"
                placeholder="New password (6+ characters)"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
              <TouchableOpacity style={styles.button} onPress={confirmReset} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Reset Password</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={sendResetCode} disabled={busy} style={{ alignSelf: 'center', marginTop: 16 }}>
                <Text style={styles.forgot}>Resend code</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
            style={{ alignSelf: 'center' }}
          >
            <Text style={styles.switchText}>
              {mode === 'signIn' ? 'New here? Create an account' : mode === 'signUp' ? 'Already have an account? Sign in' : 'Back to sign in'}
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
  logoImage: { width: 96, height: 96, alignSelf: 'center', marginBottom: 10 },
  logo: { fontSize: 32, fontWeight: 'bold', color: NAVY, textAlign: 'center' },
  tagline: { fontSize: 15, color: '#555', textAlign: 'center', marginTop: 6, marginBottom: 28 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 4, marginLeft: 4 },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 10,
    padding: 14, fontSize: 16, marginBottom: 12, backgroundColor: '#fafafa', color: '#111',
  },
  codeInput: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 20, paddingVertical: 9, paddingHorizontal: 16, marginRight: 8, marginBottom: 8 },
  chipActive: { backgroundColor: FIRE_RED, borderColor: FIRE_RED },
  chipText: { color: '#333', fontSize: 15 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  hint: { fontSize: 13, color: '#777', marginTop: -6, marginBottom: 12, marginLeft: 4 },
  help: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 12 },
  button: { backgroundColor: FIRE_RED, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  forgot: { color: '#555', fontSize: 15, fontWeight: '600' },
  switchText: { color: FIRE_RED, textAlign: 'center', marginTop: 20, fontSize: 15 },
});