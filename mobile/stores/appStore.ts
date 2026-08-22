import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Chat, Contact, Message } from '@/lib/types';
import { mapContactRow, mapMessageRow, sortChats } from '@/lib/mappers';

interface AppState {
  contacts: Contact[];
  chats: Chat[];
  messages: Record<string, Message[]>;
  unreadCounts: Record<string, number>;
  loading: boolean;
  dataLoaded: boolean;
  activeChatId: string | null;

  loadData: (userId: string) => Promise<void>;
  reset: () => void;

  setActiveChatId: (id: string | null) => Promise<void>;

  upsertContact: (contact: Contact) => void;
  addMessage: (message: Message) => void;
  updateMessage: (contactId: string, messageId: string, updates: Partial<Message>) => void;
  markChatAsRead: (contactId: string) => Promise<void>;
  deleteMessageLocal: (contactId: string, messageId: string) => void;

  drafts: Record<string, string>;
  setDraft: (contactId: string, text: string) => void;
}

const DRAFTS_KEY = 'waaba-mobile-drafts';

function loadDrafts(): Record<string, string> {
  try {
    return JSON.parse(globalThis.localStorage.getItem(DRAFTS_KEY) || '{}');
  } catch {
    return {};
  }
}

function persistDrafts(drafts: Record<string, string>) {
  try {
    globalThis.localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  } catch {}
}

