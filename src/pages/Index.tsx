// @ts-nocheck
import { useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
import { useBackButton } from '@/hooks/useBackButton';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { supabase } from '@/integrations/supabase/client';
import { initializePushNotifications, setupForegroundMessages } from '@/lib/firebase';

const Index = () => {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { 
    loadData, 
    loading, 
    dataLoaded, 
    addMessage, 
    addContact,
    activeChat, 
    setActiveChat,
    showContactPanel,
    setShowContactPanel,
    showAddContactModal,
    setShowAddContactModal,
    incrementUnread,
  } = useAppStore();

  // Apply persisted theme on mount
  useEffect(() => {
    const saved = localStorage.getItem('app_theme') || 'light';
    const isDark = saved === 'dark' || (saved === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  // 🔗 Deep-link: open the exact chat when launched via notification
  // Triggers: ?chat=<id> URL, postMessage from service worker, or in-app
  // 'open-chat' CustomEvent fallback (used by direct Notification API).
  useEffect(() => {
    const openChatById = (contactId: string | null | undefined) => {
      if (!contactId) return;
      const tryOpen = (attempt = 0) => {
        const state = useAppStore.getState();
        const chat = state.chats.find((c) => c.id === contactId);
        if (chat) {
          state.setActiveChat(chat);
          // Clean the URL after opening so refresh doesn't re-trigger
          if (window.location.search.includes('chat=')) {
            const cleanUrl = window.location.pathname + window.location.hash;
            window.history.replaceState({}, '', cleanUrl);
          }
          return;
        }
        if (attempt < 20) setTimeout(() => tryOpen(attempt + 1), 250);
      };
      tryOpen();
    };

    // 1. URL param on initial load
    const params = new URLSearchParams(window.location.search);
    const initialChat = params.get('chat');
    if (initialChat) openChatById(initialChat);

    // 2. Service worker → page postMessage (notification click while app open or PWA wakes)
    const onSwMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'OPEN_CHAT' && msg.contactId) {
        openChatById(msg.contactId);
        try { window.focus(); } catch {}
      }
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);

    // 3. In-page Notification API fallback
    const onCustom = (e: any) => openChatById(e?.detail?.contactId);
    window.addEventListener('open-chat', onCustom);

    return () => {
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
      window.removeEventListener('open-chat', onCustom);
    };
  }, []);

  // Load data from server on auth + initialize FCM
  useEffect(() => {
    if (user) {
      loadData(user.id);
      
      // Initialize FCM push notifications silently
      initializePushNotifications(user.id).then((result) => {
        if (result.success) {
          console.log('🔔 FCM push initialized');
        } else {
          console.log('🔔 FCM push skipped:', result.error);
        }
      });
      
      // Listen for foreground FCM messages (play sound / show notification)
      setupForegroundMessages((payload) => {
        const state = useAppStore.getState();
        const contactId = payload?.data?.contactId;
        // Don't show foreground notification if viewing that chat
        if (contactId && state.activeChat?.id === contactId) return;
        
        // Show browser notification for foreground messages
        if ('Notification' in window && Notification.permission === 'granted') {
          const title = payload?.notification?.title || payload?.data?.title || 'New Message';
          const body = payload?.notification?.body || payload?.data?.body || 'You have a new message';
          try {
            navigator.serviceWorker?.ready?.then(reg => {
              reg.showNotification(title, {
                body,
                icon: '/pwa-192x192.png',
                tag: contactId ? `fcm-${contactId}` : 'fcm-message',
                silent: false,
              });
            });
          } catch { /* no-op */ }
        }
      });
    }
  }, [user, loadData]);

  // 🔥 ENHANCED Global realtime: messages (INSERT + UPDATE) + contacts (INSERT + UPDATE)
  useEffect(() => {
    if (!user) return;

    console.log('📡 [Global RT] Setting up real-time subscriptions for user:', user.id);

    const channel = supabase
      .channel('global-realtime')
      // ── New contact creation (from webhook) ──
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'contacts',
      }, async (payload) => {
        const c = payload.new as any;
        
        // Only process contacts that belong to this user
        if (c.user_id !== user.id && c.assigned_user_id !== user.id) return;
        
        console.log('👤 [Global RT] NEW CONTACT created:', {
          id: c.id,
          name: c.name,
          phone: c.phone,
          userId: c.user_id,
        });
        
        // Fetch full contact with account_details
        const { data: fullContact } = await supabase
          .from('contacts')
          .select('*, account_details(*)')
          .eq('id', c.id)
          .single();
        
        if (!fullContact) {
          console.error('❌ [Global RT] Failed to fetch full contact data');
          return;
        }
        
        const newContact = {
          id: fullContact.id,
          loanId: fullContact.loan_id,
          name: fullContact.name,
          phone: fullContact.phone,
          amount: fullContact.amount ? Number(fullContact.amount) : undefined,
          appType: fullContact.app_type || 'tloan',
          dayType: fullContact.day_type ?? 0,
          isOnline: fullContact.is_online || false,
          lastSeen: fullContact.last_seen ? new Date(fullContact.last_seen) : undefined,
          avatar: fullContact.avatar_url || undefined,
          isPinned: fullContact.is_pinned || false,
          isMuted: fullContact.is_muted || false,
          isArchived: fullContact.is_archived || false,
          assignedUserId: fullContact.assigned_user_id || undefined,
          createdAt: new Date(fullContact.created_at),
          updatedAt: new Date(fullContact.updated_at),
          accountDetails: (fullContact.account_details || []).map((ad: any) => ({
            id: ad.id,
            bank: ad.bank,
            accountNumber: ad.account_number,
            accountName: ad.account_name,
          })),
        };
        
        // Add contact to store
        const { addContact } = useAppStore.getState();
        addContact(newContact);
        
        console.log('✅ [Global RT] New contact added to store:', newContact.name);
      })
      // ── New incoming messages ──
      .on('postgres_changes', {
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const m = payload.new as any;
        
        console.log('📨 [Global RT] New message INSERT detected:', {
          id: m.id,
          contactId: m.contact_id,
          isOutgoing: m.is_outgoing,
          type: m.type,
          content: m.content?.substring(0, 50),
        });
        
        // Build message object
        const msg = {
          id: m.id, 
          contactId: m.contact_id, 
          content: m.content,
          type: m.type as any, 
          status: m.status as any,
          isOutgoing: m.is_outgoing, 
          timestamp: new Date(m.created_at),
          mediaUrl: m.media_url || undefined,
          whatsappMessageId: m.whatsapp_message_id || undefined,
          templateName: m.template_name || undefined,
          templateParams: m.template_params || undefined,
        };
        
        const state = useAppStore.getState();
        const contactExists = state.contacts.find(c => c.id === m.contact_id);
        
        if (!contactExists) {
          console.log('⚠️ [Global RT] Contact not found locally yet, waiting for contact INSERT...');
          // Contact will be added via the contact INSERT subscription above
          // Then the message will be added automatically via addContact -> creates chat
          // OR we can retry after a short delay to allow contact INSERT to process first
          setTimeout(() => {
            const retryState = useAppStore.getState();
            const retryContact = retryState.contacts.find(c => c.id === m.contact_id);
            if (retryContact) {
              console.log('✅ [Global RT] Contact now exists, adding message on retry');
              addMessage(m.contact_id, msg);
              if (!m.is_outgoing && retryState.activeChat?.id !== m.contact_id) {
                incrementUnread(m.contact_id);
              }
            } else {
              console.warn('⚠️ [Global RT] Contact still not found after retry, doing full reload');
              loadData(user.id);
            }
          }, 500); // Wait 500ms for contact INSERT to process
        } else {
          console.log('➕ [Global RT] Adding message to existing contact:', m.contact_id);
          
          // Add message to store (this will also update chat list preview)
          addMessage(m.contact_id, msg);
          
          // EXPLICIT: Increment unread if it's an incoming message and chat is not active
          if (!m.is_outgoing && state.activeChat?.id !== m.contact_id) {
            console.log('🔔 [Global RT] Incrementing unread for contact:', m.contact_id);
            incrementUnread(m.contact_id);
          }
          
          console.log('✅ [Global RT] Message processed successfully');
        }
      })
      // ── Status updates (sent→delivered→read, failed) ──
      .on('postgres_changes', {
        event: 'UPDATE', 
        schema: 'public', 
        table: 'messages',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const m = payload.new as any;
        
        console.log('🔄 [Global RT] Message UPDATE detected:', {
          id: m.id,
          contactId: m.contact_id,
          status: m.status,
        });
        
        if (m.status) {
          const { updateMessageStatus } = useAppStore.getState();
          updateMessageStatus(m.contact_id, m.id, m.status);
          console.log('✅ [Global RT] Status updated:', m.status);
        }
      })
      // ── Contact online/last_seen updates ──
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'contacts',
      }, (payload) => {
        const c = payload.new as any;
        const state = useAppStore.getState();
        
        // Only process contacts that belong to this user
        if (!state.contacts.find(ct => ct.id === c.id)) return;
        
        console.log('👤 [Global RT] Contact UPDATE detected:', {
          id: c.id,
          name: c.name,
          isOnline: c.is_online,
        });
        
        state.updateContact(c.id, {
          isOnline: c.is_online ?? false,
          lastSeen: c.last_seen ? new Date(c.last_seen) : undefined,
          isPinned: c.is_pinned ?? false,
          isMuted: c.is_muted ?? false,
          isArchived: c.is_archived ?? false,
          name: c.name,
          amount: c.amount ? Number(c.amount) : undefined,
          dayType: c.day_type ?? 0,
          appType: c.app_type || 'tloan',
        });
      })
      .subscribe((status) => {
        console.log('📡 [Global RT] Subscription status:', status);
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ [Global RT] Successfully subscribed to real-time events');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ [Global RT] Channel error - real-time may not work');
        } else if (status === 'TIMED_OUT') {
          console.error('⏱️ [Global RT] Subscription timed out - retrying...');
        } else if (status === 'CLOSED') {
          console.warn('🔌 [Global RT] Channel closed');
        }
      });

    return () => { 
      console.log('🔌 [Global RT] Unsubscribing from channel');
      supabase.removeChannel(channel); 
    };
  }, [user, loadData, addMessage, addContact, incrementUnread]);

  // 🔙 NATIVE BACK BUTTON HANDLER (Android hardware back)
  useBackButton(() => {
    // Priority 1: Close modals first
    if (showAddContactModal) {
      setShowAddContactModal(false);
      return true; // handled
    }

    // Priority 2: Close contact panel
    if (showContactPanel) {
      setShowContactPanel(false);
      return true; // handled
    }

    // Priority 3: Exit chat and go to list
    if (activeChat) {
      setActiveChat(null);
      return true; // handled
    }

    // Priority 4: At root - allow app exit
    return false; // not handled - let browser/OS handle
  });

  if (loading && !dataLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return isMobile ? <MobileLayout /> : <DesktopLayout />;
};

export default Index;
