// @ts-nocheck
import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { ViewMode, Message, Chat, Contact } from '@/types';

// Minimal UI state persisted to localStorage
interface PersistedUIState {
  viewMode: ViewMode;
  lastActiveChatId: string | null;
  favorites: Record<string, boolean>;
  drafts: Record<string, string>;
}

// Light data cache for instant load
interface CachedData {
  contacts: any[];
  chats: any[];
  messages: Record<string, any[]>;
  unreadCounts: Record<string, number>;
  ts: number;
}

const STORAGE_KEY = 'waba-crm-ui';
const CACHE_KEY = 'waba-crm-cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function loadUIState(): Partial<PersistedUIState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveUIState(state: PersistedUIState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota exceeded — ignore */ }
}

function loadCachedData(): CachedData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data: CachedData = JSON.parse(raw);
    if (Date.now() - data.ts > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

function saveCachedData(contacts: Contact[], chats: Chat[], messages: Record<string, Message[]>, unreadCounts: Record<string, number>) {
  try {
    const data: CachedData = {
      contacts: contacts.slice(0, 100),
      chats: chats.slice(0, 100),
      messages: Object.fromEntries(
        Object.entries(messages).map(([k, v]) => [k, v.slice(-50)])
      ),
      unreadCounts,
      ts: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch { /* quota — ignore */ }
}

interface AppState {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  contacts: Contact[];
  setContacts: (contacts: Contact[]) => void;
  addContact: (contact: Contact) => void;
  addContacts: (contacts: Contact[]) => void;
  updateContact: (id: string, updates: Partial<Contact>) => void;
  deleteContact: (id: string) => void;

  chats: Chat[];
  setChats: (chats: Chat[]) => void;
  activeChat: Chat | null;
  setActiveChat: (chat: Chat | null) => Promise<void>; // 🔥 CHANGED: Now async

  messages: Record<string, Message[]>;
  setMessages: (contactId: string, messages: Message[]) => void;
  addMessage: (contactId: string, message: Message) => void;
  updateMessageStatus: (contactId: string, messageId: string, status: Message['status']) => void;

  drafts: Record<string, string>;
  setDraft: (contactId: string, text: string) => void;

  // Unread counters
  unreadCounts: Record<string, number>;
  incrementUnread: (contactId: string) => void;
  clearUnread: (contactId: string) => Promise<void>; // 🔥 CHANGED: Now async
  totalUnread: () => number;

  // Favorites
  favorites: Record<string, boolean>;
  toggleFavorite: (contactId: string) => void;

  loading: boolean;
  setLoading: (loading: boolean) => void;
  dataLoaded: boolean;
  loadData: (userId: string) => Promise<void>;

  showContactPanel: boolean;
  setShowContactPanel: (show: boolean) => void;

  showAddContactModal: boolean;
  setShowAddContactModal: (show: boolean) => void;

  searchQuery: string;
  setSearchQuery: (query: string) => void;

  editContactId: string | null;
  setEditContactId: (id: string | null) => void;
}

const persisted = loadUIState();

export const useAppStore = create<AppState>()((set, get) => ({
  viewMode: persisted.viewMode || 'chats',
  setViewMode: (mode) => { set({ viewMode: mode }); _persistUI(); },

  contacts: [],
  setContacts: (contacts) => set({ contacts }),
  addContact: (contact) => {
    set((state) => ({
      contacts: [...state.contacts.filter((c) => c.id !== contact.id), contact],
      chats: [...state.chats.filter((c) => c.id !== contact.id), { id: contact.id, contact, unreadCount: 0 }],
    }));
  },
  addContacts: (contacts) => {
    set((state) => ({
      contacts: [
        ...state.contacts.filter((existing) => !contacts.some((incoming) => incoming.id === existing.id || incoming.phone === existing.phone)),
        ...contacts,
      ],
      chats: [
        ...state.chats.filter((existing) => !contacts.some((incoming) => incoming.id === existing.id || incoming.id === existing.contact.id || incoming.phone === existing.contact.phone)),
        ...contacts.map(c => ({ id: c.id, contact: c, unreadCount: 0 })),
      ],
    }));
  },
  updateContact: (id, updates) => set((state) => ({
    contacts: state.contacts.map(c => c.id === id ? { ...c, ...updates, updatedAt: new Date() } : c),
    chats: state.chats.map(chat =>
      chat.contact.id === id ? { ...chat, contact: { ...chat.contact, ...updates, updatedAt: new Date() }, ...(updates.isPinned !== undefined ? { isPinned: updates.isPinned } : {}), ...(updates.isMuted !== undefined ? { isMuted: updates.isMuted } : {}), ...(updates.isArchived !== undefined ? { isArchived: updates.isArchived } : {}) } : chat
    ),
    activeChat: state.activeChat?.id === id
      ? { ...state.activeChat, contact: { ...state.activeChat.contact, ...updates, updatedAt: new Date() }, ...(updates.isPinned !== undefined ? { isPinned: updates.isPinned } : {}), ...(updates.isMuted !== undefined ? { isMuted: updates.isMuted } : {}), ...(updates.isArchived !== undefined ? { isArchived: updates.isArchived } : {}) }
      : state.activeChat,
  })),
  deleteContact: (id) => get().updateContact(id, { isDeleted: true, deletedAt: new Date() } as any),

  chats: [],
  setChats: (chats) => set({ chats }),
  activeChat: null,
  
  // 🔥 CRITICAL FIX: Mark messages as read in DATABASE when chat opens
  setActiveChat: async (chat) => {
    set({ activeChat: chat, showContactPanel: false });
    
    if (chat) {
      console.log('📖 [Store] Marking messages as read for chat:', chat.id);
      
      // Clear unread count in memory immediately (for instant UI update)
      set((state) => ({
        unreadCounts: { ...state.unreadCounts, [chat.id]: 0 },
        chats: state.chats.map(c => c.id === chat.id ? { ...c, unreadCount: 0 } : c),
      }));
      
      // Mark all unread incoming messages as 'read' in database
      const { error } = await supabase
        .from('messages')
        .update({ status: 'read' })
        .eq('contact_id', chat.id)
        .eq('is_outgoing', false)
        .neq('status', 'read'); // Only update messages that aren't already read
      
      if (error) {
        console.error('❌ [Store] Failed to mark messages as read:', error);
      } else {
        console.log('✅ [Store] Messages marked as read in database');
        
        // Also update local message status for consistency
        set((state) => ({
          messages: {
            ...state.messages,
            [chat.id]: (state.messages[chat.id] || []).map(m => 
              !m.isOutgoing && m.status !== 'read' ? { ...m, status: 'read' as const } : m
            ),
          },
        }));
      }
    }
    
    _persistUI();
  },

  messages: {},
  setMessages: (contactId, messages) => set((state) => ({
    messages: { ...state.messages, [contactId]: messages },
  })),
  addMessage: (contactId, message) => set((state) => {
    const isCurrentChat = state.activeChat?.id === contactId;
    const existing = state.messages[contactId] || [];
    
    // Prevent duplicates
    if (existing.find(m => m.id === message.id)) {
      console.log('⚠️ [Store] Duplicate message detected, skipping:', message.id);
      return state;
    }
    
    // If it's an incoming message and this chat is currently open, mark as read immediately
    const shouldMarkAsRead = !message.isOutgoing && isCurrentChat;
    const finalMessage = shouldMarkAsRead ? { ...message, status: 'read' as const } : message;
    
    // If we should mark as read, also update database
    if (shouldMarkAsRead && message.id) {
      supabase
        .from('messages')
        .update({ status: 'read' })
        .eq('id', message.id)
        .then(({ error }) => {
          if (error) {
            console.error('❌ [Store] Failed to mark new message as read:', error);
          } else {
            console.log('✅ [Store] New incoming message marked as read:', message.id);
          }
        });
    }
    
    const newUnread = !message.isOutgoing && !isCurrentChat
      ? (state.unreadCounts[contactId] || 0) + 1
      : state.unreadCounts[contactId] || 0;
    
    return {
      messages: {
        ...state.messages,
        [contactId]: [...existing, finalMessage],
      },
      chats: state.chats.map(chat =>
        chat.id === contactId ? { ...chat, lastMessage: finalMessage, unreadCount: isCurrentChat ? 0 : newUnread } : chat
      ),
      unreadCounts: { ...state.unreadCounts, [contactId]: isCurrentChat ? 0 : newUnread },
    };
  }),
  updateMessageStatus: (contactId, messageId, status) => set((state) => {
    const updatedMessages = (state.messages[contactId] || []).map(m =>
      m.id === messageId ? { ...m, status } : m
    );
    // Update lastMessage in chats — check both by ID match and if it's the latest outgoing
    const updatedChats = state.chats.map(chat => {
      if (chat.id !== contactId) return chat;
      if (chat.lastMessage?.id === messageId) {
        return { ...chat, lastMessage: { ...chat.lastMessage, status } };
      }
      // Also update if this is the most recent outgoing message (fallback)
      const lastOutgoing = [...updatedMessages].reverse().find(m => m.isOutgoing);
      if (lastOutgoing?.id === messageId && chat.lastMessage?.isOutgoing) {
        return { ...chat, lastMessage: { ...chat.lastMessage, status } };
      }
      return chat;
    });
    return {
      messages: { ...state.messages, [contactId]: updatedMessages },
      chats: updatedChats,
    };
  }),

  drafts: persisted.drafts || {},
  setDraft: (contactId, text) => {
    set((state) => ({ drafts: { ...state.drafts, [contactId]: text } }));
    _persistUI();
  },

  // Unread
  unreadCounts: {},
  incrementUnread: (contactId) => set((state) => ({
    unreadCounts: { ...state.unreadCounts, [contactId]: (state.unreadCounts[contactId] || 0) + 1 },
  })),
  
  // 🔥 FIXED: Clear unread also marks as read in database
  clearUnread: async (contactId) => {
    console.log('📖 [Store] Clearing unread for contact:', contactId);
    
    // Clear in memory immediately
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [contactId]: 0 },
      chats: state.chats.map(c => c.id === contactId ? { ...c, unreadCount: 0 } : c),
    }));
    
    // Mark as read in database
    const { error } = await supabase
      .from('messages')
      .update({ status: 'read' })
      .eq('contact_id', contactId)
      .eq('is_outgoing', false)
      .neq('status', 'read');
    
    if (error) {
      console.error('❌ [Store] Failed to mark messages as read:', error);
    } else {
      console.log('✅ [Store] Messages marked as read for contact:', contactId);
      
      // Update local state
      set((state) => ({
        messages: {
          ...state.messages,
          [contactId]: (state.messages[contactId] || []).map(m => 
            !m.isOutgoing && m.status !== 'read' ? { ...m, status: 'read' as const } : m
          ),
        },
      }));
    }
  },
  
  totalUnread: () => {
    const counts = get().unreadCounts;
    return Object.values(counts).reduce((sum, c) => sum + c, 0);
  },

  // Favorites
  favorites: persisted.favorites || {},
  toggleFavorite: (contactId) => {
    set((state) => ({ favorites: { ...state.favorites, [contactId]: !state.favorites[contactId] } }));
    _persistUI();
  },

  loading: true,
  setLoading: (loading) => set({ loading }),
  dataLoaded: false,

  loadData: async (userId: string) => {
    // Hydrate from light cache immediately for instant render
    const cached = loadCachedData();
    if (cached && cached.contacts.length > 0) {
      const restoredContacts = cached.contacts.map((c: any) => ({
        ...c,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
        lastSeen: c.lastSeen ? new Date(c.lastSeen) : undefined,
      }));
      const restoredChats = cached.chats.map((ch: any) => ({
        ...ch,
        contact: { ...ch.contact, createdAt: new Date(ch.contact.createdAt), updatedAt: new Date(ch.contact.updatedAt), lastSeen: ch.contact.lastSeen ? new Date(ch.contact.lastSeen) : undefined },
        lastMessage: ch.lastMessage ? { ...ch.lastMessage, timestamp: new Date(ch.lastMessage.timestamp) } : undefined,
      }));
      const restoredMessages: Record<string, Message[]> = {};
      for (const [cid, msgs] of Object.entries(cached.messages)) {
        restoredMessages[cid] = (msgs as any[]).map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
      }
      set({ contacts: restoredContacts, chats: restoredChats, messages: restoredMessages, unreadCounts: cached.unreadCounts, loading: false, dataLoaded: true });
    } else {
      set({ loading: true });
    }

    try {
      const { data: contactsData, error: contactsError } = await supabase
        .from('contacts')
        .select(`*, account_details (*)`)
        .or(`user_id.eq.${userId},assigned_user_id.eq.${userId}`)
        .order('created_at', { ascending: false });

      if (contactsError) throw contactsError;

      const contacts: Contact[] = (contactsData || []).map((c: any) => ({
        id: c.id, loanId: c.loan_id, name: c.name, phone: c.phone,
        amount: c.amount ? Number(c.amount) : undefined,
        appType: c.app_type || 'tloan', dayType: c.day_type ?? 0,
        isOnline: c.is_online || false,
        lastSeen: c.last_seen ? new Date(c.last_seen) : undefined,
        avatar: c.avatar_url || undefined,
        isPinned: c.is_pinned || false, isMuted: c.is_muted || false, isArchived: c.is_archived || false,
        isBlocked: c.is_blocked || false, isDeleted: c.is_deleted || false, deletedAt: c.deleted_at ? new Date(c.deleted_at) : undefined,
        assignedUserId: c.assigned_user_id || undefined,
        createdAt: new Date(c.created_at), updatedAt: new Date(c.updated_at),
        accountDetails: (c.account_details || []).map((ad: any) => ({
          id: ad.id, bank: ad.bank, accountNumber: ad.account_number, accountName: ad.account_name,
        })),
      }));

      const contactIds = contacts.map(c => c.id);
      const { data: messagesData, error: messagesError } = contactIds.length > 0
        ? await supabase.from('messages').select('*').in('contact_id', contactIds).eq('is_deleted', false).order('created_at', { ascending: true })
        : { data: [], error: null };
      if (messagesError) throw messagesError;

      const messagesMap: Record<string, Message[]> = {};
      const lastMessages: Record<string, Message> = {};
      const unreadCounts: Record<string, number> = {};

      (messagesData || []).forEach((m: any) => {
        const message: Message = {
          id: m.id, contactId: m.contact_id, content: m.content,
          type: m.type as Message['type'], status: m.status as Message['status'],
          isOutgoing: m.is_outgoing, timestamp: new Date(m.created_at),
          mediaUrl: m.media_url || undefined,
          whatsappMessageId: m.whatsapp_message_id || undefined,
          templateName: m.template_name || undefined,
          templateParams: m.template_params as Record<string, string> || undefined,
          isDeleted: m.is_deleted || false,
          deletedAt: m.deleted_at ? new Date(m.deleted_at) : undefined,
          replyToMessageId: m.reply_to_message_id || undefined,
          replyToWamid: m.reply_to_wamid || undefined,
          replySnapshot: m.reply_snapshot || undefined,
          reactions: m.reactions || [],
        };
        if (!messagesMap[m.contact_id]) messagesMap[m.contact_id] = [];
        messagesMap[m.contact_id].push(message);
        lastMessages[m.contact_id] = message;
        
        // 🔥 Count unread: incoming messages with status != 'read'
        // This is accurate because we now mark messages as 'read' in database when chat opens
        if (!m.is_outgoing && m.status !== 'read') {
          unreadCounts[m.contact_id] = (unreadCounts[m.contact_id] || 0) + 1;
        }
      });

      const favorites = get().favorites;
      const chats: Chat[] = contacts.map(contact => ({
        id: contact.id, contact,
        lastMessage: lastMessages[contact.id],
        unreadCount: unreadCounts[contact.id] || 0,
        isPinned: contact.isPinned, isMuted: contact.isMuted, isArchived: contact.isArchived,
        isFavorite: favorites[contact.id] || false,
      }));

      chats.sort((a, b) => {
        const aFav = favorites[a.id] ? 1 : 0;
        const bFav = favorites[b.id] ? 1 : 0;
        if (aFav !== bFav) return bFav - aFav;
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const aTime = a.lastMessage?.timestamp.getTime() || 0;
        const bTime = b.lastMessage?.timestamp.getTime() || 0;
        return bTime - aTime;
      });

      set({ contacts, chats, messages: messagesMap, loading: false, dataLoaded: true, unreadCounts });
      // Save light cache for next cold start
      saveCachedData(contacts, chats, messagesMap, unreadCounts);
    } catch (error) {
      console.error('Error loading data:', error);
      set({ loading: false, dataLoaded: true });
    }
  },

  showContactPanel: false,
  setShowContactPanel: (show) => set({ showContactPanel: show }),

  showAddContactModal: false,
  setShowAddContactModal: (show) => set({ showAddContactModal: show }),

  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  editContactId: null,
  setEditContactId: (id) => set({ editContactId: id }),
}));

// Helper to persist minimal UI state
function _persistUI() {
  const s = useAppStore.getState();
  saveUIState({
    viewMode: s.viewMode,
    lastActiveChatId: s.activeChat?.id || null,
    favorites: s.favorites,
    drafts: s.drafts,
  });
}
