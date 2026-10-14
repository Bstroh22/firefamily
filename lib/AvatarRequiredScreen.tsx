import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './auth';
import { chooseAndUploadAvatar } from './Avatar';
import { supabase } from './supabase';

const FIRE_RED = '#C8102E';

export default function AvatarRequiredScreen() {
  const { profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handle(source: 'camera' | 'library') {
    setBusy(true);
    try {
      const url = await chooseAndUploadAvatar(source);
      if (url) await refreshProfile();
    } catch (e: any) {
      Alert.alert('Could not save photo', e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.circle}>
        <Text style={{ fontSize: 56 }}>📷</Text>
      </View>
      <Text style={styles.title}>Add your profile photo</Text>
      <Text style={styles.body}>
        {profile?.full_name ? `${profile.full_name.split(' ')[0]}, every` : 'Every'} member needs a clear photo of their
        face so everyone knows who they're talking to and buying from.
      </Text>

      {busy ? (
        <ActivityIndicator size="large" color={FIRE_RED} style={{ marginTop: 24 }} />
      ) : (
        <>
          <TouchableOpacity style={styles.primary} onPress={() => handle('camera')}>
            <Text style={styles.primaryText}>Take a Selfie</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={() => handle('library')}>
            <Text style={styles.secondaryText}>Choose from Library</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity onPress={() => supabase.auth.signOut()} style={{ marginTop: 28 }}>
        <Text style={styles.link}>Sign out</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#fff' },
  circle: {
    width: 140, height: 140, borderRadius: 70, backgroundColor: '#fdecee',
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  title: { fontSize: 26, fontWeight: 'bold', color: FIRE_RED, textAlign: 'center' },
  body: { fontSize: 16, color: '#555', textAlign: 'center', lineHeight: 23, marginTop: 10, marginBottom: 28 },
  primary: { backgroundColor: FIRE_RED, borderRadius: 10, paddingVertical: 15, alignSelf: 'stretch', alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  secondary: {
    borderWidth: 1, borderColor: FIRE_RED, borderRadius: 10, paddingVertical: 15,
    alignSelf: 'stretch', alignItems: 'center', marginTop: 12,
  },
  secondaryText: { color: FIRE_RED, fontSize: 17, fontWeight: 'bold' },
  link: { color: FIRE_RED, fontSize: 15 },
});