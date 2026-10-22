import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { requestOpenChannel } from './openChannel';
import { supabase } from './supabase';

const PROJECT_ID = '62e1fbb6-6394-4e7c-b290-6827fa44bf11';
let currentToken: string | null = null;

// Show notifications even while the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function getToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
  return data;
}

// Asks permission once, saves this phone, and removes it on sign-out
export function usePushRegistration(userId?: string) {
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        currentToken = token;
        await supabase.rpc('register_push_token', { p_token: token });
      } catch {
        // push isn't available here (e.g. Expo Go) — app works normally
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && currentToken) {
        supabase.rpc('unregister_push_token', { p_token: currentToken }).then(
          () => {},
          () => {}
        );
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
}

function routeFor(data: any): string | null {
  switch (data?.type) {
    case 'dm':
      return '/messages';
    case 'forum':
      if (data.channel_id) requestOpenChannel(data.channel_id);
      return '/forums';
    case 'listing':
      return '/marketplace';
    case 'rental':
      return '/rentals';
    case 'referral':
      return '/contractors';
    case 'admin':
      return '/admin';
    default:
      return null;
  }
}

// Tapping a notification opens the right screen
export function useNotificationTaps() {
  useEffect(() => {
    const open = (r: Notifications.NotificationResponse | null) => {
      const path = routeFor(r?.notification.request.content.data);
      if (path) setTimeout(() => router.navigate(path as any), 300);
    };
    Notifications.getLastNotificationResponseAsync()
      .then((r) => {
        open(r);
        (Notifications as any).clearLastNotificationResponseAsync?.();
      })
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}