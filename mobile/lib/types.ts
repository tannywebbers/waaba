export interface AccountDetail {
  id: string;
  bank: string;
  accountNumber: string;
  accountName: string;
}

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

export interface MessageReaction {
  emoji: string;
  from: string;
  fromName?: string;
  at: string;
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
  replyToMessageId?: string;
  replyToWamid?: string;
  replySnapshot?: ReplySnapshot;
  reactions?: MessageReaction[];
  errorCode?: number;
  errorTitle?: string;
  errorDetails?: string;
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
