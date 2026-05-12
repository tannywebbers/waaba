// @ts-nocheck
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ArrowLeft, Clock, MessageCircle, Send, X, Reply as ReplyIcon } from 'lucide-react';
import { EmojiPickerButton, MobileEmojiPanel } from '@/components/chat/EmojiPickerButton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';
import { useSharedInbox } from '@/hooks/useSharedInbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ContactAvatar } from '@/components/shared/ContactAvatar';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ChatOptionsMenu } from '@/components/chat/ChatOptionsMenu';
import { FileUploadButton } from '@/components/chat/FileUploadButton';
import { UnifiedTemplateSelector } from '@/components/chat/UnifiedTemplateSelector';
import { VoiceRecorderButton } from '@/components/chat/VoiceRecorderButton';
import { ImagePastePreview } from '@/components/chat/ImagePastePreview';

import { globalVoiceRecorder } from '@/lib/globalVoiceRecorder';
import { formatPresenceStatus } from '@/lib/utils/presence';
import { useIsMobile } from '@/hooks/use-mobile';
import chatBg from '@/assets/chat-bg.png';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import { getWhatsAppErrorExplanation } from '@/lib/whatsappErrors';
import { getMessagePreview } from '@/lib/utils/messagePreview';
import type { Message } from '@/types';

interface ChatViewProps { onBack?: () => void; showBackButton?: boolean }

