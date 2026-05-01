export interface Contact {
  id: string;
  loanId: string;
  name: string;
  phone: string;
  amount?: number;
  appType?: string;
  dayType?: number;
  accountDetails?: AccountDetail[];
  avatar?: string;
  lastSeen?: Date;
  isOnline?: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  isBlocked?: boolean;
  isDeleted?: boolean;
  deletedAt?: Date;
  assignedUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountDetail {
  id: string;
  bank: string;
  accountNumber: string;
  accountName: string;
}

export interface MessageReaction {
  emoji: string;
  from: string;        // 'me' or sender phone
  fromName?: string;
  at: string;          // ISO
}

export interface ReplySnapshot {
  type: string;
  content: string;
  isOutgoing: boolean;
  fromName?: string;
}

export interface Message {
  id: string;
  contactId: string;
  content: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'template' | 'sticker';
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  isOutgoing: boolean;
  timestamp: Date;
  mediaUrl?: string;
  whatsappMessageId?: string;
  templateName?: string;
  templateParams?: Record<string, string>;
  isDeleted?: boolean;
  deletedAt?: Date;
  // Reply context
  replyToMessageId?: string;
  replyToWamid?: string;
  replySnapshot?: ReplySnapshot;
  // Reactions
  reactions?: MessageReaction[];
}

export interface Chat {
  id: string;
  contact: Contact;
  lastMessage?: Message;
  unreadCount: number;
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  isFavorite?: boolean;
  isDeleted?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface Sticker {
  id: string;
  userId: string;
  name?: string;
  mediaUrl: string;
  mimeType: string;
  source: 'uploaded' | 'saved_from_chat';
  sourceMessageId?: string;
  createdAt: Date;
}

export type ViewMode = 'chats' | 'contacts' | 'settings';
export type SettingsTab = 'api' | 'theme' | 'account' | 'notifications' | 'business' | 'templates' | 'logs' | 'stickers';
