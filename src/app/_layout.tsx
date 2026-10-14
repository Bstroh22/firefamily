import { Tabs, router } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { AdminCountProvider } from '../../lib/admin';
import { AuthProvider, useAuth } from '../../lib/auth';
import AuthScreen from '../../lib/AuthScreen';
import AvatarRequiredScreen from '../../lib/AvatarRequiredScreen';
import { UnreadMessagesProvider } from '../../lib/messages';
import PendingScreen from '../../lib/PendingScreen';

const FIRE_RED = '#C8102E';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
}

function BackHome() {
  return (
    <Text
      onPress={() => router.navigate('/')}
      style={{ color: '#fff', marginLeft: 16, fontWeight: '600', fontSize: 16 }}
      suppressHighlighting
    >
      ‹ Home
    </Text>
  );
}

function MainTabs() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: FIRE_RED },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        tabBarActiveTintColor: FIRE_RED,
        tabBarInactiveTintColor: '#888',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="marketplace"
        options={{
          title: 'Marketplace',
          tabBarLabel: 'Market',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🛒" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="rentals"
        options={{
          title: 'Rentals',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏡" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="contractors"
        options={{
          title: 'Contractors',
          tabBarLabel: 'Pros',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🧰" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="forums"
        options={{
          title: 'Forums',
          tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{ title: 'Messages', href: null, headerLeft: () => <BackHome /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', href: null, headerLeft: () => <BackHome /> }}
      />
      <Tabs.Screen
        name="admin"
        options={{ title: 'Admin', href: null, headerLeft: () => <BackHome /> }}
      />
    </Tabs>
  );
}

function AppGate() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color={FIRE_RED} />
      </View>
    );
  }

  if (!session) return <AuthScreen />;
  if (profile && !profile.avatar_url) return <AvatarRequiredScreen />;
  if (!profile || profile.verification_status !== 'approved') return <PendingScreen />;

  return (
    <AdminCountProvider enabled={!!profile.is_admin}>
      <UnreadMessagesProvider>
        <MainTabs />
      </UnreadMessagesProvider>
    </AdminCountProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  );
}