const toDateTimeLocalValue = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function ChatView({ onBack, showBackButton = false }: ChatViewProps) {
  const { activeChat, messages, addMessage, setMessages, setShowContactPanel, setDraft, updateMessageStatus } = useAppStore();
  const { user } = useAuth();
  const { isSharedUser } = useSharedInbox();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recorderState, setRecorderState] = useState(globalVoiceRecorder.getState());
  const [pastedImageFile, setPastedImageFile] = useState<File | null>(null);
  const [emojiPanelOpen, setEmojiPanelOpen] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const schedulePressTimer = useRef<NodeJS.Timeout | null>(null);

  // Check if the phone number is assigned to another user in the shared inbox (uses SECURITY DEFINER to bypass RLS)
  const checkConflictingAssignment = useCallback(async (): Promise<boolean> => {
    if (!activeChat || !user) return false;
    const phone = activeChat.contact.phone;

    const { data, error } = await supabase.rpc('check_phone_conflict' as any, {
      _phone: phone,
      _user_id: user.id,
    });

    if (error) {
      console.error('Phone conflict check failed:', error);
      return false;
    }

    const conflicts = data as any[];
    if (conflicts && conflicts.length > 0) {
      const ownerName = conflicts[0].owner_name || 'another user';
      toast({
        title: '🚫 Conversation Already Assigned',
        description: `This phone number (${phone}) is currently assigned to ${ownerName}. Replies will be routed to their inbox, so sending from here would create an inconsistent conversation.`,
        variant: 'destructive',
        duration: 8000,
      });
      return true;
    }
    return false;
  }, [activeChat, user, toast]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatMessages = activeChat ? messages[activeChat.id] || [] : [];

  const formatDaySeparator = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'EEEE, dd MMM yyyy');
  };

  useEffect(() => {
    const unsub = globalVoiceRecorder.subscribe(setRecorderState);
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    if (!activeChat) return;
    setInputValue(useAppStore.getState().drafts?.[activeChat.id] || '');
    useAppStore.getState().clearUnread(activeChat.id);
  }, [activeChat?.id]);

  // Real-time subscription for THIS chat's messages & status updates
  useEffect(() => {
    if (!user || !activeChat) return;

    const channel = supabase
      .channel(`chat-messages-${activeChat.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `contact_id=eq.${activeChat.id}` },
        (payload) => {
          const newMsg = payload.new as any;
          const existingMessages = useAppStore.getState().messages[activeChat.id] || [];
          if (existingMessages.find(m => m.id === newMsg.id)) return;
          addMessage(activeChat.id, {
            id: newMsg.id, contactId: newMsg.contact_id, content: newMsg.content,
            type: newMsg.type, status: newMsg.status, isOutgoing: newMsg.is_outgoing,
            timestamp: new Date(newMsg.created_at), mediaUrl: newMsg.media_url || undefined,
            whatsappMessageId: newMsg.whatsapp_message_id || undefined,
            replyToMessageId: newMsg.reply_to_message_id || undefined,
            replyToWamid: newMsg.reply_to_wamid || undefined,
            replySnapshot: newMsg.reply_snapshot || undefined,
            reactions: newMsg.reactions || [],
          });
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `contact_id=eq.${activeChat.id}` },
        (payload) => {
          const updated = payload.new as any;
          updateMessageStatus(activeChat.id, updated.id, updated.status);
          // Sync reactions/reply changes
          useAppStore.setState((state) => ({
            messages: {
              ...state.messages,
              [activeChat.id]: (state.messages[activeChat.id] || []).map(m =>
                m.id === updated.id ? {
                  ...m,
                  reactions: updated.reactions || [],
                  replySnapshot: updated.reply_snapshot || m.replySnapshot,
                } : m
              ),
            },
          }));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, activeChat, addMessage, updateMessageStatus]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    if (!messagesContainerRef.current) return;
    messagesContainerRef.current.scrollTo({ top: messagesContainerRef.current.scrollHeight, behavior });
  }, []);

  // Scroll to last message when chat opens
  useEffect(() => {
    if (!activeChat) return;
    // Run twice: once now, once after layout settles, to handle async message render
    scrollToBottom('auto');
    const id = requestAnimationFrame(() => scrollToBottom('auto'));
    const t = setTimeout(() => scrollToBottom('auto'), 80);
    return () => { cancelAnimationFrame(id); clearTimeout(t); };
  }, [activeChat?.id, scrollToBottom]);

  // Scroll to bottom when message count grows (new send/receive while open)
  useEffect(() => { scrollToBottom('smooth'); }, [chatMessages.length, scrollToBottom]);

  // Mobile keyboard: use visualViewport to keep header + input visible, only messages scroll
  useEffect(() => {
    if (!isMobile) return;
    const vv = window.visualViewport;
    if (!vv) return;
    
    const handleResize = () => {
      if (chatContainerRef.current) {
        // Set the container height to the visual viewport height
        const height = vv.height;
        chatContainerRef.current.style.height = `${height}px`;
        // Offset from top of viewport (handles address bar / scroll offset)
        chatContainerRef.current.style.top = `${vv.offsetTop}px`;
      }
      // Scroll messages to bottom after keyboard animation
      requestAnimationFrame(scrollToBottom);
    };

    vv.addEventListener('resize', handleResize);
    vv.addEventListener('scroll', handleResize);
    handleResize();
    
    return () => {
      vv.removeEventListener('resize', handleResize);
      vv.removeEventListener('scroll', handleResize);
      if (chatContainerRef.current) {
        chatContainerRef.current.style.height = '';
        chatContainerRef.current.style.top = '';
      }
    };
  }, [isMobile, scrollToBottom]);

  const sendMessageToWhatsApp = async (
    content: string,
    type: 'text' | 'image' | 'document' | 'audio' | 'sticker' = 'text',
    mediaUrl?: string,
    mediaMeta?: { fileName?: string; mimeType?: string },
    replyToWamid?: string,
  ) => {
    if (!activeChat || !user) return null;

    const { data: settings } = await supabase.from('whatsapp_settings').select('*').eq('user_id', user.id).maybeSingle();
    if (!settings?.api_token || !settings?.phone_number_id) {
      toast({ title: '❌ WhatsApp not configured', description: 'Go to Settings > WhatsApp API to configure your credentials.', variant: 'destructive', duration: 5000 });
      return null;
    }

    const normalizedPhone = activeChat.contact.phone.replace(/[^\d+]/g, '').replace(/^\+/, '');

    const { data, error } = await supabase.functions.invoke('whatsapp-api', {
      body: {
        action: 'send_message', token: settings.api_token, phoneNumberId: settings.phone_number_id,
        to: normalizedPhone, type, content: mediaUrl || content,
        mediaFileName: mediaMeta?.fileName, mediaMimeType: mediaMeta?.mimeType,
        replyToWamid,
      },
    });

    if (error || !data?.success) {
      const errMsg = data?.error || error?.message || 'Failed to send message';
      const details = getWhatsAppErrorExplanation(errMsg);
      toast({ title: `❌ ${details.title}`, description: `${details.description}\n\n💡 ${details.action}`, variant: 'destructive', duration: 8000 });
      return null;
    }

    return data.messageId as string;
  };

  // Build a reply snapshot for storing in DB
  const buildReplySnapshot = (m: Message) => ({
    type: m.type,
    content: m.content,
    isOutgoing: m.isOutgoing,
    fromName: m.isOutgoing ? 'You' : (activeChat?.contact.name || 'Contact'),
  });

  const handleReact = async (m: Message, emoji: string) => {
    if (!activeChat || !user) return;
    const existing = (m.reactions || []).filter(r => r.from !== 'me');
    const newReactions = [...existing, { emoji, from: 'me', fromName: 'You', at: new Date().toISOString() }];

    // Optimistic update
    useAppStore.setState((state) => ({
      messages: {
        ...state.messages,
        [activeChat.id]: (state.messages[activeChat.id] || []).map(x =>
          x.id === m.id ? { ...x, reactions: newReactions } : x
        ),
      },
    }));

    await supabase.from('messages').update({ reactions: newReactions } as any).eq('id', m.id);

    // Send reaction to WhatsApp if we have the original wamid
    if (m.whatsappMessageId) {
      const { data: settings } = await supabase.from('whatsapp_settings').select('api_token, phone_number_id').eq('user_id', user.id).maybeSingle();
      if (settings?.api_token && settings?.phone_number_id) {
        const normalizedPhone = activeChat.contact.phone.replace(/[^\d+]/g, '').replace(/^\+/, '');
        await supabase.functions.invoke('whatsapp-api', {
          body: {
            action: 'send_message', token: settings.api_token, phoneNumberId: settings.phone_number_id,
            to: normalizedPhone, type: 'reaction',
            replyToWamid: m.whatsappMessageId, reactionEmoji: emoji,
          },
        });
      }
    }
  };

  const handleSendSticker = async (sticker: { mediaUrl: string; mimeType: string }) => {
    if (!activeChat || !user) return;
    setSending(true);
    try {
      const blocked = await checkConflictingAssignment();
      if (blocked) { setSending(false); return; }

      const wamid = await sendMessageToWhatsApp('[Sticker]', 'sticker', sticker.mediaUrl, { mimeType: sticker.mimeType }, replyTo?.whatsappMessageId);
      const status = wamid ? 'sent' : 'failed';
      const replySnap = replyTo ? buildReplySnapshot(replyTo) : null;

      const { data } = await supabase.from('messages').insert({
        user_id: user.id, contact_id: activeChat.id, content: '[Sticker]',
        type: 'sticker', is_outgoing: true, status,
        media_url: sticker.mediaUrl, whatsapp_message_id: wamid || null,
        reply_to_message_id: replyTo?.id || null,
        reply_to_wamid: replyTo?.whatsappMessageId || null,
        reply_snapshot: replySnap,
      } as any).select().maybeSingle();
      if (data) {
        addMessage(activeChat.id, {
          id: data.id, contactId: data.contact_id, content: '[Sticker]', type: 'sticker',
          status, isOutgoing: true, timestamp: new Date(data.created_at), mediaUrl: sticker.mediaUrl,
          whatsappMessageId: wamid || undefined,
          replyToMessageId: replyTo?.id, replyToWamid: replyTo?.whatsappMessageId,
          replySnapshot: replySnap as any,
        });
      }
      setReplyTo(null);
    } finally {
      setSending(false);
    }
  };

  const handleSendMetaTemplate = async (template: any, params: Record<string, string>) => {
    if (!activeChat || !user) return;
    setSending(true);
    try {
      // Block if phone is assigned to another user in shared inbox
      const blocked = await checkConflictingAssignment();
      if (blocked) { setSending(false); return; }

      // Determine if this is a business-initiated template (utility, marketing, authentication)
      const templateCategory = (template.category || '').toUpperCase();
      const isBusinessInitiatedCategory = ['UTILITY', 'MARKETING', 'AUTHENTICATION'].includes(templateCategory);

      // Check if we're within the 24-hour service window (last incoming message < 24h ago)
      let inServiceWindow = false;
      if (isBusinessInitiatedCategory) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: lastIncoming } = await supabase
          .from('messages')
          .select('created_at')
          .eq('contact_id', activeChat.id)
          .eq('is_outgoing', false)
          .gte('created_at', twentyFourHoursAgo)
          .order('created_at', { ascending: false })
          .limit(1);
        inServiceWindow = (lastIncoming && lastIncoming.length > 0);
      }

      // Only charge credits for business-initiated templates OUTSIDE the service window
      const shouldDebitCredit = isBusinessInitiatedCategory && !inServiceWindow;

      // For shared users sending business-initiated templates outside service window, check credit balance first
      if (isSharedUser && shouldDebitCredit) {
        const { data: membership } = await supabase
          .from('shared_inbox_users' as any)
          .select('balance')
          .eq('shared_user_id', user.id)
          .eq('status', 'active')
          .limit(1);
        
        const currentBalance = (membership as any[])?.[0]?.balance ?? 0;
        if (currentBalance < 1) {
          toast({
            title: '💰 Insufficient Message Credits',
            description: `You need at least 1 credit to send a business-initiated template. Your current balance is ${currentBalance}. Contact your admin to top up.`,
            variant: 'destructive',
            duration: 8000,
          });
          setSending(false);
          return;
        }
      }

      const { data: settings } = await supabase.from('whatsapp_settings').select('*').eq('user_id', user.id).maybeSingle();
      if (!settings?.api_token || !settings?.phone_number_id) {
        toast({ title: '❌ WhatsApp not configured', variant: 'destructive', duration: 5000 });
        return;
      }
      const normalizedPhone = activeChat.contact.phone.replace(/[^\d+]/g, '').replace(/^\+/, '');
      
      const body = template.components?.find((c: any) => c.type === 'BODY');
      let previewText = body?.text || template.name;
      Object.entries(params).forEach(([key, value]) => { previewText = previewText.replace(key, value || key); });

      const { data, error } = await supabase.functions.invoke('whatsapp-api', {
        body: {
          action: 'send_message', token: settings.api_token, phoneNumberId: settings.phone_number_id,
          to: normalizedPhone, type: 'template', templateName: template.name,
          templateParams: params, templateLanguage: template.language || 'en',
        },
      });
      
      if (error || !data?.success) {
        const errMsg = data?.error || error?.message || 'Failed to send template';
        const details = getWhatsAppErrorExplanation(errMsg);
        toast({ title: `❌ ${details.title}`, description: `${details.description}\n\n💡 ${details.action}`, variant: 'destructive', duration: 8000 });
        
        // Failed messages do NOT deduct credits
        const { data: msgData } = await supabase.from('messages').insert({
          user_id: user.id, contact_id: activeChat.id, content: previewText,
          type: 'template', status: 'failed', is_outgoing: true, template_name: template.name, template_params: params,
        }).select().maybeSingle();
        
        if (msgData) {
          addMessage(activeChat.id, {
            id: msgData.id, contactId: msgData.contact_id, content: msgData.content, type: 'template',
            status: 'failed', isOutgoing: true, timestamp: new Date(msgData.created_at),
          });
        }
        return;
      }
      
      // Deduct credit for shared users on successful business-initiated templates outside service window
      if (isSharedUser && shouldDebitCredit) {
        const { data: newBalance } = await supabase.rpc('deduct_shared_credit' as any, {
          _shared_user_id: user.id,
        });
        const bal = newBalance as number;
        if (bal >= 0) {
          toast({ title: `💰 Credit deducted`, description: `Remaining balance: ${bal}`, duration: 3000 });
        }
      }

      const { data: msgData } = await supabase.from('messages').insert({
        user_id: user.id, contact_id: activeChat.id, content: previewText,
        type: 'template', status: 'sent', is_outgoing: true, whatsapp_message_id: data.messageId,
        template_name: template.name, template_params: params,
      }).select().maybeSingle();
      
      if (msgData) {
        addMessage(activeChat.id, {
          id: msgData.id, contactId: msgData.contact_id, content: msgData.content, type: 'template',
          status: 'sent', isOutgoing: true, timestamp: new Date(msgData.created_at), whatsappMessageId: data.messageId,
        });
      }
      
      toast({ title: '✅ Template sent', duration: 3000 });
    } catch (err: any) {
      const details = getWhatsAppErrorExplanation(err.message || 'Unknown error');
      toast({ title: `❌ ${details.title}`, description: `${details.description}\n\n💡 ${details.action}`, variant: 'destructive', duration: 8000 });
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !activeChat || !user) return;
    const content = inputValue.trim();

    setInputValue('');
    setDraft(activeChat.id, '');
    // Reset textarea height immediately after clearing
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    setSending(true);

    try {
      // Block if phone is assigned to another user in shared inbox
      const blocked = await checkConflictingAssignment();
      if (blocked) { setSending(false); setInputValue(content); return; }

      const currentReply = replyTo;
      setReplyTo(null);
      const replySnap = currentReply ? buildReplySnapshot(currentReply) : null;

      const whatsappMessageId = await sendMessageToWhatsApp(content, 'text', undefined, undefined, currentReply?.whatsappMessageId);
      const status = whatsappMessageId ? 'sent' : 'failed';

      const { data, error } = await supabase.from('messages').insert({
        user_id: user.id, contact_id: activeChat.id, content, type: 'text', is_outgoing: true,
        status, whatsapp_message_id: whatsappMessageId || null,
        reply_to_message_id: currentReply?.id || null,
        reply_to_wamid: currentReply?.whatsappMessageId || null,
        reply_snapshot: replySnap,
      } as any).select().maybeSingle();

      if (error) throw error;

      addMessage(activeChat.id, {
        id: data.id, contactId: data.contact_id, content: data.content, type: 'text',
        status, isOutgoing: true, timestamp: new Date(data.created_at),
        whatsappMessageId: whatsappMessageId || undefined,
        replyToMessageId: currentReply?.id, replyToWamid: currentReply?.whatsappMessageId,
        replySnapshot: replySnap as any,
      });

      // Auto-assign contact to shared user on first message
      if (isSharedUser && status === 'sent' && !activeChat.contact.assignedUserId) {
        await supabase.from('contacts').update({ assigned_user_id: user.id }).eq('id', activeChat.id);
      }

      // Show error alert for failed messages
      if (status === 'failed') {
        toast({ title: '❌ Message Failed', description: 'WhatsApp rejected this message. Check the error above for details.', variant: 'destructive', duration: 5000 });
      }

      // Keep focus on input so user can send next message immediately
      setTimeout(() => {
        inputRef.current?.focus();
        // On mobile, prevent keyboard from closing
        if (inputRef.current) {
          inputRef.current.blur();
          inputRef.current.focus();
        }
      }, 50);
    } catch (error: any) {
      const details = getWhatsAppErrorExplanation(error.message || 'Unknown error');
      toast({ title: `❌ ${details.title}`, description: `${details.description}\n\n💡 ${details.action}`, variant: 'destructive', duration: 8000 });
      setInputValue(content);
    } finally {
      setSending(false);
    }
  };

  const handleScheduleText = async () => {
    if (!inputValue.trim() || !activeChat || !user || !scheduleAt) return;
    const content = inputValue.trim();
    const scheduledDate = new Date(scheduleAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      toast({ title: 'Invalid schedule time', variant: 'destructive' });
      return;
    }

    const { error } = await supabase.from('scheduled_messages' as any).insert({
      user_id: user.id,
      contact_id: activeChat.id,
      content,
      type: 'text',
      scheduled_at: scheduledDate.toISOString(),
      status: 'pending',
    } as any);
    if (error) {
      toast({ title: 'Failed to schedule message', description: error.message, variant: 'destructive' });
      return;
    }
    setInputValue('');
    setDraft(activeChat.id, '');
    setScheduleAt('');
    setShowScheduleDialog(false);
    toast({ title: 'Message scheduled' });
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!activeChat) return;
    const currentMessages = messages[activeChat.id] || [];
      const updatedMessages = currentMessages.filter((m) => m.id !== messageId);
    setMessages(activeChat.id, updatedMessages);
    const lastMessage = updatedMessages.length > 0 ? updatedMessages[updatedMessages.length - 1] : undefined;
    useAppStore.setState((state) => ({
      chats: state.chats.map((chat) => chat.id === activeChat.id ? { ...chat, lastMessage } : chat),
    }));
    try {
      const { error } = await supabase.from('messages').update({ is_deleted: true, deleted_at: new Date().toISOString() } as any).eq('id', messageId);
      if (error) throw error;
    } catch (error: any) {
      setMessages(activeChat.id, currentMessages);
      toast({ title: '❌ Failed to delete message', description: error.message, variant: 'destructive', duration: 5000 });
    }
  };

  // Meta-supported audio MIME types for WhatsApp Cloud API
  const SUPPORTED_AUDIO_MIMES = [
    'audio/aac', 'audio/amr', 'audio/mpeg', 'audio/mp4', 'audio/ogg',
    'audio/opus', 'audio/ogg; codecs=opus',
  ];

  const handleFileUpload = async (file: File, type: 'image' | 'document' | 'audio') => {
    if (!activeChat || !user) return;
    setUploading(true);

    try {
      // Block if phone is assigned to another user in shared inbox
      const blocked = await checkConflictingAssignment();
      if (blocked) { setUploading(false); return; }

      const finalFile = file;
      const finalMimeType = file.type || 'application/octet-stream';

      // Detect video files (selected via Photos & Videos picker, which uses type='image')
      let effectiveType: 'image' | 'document' | 'audio' | 'video' = type;
      const isVideo = finalMimeType.toLowerCase().startsWith('video/') ||
        /\.(mp4|3gp|mov|m4v|webm|mkv)$/i.test(finalFile.name);
      if (type === 'image' && isVideo) {
        effectiveType = 'video';
      }

      // If audio format isn't supported by Meta, send as document so recipient can open it
      if (type === 'audio' && !SUPPORTED_AUDIO_MIMES.some(m => finalMimeType.toLowerCase().startsWith(m))) {
        console.log(`⚠️ Audio MIME "${finalMimeType}" not supported by WhatsApp, sending as document`);
        effectiveType = 'document';
      }

      const filePath = `${user.id}/${activeChat.id}/${Date.now()}-${finalFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(filePath, finalFile, { contentType: finalMimeType, upsert: false });
      
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(filePath);
      const mediaUrl = urlData.publicUrl;

      const msgType = effectiveType === 'audio' ? 'audio' : effectiveType;
      const displayName = finalFile.name;
      
      const whatsappMessageId = await sendMessageToWhatsApp(displayName, msgType, mediaUrl, { 
        fileName: displayName, mimeType: finalMimeType 
      });
      const status = whatsappMessageId ? 'sent' : 'failed';

      const { data, error } = await supabase.from('messages').insert({
        user_id: user.id, contact_id: activeChat.id, content: displayName,
        type: msgType, status, is_outgoing: true,
        media_url: mediaUrl, whatsapp_message_id: whatsappMessageId || null,
      }).select().maybeSingle();
      
      if (error) throw error;

      addMessage(activeChat.id, {
        id: data.id, contactId: data.contact_id, content: data.content, type: msgType,
        status, isOutgoing: true, timestamp: new Date(data.created_at), mediaUrl,
      });

      if (status === 'failed') {
        toast({ title: '❌ Media Failed', description: 'WhatsApp rejected this file. Check the error above for details.', variant: 'destructive', duration: 5000 });
      }
    } catch (error: any) {
      const details = getWhatsAppErrorExplanation(error.message || 'File upload failed');
      toast({ title: `❌ ${details.title}`, description: `${details.description}\n\n💡 ${details.action}`, variant: 'destructive', duration: 8000 });
    } finally {
      setUploading(false);
    }
  };

  // Voice note: record → convert to MP3 via edge function → upload to Meta via media ID → send
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);

  const handleVoiceNoteSend = async (blob: Blob) => {
    if (!activeChat || !user) return;
    if (blob.size < 1000) {
      toast({ title: 'Recording too short', description: 'Please record for at least 1 second.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      // Block if phone is assigned to another user in shared inbox
      const blocked = await checkConflictingAssignment();
      if (blocked) { setUploading(false); return; }

      // Voice is already MP3 from vmsg encoder — no conversion needed
      setVoiceStatus('Sending...');
      const mp3File = new File([blob], `voice-${Date.now()}.mp3`, { type: blob.type || 'audio/mpeg' });

      // Get WhatsApp settings
      const { data: settings } = await supabase.from('whatsapp_settings').select('*').eq('user_id', user.id).maybeSingle();
      if (!settings?.api_token || !settings?.phone_number_id) {
        toast({ title: '❌ WhatsApp not configured', variant: 'destructive' });
        return;
      }

      // Upload to Meta to get media_id
      const formData = new FormData();
      formData.append('file', mp3File, 'voice-note.mp3');
      formData.append('type', 'audio/mpeg');
      formData.append('messaging_product', 'whatsapp');

      const metaUploadRes = await fetch(
        `https://graph.facebook.com/v25.0/${settings.phone_number_id}/media`,
        { method: 'POST', headers: { 'Authorization': `Bearer ${settings.api_token}` }, body: formData }
      );

      if (!metaUploadRes.ok) {
        const metaErr = await metaUploadRes.json();
        throw new Error(metaErr?.error?.message || 'Failed to upload audio to WhatsApp');
      }

      const metaUploadData = await metaUploadRes.json();
      const mediaId = metaUploadData.id;
      if (!mediaId) throw new Error('No media ID returned from WhatsApp');

      // Send WhatsApp audio message using media_id
      const normalizedPhone = activeChat.contact.phone.replace(/[^\d+]/g, '').replace(/^\+/, '');
      const sendRes = await fetch(
        `https://graph.facebook.com/v25.0/${settings.phone_number_id}/messages`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${settings.api_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: normalizedPhone, type: 'audio', audio: { id: mediaId } }),
        }
      );

      const sendData = await sendRes.json();
      if (!sendRes.ok || !sendData.messages?.[0]?.id) {
        throw new Error(sendData?.error?.message || 'Failed to send voice note');
      }

      const whatsappMessageId = sendData.messages[0].id;

      // Upload mp3 to storage for local playback
      const filePath = `${user.id}/${activeChat.id}/${Date.now()}-voice-note.mp3`;
      await supabase.storage.from('chat-media').upload(filePath, mp3File, { contentType: 'audio/mpeg', upsert: false });
      const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(filePath);

      const { data: msgData, error: dbError } = await supabase.from('messages').insert({
        user_id: user.id, contact_id: activeChat.id, content: '🎵 Voice note',
        type: 'audio', status: 'sent', is_outgoing: true,
        media_url: urlData.publicUrl, whatsapp_message_id: whatsappMessageId,
      }).select().maybeSingle();

      if (dbError) throw dbError;

      addMessage(activeChat.id, {
        id: msgData.id, contactId: msgData.contact_id, content: '🎵 Voice note',
        type: 'audio', status: 'sent', isOutgoing: true,
        timestamp: new Date(msgData.created_at), mediaUrl: urlData.publicUrl,
        whatsappMessageId: whatsappMessageId,
      });

      toast({ title: '✅ Voice note sent', duration: 3000 });
    } catch (error: any) {
      console.error('Voice note error:', error);
      const details = getWhatsAppErrorExplanation(error.message || 'Voice note failed');
      toast({ title: `❌ ${details.title}`, description: `${details.description}\n\n💡 ${details.action}`, variant: 'destructive', duration: 8000 });
    } finally {
      setUploading(false);
      setVoiceStatus(null);
    }
  };

  // Desktop: Enter sends, Shift+Enter = newline. Mobile: Enter = newline always
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !isMobile && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!activeChat) {
    return (
      <div className="flex-1 flex items-center justify-center chat-background" style={{ backgroundImage: `url(${chatBg})`, backgroundAttachment: 'fixed', backgroundSize: 'cover' }}>
        <div className="text-center p-8 rounded-2xl">
          <MessageCircle className="w-14 h-14 text-primary/70 mx-auto mb-3" />
          <h2 className="text-[40px] text-foreground/80 mb-1">WABA</h2>
          <p className="text-muted-foreground">Click a chat to start messaging</p>
        </div>
      </div>
    );
  }

  const contact = activeChat.contact;
  const presenceText = formatPresenceStatus(contact.lastSeen);

  return (
    <div
      ref={chatContainerRef}
      className={cn(
        "flex flex-col min-h-0 chat-background overflow-hidden",
        isMobile ? "fixed left-0 right-0" : "flex-1 h-full relative"
      )}
      style={{ backgroundImage: `url(${chatBg})`, backgroundAttachment: 'fixed', backgroundSize: 'cover' }}
    >
      {/* Header - ALWAYS at top, never moves */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-panel-border bg-panel-header/95 shrink-0 z-20" style={{ position: 'sticky', top: 0 }}>
        {showBackButton && (
          <Button variant="ghost" size="icon" className="h-[45px] w-[45px] text-[hsl(var(--chat-control-icon))]" onClick={onBack}>
            <ArrowLeft className="h-[29px] w-[29px]" strokeWidth={2.75} />
          </Button>
        )}
        <button className="flex items-center gap-2 flex-1 min-w-0" onClick={() => setShowContactPanel(true)}>
          <ContactAvatar name={contact.name} avatar={contact.avatar} isOnline={contact.isOnline} size="md" />
          <div className="min-w-0 text-left">
            <p className="font-extrabold text-[16px] truncate">{contact.name}</p>
            <p className="text-xs text-muted-foreground truncate">{presenceText}</p>
          </div>
        </button>
        <ChatOptionsMenu
          chatId={activeChat.id} contactName={contact.name}
          isPinned={activeChat.isPinned || contact.isPinned}
          isMuted={activeChat.isMuted || contact.isMuted}
          isArchived={activeChat.isArchived || contact.isArchived}
          isBlocked={contact.isBlocked}
          assignedUserId={contact.assignedUserId}
          onViewContact={() => setShowContactPanel(true)}
        />
      </div>

      {/* Messages - scrollable area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 pb-10 message-spacing-container custom-scrollbar min-h-0">
        {chatMessages.map((message, idx) => {
          const showDaySeparator = idx === 0 || !isSameDay(new Date(chatMessages[idx - 1].timestamp), new Date(message.timestamp));
          return (
            <div key={message.id}>
              {showDaySeparator && (
                <div className="conversation-day-separator">
                  <span>{formatDaySeparator(new Date(message.timestamp))}</span>
                </div>
              )}
              <MessageBubble
                message={message}
                onDelete={() => handleDeleteMessage(message.id)}
                onReply={(m) => { setReplyTo(m); setTimeout(() => inputRef.current?.focus(), 50); }}
                onReact={handleReact}
              />
            </div>
          );
        })}
      </div>

      <ImagePastePreview
        file={pastedImageFile}
        onCancel={() => setPastedImageFile(null)}
        onConfirm={async (file, caption) => {
          setPastedImageFile(null);
          await handleFileUpload(file, 'image');
          // If there's a caption, send it as a follow-up text message
          if (caption?.trim() && activeChat && user) {
            const whatsappMessageId = await sendMessageToWhatsApp(caption.trim());
            const status = whatsappMessageId ? 'sent' : 'failed';
            const { data } = await supabase.from('messages').insert({
              user_id: user.id, contact_id: activeChat.id, content: caption.trim(), type: 'text', is_outgoing: true,
              status, whatsapp_message_id: whatsappMessageId || null,
            }).select().maybeSingle();
            if (data) {
              addMessage(activeChat.id, {
                id: data.id, contactId: data.contact_id, content: data.content, type: 'text',
                status, isOutgoing: true, timestamp: new Date(data.created_at),
                whatsappMessageId: whatsappMessageId || undefined,
              });
            }
          }
        }}
      />

      {/* Voice conversion status */}
      {voiceStatus && (
        <div className="px-4 py-2 bg-primary/10 text-center text-sm font-medium text-primary animate-pulse shrink-0">
          {voiceStatus}
        </div>
      )}

      {/* Reply preview bar */}
      {replyTo && (
        <div className="px-3 py-2 mx-2 sm:mx-3 mb-1 bg-card border-l-[3px] border-primary rounded-md flex items-start gap-2 shrink-0 z-20">
          <ReplyIcon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-primary">
              Replying to {replyTo.isOutgoing ? 'yourself' : (activeChat.contact.name || 'Contact')}
            </p>
            <p className="text-[12px] text-muted-foreground truncate">
              {getMessagePreview(replyTo)}
            </p>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-accent rounded-full shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="px-2 sm:px-3 pt-1.5 shrink-0 z-20" style={{ paddingBottom: 'max(5px, env(safe-area-inset-bottom))' }}>
        <div className="flex w-full items-end gap-2 max-w-3xl mx-auto pr-2">
          {recorderState.state !== 'idle' ? (
            <VoiceRecorderButton
              onRecordingComplete={(blob) => handleVoiceNoteSend(blob)}
              disabled={sending || uploading}
            />
          ) : (
            <>
              {/* Message input area - contains emoji, textarea, file, template */}
              <div className="min-w-0 flex-1 flex items-end bg-card dark:bg-[hsl(200_12%_16%)] rounded-[25px] px-2 py-1 border border-input shadow-sm gap-1">
                {/* Emoji button */}
                <div className="shrink-0 self-end pb-[2px]">
                  <EmojiPickerButton
                    onEmojiSelect={(emoji) => {
                      setInputValue((prev) => prev + emoji);
                      setDraft(activeChat.id, inputValue + emoji);
                    }}
                    onStickerSelect={handleSendSticker}
                    onDeleteChar={() => {
                      setInputValue((prev) => {
                        const arr = [...prev];
                        arr.pop();
                        return arr.join('');
                      });
                    }}
                    onToggle={(isOpen) => {
                      setEmojiPanelOpen(isOpen);
                      if (isOpen && isMobile) {
                        // Close keyboard when emoji opens
                        inputRef.current?.blur();
                      }
                      if (!isOpen && isMobile) {
                        // Open keyboard when emoji closes
                        setTimeout(() => inputRef.current?.focus(), 50);
                      }
                    }}
                  />
                </div>

                {/* Textarea */}
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setDraft(activeChat.id, e.target.value);
                    // Auto-resize
                    if (inputRef.current) {
                      inputRef.current.style.height = 'auto';
                      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 154)}px`;
                    }
                  }}
                  onFocus={() => {
                    if (isMobile && emojiPanelOpen) {
                      setEmojiPanelOpen(false);
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  onPaste={(e) => {
                    const items = e.clipboardData?.items;
                    if (!items) return;
                    for (let i = 0; i < items.length; i++) {
                      if (items[i].type.startsWith('image/')) {
                        e.preventDefault();
                        const file = items[i].getAsFile();
                        if (file) setPastedImageFile(file);
                        return;
                      }
                    }
                  }}
                  placeholder="Message"
                  rows={1}
                  className="min-w-0 flex-1 resize-none border-0 focus:outline-none min-h-[38px] max-h-[154px] py-[7px] px-2 text-[16px] bg-transparent leading-[1.4] font-medium overflow-y-auto custom-scrollbar"
                  style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'rgba(155, 155, 155, 0.5) transparent'
                  }}
                  /* Allow typing while a message is sending — input is never disabled */
                />

                {/* File upload button */}
                <div className="shrink-0 self-end pb-[2px]">
                  <FileUploadButton
                    onFileSelect={(file, type) => handleFileUpload(file, type)}
                    uploading={uploading}
                  />
                </div>

                {/* Template button */}
                <div className="shrink-0 self-end pb-[2px]">
                  <UnifiedTemplateSelector
                    contact={contact}
                    onSelectMetaTemplate={handleSendMetaTemplate}
                    onInsertAppTemplate={(text) => {
                      setInputValue((prev) => prev + text);
                      setDraft(activeChat.id, inputValue + text);
                    }}
                  />
                </div>
              </div>

              {/* Send or Voice button - OUTSIDE message area */}
              {inputValue.trim()
                ? <Button
                    size="icon"
                    className="h-[46px] w-[46px] shrink-0 rounded-full bg-primary hover:bg-primary/90 shadow-md"
                    onClick={handleSend}
                    onContextMenu={(e) => { e.preventDefault(); setShowScheduleDialog(true); }}
                    onTouchStart={() => { schedulePressTimer.current = setTimeout(() => setShowScheduleDialog(true), 550); }}
                    onTouchEnd={() => { if (schedulePressTimer.current) clearTimeout(schedulePressTimer.current); }}
                    disabled={sending || uploading}
                    title="Send. Right-click or long-press to schedule."
                  >
                    <Send className="h-5 w-5" strokeWidth={2.25} />
                  </Button>
                : (
                  <VoiceRecorderButton
                    onRecordingComplete={(blob) => handleVoiceNoteSend(blob)}
                    disabled={sending || uploading}
                  />
                )}
            </>
          )}
        </div>
      </div>

      {/* Mobile emoji panel — renders below input like a keyboard */}
      {isMobile && emojiPanelOpen && (
        <div className="shrink-0 z-20">
          <MobileEmojiPanel
            onEmojiSelect={(emoji) => {
              setInputValue((prev) => prev + emoji);
              setDraft(activeChat.id, inputValue + emoji);
            }}
            onDeleteChar={() => {
              setInputValue((prev) => {
                const arr = [...prev];
                arr.pop();
                return arr.join('');
              });
            }}
            onStickerSelect={(s) => { handleSendSticker(s); setEmojiPanelOpen(true); }}
          />
        </div>
      )}

      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule message</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input type="datetime-local" min={toDateTimeLocalValue()} value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
            <Button className="w-full" onClick={handleScheduleText} disabled={!scheduleAt || !inputValue.trim()}>
              <Clock className="h-4 w-4 mr-2" />Schedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

