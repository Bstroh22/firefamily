import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text, TextInput, TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from './supabase';

const FIRE_RED = '#C8102E';

export type ReportKind = 'listing' | 'rental' | 'forum_message' | 'direct_message' | 'contractor';

const REASONS = [
  'Spam or scam',
  'Offensive or inappropriate',
  'Harassment',
  'Fake account / not a firefighter',
  'Other',
];

const KIND_LABEL: Record<ReportKind, string> = {
  listing: 'listing',
  rental: 'rental',
  forum_message: 'message',
  direct_message: 'message', contractor: 'contractor',
};

type ModalProps = {
  kind: ReportKind;
  targetId: string | null;
  onClose: () => void;
};

export function ReportModal({ kind, targetId, onClose }: ModalProps) {
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  if (!targetId) return null;

  function close() {
    setReason(null);
    setDetails('');
    onClose();
  }

  async function submit() {
    if (!reason) {
      Alert.alert('Choose a reason', 'Select why you are reporting this.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('submit_report', {
      p_kind: kind,
      p_target: targetId,
      p_reason: reason,
      p_details: details.trim() || null,
    });
    setBusy(false);
    if (error) {
      Alert.alert('Could not send report', error.message);
      return;
    }
    close();
    Alert.alert('Report sent', 'Thank you. An admin will review it.');
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Report this {KIND_LABEL[kind]}</Text>
          <Text style={styles.subtitle}>Only admins will see your report.</Text>

          {REASONS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.reason, reason === r && styles.reasonActive]}
              onPress={() => setReason(r)}
            >
              <Text style={[styles.reasonText, reason === r && styles.reasonTextActive]}>{r}</Text>
            </TouchableOpacity>
          ))}

          <TextInput
            style={styles.input}
            placeholder="Details (optional)"
            placeholderTextColor="#888"
            value={details}
            onChangeText={setDetails}
            multiline
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.button, styles.cancel]} onPress={close} disabled={busy}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.submit]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Send Report</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Small "⚑ Report" link for detail pages
export default function ReportButton({ kind, targetId }: { kind: ReportKind; targetId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} style={styles.link}>
        <Text style={styles.linkText}>⚑ Report this {KIND_LABEL[kind]}</Text>
      </TouchableOpacity>
      <ReportModal kind={kind} targetId={open ? targetId : null} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#111' },
  subtitle: { fontSize: 13, color: '#777', marginTop: 4, marginBottom: 14 },
  reason: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, marginBottom: 8 },
  reasonActive: { borderColor: FIRE_RED, backgroundColor: '#fdecee' },
  reasonText: { fontSize: 15, color: '#333' },
  reasonTextActive: { color: FIRE_RED, fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, minHeight: 70,
    fontSize: 15, color: '#111', backgroundColor: '#fafafa', marginTop: 4, textAlignVertical: 'top',
  },
  buttonRow: { flexDirection: 'row', marginTop: 16 },
  button: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  cancel: { borderWidth: 1, borderColor: '#bbb', marginRight: 8 },
  cancelText: { color: '#333', fontSize: 16, fontWeight: '600' },
  submit: { backgroundColor: FIRE_RED, marginLeft: 8 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  link: { alignSelf: 'center', marginTop: 18, padding: 6 },
  linkText: { color: '#999', fontSize: 14 },
});