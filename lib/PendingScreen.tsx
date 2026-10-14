import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './auth';
import { supabase } from './supabase';

const FIRE_RED = '#C8102E';

export default function PendingScreen() {
  const { profile, refreshProfile } = useAuth();
  const rejected = profile?.verification_status === 'rejected';

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.emoji}>{rejected ? '⛔' : '⏳'}</Text>
      <Text style={styles.title}>{rejected ? 'Verification not approved' : 'Verification pending'}</Text>
      <Text style={styles.body}>
        {rejected
          ? 'We could not verify your OCFA employment. Contact the FireFamily admin if you think this is a mistake.'
          : `Thanks${profile?.full_name ? ', ' + profile.full_name : ''}! An admin is confirming that you're an OCFA employee. You'll get full access as soon as you're approved.`}
      </Text>

      <TouchableOpacity style={styles.button} onPress={refreshProfile}>
        <Text style={styles.buttonText}>Check again</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => supabase.auth.signOut()}>
        <Text style={styles.link}>Sign out</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 26, fontWeight: 'bold', color: FIRE_RED, marginBottom: 12, textAlign: 'center' },
  body: { fontSize: 16, color: '#555', textAlign: 'center', lineHeight: 23, marginBottom: 32 },
  button: { backgroundColor: FIRE_RED, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 40 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  link: { color: FIRE_RED, marginTop: 20, fontSize: 15 },
});