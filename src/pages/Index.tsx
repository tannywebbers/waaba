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
    activeChat, 
    setActiveChat,
    showContactPanel,
    setShowContactPanel,
    showAddContactModal,
    setShowAddContactModal,
  } = useAppStore();

  // Apply persisted theme on mount
  useEffect(() => {
    const saved = localStorage.getItem('app_theme') || 'light';
    const isDark = saved === 'dark' || (saved === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
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

  // 🔥 Global realtime: messages (INSERT + UPDATE) + contacts (UPDATE)
  useEffect(() => {
    if (!user) return;

    console.log('📡 [Global] Setting up real-time subscriptions for user:', user.id);

    const channel = supabase
      .channel('global-realtime')
      // ── New incoming messages ──
      .on('postgres_changes', {
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const m = payload.new as any;
        
        // Handle both incoming AND outgoing (outgoing from other tabs / webhook echo)
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
          console.log('👤 [RT] New contact detected, reloading...');
          loadData(user.id);
        } else {
          addMessage(m.contact_id, msg);
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
        if (m.status) {
          const { updateMessageStatus } = useAppStore.getState();
          updateMessageStatus(m.contact_id, m.id, m.status);
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
        console.log('📡 [RT] Subscription:', status);
      });

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [user, loadData, addMessage]);

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