export const useAppStore = create<AppState>((set, get) => ({
  contacts: [],
  chats: [],
  messages: {},
  unreadCounts: {},
  loading: true,
  dataLoaded: false,
  activeChatId: null,

  drafts: loadDrafts(),

  setDraft: (contactId, text) => {
    const drafts = { ...get().drafts, [contactId]: text };
    set({ drafts });
    persistDrafts(drafts);
  },

  deleteMessageLocal: (contactId, messageId) => {
    const state = get();
    const updated = (state.messages[contactId] || []).filter(m => m.id !== messageId);
    const lastMessage = updated[updated.length - 1];
    useAppStore.setState({
      messages: { ...state.messages, [contactId]: updated },
      chats: state.chats.map(c =>
        c.id === contactId && c.lastMessage?.id === messageId ? { ...c, lastMessage } : c
      ),
    });
  },

  reset: () =>
    set({
      contacts: [],
      chats: [],
      messages: {},
      unreadCounts: {},
      loading: true,
      dataLoaded: false,
      activeChatId: null,
    }),

  loadData: async (userId: string) => {
    set({ loading: true });

    try {
      const { data: contactsData, error: contactsError } = await supabase
        .from('contacts')
        .select('*, account_details (*)')
        .or(`user_id.eq.${userId},assigned_user_id.eq.${userId}`)
        .order('created_at', { ascending: false });

      if (contactsError) throw contactsError;

      const contacts: Contact[] = (contactsData || [])
        .filter((c: any) => !c.is_deleted)
        .map(mapContactRow);

      const contactIds = contacts.map(c => c.id);
      const { data: messagesData, error: messagesError } =
        contactIds.length > 0
          ? await supabase
              .from('messages')
              .select('*')
              .in('contact_id', contactIds)
              .eq('is_deleted', false)
              .order('created_at', { ascending: true })
          : { data: [], error: null };
      if (messagesError) throw messagesError;

      const messagesMap: Record<string, Message[]> = {};
      const lastMessages: Record<string, Message> = {};
      const unreadCounts: Record<string, number> = {};

      (messagesData || []).forEach((m: any) => {
        const message = mapMessageRow(m);
        if (!messagesMap[m.contact_id]) messagesMap[m.contact_id] = [];
        messagesMap[m.contact_id].push(message);
        lastMessages[m.contact_id] = message;
        if (!m.is_outgoing && m.status !== 'read') {
          unreadCounts[m.contact_id] = (unreadCounts[m.contact_id] || 0) + 1;
        }
      });

      const chats = sortChats(
        contacts.map(contact => ({
          id: contact.id,
          contact,
          lastMessage: lastMessages[contact.id],
          unreadCount: unreadCounts[contact.id] || 0,
          isPinned: contact.isPinned,
          isMuted: contact.isMuted,
          isArchived: contact.isArchived,
        }))
      );

      set({
        contacts,
        chats,
        messages: messagesMap,
        unreadCounts,
        loading: false,
        dataLoaded: true,
      });
    } catch (error) {
      console.error('[Store] Error loading data:', error);
      set({ loading: false, dataLoaded: true });
    }
  },

  setActiveChatId: async (id: string | null) => {
    set({ activeChatId: id });
    if (id) await get().markChatAsRead(id);
  },

  markChatAsRead: async (contactId: string) => {
    // Instant local update
    useAppStore.setState(state => {
      const msgs = (state.messages[contactId] || []).map(m =>
        !m.isOutgoing && m.status !== 'read' ? { ...m, status: 'read' as const } : m
      );
      return {
        messages: { ...state.messages, [contactId]: msgs },
        chats: state.chats.map(c => (c.id === contactId ? { ...c, unreadCount: 0 } : c)),
        unreadCounts: { ...state.unreadCounts, [contactId]: 0 },
      };
    });

    // Persist to database
    const { error } = await supabase
      .from('messages')
      .update({ status: 'read' })
      .eq('contact_id', contactId)
      .eq('is_outgoing', false)
      .neq('status', 'read');

    if (error) console.error('[Store] Failed to mark messages as read:', error);
  },

  upsertContact: (contact: Contact) => {
    const state = get();
    const exists = state.contacts.some(c => c.id === contact.id);
    const contacts = exists
      ? state.contacts.map(c => (c.id === contact.id ? contact : c))
      : [contact, ...state.contacts];

    let chats = state.chats;
    if (!exists && !contact.isDeleted) {
      chats = [
        { id: contact.id, contact, unreadCount: 0, isPinned: contact.isPinned },
        ...state.chats,
      ];
    }
    chats = sortChats(chats);

    set({ contacts, chats });
  },

  addMessage: (message: Message) => {
    const state = get();
    const existing = state.messages[message.contactId] || [];

    // Prevent duplicates from realtime echo of our own insert
    if (existing.some(m => m.id === message.id)) return;

    const isActiveChat = state.activeChatId === message.contactId;
    const finalMessage: Message =
      !message.isOutgoing && isActiveChat && message.status !== 'read'
        ? { ...message, status: 'read' }
        : message;

    if (!message.isOutgoing && isActiveChat) {
      supabase
        .from('messages')
        .update({ status: 'read' })
        .eq('id', message.id)
        .then(({ error }) => {
          if (error) console.error('[Store] Failed to mark as read:', error);
        });
    }

    const newUnread =
      !message.isOutgoing && !isActiveChat
        ? (state.unreadCounts[message.contactId] || 0) + 1
        : state.unreadCounts[message.contactId] || 0;

    const chats = state.chats.map(chat =>
      chat.id === message.contactId
        ? { ...chat, lastMessage: finalMessage, unreadCount: isActiveChat ? 0 : newUnread }
        : chat
    );

    set({
      messages: {
        ...state.messages,
        [message.contactId]: [...existing, finalMessage],
      },
      chats: sortChats(chats),
      unreadCounts: {
        ...state.unreadCounts,
        [message.contactId]: isActiveChat ? 0 : newUnread,
      },
    });
  },

  updateMessage: (contactId: string, messageId: string, updates: Partial<Message>) => {
    const state = get();
    const updatedMessages = (state.messages[contactId] || []).map(m =>
      m.id === messageId ? { ...m, ...updates } : m
    );
    const updatedChats = state.chats.map(chat => {
      if (chat.id !== contactId) return chat;
      if (chat.lastMessage?.id === messageId) {
        return { ...chat, lastMessage: { ...chat.lastMessage, ...updates } };
      }
      return chat;
    });

    set({
      messages: { ...state.messages, [contactId]: updatedMessages },
      chats: updatedChats,
    });
  },
}));
