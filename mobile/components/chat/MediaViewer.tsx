import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Message } from '@/lib/types';

function VideoPlayer({ uri, onClose }: { uri: string; onClose: () => void }) {
  const player = useVideoPlayer(uri, p => {
    p.play();
  });

  return (
    <View style={styles.fill}>
      <VideoView player={player} style={styles.video} contentFit="contain" nativeControls />
      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <Ionicons name="close" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

export function MediaViewer({
  message,
  onClose,
}: {
  message: Message | null;
  onClose: () => void;
}) {
  const [imgLoading, setImgLoading] = useState(true);

  useEffect(() => setImgLoading(true), [message?.id]);

  if (!message) return null;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.topBar}>
          <Text style={styles.name} numberOfLines={1}>
            {message.type === 'video' ? 'Video' : 'Photo'}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {message.type === 'video' ? (
          <VideoPlayer uri={message.mediaUrl!} onClose={onClose} />
        ) : (
          <TouchableOpacity activeOpacity={1} style={styles.fill} onPress={onClose}>
            {imgLoading && (
              <ActivityIndicator size="large" color="#fff" style={StyleSheet.absoluteFill as any} />
            )}
            <Image
              source={{ uri: message.mediaUrl }}
              style={styles.image}
              resizeMode="contain"
              onLoadEnd={() => setImgLoading(false)}
            />
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0b141a' },
  fill: { flex: 1, justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  name: { color: '#fff', fontSize: 16 },
  image: { width: '100%', height: '100%' },
  video: { width: '100%', height: '70%' },
  closeBtn: { position: 'absolute', top: 50, right: 16 },
});
