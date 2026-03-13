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

export interface Message {
  id: string;
  contactId: string;
  content: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'template';
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  isOutgoing: boolean;
  timestamp: Date;
  mediaUrl?: string;
  whatsappMessageId?: string;
  templateName?: string;
  templateParams?: Record<string, string>;
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
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export type ViewMode = 'chats' | 'contacts' | 'settings';
export type SettingsTab = 'api' | 'theme' | 'account' | 'notifications' | 'business' | 'templates';
