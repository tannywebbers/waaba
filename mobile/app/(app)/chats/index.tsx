import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
import { Chat } from '@/lib/types';
import { formatChatListTime, initialsOf } from '@/lib/format';

const AVATAR_COLORS = ['#28A156', '#0E7490', '#B45309', '#7C3AED', '#BE185D', '#4D7C0F'];

function previewText(chat: Chat): string {
  const m = chat.lastMessage;
  if (!m) return 'No messages yet';
  const prefix =
    m.type === 'image' ? '📷 '
    : m.type === 'video' ? '🎥 '
    : m.type === 'audio' ? '🎤 '
    : m.type === 'document' ? '📄 '
    : m.type === 'sticker' ? ''
    : '';
  const body = m.type === 'sticker' ? 'Sticker' : m.content;
  return `${m.isOutgoing ? '' : ''}${prefix}${body}`;
}

export default function ChatsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { chats, loading, dataLoaded, loadData } = useAppStore();
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Leaving a chat detail resets activeChatId
  useFocusEffect(
    useCallback(() => {
      return () => {
        useAppStore.getState().setActiveChatId(null);
      };
    }, [])
  );

  const onRefresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    await loadData(user.id);
    setRefreshing(false);
  }, [user, loadData]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      c =>
        c.contact.name.toLowerCase().includes(q) ||
        c.contact.phone.replace(/[^\d]/g, '').includes(q.replace(/[^\d]/g, '')) ||
        (c.lastMessage?.content || '').toLowerCase().includes(q)
    );
  }, [chats, query]);

  const renderItem = ({ item }: { item: Chat }) => {
    const avatarColor = AVATAR_COLORS[item.id.charCodeAt(0) % AVATAR_COLORS.length];
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.6}
        onPress={() => router.push(`/chats/${item.id}`)}
      >
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{initialsOf(item.contact.name)}</Text>
        </View>

        <View style={styles.rowMain}>
          <View style={styles.rowTop}>
            <Text style={styles.name} numberOfLines={1}>
              {item.contact.name}
            </Text>
            <Text
              style={[
                styles.time,
                item.unreadCount > 0 && { color: '#28A156', fontWeight: '600' },
              ]}
            >
              {formatChatListTime(item.lastMessage?.timestamp || undefined)}
            </Text>
          </View>
          <View style={styles.rowBottom}>
            <Text style={styles.preview} numberOfLines={1}>
              {previewText(item)}
            </Text>
            {item.unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && !dataLoaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#28A156" />
        <Text style={styles.loadingText}>Loading chats…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Chats</Text>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color="#8696a0" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search"
          placeholderTextColor="#8696a0"
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color="#8696a0" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubble-ellipses-outline" size={48} color="#c8d2d8" />
            <Text style={styles.emptyTitle}>No chats found</Text>
            <Text style={styles.emptySubtitle}>
              {chats.length === 0
                ? 'New conversations will appear here'
                : 'Try a different search'}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#28A156" />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', gap: 12 },
  loadingText: { color: '#667781', fontSize: 14 },

  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  title: { fontSize: 32, fontWeight: '800', color: '#111b21' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 10,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 30,
    backgroundColor: '#f0f2f5',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111b21', paddingVertical: 0 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '600' },

  rowMain: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  name: { fontSize: 16, fontWeight: '600', color: '#111b21', flexShrink: 1 },
  time: { fontSize: 12, color: '#667781', marginLeft: 8 },

  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  preview: { flexShrink: 1, fontSize: 14, color: '#667781' },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: '#28A156',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 80, gap: 6 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#111b21', marginTop: 8 },
  emptySubtitle: { fontSize: 13, color: '#667781', textAlign: 'center' },
});
