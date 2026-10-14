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
import {
  fetchPending, fetchReports, OpenReport, PendingMember, useAdminCount,
} from '../../lib/admin';
import { useAuth } from '../../lib/auth';
import Avatar from '../../lib/Avatar';
import { timeAgo } from '../../lib/ListingDetailModal';
import { supabase } from '../../lib/supabase';

const FIRE_RED = '#C8102E';
const GREEN = '#1f8a4c';

const KIND_LABEL: Record<OpenReport['target_kind'], string> = {
  listing: '🛒 Marketplace listing',
  rental: '🏡 Rental',
  forum_message: '💬 Forum message',
  direct_message: '✉️ Private message', contractor: '🧰 Contractor',
};

export default function AdminScreen() {
  const { profile } = useAuth();
  const { refresh: refreshBadge } = useAdminCount();
  const [newMembers, setNewMembers] = useState<PendingMember[]>([]);
  const [rankRequests, setRankRequests] = useState<PendingMember[]>([]);
  const [reports, setReports] = useState<OpenReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pending, openReports] = await Promise.all([fetchPending(), fetchReports()]);
      setNewMembers(pending.newMembers);
      setRankRequests(pending.rankRequests);
      setReports(openReports);
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

  async function afterAction() {
    await load();
    refreshBadge();
  }

  async function reviewMember(member: PendingMember, approve: boolean) {
    setWorkingId(member.id);
    const { error } = await supabase.rpc('admin_review_member', { target: member.id, approve });
    setWorkingId(null);
    if (error) {
      Alert.alert('Could not update', error.message);
      return;
    }
    afterAction();
  }

  async function reviewRank(member: PendingMember, approve: boolean) {
    setWorkingId(member.id);
    const { error } = await supabase.rpc('admin_review_rank', { target: member.id, approve });
    setWorkingId(null);
    if (error) {
      Alert.alert('Could not update', error.message);
      return;
    }
    afterAction();
  }

  async function resolveReport(report: OpenReport, remove: boolean) {
    setWorkingId(report.id);
    const { error } = await supabase.rpc('admin_resolve_report', { p_report: report.id, p_remove: remove });
    setWorkingId(null);
    if (error) {
      Alert.alert('Could not update', error.message);
      return;
    }
    afterAction();
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

  function confirmRemove(report: OpenReport) {
    Alert.alert('Remove this content?', 'It will be deleted for everyone. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => resolveReport(report, true) },
    ]);
  }

  function confirmSuspend(report: OpenReport) {
    if (!report.owner_id) return;
    Alert.alert(
      `Suspend ${report.owner_name ?? 'this member'}?`,
      'They will lose access to the app. You can restore them later in Supabase by setting their status back to approved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Suspend',
          style: 'destructive',
          onPress: async () => {
            setWorkingId(report.id);
            const { error } = await supabase.rpc('admin_review_member', { target: report.owner_id, approve: false });
            setWorkingId(null);
            if (error) {
              Alert.alert('Could not suspend', error.message);
              return;
            }
            Alert.alert('Member suspended', 'You can now remove or dismiss the report.');
            afterAction();
          },
        },
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

  const nothingPending = newMembers.length === 0 && rankRequests.length === 0 && reports.length === 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 60, flexGrow: 1 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            afterAction();
          }}
          tintColor={FIRE_RED}
        />
      }
    >
      {nothingPending ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 56 }}>✅</Text>
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptyText}>No new members, position changes, or reports waiting.</Text>
        </View>
      ) : null}

      {reports.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Reports ({reports.length})</Text>
          {reports.map((r) => (
            <View key={r.id} style={[styles.card, styles.reportCard]}>
              <View style={styles.reportTop}>
                <Text style={styles.kind}>{KIND_LABEL[r.target_kind]}</Text>
                {r.report_count > 1 && (
                  <Text style={styles.countBadge}>Reported {r.report_count}×</Text>
                )}
              </View>
              <Text style={styles.reason}>{r.reason}</Text>

              <View style={styles.snapshot}>
                <Text style={styles.snapshotText}>{r.content_snapshot ?? '(no content)'}</Text>
              </View>

              <Text style={styles.meta}>
                Posted by <Text style={styles.metaBold}>{r.owner_name ?? 'Unknown'}</Text>
                {r.owner_station ? ` · ${r.owner_station}` : ''}
              </Text>
              <Text style={styles.meta}>
                Reported by {r.reporter_name ?? 'Unknown'} · {timeAgo(r.created_at)}
              </Text>
              {r.details ? <Text style={styles.details}>"{r.details}"</Text> : null}

              {workingId === r.id ? (
                <ActivityIndicator color={FIRE_RED} style={{ marginTop: 14 }} />
              ) : (
                <>
                  <View style={styles.buttonRow}>
                    <TouchableOpacity style={[styles.button, styles.removeButton]} onPress={() => confirmRemove(r)}>
                      <Text style={styles.buttonText}>Remove</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.button, styles.dismissButton]} onPress={() => resolveReport(r, false)}>
                      <Text style={styles.dismissText}>Dismiss</Text>
                    </TouchableOpacity>
                  </View>
                  {r.owner_id ? (
                    <TouchableOpacity onPress={() => confirmSuspend(r)} style={styles.suspendLink}>
                      <Text style={styles.suspendText}>Suspend {r.owner_name ?? 'member'}</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              )}
            </View>
          ))}
        </>
      )}

      {newMembers.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>New members ({newMembers.length})</Text>
          {newMembers.map((m) => (
            <View key={m.id} style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}><Avatar uri={m.avatar_url} name={m.full_name} size={56} /><Text style={[styles.name, { marginLeft: 12, flex: 1 }]}>{m.full_name ?? 'Unknown'}</Text></View>
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
              <View style={{ flexDirection: 'row', alignItems: 'center' }}><Avatar uri={m.avatar_url} name={m.full_name} size={56} /><Text style={[styles.name, { marginLeft: 12, flex: 1 }]}>{m.full_name ?? 'Unknown'}</Text></View>
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
  reportCard: { borderLeftWidth: 4, borderLeftColor: FIRE_RED },
  reportTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kind: { fontSize: 13, fontWeight: '700', color: '#555' },
  countBadge: {
    fontSize: 11, fontWeight: 'bold', color: '#fff', backgroundColor: FIRE_RED,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden',
  },
  reason: { fontSize: 17, fontWeight: 'bold', color: FIRE_RED, marginTop: 6 },
  snapshot: { backgroundColor: '#f6f6f6', borderRadius: 8, padding: 12, marginTop: 10 },
  snapshotText: { fontSize: 15, color: '#333', lineHeight: 21 },
  details: { fontSize: 14, color: '#555', fontStyle: 'italic', marginTop: 6 },
  name: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  station: { fontSize: 14, color: '#777', marginTop: 2 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  detailLabel: { fontSize: 14, color: '#777' },
  detailValue: { fontSize: 14, color: '#111', fontWeight: '600' },
  meta: { fontSize: 13, color: '#888', marginTop: 8 },
  metaBold: { color: '#333', fontWeight: '600' },
  changeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  oldRank: { fontSize: 16, color: '#888', textDecorationLine: 'line-through' },
  arrow: { fontSize: 18, color: '#888', marginHorizontal: 10 },
  newRank: { fontSize: 16, color: FIRE_RED, fontWeight: 'bold' },
  buttonRow: { flexDirection: 'row', marginTop: 14 },
  button: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  approve: { backgroundColor: GREEN, marginRight: 8 },
  reject: { borderWidth: 1, borderColor: FIRE_RED, marginLeft: 8 },
  removeButton: { backgroundColor: FIRE_RED, marginRight: 8 },
  dismissButton: { borderWidth: 1, borderColor: '#bbb', marginLeft: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  rejectText: { color: FIRE_RED, fontSize: 16, fontWeight: 'bold' },
  dismissText: { color: '#333', fontSize: 16, fontWeight: '600' },
  suspendLink: { alignSelf: 'center', marginTop: 12, padding: 4 },
  suspendText: { color: FIRE_RED, fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
});