// @ts-nocheck
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ArrowLeft, MessageCircle, Send } from 'lucide-react';
import { EmojiPickerButton, MobileEmojiPanel } from '@/components/chat/EmojiPickerButton';
import { Button } from '@/components/ui/button';
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

interface ChatViewProps { onBack?: () => void; showBackButton?: boolean }

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
          });
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `contact_id=eq.${activeChat.id}` },
        (payload) => {
          const updated = payload.new as any;
          updateMessageStatus(activeChat.id, updated.id, updated.status);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, activeChat, addMessage, updateMessageStatus]);

  const scrollToBottom = useCallback(() => {
    if (!messagesContainerRef.current) return;
    messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
  }, []);

  useEffect(() => { scrollToBottom(); }, [chatMessages.length, scrollToBottom]);

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
    type: 'text' | 'image' | 'document' | 'audio' = 'text',
    mediaUrl?: string,
    mediaMeta?: { fileName?: string; mimeType?: string },
  ) => {
    if (!activeChat || !user) return null;

    const { data: settings } = await supabase.from('whatsapp_settings').select('*').eq('user_id', user.id).single();
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

      const { data: settings } = await supabase.from('whatsapp_settings').select('*').eq('user_id', user.id).single();
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
        }).select().single();
        
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
      }).select().single();
      
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
    setSending(true);

    try {
      // Block if phone is assigned to another user in shared inbox
      const blocked = await checkConflictingAssignment();
      if (blocked) { setSending(false); setInputValue(content); return; }

      const whatsappMessageId = await sendMessageToWhatsApp(content);
      const status = whatsappMessageId ? 'sent' : 'failed';

      const { data, error } = await supabase.from('messages').insert({
        user_id: user.id, contact_id: activeChat.id, content, type: 'text', is_outgoing: true,
        status, whatsapp_message_id: whatsappMessageId || null,
      }).select().single();

      if (error) throw error;

      addMessage(activeChat.id, {
        id: data.id, contactId: data.contact_id, content: data.content, type: 'text',
        status, isOutgoing: true, timestamp: new Date(data.created_at),
        whatsappMessageId: whatsappMessageId || undefined,
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
      const { error } = await supabase.from('messages').delete().eq('id', messageId);
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

      // If audio format isn't supported by Meta, send as document so recipient can open it
      let effectiveType: 'image' | 'document' | 'audio' = type;
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
      }).select().single();
      
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
      const { data: settings } = await supabase.from('whatsapp_settings').select('*').eq('user_id', user.id).single();
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
        `https://graph.facebook.com/v18.0/${settings.phone_number_id}/messages`,
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
      }).select().single();

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
        {showBackButton && <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>}
        <button className="flex items-center gap-2 flex-1 min-w-0" onClick={() => setShowContactPanel(true)}>
          <ContactAvatar name={contact.name} avatar={contact.avatar} isOnline={contact.isOnline} size="md" />
          <div className="min-w-0 text-left">
            <p className="font-bold truncate">{contact.name}</p>
            <p className="text-xs text-muted-foreground truncate">{presenceText}</p>
          </div>
        </button>
        <ChatOptionsMenu
          chatId={activeChat.id} contactName={contact.name}
          isPinned={activeChat.isPinned || contact.isPinned}
          isMuted={activeChat.isMuted || contact.isMuted}
          isArchived={activeChat.isArchived || contact.isArchived}
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
              <MessageBubble message={message} onDelete={() => handleDeleteMessage(message.id)} />
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
            }).select().single();
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

      {/* Input bar - transparent, floating above emoji panel */}
      <div className="px-2 sm:px-3 pt-1.5 pb-2 shrink-0 z-20">
        <div className="flex items-end gap-1.5 max-w-3xl mx-auto">
          {recorderState.state === 'idle' && (
            <>
              <div><FileUploadButton onFileSelect={(file, type) => handleFileUpload(file, type)} uploading={uploading} /></div>
              <UnifiedTemplateSelector
                contact={contact}
                onSelectMetaTemplate={handleSendMetaTemplate}
                onInsertAppTemplate={(text) => {
                  setInputValue((prev) => prev + text);
                  setDraft(activeChat.id, inputValue + text);
                }}
              />
            </>
          )}

          {recorderState.state !== 'idle' ? (
            <VoiceRecorderButton
              onRecordingComplete={(blob) => handleVoiceNoteSend(blob)}
              disabled={sending || uploading}
            />
          ) : (
            <>
              <div className="flex-1 flex items-end bg-card dark:bg-[hsl(200_12%_16%)] rounded-[25px] px-3 py-1 border border-input shadow-sm gap-1">
                <EmojiPickerButton
                  onEmojiSelect={(emoji) => {
                    setInputValue((prev) => prev + emoji);
                    setDraft(activeChat.id, inputValue + emoji);
                  }}
                  onDeleteChar={() => {
                    setInputValue((prev) => {
                      // Remove last grapheme (handles multi-byte emoji)
                      const arr = [...prev];
                      arr.pop();
                      return arr.join('');
                    });
                  }}
                  onToggle={(isOpen) => {
                    setEmojiPanelOpen(isOpen);
                    if (isOpen && isMobile) {
                      // Blur input so mobile keyboard closes
                      inputRef.current?.blur();
                    }
                  }}
                />
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setDraft(activeChat.id, e.target.value);
                  }}
                  onFocus={() => {
                    // Close emoji panel when keyboard opens on mobile
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
                  className="flex-1 resize-none border-0 focus:outline-none min-h-[36px] max-h-[120px] py-[6px] text-[15px] bg-transparent leading-[1.35] font-medium overflow-y-auto"
                  disabled={sending || uploading}
                />
              </div>

              {inputValue.trim()
                ? <Button size="icon" className="h-[42px] w-[42px] shrink-0 rounded-full bg-primary hover:bg-primary/90 shadow-sm" onClick={handleSend} disabled={sending || uploading}>
                    <Send className="h-[18px] w-[18px]" strokeWidth={2.25} />
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
          />
        </div>
      )}

      {/* Safe area spacer */}
      <div className="shrink-0" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }} />
    </div>
  );
}
