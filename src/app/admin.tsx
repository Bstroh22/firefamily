import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { fetchPending, PendingMember, useAdminCount } from '../../lib/admin';
import { useAuth } from '../../lib/auth';
import { timeAgo } from '../../lib/ListingDetailModal';
import { supabase } from '../../lib/supabase';

const FIRE_RED = '#C8102E';
const GREEN = '#1f8a4c';

export default function AdminScreen() {
  const { profile } = useAuth();
  const { refresh: refreshBadge } = useAdminCount();
  const [newMembers, setNewMembers] = useState<PendingMember[]>([]);
  const [rankRequests, setRankRequests] = useState<PendingMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const pending = await fetchPending();
      setNewMembers(pending.newMembers);
      setRankRequests(pending.rankRequests);
    } catch (e: any) {
      Alert.alert('Could not load', e.message);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function reviewMember(member: PendingMember, approve: boolean) {
    setWorkingId(member.id);
    const { error } = await supabase.rpc('admin_review_member', { target: member.id, approve });
    setWorkingId(null);
    if (error) {
      Alert.alert('Could not update', error.message);
      return;
    }
    await load();
    refreshBadge();
  }

  async function reviewRank(member: PendingMember, approve: boolean) {
    setWorkingId(member.id);
    const { error } = await supabase.rpc('admin_review_rank', { target: member.id, approve });
    setWorkingId(null);
    if (error) {
      Alert.alert('Could not update', error.message);
      return;
    }
    await load();
    refreshBadge();
  }

  function confirmReject(member: PendingMember) {
    Alert.alert(
      'Reject member?',
      `${member.full_name ?? 'This person'} will not get access to FireFamily.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => reviewMember(member, false) },
      ]
    );
  }

  if (!profile?.is_admin) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Admins only.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={FIRE_RED} />
      </View>
    );
  }

  const nothingPending = newMembers.length === 0 && rankRequests.length === 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 60, flexGrow: 1 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
            refreshBadge();
          }}
          tintColor={FIRE_RED}
        />
      }
    >
      {nothingPending ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 56 }}>✅</Text>
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptyText}>No new members or position changes waiting.</Text>
        </View>
      ) : null}

      {newMembers.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>New members ({newMembers.length})</Text>
          {newMembers.map((m) => (
            <View key={m.id} style={styles.card}>
              <Text style={styles.name}>{m.full_name ?? 'Unknown'}</Text>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Employee ID</Text>
                <Text style={styles.detailValue}>{m.employee_id ?? '—'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Station</Text>
                <Text style={styles.detailValue}>{m.station ?? '—'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Position</Text>
                <Text style={styles.detailValue}>{m.requested_rank ?? '—'}</Text>
              </View>
              <Text style={styles.meta}>Signed up {timeAgo(m.created_at)}</Text>

              {workingId === m.id ? (
                <ActivityIndicator color={FIRE_RED} style={{ marginTop: 14 }} />
              ) : (
                <View style={styles.buttonRow}>
                  <TouchableOpacity style={[styles.button, styles.approve]} onPress={() => reviewMember(m, true)}>
                    <Text style={styles.buttonText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.button, styles.reject]} onPress={() => confirmReject(m)}>
                    <Text style={styles.rejectText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </>
      )}

      {rankRequests.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Position changes ({rankRequests.length})</Text>
          {rankRequests.map((m) => (
            <View key={m.id} style={styles.card}>
              <Text style={styles.name}>{m.full_name ?? 'Unknown'}</Text>
              <Text style={styles.station}>{m.station ?? ''}</Text>
              <View style={styles.changeRow}>
                <Text style={styles.oldRank}>{m.rank ?? 'None'}</Text>
                <Text style={styles.arrow}>→</Text>
                <Text style={styles.newRank}>{m.requested_rank}</Text>
              </View>

              {workingId === m.id ? (
                <ActivityIndicator color={FIRE_RED} style={{ marginTop: 14 }} />
              ) : (
                <View style={styles.buttonRow}>
                  <TouchableOpacity style={[styles.button, styles.approve]} onPress={() => reviewRank(m, true)}>
                    <Text style={styles.buttonText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.button, styles.reject]} onPress={() => reviewRank(m, false)}>
                    <Text style={styles.rejectText}>Deny</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f4f4' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 22, fontWeight: 'bold', color: GREEN, marginTop: 10 },
  emptyText: { fontSize: 15, color: '#666', marginTop: 4, textAlign: 'center' },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: '#999', textTransform: 'uppercase',
    marginTop: 8, marginBottom: 8, marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  name: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  station: { fontSize: 14, color: '#777', marginTop: 2 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  detailLabel: { fontSize: 14, color: '#777' },
  detailValue: { fontSize: 14, color: '#111', fontWeight: '600' },
  meta: { fontSize: 12, color: '#999', marginTop: 10 },
  changeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  oldRank: { fontSize: 16, color: '#888', textDecorationLine: 'line-through' },
  arrow: { fontSize: 18, color: '#888', marginHorizontal: 10 },
  newRank: { fontSize: 16, color: FIRE_RED, fontWeight: 'bold' },
  buttonRow: { flexDirection: 'row', marginTop: 14 },
  button: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  approve: { backgroundColor: GREEN, marginRight: 8 },
  reject: { borderWidth: 1, borderColor: FIRE_RED, marginLeft: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  rejectText: { color: FIRE_RED, fontSize: 16, fontWeight: 'bold' },
});