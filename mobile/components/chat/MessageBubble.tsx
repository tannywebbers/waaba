import { memo } from 'react';
import {
  Image,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Message } from '@/lib/types';
import { formatTime } from '@/lib/format';

function Ticks({ status }: { status: Message['status'] }) {
  switch (status) {
    case 'sending':
      return <Ionicons name="time-outline" size={13} color="#667781" />;
    case 'sent':
      return <Ionicons name="checkmark" size={14} color="#667781" />;
    case 'delivered':
      return <Ionicons name="checkmark-done" size={14} color="#667781" />;
    case 'read':
      return <Ionicons name="checkmark-done" size={14} color="#53bdeb" />;
    case 'failed':
      return <Ionicons name="alert-circle" size={13} color="#e53935" />;
    default:
      return null;
  }
}

const fmt = (s: number) => {
  if (!isFinite(s) || s <= 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

export function VoiceBubble({ uri, outgoing }: { uri: string; outgoing: boolean }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  const toggle = () => {
    if (status.playing) {
      player.pause();
    } else {
      if (status.currentTime >= status.duration - 0.05) player.seekTo(0);
      player.play();
    }
  };

  return (
    <View style={styles.voiceRow}>
      <TouchableOpacity onPress={toggle} style={styles.voiceBtn}>
        <Ionicons
          name={status.playing ? 'pause' : 'play'}
          size={22}
          color={outgoing ? '#54656f' : '#28A156'}
        />
      </TouchableOpacity>
      <View style={styles.voiceTrack}>
        <View
          style={[
            styles.voiceFill,
            { width: `${Math.min(100, (status.currentTime / (status.duration || 1)) * 100)}%` },
          ]}
        />
      </View>
      <Text style={styles.voiceTime}>{fmt(status.playing ? status.currentTime : status.duration)}</Text>
    </View>
  );
}

interface Props {
  message: Message;
  contactName: string;
  onLongPress?: (m: Message) => void;
  onOpenMedia?: (m: Message) => void;
}

function MessageBubbleInner({ message: m, contactName, onLongPress, onOpenMedia }: Props) {
  const outgoing = m.isOutgoing;
  const isSticker = m.type === 'sticker';

  const reactionCounts: Record<string, number> = {};
  (m.reactions || []).forEach(r => {
    if (r.emoji) reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
  });
  const hasReactions = Object.keys(reactionCounts).length > 0;

  let body: React.ReactNode = null;
  switch (m.type) {
    case 'image':
      body = (
        <TouchableOpacity activeOpacity={0.9} onPress={() => onOpenMedia?.(m)} disabled={!m.mediaUrl}>
          {m.mediaUrl ? (
            <Image source={{ uri: m.mediaUrl }} style={styles.image} resizeMode="cover" />
          ) : (
            <Text style={m.isOutgoing ? styles.contentOut : styles.contentIn}>📷 Photo</Text>
          )}
        </TouchableOpacity>
      );
      break;
    case 'video':
      body = (
        <TouchableOpacity activeOpacity={0.9} onPress={() => onOpenMedia?.(m)} disabled={!m.mediaUrl}>
          <View style={styles.videoTile}>
            {m.mediaUrl && (
              <Image source={{ uri: m.mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={12} />
            )}
            <View style={styles.videoPlay}>
              <Ionicons name="play" size={30} color="#fff" style={{ marginLeft: 4 }} />
            </View>
          </View>
        </TouchableOpacity>
      );
      break;
    case 'audio':
      body = <VoiceBubble uri={m.mediaUrl!} outgoing={outgoing} />;
      break;
    case 'document':
      body = (
        <TouchableOpacity
          style={styles.docRow}
          activeOpacity={0.7}
          onPress={() => m.mediaUrl && Linking.openURL(m.mediaUrl)}
        >
          <View style={[styles.docIconWrap, outgoing && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
            <Ionicons name="document-text" size={24} color={outgoing ? '#fff' : '#7f66ff'} />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={[styles.docName, outgoing && { color: '#fff' }]} numberOfLines={1}>
              {m.content}
            </Text>
            <Text style={[styles.docSub, outgoing && { color: 'rgba(255,255,255,0.75)' }]}>
              tap to open
            </Text>
          </View>
        </TouchableOpacity>
      );
      break;
    case 'template':
      body = (
        <View>
          <View style={styles.templateTag}>
            <Ionicons name="albums-outline" size={12} color={outgoing ? 'rgba(255,255,255,0.9)' : '#28A156'} />
            <Text style={[styles.templateTagText, outgoing && { color: 'rgba(255,255,255,0.9)' }]}>
              Template{m.templateName ? ` · ${m.templateName}` : ''}
            </Text>
          </View>
          <Text style={outgoing ? styles.contentOut : styles.contentIn}>{m.content}</Text>
        </View>
      );
      break;
    case 'sticker':
      return (
        <View style={[styles.bubbleWrap, styles.stickerWrap]}>
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={() => onLongPress?.(m)}
            delayLongPress={350}
          >
            {m.mediaUrl ? (
              <Image source={{ uri: m.mediaUrl }} style={styles.stickerImg} resizeMode="contain" />
            ) : (
              <Text style={outgoing ? styles.contentOut : styles.contentIn}>{m.content}</Text>
            )}
          </TouchableOpacity>
          {hasReactions && (
            <View style={[styles.reactionRow, { alignSelf: outgoing ? 'flex-end' : 'flex-start' }]}>
              {Object.entries(reactionCounts).map(([emoji, count]) => (
                <View key={emoji} style={styles.reactionChip}>
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                  {count > 1 && <Text style={styles.reactionCount}>{count}</Text>}
                </View>
              ))}
            </View>
          )}
        </View>
      );
    default:
      body = <Text style={outgoing ? styles.contentOut : styles.contentIn}>{m.content}</Text>;
  }

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onLongPress={() => onLongPress?.(m)}
      delayLongPress={350}
      style={[styles.bubbleWrap, outgoing ? styles.outWrap : styles.inWrap]}
    >
      <View style={[styles.bubble, outgoing ? styles.bubbleOut : styles.bubbleIn]}>
        {m.replySnapshot && (
          <View style={styles.replyQuote}>
            <Text style={styles.replyQuoteName}>
              {m.replySnapshot.isOutgoing ? 'You' : m.replySnapshot.fromName || contactName}
            </Text>
            <Text style={styles.replyQuoteText} numberOfLines={2}>
              {m.replySnapshot.type === 'image' ? '📷 Photo'
                : m.replySnapshot.type === 'sticker' ? 'Sticker'
                : m.replySnapshot.content}
            </Text>
          </View>
        )}

        {body}

        {!outgoing && !isSticker && (
          <View style={styles.metaRowIn}>
            <Text style={styles.timestamp}>{formatTime(m.timestamp)}</Text>
          </View>
        )}
        {outgoing && !isSticker && (
          <View style={styles.metaRow}>
            <Text style={styles.timestamp}>{formatTime(m.timestamp)}</Text>
            <Ticks status={m.status} />
          </View>
        )}

        {m.status === 'failed' && (
          <Text style={styles.errorText}>{m.errorTitle || 'Failed to deliver'}</Text>
        )}

        {hasReactions && (
          <View style={[styles.reactionRow, { alignSelf: outgoing ? 'flex-end' : 'flex-start' }]}>
            {Object.entries(reactionCounts).map(([emoji, count]) => (
              <View key={emoji} style={styles.reactionChip}>
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                {count > 1 && <Text style={styles.reactionCount}>{count}</Text>}
              </View>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export const MessageBubble = memo(MessageBubbleInner);

const styles = StyleSheet.create({
  bubbleWrap: { marginVertical: 2, maxWidth: '82%' },
  outWrap: { alignSelf: 'flex-end' },
  inWrap: { alignSelf: 'flex-start' },

  bubble: {
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingTop: 6,
    paddingBottom: 6,
  },
  bubbleOut: { backgroundColor: '#d9fdd3', borderBottomRightRadius: 2 },
  bubbleIn: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e9edef',
  },

  contentOut: { fontSize: 15.5, color: '#111b21', lineHeight: 21 },
  contentIn: { fontSize: 15.5, color: '#111b21', lineHeight: 21 },

  image: { width: 220, height: 240, borderRadius: 8, marginBottom: 3 },

  videoTile: {
    width: 230,
    height: 150,
    borderRadius: 8,
    backgroundColor: '#111b21',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
    overflow: 'hidden',
  },
  videoPlay: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, minWidth: 180 },
  voiceBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  voiceTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
    overflow: 'hidden',
  },
  voiceFill: { height: 4, backgroundColor: '#28A156' },
  voiceTime: { fontSize: 11, color: '#54656f' },

  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, minWidth: 190 },
  docIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: 'rgba(127,102,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docName: { fontSize: 14.5, fontWeight: '500', color: '#111b21' },
  docSub: { fontSize: 11.5, color: '#667781', marginTop: 2 },

  templateTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  templateTagText: { fontSize: 11.5, fontWeight: '600', color: '#28A156' },

  stickerWrap: { maxWidth: 200 },
  stickerImg: { width: 160, height: 160 },

  replyQuote: {
    borderLeftWidth: 4,
    borderColor: '#28A156',
    backgroundColor: 'rgba(40,161,86,0.08)',
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 5,
  },
  replyQuoteName: { fontSize: 12.5, fontWeight: '600', color: '#28A156' },
  replyQuoteText: { fontSize: 12.5, color: '#54656f' },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    marginLeft: 24,
  },
  metaRowIn: { flexDirection: 'row', justifyContent: 'flex-end' },
  timestamp: { fontSize: 11, color: '#667781' },
  errorText: { fontSize: 11.5, color: '#e53935', marginTop: 3 },

  reactionRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#f0f2f5',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e9edef',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, color: '#54656f', fontWeight: '600' },
});
