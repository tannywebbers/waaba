import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
import { supabase } from '@/lib/supabase';
import { Message } from '@/lib/types';
import { initialsOf } from '@/lib/format';
import {
  getWhatsAppSettings,
  invokeWhatsAppApi,
  persistMessage,
  sendVoiceNoteViaMeta,
  uploadChatMedia,
} from '@/lib/whatsapp';
import { getEffectiveWhatsAppUserId } from '@/lib/effectiveUser';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { MediaViewer } from '@/components/chat/MediaViewer';
import { TemplatePickerModal, MetaTemplate } from '@/components/chat/TemplatePickerModal';
import { StickerPickerModal, StickerItem } from '@/components/chat/StickerPickerModal';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const chat = useMemo(() => useAppStore.getState().chats.find(c => c.id === id), [id]);
  const contact = useAppStore(s => s.contacts.find(c => c.id === id));
  const messages = useAppStore(s => (id ? s.messages[id] : undefined)) || [];

  const [input, setInput] = useState(useAppStore.getState().drafts[id || ''] || '');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactTarget, setReactTarget] = useState<Message | null>(null);
  const [viewerMessage, setViewerMessage] = useState<Message | null>(null);

  const [templatesVisible, setTemplatesVisible] = useState(false);
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [stickersVisible, setStickersVisible] = useState(false);

  const [scheduleVisible, setScheduleVisible] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(new Date());
  const [scheduleStage, setScheduleStage] = useState<'date' | 'time'>('date');

  const [contactInfoVisible, setContactInfoVisible] = useState(false);

  // Voice recording
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!id) return;
    useAppStore.getState().setActiveChatId(id);
    return () => {
      useAppStore.getState().setActiveChatId(null);
    };
  }, [id]);

  useEffect(() => {
    if (!recording) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = setInterval(() => setRecordedSeconds(s => s + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recording]);

  const saveDraft = useCallback(
    (text: string) => {
      setInput(text);
      if (id) useAppStore.getState().setDraft(id, text);
    },
    [id]
  );

  const buildReplySnapshot = useCallback(
    (m: Message) => ({
      type: m.type,
      content: m.content,
      isOutgoing: m.isOutgoing,
      fromName: m.isOutgoing ? 'You' : contact?.name || 'Contact',
    }),
    [contact]
  );

  const replyContext = () =>
    replyTo
      ? {
          reply_to_message_id: replyTo.id || null,
          reply_to_wamid: replyTo.whatsappMessageId || null,
          reply_snapshot: buildReplySnapshot(replyTo),
          _replyWamid: replyTo.whatsappMessageId,
        }
      : {};

  // ── Send: text ───────────────────────────────────────────────
  const handleSendText = async () => {
    const content = input.trim();
    if (!content || !chat || !user || sending) return;

    saveDraft('');
    setSending(true);
    const ctx = replyContext();
    setReplyTo(null);

    try {
      const settings = await getWhatsAppSettings(user.id);
      if (!settings) {
        Alert.alert(
          'WhatsApp not configured',
          'Open the web app Settings > WhatsApp API to configure your credentials.'
        );
        setSending(false);
        saveDraft(content);
        return;
      }

      const { data, error } = await invokeWhatsAppApi(settings, chat, {
        action: 'send_message',
        type: 'text',
        content,
        replyToWamid: ctx._replyWamid,
      });

      if (error || !data?.success) {
        console.error('[Chat] Send failed:', data?.error || error?.message);
        Alert.alert(
          'Message failed',
          data?.errorDetails || data?.error || error?.message || 'WhatsApp rejected this message.'
        );
      }

      const status: Message['status'] = data?.success ? 'sent' : 'failed';
      const inserted = await persistMessage(user.id, chat, {
        content,
        type: 'text',
        status,
        whatsapp_message_id: data?.success ? (data.messageId as string) : null,
        reply_to_message_id: ctx.reply_to_message_id,
        reply_to_wamid: ctx.reply_to_wamid,
        reply_snapshot: ctx.reply_snapshot,
      });
      if (inserted)
        useAppStore.getState().addMessage({
          ...inserted,
          replyToMessageId: ctx.reply_to_message_id || undefined,
          replyToWamid: ctx.reply_to_wamid || undefined,
          replySnapshot: ctx.reply_snapshot || undefined,
        });
    } catch (err: any) {
      console.error('[Chat] Send error:', err);
      Alert.alert('Message failed', err?.message || 'Unknown error');
      saveDraft(content);
    } finally {
      setSending(false);
    }
  };

  // ── Send: media (image / video / document / sticker) ─────────
  const sendMedia = async (
    type: 'image' | 'video' | 'document' | 'sticker',
    mediaUrl: string,
    displayName: string,
    mimeType: string
  ) => {
    if (!chat || !user) return;
    setUploading(true);
    try {
      const settings = await getWhatsAppSettings(user.id);
      if (!settings) {
        Alert.alert('WhatsApp not configured', 'Configure credentials in the web app first.');
        return;
      }
      const { data, error } = await invokeWhatsAppApi(settings, chat, {
        action: 'send_message',
        type,
        content: mediaUrl,
        mediaFileName: type === 'document' ? displayName : undefined,
        mediaMimeType: mimeType,
        replyToWamid: replyContext()._replyWamid,
      });
      if (error || !data?.success) {
        Alert.alert(
          `${type} failed`,
          data?.errorDetails || data?.error || error?.message || 'WhatsApp rejected this file.'
        );
      }
      const status: Message['status'] = data?.success ? 'sent' : 'failed';
      const inserted = await persistMessage(user.id, chat, {
        content: displayName,
        type,
        status,
        media_url: mediaUrl,
        whatsapp_message_id: data?.success ? (data.messageId as string) : null,
        ...replyContext(),
      });
      if (inserted) useAppStore.getState().addMessage(inserted);
      setReplyTo(null);
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message || 'Unknown error');
    } finally {
      setUploading(false);
    }
  };

  const pickFromLibrary = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('Permission needed', 'Allow photo library access to send media.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.9,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType || 'application/octet-stream';
    const fileName =
      asset.fileName ||
      `${asset.type === 'video' ? 'video' : 'photo'}-${Date.now()}${asset.uri.split('.').pop() ? '.' + asset.uri.split('.').pop()!.split('?')[0] : '.jpg'}`;
    const isVideo =
      mime.startsWith('video/') || /\.(mp4|3gp|mov|m4v|webm|mkv)$/i.test(asset.fileName || asset.uri);
    const url = await uploadChatMedia(user!.id, chat!.id, asset.uri, mime, fileName);
    await sendMedia(isVideo ? 'video' : 'image', url, fileName, mime);
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType || 'application/octet-stream';
    const url = await uploadChatMedia(user!.id, chat!.id, asset.uri, mime, asset.name);
    await sendMedia('document', url, asset.name, mime);
  };

  const handleSendSticker = async (sticker: StickerItem) => {
    setStickersVisible(false);
    await sendMedia('sticker', sticker.mediaUrl, '[Sticker]', sticker.mimeType || 'image/webp');
  };

  // ── Send: template ───────────────────────────────────────────
  const openTemplates = async () => {
    setTemplatesVisible(true);
    if (templates.length > 0 || templatesLoading || !user) return;
    setTemplatesLoading(true);
    const { data } = await supabase.from('whatsapp_templates').select('*').eq('user_id', user.id);
    setTemplates((data as any) || []);
    setTemplatesLoading(false);
  };

  const handleSendTemplate = async (
    template: MetaTemplate,
    params: Record<string, string>,
    previewText: string
  ) => {
    if (!chat || !user) return;
    setTemplatesVisible(false);
    setUploading(true);

    try {
      // Detect shared inbox users (send via super user's connection)
      const effectiveUserId = await getEffectiveWhatsAppUserId(user.id);
      const category = (template.category || '').toUpperCase();
      const businessInitiated = ['UTILITY', 'MARKETING', 'AUTHENTICATION'].includes(category);

      let inServiceWindow = false;
      if (businessInitiated) {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: lastIncoming } = await supabase
          .from('messages')
          .select('created_at')
          .eq('contact_id', chat.id)
          .eq('is_outgoing', false)
          .gte('created_at', cutoff)
          .order('created_at', { ascending: false })
          .limit(1);
        inServiceWindow = !!lastIncoming && lastIncoming.length > 0;
      }

      const isSharedUser = effectiveUserId !== user.id;
      if (isSharedUser && businessInitiated && !inServiceWindow) {
        const { data: membership } = await supabase
          .from('shared_inbox_users')
          .select('balance')
          .eq('shared_user_id', user.id)
          .eq('status', 'active')
          .limit(1);
        const balance = (membership as any[])?.[0]?.balance ?? 0;
        if (balance < 1) {
          Alert.alert(
            'Insufficient credits',
            `You need at least 1 credit for business-initiated templates. Balance: ${balance}.`
          );
          setUploading(false);
          return;
        }
      }

      const settings = await getWhatsAppSettings(user.id);
      if (!settings) {
        Alert.alert('WhatsApp not configured', 'Configure credentials in the web app first.');
        setUploading(false);
        return;
      }

      const { data, error } = await invokeWhatsAppApi(settings, chat, {
        action: 'send_message',
        type: 'template',
        templateName: template.name,
        templateParams: params,
        templateLanguage: template.language || 'en',
        templateComponents: Array.isArray(template.components) ? template.components : undefined,
      });

      if (error || !data?.success) {
        Alert.alert(
          'Template failed',
          data?.errorDetails || data?.error || error?.message || 'WhatsApp rejected this template.'
        );
      }

      if (isSharedUser && businessInitiated && !inServiceWindow && data?.success) {
        await supabase.rpc('deduct_shared_credit' as any, { _shared_user_id: user.id });
      }

      const status: Message['status'] = data?.success ? 'sent' : 'failed';
      const inserted = await persistMessage(user.id, chat, {
        content: previewText,
        type: 'template',
        status,
        whatsapp_message_id: data?.success ? (data.messageId as string) : null,
        template_name: template.name,
        template_params: params,
        ...replyContext(),
      });
      if (inserted) useAppStore.getState().addMessage(inserted);
      setReplyTo(null);
    } catch (err: any) {
      Alert.alert('Template failed', err?.message || 'Unknown error');
    } finally {
      setUploading(false);
    }
  };

  // ── Voice notes ──────────────────────────────────────────────
  const startRecording = async () => {
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow microphone access to record voice notes.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecordedSeconds(0);
    setRecording(true);
  };

  const cancelRecording = async () => {
    await recorder.stop();
    setRecording(false);
    setRecordedSeconds(0);
  };

  const stopAndSendRecording = async () => {
    if (!chat || !user) return;
    setRecording(false);
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri || recordedSeconds < 1) {
      Alert.alert('Recording too short', 'Please record for at least 1 second.');
      return;
    }
    setUploading(true);
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const settings = await getWhatsAppSettings(user.id);
      if (!settings) {
        Alert.alert('WhatsApp not configured', 'Configure credentials in the web app first.');
        return;
      }
      const wamid = await sendVoiceNoteViaMeta(settings, chat, uri);
      const backupPath = `${user.id}/${chat.id}/${Date.now()}-voice-note.m4a`;
      const blob = await fetch(uri).then(r => r.blob());
      await supabase.storage
        .from('chat-media')
        .upload(backupPath, blob, { contentType: 'audio/mp4', upsert: false });
      const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(backupPath);

      const inserted = await persistMessage(user.id, chat, {
        content: '🎵 Voice note',
        type: 'audio',
        status: 'sent',
        media_url: urlData.publicUrl,
        whatsapp_message_id: wamid,
        ...replyContext(),
      });
      if (inserted) useAppStore.getState().addMessage(inserted);
      setReplyTo(null);
    } catch (err: any) {
      Alert.alert('Voice note failed', err?.message || 'Unknown error');
    } finally {
      setUploading(false);
      setRecordedSeconds(0);
    }
  };

  // ── Reactions ────────────────────────────────────────────────
  const handleReact = async (m: Message, emoji: string) => {
    setReactTarget(null);
    const existing = (m.reactions || []).filter(r => r.from !== 'me');
    const newReactions = [
      ...existing,
      { emoji, from: 'me', fromName: 'You', at: new Date().toISOString() },
    ];
    useAppStore.getState().updateMessage(m.contactId, m.id, { reactions: newReactions });
    await supabase.from('messages').update({ reactions: newReactions } as any).eq('id', m.id);

    if (m.whatsappMessageId && user) {
      const settings = await getWhatsAppSettings(user.id);
      if (settings) {
        await invokeWhatsAppApi(settings, chat!, {
          action: 'send_message',
          type: 'reaction',
          replyToWamid: m.whatsappMessageId,
          reactionEmoji: emoji,
        });
      }
    }
  };

  // ── Delete for everyone ──────────────────────────────────────
  const handleDelete = async (m: Message) => {
    useAppStore.getState().deleteMessageLocal(m.contactId, m.id);
    const { error } = await supabase
      .from('messages')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() } as any)
      .eq('id', m.id);
    if (error) Alert.alert('Delete failed', error.message);
  };

  // ── Long-press actions ───────────────────────────────────────
  const onBubbleLongPress = (m: Message) => {
    const buttons: any[] = [{ text: 'Reply', onPress: () => setReplyTo(m) }];
    if (['image', 'document'].includes(m.type) && m.mediaUrl) {
      buttons.push({
        text: 'Open',
        onPress: () => Linking.openURL(m.mediaUrl!),
      });
    }
    buttons.push({
      text: 'Delete for everyone',
      style: 'destructive',
      onPress: () => handleDelete(m),
    });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(m.type === 'sticker' ? 'Sticker' : m.content.slice(0, 80), undefined, buttons);
  };

  // ── Schedule ─────────────────────────────────────────────────
  const openSchedule = () => {
    if (!input.trim()) {
      Alert.alert('Write a message first', 'Enter the text you want to schedule.');
      return;
    }
    setScheduleDate(new Date(Date.now() + 60 * 60 * 1000));
    setScheduleStage('date');
    setScheduleVisible(true);
  };

  const confirmSchedule = async (date: Date) => {
    if (!chat || !user) return;
    setScheduleVisible(false);
    const { error } = await supabase.from('scheduled_messages').insert({
      user_id: user.id,
      contact_id: chat.id,
      content: input.trim(),
      type: 'text',
      scheduled_at: date.toISOString(),
      status: 'pending',
    } as any);
    if (error) {
      Alert.alert('Failed to schedule', error.message);
      return;
    }
    saveDraft('');
    Alert.alert('Scheduled', `Message will be sent at ${date.toLocaleString()}`);
  };

  // ── Contact info actions ─────────────────────────────────────
  const toggleFlag = async (field: 'is_pinned' | 'is_muted' | 'is_archived' | 'is_blocked') => {
    if (!contact || !id) return;
    const next = !(contact as any)[field];
    useAppStore.setState(state => ({
      contacts: state.contacts.map(c => (c.id === id ? { ...c, [field]: next } : c)),
      chats: state.chats.map(c =>
        c.id === id
          ? {
              ...c,
              contact: { ...c.contact, [field]: next },
              ...(field !== 'is_blocked' ? { [field.replace('is_', '')]: next } : {}),
            }
          : c
      ),
    }));
    await supabase.from('contacts').update({ [field]: next }).eq('id', id);
  };

  const deleteChat = async () => {
    if (!id) return;
    setContactInfoVisible(false);
    await supabase
      .from('contacts')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() } as any)
      .eq('id', id);
    useAppStore.setState(state => ({ chats: state.chats.filter(c => c.id !== id) }));
    router.back();
  };

  const renderBubble = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble
        message={item}
        contactName={contact?.name || ''}
        onLongPress={onBubbleLongPress}
        onOpenMedia={setViewerMessage}
      />
    ),
    [contact]
  );

  const fmtRec = `${Math.floor(recordedSeconds / 60)}:${(recordedSeconds % 60)
    .toString()
    .padStart(2, '0')}`;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color="#111b21" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerMain}
          onPress={() => setContactInfoVisible(true)}
          activeOpacity={0.7}
        >
          {contact?.avatar ? (
            <Image
              source={{ uri: contact.avatar }}
              style={[styles.avatar, styles.avatarImg]}
            />
          ) : (
            <View style={[styles.avatar, { backgroundColor: '#25D366' }]}>
              <Text style={styles.avatarText}>{initialsOf(contact?.name || '?')}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.headerName} numberOfLines={1}>
              {contact?.name || 'Chat'}
            </Text>
            <Text style={styles.headerStatus}>
              {contact?.isOnline ? 'online' : contact?.phone || ''}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setContactInfoVisible(true)} hitSlop={10}>
          <Ionicons name="ellipsis-vertical" size={20} color="#54656f" />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <View style={styles.messagesArea}>
        <FlatList
          data={[...messages].reverse()}
          inverted
          keyExtractor={m => m.id}
          renderItem={renderBubble}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Ionicons name="lock-closed-outline" size={14} color="#8696a0" />
              <Text style={styles.emptyChatText}>Messages are end-to-end encrypted</Text>
            </View>
          }
        />
      </View>

      {/* Reaction bar */}
      {reactTarget && (
        <View style={styles.reactionBar}>
          {REACTIONS.map(emoji => (
            <TouchableOpacity key={emoji} onPress={() => handleReact(reactTarget, emoji)}>
              <Text style={styles.reactionBarEmoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => setReactTarget(null)} hitSlop={8}>
            <Ionicons name="close" size={18} color="#667781" />
          </TouchableOpacity>
        </View>
      )}

      {/* Reply preview */}
      {!reactTarget && replyTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyBarAccent} />
          <View style={styles.replyBarMain}>
            <Text style={styles.replyQuoteName}>
              {replyTo.isOutgoing ? 'You' : contact?.name}
            </Text>
            <Text style={styles.replyQuoteText} numberOfLines={1}>
              {replyTo.content}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={10}>
            <Ionicons name="close" size={20} color="#667781" />
          </TouchableOpacity>
        </View>
      )}

      {/* Recording UI */}
      {recording ? (
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.micActiveBtn} onPress={cancelRecording}>
            <Ionicons name="trash-outline" size={20} color="#e53935" />
          </TouchableOpacity>
          <View style={[styles.input, styles.recordingPill]}>
            <View style={styles.recDot} />
            <Text style={styles.recTimer}>{fmtRec}</Text>
            <Text style={styles.recHint}>tap trash to cancel</Text>
          </View>
          <TouchableOpacity style={styles.sendBtn} onPress={stopAndSendRecording}>
            {uploading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" style={{ marginLeft: 2 }} />
            )}
          </TouchableOpacity>
        </View>
      ) : (
        /* Input bar */
        <View style={styles.inputBar}>
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={pickFromLibrary}
            disabled={uploading}
          >
            <Ionicons name="add-circle-outline" size={26} color={uploading ? '#8696a0' : '#54656f'} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Message"
            placeholderTextColor="#8696a0"
            multiline
            value={input}
            onChangeText={saveDraft}
          />
          {input.trim() ? (
            <TouchableOpacity
              style={[styles.sendBtn, sending && styles.btnDisabled]}
              onPress={handleSendText}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={18} color="#fff" style={{ marginLeft: 2 }} />
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.toolsRow}>
              <TouchableOpacity onPress={() => setStickersVisible(true)} hitSlop={6}>
                <Ionicons name="happy-outline" size={24} color="#54656f" />
              </TouchableOpacity>
              <TouchableOpacity onPress={openTemplates} hitSlop={6}>
                <Ionicons name="albums-outline" size={24} color="#54656f" />
              </TouchableOpacity>
              <TouchableOpacity onPress={openSchedule} hitSlop={6}>
                <Ionicons name="time-outline" size={24} color="#54656f" />
              </TouchableOpacity>
              <TouchableOpacity onPress={pickDocument} hitSlop={6}>
                <Ionicons name="attach" size={24} color="#54656f" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.micBtn} onPress={startRecording}>
                <Ionicons name="mic-outline" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
      {(uploading || sending) && (
        <View style={styles.statusStrip}>
          <ActivityIndicator size="small" color="#25D366" />
          <Text style={styles.statusText}>{uploading ? 'Uploading…' : 'Sending…'}</Text>
        </View>
      )}

      {/* Media viewer */}
      <MediaViewer message={viewerMessage} onClose={() => setViewerMessage(null)} />

      {/* Templates */}
      <TemplatePickerModal
        visible={templatesVisible}
        templates={templates}
        loading={templatesLoading}
        onClose={() => setTemplatesVisible(false)}
        onSend={handleSendTemplate}
      />

      {/* Stickers */}
      <StickerPickerModal
        visible={stickersVisible}
        userId={user?.id || ''}
        onClose={() => setStickersVisible(false)}
        onSend={handleSendSticker}
      />

      {/* Schedule dialog */}
      <Modal visible={scheduleVisible} animationType="slide" transparent onRequestClose={() => setScheduleVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheetSmall}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Schedule message</Text>
            <DateTimePicker
              value={scheduleDate}
              mode={scheduleStage}
              display="default"
              minimumDate={new Date()}
              onChange={(_e, d) => {
                if (!d) {
                  setScheduleVisible(false);
                  return;
                }
                if (scheduleStage === 'date') {
                  setScheduleDate(d);
                  setScheduleStage('time');
                } else {
                  const final = new Date(scheduleDate);
                  final.setHours(d.getHours(), d.getMinutes(), 0, 0);
                  setScheduleDate(final);
                  setScheduleVisible(false);
                  confirmSchedule(final);
                }
              }}
            />
            <TouchableOpacity
              style={styles.cancelLink}
              onPress={() => setScheduleVisible(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Contact info sheet */}
      <Modal visible={contactInfoVisible} animationType="slide" transparent onRequestClose={() => setContactInfoVisible(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setContactInfoVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.infoHead}>
              {contact?.avatar ? (
                <Image source={{ uri: contact.avatar }} style={[styles.infoAvatar, styles.avatarImg]} />
              ) : (
                <View style={[styles.infoAvatar, { backgroundColor: '#25D366' }]}>
                  <Text style={styles.infoAvatarText}>{initialsOf(contact?.name || '?')}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.infoName}>{contact?.name}</Text>
                <Text style={styles.infoPhone}>{contact?.phone}</Text>
                {(contact?.loanId || contact?.appType) && (
                  <Text style={styles.infoMeta}>
                    {[contact.loanId && `Loan ${contact.loanId}`, contact.appType]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.actionsWrap}>
              <TouchableOpacity style={styles.actionRow} onPress={() => toggleFlag('is_pinned')}>
                <Ionicons name="pin-outline" size={22} color="#54656f" />
                <Text style={styles.actionText}>
                  {contact?.isPinned ? 'Unpin chat' : 'Pin chat'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionRow} onPress={() => toggleFlag('is_muted')}>
                <Ionicons
                  name={contact?.isMuted ? 'notifications-outline' : 'notifications-off-outline'}
                  size={22}
                  color="#54656f"
                />
                <Text style={styles.actionText}>{contact?.isMuted ? 'Unmute' : 'Mute'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionRow} onPress={() => toggleFlag('is_archived')}>
                <Ionicons name="archive-outline" size={22} color="#54656f" />
                <Text style={styles.actionText}>
                  {contact?.isArchived ? 'Unarchive' : 'Archive'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionRow} onPress={() => toggleFlag('is_blocked')}>
                <Ionicons name="ban-outline" size={22} color="#e53935" />
                <Text style={[styles.actionText, { color: '#e53935' }]}>
                  {contact?.isBlocked ? 'Unblock' : 'Block'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionRow} onPress={deleteChat}>
                <Ionicons name="trash-outline" size={22} color="#e53935" />
                <Text style={[styles.actionText, { color: '#e53935' }]}>Delete chat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#efeae2' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#f0f2f5',
  },
  headerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { resizeMode: 'cover' },
  avatarText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  headerName: { fontSize: 16, fontWeight: '600', color: '#111b21' },
  headerStatus: { fontSize: 12, color: '#667781' },

  messagesArea: { flex: 1 },
  listContent: { paddingHorizontal: 10, paddingVertical: 12 },
  emptyChat: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    marginTop: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#ffeecd',
  },
  emptyChatText: { fontSize: 12, color: '#54656f' },

  reactionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#f0f2f5',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingTop: 8,
    paddingBottom: 4,
  },
  reactionBarEmoji: { fontSize: 28 },

  replyBar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#f0f2f5',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  replyBarAccent: { width: 4, backgroundColor: '#25D366' },
  replyBarMain: { flex: 1, paddingHorizontal: 8, paddingVertical: 6 },
  replyQuoteName: { fontSize: 12.5, fontWeight: '600', color: '#25D366' },
  replyQuoteText: { fontSize: 12.5, color: '#54656f' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 8 : 6,
    backgroundColor: '#efeae2',
  },
  attachBtn: {
    width: 38,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 42,
    backgroundColor: '#fff',
    borderRadius: 21,
    paddingHorizontal: 16,
    paddingVertical: 11,
    fontSize: 15.5,
    color: '#111b21',
  },
  toolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 9,
    paddingLeft: 2,
  },
  micBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  micActiveBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#e53935',
  },
  recTimer: { fontSize: 15, fontWeight: '600', color: '#111b21' },
  recHint: { fontSize: 12, color: '#8696a0', flex: 1 },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },

  statusStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: '#efeae2',
  },
  statusText: { fontSize: 12.5, color: '#54656f' },

  overlay: { flex: 1, backgroundColor: 'rgba(11,20,26,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    maxHeight: '75%',
  },
  sheetSmall: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    alignItems: 'center',
    paddingBottom: 20,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d7db',
    marginBottom: 8,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#111b21', marginBottom: 8 },

  infoHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e9edef',
  },
  infoAvatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoAvatarText: { color: '#fff', fontSize: 24, fontWeight: '600' },
  infoName: { fontSize: 19, fontWeight: '700', color: '#111b21' },
  infoPhone: { fontSize: 14, color: '#54656f', marginTop: 2 },
  infoMeta: { fontSize: 13, color: '#8696a0', marginTop: 2 },

  actionsWrap: { paddingVertical: 8 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  actionText: { fontSize: 15.5, color: '#111b21' },
  cancelLink: { marginTop: 6 },
  cancelText: { color: '#e53935', fontSize: 15, fontWeight: '600' },
});
