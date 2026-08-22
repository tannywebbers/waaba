import { Contact, Message, Chat } from './types';

export function mapContactRow(c: any): Contact {
  return {
    id: c.id,
    loanId: c.loan_id,
    name: c.name,
    phone: c.phone,
    amount: c.amount ? Number(c.amount) : undefined,
    appType: c.app_type || '',
    dayType: c.day_type ?? 0,
    isOnline: c.is_online || false,
    lastSeen: c.last_seen ? new Date(c.last_seen) : undefined,
    avatar: c.avatar_url || undefined,
    isPinned: c.is_pinned || false,
    isMuted: c.is_muted || false,
    isArchived: c.is_archived || false,
    isBlocked: c.is_blocked || false,
    isDeleted: c.is_deleted || false,
    deletedAt: c.deleted_at ? new Date(c.deleted_at) : undefined,
    assignedUserId: c.assigned_user_id || undefined,
    createdAt: new Date(c.created_at),
    updatedAt: new Date(c.updated_at),
    accountDetails: (c.account_details || []).map((ad: any) => ({
      id: ad.id,
      bank: ad.bank,
      accountNumber: ad.account_number,
      accountName: ad.account_name,
    })),
  };
}

export function mapMessageRow(m: any): Message {
  return {
    id: m.id,
    contactId: m.contact_id,
    content: m.content,
    type: m.type as Message['type'],
    status: m.status as Message['status'],
    isOutgoing: m.is_outgoing,
    timestamp: new Date(m.created_at),
    mediaUrl: m.media_url || undefined,
    whatsappMessageId: m.whatsapp_message_id || undefined,
    templateName: m.template_name || undefined,
    templateParams: (m.template_params as Record<string, string>) || undefined,
    isDeleted: m.is_deleted || false,
    deletedAt: m.deleted_at ? new Date(m.deleted_at) : undefined,
    replyToMessageId: m.reply_to_message_id || undefined,
    replyToWamid: m.reply_to_wamid || undefined,
    replySnapshot: m.reply_snapshot || undefined,
    reactions: m.reactions || [],
    errorCode: m.error_code ?? undefined,
    errorTitle: m.error_title || undefined,
    errorDetails: m.error_details || undefined,
  };
}

export function sortChats(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    const aTime = a.lastMessage?.timestamp.getTime() || a.contact.createdAt.getTime();
    const bTime = b.lastMessage?.timestamp.getTime() || b.contact.createdAt.getTime();
    return bTime - aTime;
  });
}
