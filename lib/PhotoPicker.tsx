import * as ImagePicker from 'expo-image-picker';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from './supabase';

const PHOTO_BUCKET = 'listing-photos';

// remote = already uploaded (an existing photo when editing)
export type LocalPhoto = { uri: string; mimeType: string; remote?: boolean };

export function toPhotoList(urls: string[] | null | undefined): LocalPhoto[] {
  return (urls ?? []).map((url) => ({ uri: url, mimeType: 'image/jpeg', remote: true }));
}

export async function uploadPhotos(photos: LocalPhoto[], folder: string): Promise<string[]> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error('You are signed out. Please sign in again.');

  const urls: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];

    if (photo.remote) {
      urls.push(photo.uri);
      continue;
    }

    const ext = (photo.mimeType.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
    const path = `${userId}/${folder}/${Date.now()}-${i}.${ext}`;
    const fileData = await fetch(photo.uri).then((res) => res.arrayBuffer());

    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, fileData, { contentType: photo.mimeType });
    if (error) throw error;

    urls.push(supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl);
  }
  return urls;
}

type Props = {
  photos: LocalPhoto[];
  onChange: (photos: LocalPhoto[]) => void;
  max?: number;
};

export default function PhotoPicker({ photos, onChange, max = 5 }: Props) {
  async function pickFromLibrary() {
    const remaining = max - photos.length;
    if (remaining <= 0) {
      Alert.alert('Photo limit', `You can add up to ${max} photos.`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.6,
    });
    if (!result.canceled) {
      const picked = result.assets.map((a) => ({ uri: a.uri, mimeType: a.mimeType ?? 'image/jpeg' }));
      onChange([...photos, ...picked].slice(0, max));
    }
  }

  async function takePhoto() {
    if (photos.length >= max) {
      Alert.alert('Photo limit', `You can add up to ${max} photos.`);
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera access needed', 'Allow camera access in your phone settings to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled) {
      const a = result.assets[0];
      onChange([...photos, { uri: a.uri, mimeType: a.mimeType ?? 'image/jpeg' }]);
    }
  }

  return (
    <View>
      <Text style={styles.label}>Photos ({photos.length}/{max})</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        {photos.map((p) => (
          <View key={p.uri} style={styles.thumbWrap}>
            <Image source={{ uri: p.uri }} style={styles.thumb} />
            <TouchableOpacity
              style={styles.removeBadge}
              onPress={() => onChange(photos.filter((x) => x.uri !== p.uri))}
            >
              <Text style={styles.removeText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
        {photos.length < max && (
          <>
            <TouchableOpacity style={styles.addPhoto} onPress={pickFromLibrary}>
              <Text style={styles.addPhotoIcon}>🖼️</Text>
              <Text style={styles.addPhotoText}>Library</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addPhoto} onPress={takePhoto}>
              <Text style={styles.addPhotoIcon}>📷</Text>
              <Text style={styles.addPhotoText}>Camera</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6, marginTop: 8 },
  thumbWrap: { marginRight: 10, marginTop: 6 },
  thumb: { width: 90, height: 90, borderRadius: 10, backgroundColor: '#eee' },
  removeBadge: {
    position: 'absolute', top: -6, right: -6, backgroundColor: '#000',
    width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  removeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  addPhoto: {
    width: 90, height: 90, borderRadius: 10, borderWidth: 1, borderColor: '#ccc',
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
    marginRight: 10, marginTop: 6, backgroundColor: '#fafafa',
  },
  addPhotoIcon: { fontSize: 26 },
  addPhotoText: { fontSize: 12, color: '#555', marginTop: 4 },
});