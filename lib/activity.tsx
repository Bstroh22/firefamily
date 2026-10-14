import { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { supabase } from './supabase';

const HEARTBEAT_MS = 60000;      // app-wide check-in once a minute
const ACTIVE_WINDOW_MIN = 5;     // "active" = seen in the last 5 minutes
const CHANNEL_TICK_MS = 20000;   // in-channel check-in every 20 seconds

async function checkIn() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  await supabase.rpc('touch_last_seen');
}

// Keeps this member marked as active while the app is open
export function useHeartbeat() {
  useEffect(() => {
    checkIn();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') checkIn();
    }, HEARTBEAT_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkIn();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
}

// "🟢 X members active now" (channel list)
export function ActiveNow() {
  const [count, setCount] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase.rpc('active_member_count', { minutes: ACTIVE_WINDOW_MIN });
      if (cancelled) return;
      if (error) {
        setProblem(error.message);
      } else if (typeof data === 'number') {
        setProblem(null);
        setCount(data);
      }
    }
    load();
    const timer = setInterval(load, HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (problem) {
    return <Text style={styles.problem}>Activity unavailable: {problem}</Text>;
  }
  if (count === null) return null;

  return (
    <View style={styles.pill}>
      <View style={styles.dot} />
      <Text style={styles.pillText}>
        {count} {count === 1 ? 'member' : 'members'} active now
      </Text>
    </View>
  );
}

// "🟢 X here now" (inside a channel)
export function ChannelHere({ channelId }: { channelId: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      await supabase.rpc('touch_channel', { ch: channelId });
      const { data, error } = await supabase.rpc('channel_active_count', { ch: channelId });
      if (!cancelled && !error && typeof data === 'number') setCount(data);
    }

    tick();
    const timer = setInterval(tick, CHANNEL_TICK_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      supabase.rpc('leave_channel').then(() => {});
    };
  }, [channelId]);

  if (count === null) return null;

  return (
    <View style={styles.hereRow}>
      <View style={styles.dotSmall} />
      <Text style={styles.hereText}>{count} here now</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    backgroundColor: '#e8f6ee', borderRadius: 20,
    paddingVertical: 6, paddingHorizontal: 12, marginBottom: 12, marginLeft: 4,
  },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#1f8a4c', marginRight: 8 },
  pillText: { fontSize: 14, color: '#1f6b3d', fontWeight: '600' },
  problem: { fontSize: 12, color: '#999', marginBottom: 10, marginLeft: 4 },
  hereRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  dotSmall: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#1f8a4c', marginRight: 5 },
  hereText: { fontSize: 12, color: '#1f6b3d', fontWeight: '600' },
});