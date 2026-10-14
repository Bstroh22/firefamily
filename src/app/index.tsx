import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    Image, RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminCount } from '../../lib/admin';
import { useAuth } from '../../lib/auth';
import Avatar from '../../lib/Avatar';
import { formatPrice, timeAgo } from '../../lib/ListingDetailModal';
import { useUnreadMessages } from '../../lib/messages';
import { formatRate } from '../../lib/RentalDetailModal';
import { supabase } from '../../lib/supabase';

const RED = '#C8102E';
const NAVY = '#031D3C';
const ORANGE = '#F7731E';

type HomeListing = {
  id: string;
  title: string;
  price: number | null;
  photo_urls: string[];
  created_at: string;
  seller: { full_name: string | null; station: string | null } | null;
};

type HomePost = {
  id: string;
  body: string;
  created_at: string;
  author: { full_name: string | null; avatar_url: string | null } | null;
  channel: { name: string } | null;
};

type HomeRental = {
  id: string;
  title: string;
  location: string | null;
  nightly_rate: number | null;
  max_guests: number | null;
  photo_urls: string[];
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Good afternoon,';
  return 'Good evening,';
}

function Tile({ icon, label, badge, onPress }: { icon: string; label: string; badge?: number; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress}>
      <View style={styles.tileIcon}>
        <Text style={{ fontSize: 20 }}>{icon}</Text>
      </View>
      <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
      {badge ? (
        <View style={styles.tileBadge}>
          <Text style={styles.tileBadgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function SectionHeader({ title, action, onPress }: { title: string; action: string; onPress: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <TouchableOpacity onPress={onPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.sectionAction}>{action}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { count: unread, refresh: refreshUnread } = useUnreadMessages();
  const { count: adminCount, refresh: refreshAdmin } = useAdminCount();
  const [active, setActive] = useState<number | null>(null);
  const [listings, setListings] = useState<HomeListing[]>([]);
  const [posts, setPosts] = useState<HomePost[]>([]);
  const [rental, setRental] = useState<HomeRental | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [a, l, f, r] = await Promise.all([
      supabase.rpc('active_member_count', { minutes: 5 }),
      supabase
        .from('listings')
        .select('id, title, price, photo_urls, created_at, seller:profiles(full_name, station)')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(6),
      supabase
        .from('forum_messages')
        .select('id, body, created_at, author:profiles(full_name, avatar_url), channel:forum_channels(name)')
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('rentals')
        .select('id, title, location, nightly_rate, max_guests, photo_urls')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);
    if (typeof a.data === 'number') setActive(a.data);
    if (!l.error) setListings((l.data as any) ?? []);
    if (!f.error) setPosts((f.data as any) ?? []);
    if (!r.error) setRental(((r.data as any) ?? [])[0] ?? null);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      refreshUnread();
      refreshAdmin();
    }, [load, refreshUnread, refreshAdmin])
  );

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Firefighter';
  const subtitle = [profile?.rank, profile?.station].filter(Boolean).join(' · ');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); refreshUnread(); refreshAdmin(); }}
          tintColor="#fff"
        />
      }
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}><Image source={require('../../assets/images/logo-mark.png')} style={[styles.watermark, { top: insets.top + 30 }]} resizeMode="contain" />
        <View style={styles.headerTop}><Image source={require('../../assets/images/logo-mark.png')} style={styles.brandMark} resizeMode="contain" />
          <Text style={styles.brand}>
            SoCal <Text style={{ color: RED }}>Fire</Text>Family
          </Text>
          <TouchableOpacity onPress={() => router.push('/profile')} style={styles.avatarRing} accessibilityLabel="Your profile">
            <Avatar uri={profile?.avatar_url} name={profile?.full_name} size={40} />
          </TouchableOpacity>
        </View>
        <Text style={styles.greeting}>{greeting()}</Text>
        <Text style={styles.name}>{firstName}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {active !== null && (
          <View style={styles.activePill}>
            <View style={styles.activeDot} />
            <Text style={styles.activeText}>
              {active} {active === 1 ? 'member' : 'members'} active now
            </Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        {/* Quick actions */}
        <View style={styles.tiles}>
          <Tile icon="🏷️" label="Sell" onPress={() => router.push({ pathname: '/marketplace', params: { new: '1' } })} />
          <Tile icon="🏡" label="List rental" onPress={() => router.push({ pathname: '/rentals', params: { new: '1' } })} />
          <Tile icon="✉️" label="Messages" badge={unread} onPress={() => router.push('/messages')} />
          <Tile icon="🧰" label="Contractors" onPress={() => router.push('/contractors')} />
        </View>

        {/* Admin card */}
        {profile?.is_admin ? (
          <TouchableOpacity style={styles.adminCard} onPress={() => router.push('/admin')}>
            <View style={styles.adminIcon}>
              <Text style={{ fontSize: 18 }}>🛡️</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.adminTitle}>
                {adminCount > 0 ? `Admin: ${adminCount} waiting for review` : 'Admin: all caught up'}
              </Text>
              <Text style={styles.adminSub}>New members, position changes, and reports</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ) : null}

        {/* Marketplace */}
        <SectionHeader title="New in Marketplace" action="See all" onPress={() => router.push('/marketplace')} />
        {listings.length === 0 ? (
          <Text style={styles.emptyLine}>No listings yet. Be the first to sell something.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginRight: -16 }}>
            {listings.map((l) => (
              <TouchableOpacity key={l.id} style={styles.listingCard} onPress={() => router.push('/marketplace')}>
                {l.photo_urls?.length ? (
                  <Image source={{ uri: l.photo_urls[0] }} style={styles.listingPhoto} />
                ) : (
                  <View style={[styles.listingPhoto, styles.noPhoto]}>
                    <Text style={{ fontSize: 30 }}>📦</Text>
                  </View>
                )}
                <View style={{ padding: 10 }}>
                  <Text style={styles.listingPrice}>{formatPrice(l.price)}</Text>
                  <Text style={styles.listingTitle} numberOfLines={1}>{l.title}</Text>
                  <Text style={styles.listingMeta} numberOfLines={1}>
                    {l.seller?.full_name ?? 'Unknown'} · {timeAgo(l.created_at)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            <View style={{ width: 16 }} />
          </ScrollView>
        )}

        {/* Forums */}
        <SectionHeader title="Latest in Forums" action="Open" onPress={() => router.push('/forums')} />
        {posts.length === 0 ? (
          <Text style={styles.emptyLine}>No forum messages yet.</Text>
        ) : (
          <View style={styles.forumCard}>
            {posts.map((p, i) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.forumRow, i < posts.length - 1 && styles.forumDivider]}
                onPress={() => router.push('/forums')}
              >
                <Avatar uri={p.author?.avatar_url} name={p.author?.full_name} size={38} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={styles.forumTop}>
                    <Text style={styles.forumChannel}># {p.channel?.name ?? 'channel'}</Text>
                    <Text style={styles.forumTime}>{timeAgo(p.created_at)}</Text>
                  </View>
                  <Text style={styles.forumAuthor}>{p.author?.full_name ?? 'Unknown'}</Text>
                  <Text style={styles.forumBody} numberOfLines={1}>{p.body}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Rentals */}
        <SectionHeader title="Rentals" action="See all" onPress={() => router.push('/rentals')} />
        {!rental ? (
          <Text style={styles.emptyLine}>No rentals listed yet.</Text>
        ) : (
          <TouchableOpacity style={styles.rentalCard} onPress={() => router.push('/rentals')}>
            {rental.photo_urls?.length ? (
              <Image source={{ uri: rental.photo_urls[0] }} style={styles.rentalPhoto} />
            ) : (
              <View style={[styles.rentalPhoto, styles.noPhoto]}>
                <Text style={{ fontSize: 40 }}>🏡</Text>
              </View>
            )}
            <View style={{ padding: 14 }}>
              <View style={styles.forumTop}>
                <Text style={styles.rentalTitle} numberOfLines={1}>{rental.title}</Text>
                <Text style={styles.rentalRate}>{formatRate(rental.nightly_rate)}</Text>
              </View>
              <Text style={styles.listingMeta}>
                {rental.location ?? ''}{rental.max_guests ? ` · Sleeps ${rental.max_guests}` : ''}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F1EE' },
  header: { backgroundColor: NAVY, paddingHorizontal: 20, paddingBottom: 56, overflow: 'hidden' },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  brand: { color: '#fff', fontSize: 20, fontWeight: 'bold', flex: 1, marginLeft: 10 }, brandMark: { width: 36, height: 36 }, watermark: { position: 'absolute', right: -70, width: 290, height: 290, opacity: 0.12 },
  avatarRing: { borderWidth: 2, borderColor: RED, borderRadius: 24, padding: 2 },
  greeting: { color: '#C9D3E0', fontSize: 15 },
  name: { color: '#fff', fontSize: 30, fontWeight: 'bold', marginTop: 2 },
  subtitle: { color: '#C9D3E0', fontSize: 14, marginTop: 2 },
  activePill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 20, paddingVertical: 7, paddingHorizontal: 12,
  },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3DDC84', marginRight: 8 },
  activeText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  body: { paddingHorizontal: 16, marginTop: -40 },
  tiles: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  tile: {
    width: '23.5%', backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    shadowColor: NAVY, shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  tileIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FBE7EA', alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: 12, fontWeight: '600', color: '#14181F', marginTop: 8 },
  tileBadge: {
    position: 'absolute', top: 6, right: 8, minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: RED, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  tileBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  adminCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: NAVY, borderRadius: 14, padding: 14, marginBottom: 8,
  },
  adminIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(247,115,30,0.18)',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  adminTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  adminSub: { color: '#C9D3E0', fontSize: 12, marginTop: 2 },
  chevron: { color: '#C9D3E0', fontSize: 24, marginLeft: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 22, marginBottom: 10 },
  sectionTitle: { fontSize: 21, fontWeight: 'bold', color: '#14181F' },
  sectionAction: { fontSize: 14, fontWeight: '600', color: RED },
  emptyLine: { fontSize: 14, color: '#777' },
  listingCard: {
    width: 150, backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', marginRight: 12,
    shadowColor: NAVY, shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  listingPhoto: { width: 150, height: 110, backgroundColor: '#E5E1DA' },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  listingPrice: { fontSize: 16, fontWeight: 'bold', color: RED },
  listingTitle: { fontSize: 14, fontWeight: '500', color: '#14181F', marginTop: 2 },
  listingMeta: { fontSize: 12, color: '#5F6672', marginTop: 2 },
  forumCard: {
    backgroundColor: '#fff', borderRadius: 14,
    shadowColor: NAVY, shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  forumRow: { flexDirection: 'row', padding: 14 },
  forumDivider: { borderBottomWidth: 1, borderBottomColor: '#ECE8E2' },
  forumTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  forumChannel: { fontSize: 13, fontWeight: 'bold', color: RED },
  forumTime: { fontSize: 12, color: '#5F6672' },
  forumAuthor: { fontSize: 14, fontWeight: '600', color: '#14181F', marginTop: 2 },
  forumBody: { fontSize: 14, color: '#3D434D', marginTop: 1 },
  rentalCard: {
    backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
    shadowColor: NAVY, shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  rentalPhoto: { width: '100%', height: 150, backgroundColor: '#E5E1DA' },
  rentalTitle: { fontSize: 16, fontWeight: 'bold', color: '#14181F', flex: 1, marginRight: 8 },
  rentalRate: { fontSize: 15, fontWeight: 'bold', color: RED },
});