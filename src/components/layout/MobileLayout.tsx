import { useState, useCallback, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useBackButton } from '@/hooks/useBackButton';
import { ChatList } from '@/components/chat/ChatList';
import { ChatView } from '@/components/chat/ChatView';
import { ContactPanel } from '@/components/contacts/ContactPanel';
import { AddContactModal } from '@/components/contacts/AddContactModal';
import { EditContactModal } from '@/components/contacts/EditContactModal';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { NewChatModal } from '@/components/chat/NewChatModal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ViewMode } from '@/types';

const navItems: { mode: ViewMode; label: string; imgSrc?: string }[] = [
  { mode: 'chats', label: 'Chats', imgSrc: '/icons/chats.png' },
  { mode: 'contacts', label: 'Contacts', imgSrc: '/icons/contacts.png' },
  { mode: 'settings', label: 'Settings' },
];

export function MobileLayout() {
  const { viewMode, setViewMode, activeChat, setActiveChat, showContactPanel, setShowContactPanel, chats, editContactId, setEditContactId } = useAppStore();
  const [showChatView, setShowChatView] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);

  // Auto-open chat view when activeChat is set externally (e.g. push notification openChat event)
  useEffect(() => {
    if (activeChat && !showChatView) {
      setShowChatView(true);
    }
  }, [activeChat]);

  // Count non-archived chats with unread messages
  const chatsWithUnread = useAppStore((s) => s.chats.filter(c => c.unreadCount > 0 && !c.isArchived && !c.contact?.isArchived).length);

  const handleBack = useCallback(() => {
    if (showContactPanel) { setShowContactPanel(false); return true; }
    if (showChatView) { setShowChatView(false); setActiveChat(null); return true; }
    if (viewMode !== 'chats') { setViewMode('chats'); return true; }
    return false;
  }, [showContactPanel, showChatView, viewMode, setShowContactPanel, setActiveChat, setViewMode]);

  useBackButton(handleBack);

  const handleOpenChat = (chat: any) => {
    setActiveChat(chat);
    setShowChatView(true);
  };

  const handleBackFromChat = () => {
    setShowChatView(false);
    setActiveChat(null);
  };

  const handleNewChatSelect = (contact: any) => {
    const chat = chats.find(c => c.contact.id === contact.id);
    if (chat) handleOpenChat(chat);
    setShowNewChatModal(false);
  };

  // Contact panel full screen
  if (showContactPanel && activeChat) {
    return (
      <div className="h-[100dvh] flex flex-col bg-background">
        <div className="flex items-center gap-2 px-4 py-3 bg-panel-header border-b border-panel-border shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setShowContactPanel(false)} className="h-9 w-9">
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <h1 className="text-[17px] font-bold">Contact Info</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ContactPanel />
        </div>
        {editContactId && (
          <EditContactModal open={!!editContactId} onOpenChange={(open) => { if (!open) setEditContactId(null); }} contactId={editContactId} />
        )}
      </div>
    );
  }

  // Full screen chat view — uses 100dvh, ChatView handles keyboard internally
  if (showChatView && activeChat) {
    return (
      <div className="h-[100dvh] flex flex-col bg-background overflow-hidden">
        <ChatView onBack={handleBackFromChat} showBackButton={true} />
        {editContactId && (
          <EditContactModal open={!!editContactId} onOpenChange={(open) => { if (!open) setEditContactId(null); }} contactId={editContactId} />
        )}
      </div>
    );
  }

  // Main tabbed layout
  return (
    <div className="h-[100dvh] flex flex-col bg-background">
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {viewMode === 'chats' && (
          <ChatList onChatSelect={handleOpenChat} onNewChat={() => setShowNewChatModal(true)} />
        )}
        {viewMode === 'contacts' && (
          <ChatList onChatSelect={handleOpenChat} onNewChat={() => setShowNewChatModal(true)} />
        )}
        {viewMode === 'settings' && <SettingsPage />}
      </div>

      {/* Bottom Tab Bar */}
      <nav className="flex items-center justify-around bg-panel-header/95 backdrop-blur-lg border-t border-panel-border shrink-0" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}>
        {navItems.map(({ mode, label, imgSrc }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={cn(
              'relative flex flex-col items-center gap-0.5 px-6 py-2 min-w-[72px] rounded-xl transition-all',
              viewMode === mode ? 'text-black bg-primary/20 ring-1 ring-primary/40' : 'text-black hover:bg-accent/60'
            )}
          >
            {imgSrc ? (
              <img src={imgSrc} alt={label} className={cn(
                "h-[26px] w-[26px] object-contain",
                viewMode === mode ? "opacity-100" : "opacity-75"
              )} />
            ) : (
              <svg className={cn("h-[26px] w-[26px]", viewMode === mode && "stroke-[2.5px]")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            )}
            <span className="text-[10px] font-bold">{label}</span>
            {mode === 'chats' && chatsWithUnread > 0 && (
              <span className="absolute top-0.5 right-3 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground animate-blink-badge">
                {chatsWithUnread > 99 ? '99+' : chatsWithUnread}
              </span>
            )}
          </button>
        ))}
      </nav>

      <AddContactModal />
      {editContactId && (
        <EditContactModal open={!!editContactId} onOpenChange={(open) => { if (!open) setEditContactId(null); }} contactId={editContactId} />
      )}
      <NewChatModal 
        open={showNewChatModal} 
        onClose={() => setShowNewChatModal(false)}
        onSelectContact={handleNewChatSelect}
      />
    </div>
  );
}
