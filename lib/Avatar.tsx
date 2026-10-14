import * as ImagePicker from 'expo-image-picker';
import { Alert, Image, Text, View } from 'react-native';
import { supabase } from './supabase';

const FIRE_RED = '#C8102E';

export function initials(name: string | null | undefined) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

type AvatarProps = {
  uri?: string | null;
  name?: string | null;
  size?: number;
};

export default function Avatar({ uri, name, size = 36 }: AvatarProps) {
  const shape = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={[shape, { backgroundColor: '#eee' }]} />;
  }
  return (
    <View style={[shape, { backgroundColor: '#fdecee', alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: FIRE_RED, fontWeight: 'bold', fontSize: size * 0.38 }}>{initials(name)}</Text>
    </View>
  );
}

// Ask whether to take a selfie or choose from the library
export function askPhotoSource(onPick: (source: 'camera' | 'library') => void) {
  Alert.alert('Profile photo', 'Use a clear photo of your face so members know who you are.', [
    { text: 'Take Photo', onPress: () => onPick('camera') },
    { text: 'Choose from Library', onPress: () => onPick('library') },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

// Pick a square photo, upload it, and save it to the profile. Returns the new URL (or null if cancelled).
export async function chooseAndUploadAvatar(source: 'camera' | 'library'): Promise<string | null> {
  let result: ImagePicker.ImagePickerResult;

  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera access needed', 'Allow camera access in your phone settings to take a photo.');
      return null;
    }
    result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      cameraType: ImagePicker.CameraType.front,
    });
  } else {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
  }

  if (result.canceled) return null;

  const asset = result.assets[0];
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('You are signed out. Please sign in again.');

  const mimeType = asset.mimeType ?? 'image/jpeg';
  const ext = (mimeType.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
  const path = `${userId}/${Date.now()}.${ext}`;
  const fileData = await fetch(asset.uri).then((res) => res.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, fileData, { contentType: mimeType });
  if (uploadError) throw uploadError;

  const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;

  const { error: saveError } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId);
  if (saveError) throw saveError;

  return url;
}