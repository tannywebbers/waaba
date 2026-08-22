import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/stores/appStore';
import { Contact } from '@/lib/types';
import { initialsOf } from '@/lib/format';

const AVATAR_COLORS = ['#28A156', '#0E7490', '#B45309', '#7C3AED', '#BE185D', '#4D7C0F'];

export default function ContactsScreen() {
  const contacts = useAppStore(s => s.contacts);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.phone.replace(/[^\d]/g, '').includes(q.replace(/[^\d]/g, '')) ||
        (c.loanId || '').toLowerCase().includes(q)
    );
  }, [contacts, query]);

  const renderItem = ({ item }: { item: Contact }) => (
    <View style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[item.id.charCodeAt(0) % AVATAR_COLORS.length] }]}>
        <Text style={styles.avatarText}>{initialsOf(item.name)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {item.phone}
          {item.appType ? `  ·  ${item.appType}` : ''}
        </Text>
      </View>
      {item.isOnline && <View style={styles.onlineDot} />}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Contacts</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color="#8696a0" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search contacts"
          placeholderTextColor="#8696a0"
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={c => c.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color="#c8d2d8" />
            <Text style={styles.emptyTitle}>No contacts</Text>
            <Text style={styles.emptySubtitle}>Contacts sync automatically</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  title: { fontSize: 24, fontWeight: '700', color: '#111b21' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 10,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#f0f2f5',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111b21', paddingVertical: 0 },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  name: { fontSize: 16, fontWeight: '600', color: '#111b21' },
  sub: { fontSize: 13.5, color: '#667781', marginTop: 2 },
  onlineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#28A156', marginRight: 4 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#e9edef', marginLeft: 72 },

  empty: { alignItems: 'center', paddingTop: 80, gap: 6 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#111b21', marginTop: 8 },
  emptySubtitle: { fontSize: 13, color: '#667781' },
});
