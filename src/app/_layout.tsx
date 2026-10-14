import { Tabs } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { AdminCountProvider, useAdminCount } from '../../lib/admin';
import { AuthProvider, useAuth } from '../../lib/auth';
import AuthScreen from '../../lib/AuthScreen';
import { UnreadMessagesProvider, useUnreadMessages } from '../../lib/messages';
import PendingScreen from '../../lib/PendingScreen';
import { supabase } from '../../lib/supabase';

const FIRE_RED = '#C8102E';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
}

function MainTabs({ isAdmin }: { isAdmin: boolean }) {
  const { count: adminCount } = useAdminCount();
  const { count: unreadCount } = useUnreadMessages();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: FIRE_RED },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        tabBarActiveTintColor: FIRE_RED,
        tabBarInactiveTintColor: '#888',
        headerLeft: () => (
          <Text
            onPress={() => supabase.auth.signOut()}
            style={{ color: '#fff', marginLeft: 16, fontWeight: '600' }}
          >
            Sign out
          </Text>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Marketplace',
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
        name="forums"
        options={{
          title: 'Forums',
          tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarIcon: ({ focused }) => <TabIcon emoji="✉️" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          href: isAdmin ? undefined : null,
          tabBarBadge: isAdmin && adminCount > 0 ? adminCount : undefined,
          tabBarIcon: ({ focused }) => <TabIcon emoji="🛡️" focused={focused} />,
        }}
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
  if (!profile || profile.verification_status !== 'approved') return <PendingScreen />;

  return (
    <AdminCountProvider enabled={!!profile.is_admin}>
      <UnreadMessagesProvider>
        <MainTabs isAdmin={!!profile.is_admin} />
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