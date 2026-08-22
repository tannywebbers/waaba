import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

export interface StickerItem {
  id: string;
  mediaUrl: string;
  mimeType: string;
}

interface Props {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onSend: (sticker: StickerItem) => void;
}

export function StickerPickerModal({ visible, userId, onClose, onSend }: Props) {
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !userId) return;
    setLoading(true);
    supabase
      .from('stickers')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setStickers((data as any) || []);
        setLoading(false);
      });
  }, [visible, userId]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Stickers</Text>
          {loading ? (
            <ActivityIndicator color="#25D366" style={{ marginTop: 24 }} />
          ) : stickers.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="happy-outline" size={44} color="#c8d2d8" />
              <Text style={styles.emptyTitle}>No stickers yet</Text>
              <Text style={styles.emptySubtitle}>Upload stickers in the web app</Text>
            </View>
          ) : (
            <FlatList
              data={stickers}
              keyExtractor={s => s.id}
              numColumns={4}
              contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.cell}
                  activeOpacity={0.7}
                  onPress={() => onSend(item)}
                >
                  <Image source={{ uri: item.mediaUrl }} style={styles.stickerImg} resizeMode="contain" />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(11,20,26,0.5)', justifyContent: 'flex-end' },
  sheet: {
    height: '45%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d7db',
    marginBottom: 8,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#111b21', paddingHorizontal: 16 },

  cell: { flex: 1 / 4, aspectRatio: 1, padding: 8 },
  stickerImg: { width: '100%', height: '100%' },

  empty: { alignItems: 'center', paddingTop: 36, gap: 4 },
  emptyTitle: { fontSize: 15.5, fontWeight: '600', color: '#111b21', marginTop: 8 },
  emptySubtitle: { fontSize: 13, color: '#667781' },
});
