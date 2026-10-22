import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

const FIRE_RED = '#C8102E';

type Prefs = { dms: boolean; forums: boolean; listings: boolean; referrals: boolean; admin: boolean };
const DEFAULTS: Prefs = { dms: true, forums: true, listings: true, referrals: false, admin: true };
type Channel = { id: any; name: string; hide_previews?: boolean };

function Row({
  title,
  subtitle,
  value,
  onChange,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: FIRE_RED, false: '#ccc' }} />
    </View>
  );
}

export default function NotificationsScreen() {
  const { session, profile } = useAuth();
  const myId = session?.user.id;
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [canAsk, setCanAsk] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [p, ch, m, perm] = await Promise.all([
      supabase.from('notification_prefs').select('dms, forums, listings, referrals, admin').maybeSingle(),
      supabase.from('forum_channels').select('id, name, hide_previews').order('created_at'),
      supabase.from('channel_mutes').select('channel_id'),
      Notifications.getPermissionsAsync().catch(() => null),
    ]);
    if (p.data) setPrefs(p.data as Prefs);
    setChannels((ch.data ?? []) as Channel[]);
    setMuted(new Set(((m.data ?? []) as any[]).map((r) => String(r.channel_id))));
    setAllowed(perm ? perm.granted : null);
    setCanAsk(perm ? perm.canAskAgain : true);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function setPref(key: keyof Prefs, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    const { error } = await supabase.from('notification_prefs').upsert({ user_id: myId, ...next });
    if (error) {
      Alert.alert('Could not save', error.message);
      load();
    }
  }

  async function setChannelOn(ch: Channel, on: boolean) {
    const id = String(ch.id);
    setMuted((prev) => {
      const next = new Set(prev);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });
    const { error } = on
      ? await supabase.from('channel_mutes').delete().eq('channel_id', ch.id).eq('user_id', myId)
      : await supabase.from('channel_mutes').insert({ channel_id: ch.id });
    if (error) {
      Alert.alert('Could not save', error.message);
      load();
    }
  }

  async function turnOn() {
    if (canAsk) {
      const res = await Notifications.requestPermissionsAsync();
      setAllowed(res.granted);
      setCanAsk(res.canAskAgain);
      if (res.granted) Alert.alert('Notifications on', 'Close and reopen the app to finish setup.');
    } else {
      Linking.openSettings();
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={FIRE_RED} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      {allowed === false ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Notifications are turned off for SoCal FireFamily on this phone.</Text>
          <TouchableOpacity style={styles.bannerButton} onPress={turnOn}>
            <Text style={styles.bannerButtonText}>{canAsk ? 'Turn on notifications' : 'Open iPhone Settings'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={styles.section}>Notify me about</Text>
      <View style={styles.card}>
        <Row title="Direct messages" subtitle="Someone messages you" value={prefs.dms} onChange={(v) => setPref('dms', v)} />
        <Row title="Forum posts" subtitle="New conversations in your channels" value={prefs.forums} onChange={(v) => setPref('forums', v)} />
        <Row title="New listings & rentals" subtitle="Marketplace items and vacation rentals" value={prefs.listings} onChange={(v) => setPref('listings', v)} />
        <Row title="New referrals" subtitle="Contractors and doctors added" value={prefs.referrals} onChange={(v) => setPref('referrals', v)} />
      </View>

      {profile?.is_admin ? (
        <>
          <Text style={styles.section}>Admin</Text>
          <View style={styles.card}>
            <Row
              title="Admin alerts"
              subtitle="New members, position requests, reports"
              value={prefs.admin}
              onChange={(v) => setPref('admin', v)}
            />
          </View>
        </>
      ) : null}

      <Text style={styles.section}>Forum channels</Text>
      {prefs.forums ? (
        <View style={styles.card}>
          {channels.map((ch) => (
            <Row
              key={String(ch.id)}
              title={`${muted.has(String(ch.id)) ? '🔕' : '🔔'}  ${ch.name}`}
              subtitle={ch.hide_previews ? '🔒 Lock screen hides message text' : undefined}
              value={!muted.has(String(ch.id))}
              onChange={(v) => setChannelOn(ch, v)}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.note}>Turn on Forum posts to choose channels.</Text>
      )}

      <Text style={styles.note}>
        Your own posts never notify you. Busy channels alert once at the start of a conversation, not for every message.
        Direct messages never show message text on the lock screen.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f4f4' },
  banner: { backgroundColor: '#fdecee', margin: 12, borderRadius: 12, padding: 14 },
  bannerText: { color: '#7a0a1b', fontSize: 15, lineHeight: 21 },
  bannerButton: { backgroundColor: FIRE_RED, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 10 },
  bannerButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  section: { fontSize: 13, fontWeight: '700', color: '#999', marginTop: 20, marginBottom: 8, marginHorizontal: 16, textTransform: 'uppercase' },
  card: { backgroundColor: '#fff', marginHorizontal: 12, borderRadius: 12, overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e5',
  },
  rowTitle: { fontSize: 16, color: '#111', fontWeight: '500' },
  rowSub: { fontSize: 13, color: '#777', marginTop: 2 },
  note: { fontSize: 13, color: '#888', marginHorizontal: 16, marginTop: 14, lineHeight: 19 },
});