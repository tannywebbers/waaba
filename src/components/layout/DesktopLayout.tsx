// @ts-nocheck
import { useState } from 'react';
import { MessageCircle, Users, Settings, SquarePen, UserPlus, Menu } from 'lucide-react';
import { ChatList } from '@/components/chat/ChatList';
import { ChatView } from '@/components/chat/ChatView';
import { ContactPanel } from '@/components/contacts/ContactPanel';
import { AddContactModal } from '@/components/contacts/AddContactModal';
import { EditContactModal } from '@/components/contacts/EditContactModal';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { NewChatModal } from '@/components/chat/NewChatModal';
import { useAppStore } from '@/stores/appStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ViewMode } from '@/types';

const sidebarItems: { mode: ViewMode; icon: typeof MessageCircle; label: string; imgSrc?: string }[] = [
  { mode: 'chats', icon: MessageCircle, label: 'Chats', imgSrc: '/icons/chats.png' },
  { mode: 'contacts', icon: Users, label: 'Contacts', imgSrc: '/icons/contacts.png' },
  { mode: 'settings', icon: Settings, label: 'Settings' },
];

export function DesktopLayout() {
  const { showContactPanel, activeChat, viewMode, setViewMode, setShowAddContactModal, editContactId, setEditContactId } = useAppStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const chatsWithUnread = useAppStore((s) => s.chats.filter(c => c.unreadCount > 0 && !c.isArchived && !c.contact?.isArchived).length);

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Sidebar Navigation */}
      <div className={cn(
        "flex flex-col bg-panel-header border-r border-panel-border shrink-0 transition-all duration-300",
        sidebarOpen ? "w-[68px]" : "w-0 overflow-hidden"
      )}>
        {/* Hamburger */}
        <div className="flex items-center justify-center py-4">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="h-10 w-10">
            <Menu className="h-5 w-5 text-foreground" />
          </Button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 flex flex-col items-center gap-1 pt-2">
          {sidebarItems.map(({ mode, icon: Icon, label, imgSrc }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                'relative flex flex-col items-center gap-0.5 w-14 py-2 rounded-xl transition-all hover:scale-[1.03]',
                viewMode === mode
                  ? 'bg-primary/20 text-foreground ring-2 ring-primary/40'
                  : 'text-foreground/70 hover:bg-accent'
              )}
              title={label}
            >
              {imgSrc ? (
                <img src={imgSrc} alt={label} className={cn(
                  "h-7 w-7 object-contain dark:invert",
                  viewMode === mode ? "opacity-100" : "opacity-60"
                )} />
              ) : (
                <Icon className={cn("h-7 w-7 stroke-[2.5px]", viewMode === mode && "stroke-[2.75px]")} />
              )}
              <span className="text-[10px] font-semibold">{label}</span>
              {mode === 'chats' && chatsWithUnread > 0 && (
                <span className="absolute top-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {chatsWithUnread > 99 ? '99+' : chatsWithUnread}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Quick Actions */}
        <div className="flex flex-col items-center gap-2 py-4">
          <Button
            variant="ghost" size="icon"
            className="h-10 w-10 text-black hover:text-primary"
            onClick={() => setShowNewChatModal(true)}
            title="New Chat"
          >
            <SquarePen className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-10 w-10 text-black hover:text-primary"
            onClick={() => setShowAddContactModal(true)}
            title="Add Contact"
          >
            <UserPlus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Toggle sidebar when collapsed */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="absolute top-3 left-3 z-50 h-9 w-9 flex items-center justify-center rounded-lg bg-panel-header border border-panel-border hover:bg-accent transition-colors"
        >
          <Menu className="h-5 w-5 text-black" />
        </button>
      )}

      {/* Main Panel - ChatList / Contacts / Settings */}
      <div className={cn(
        "shrink-0 flex flex-col border-r border-panel-border",
        sidebarOpen ? "w-[380px] lg:w-[420px]" : "w-[380px] lg:w-[420px] ml-12"
      )}>
        {viewMode === 'settings' ? (
          <SettingsPage />
        ) : (
          <ChatList 
            onNewChat={() => setShowNewChatModal(true)}
          />
        )}
      </div>

      {/* Chat View */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatView />
      </div>

      {/* Contact Details Panel */}
      {activeChat && showContactPanel && <ContactPanel />}

      <AddContactModal />
      {editContactId && (
        <EditContactModal
          open={!!editContactId}
          onOpenChange={(open) => { if (!open) setEditContactId(null); }}
          contactId={editContactId}
        />
      )}
      <NewChatModal 
        open={showNewChatModal}
        onClose={() => setShowNewChatModal(false)}
        onSelectContact={(contact) => {
          const chat = useAppStore.getState().chats.find(c => c.contact.id === contact.id);
          if (chat) useAppStore.getState().setActiveChat(chat);
          setShowNewChatModal(false);
        }}
      />
    </div>
  );
}
