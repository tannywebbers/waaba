// @ts-nocheck
import { useState } from 'react';
import { Search, Phone } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';
import { useSharedInbox } from '@/hooks/useSharedInbox';
import { ContactAvatar } from '@/components/shared/ContactAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Contact } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { normalizePhoneNumber } from '@/lib/utils/phone';

interface NewChatModalProps {
  open: boolean;
  onClose: () => void;
  onSelectContact: (contact: Contact) => void;
}

export function NewChatModal({ open, onClose, onSelectContact }: NewChatModalProps) {
  const { contacts, chats, addContact, setActiveChat, setViewMode } = useAppStore();
  const { user } = useAuth();
  const { isSharedUser, superUserId } = useSharedInbox();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [creatingQuickChat, setCreatingQuickChat] = useState(false);

  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(search.toLowerCase()) ||
    contact.phone.includes(search)
  );

  const handleSelect = (contact: Contact) => {
    // Find existing chat or create one in state
    const existingChat = chats.find(c => c.contact.id === contact.id);
    if (existingChat) {
      setActiveChat(existingChat);
    } else {
      // New contact — create chat entry
      const newChat = { id: contact.id, contact, unreadCount: 0 };
      setActiveChat(newChat);
    }
    setViewMode('chats');
    onSelectContact(contact);
    setSearch('');
    onClose();
  };

  const normalizedSearchPhone = normalizePhoneNumber(search);
  const isPhoneNumber = /^\d{10,15}$/.test(normalizedSearchPhone);
  const existingContactForPhone = contacts.find(c => normalizePhoneNumber(c.phone) === normalizedSearchPhone);

  const handleQuickChat = async () => {
    if (!user || !isPhoneNumber) return;
    const phone = normalizedSearchPhone;

    if (existingContactForPhone) {
      handleSelect(existingContactForPhone);
      return;
    }

    setCreatingQuickChat(true);
    try {
      // Shared users create contacts under their own user_id
      const contactOwnerId = user.id;
      const assignedUserId = isSharedUser ? user.id : null;

      const { data: existingContact } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', contactOwnerId)
        .eq('phone', phone)
        .maybeSingle();

      const payload = {
        user_id: contactOwnerId,
        assigned_user_id: assignedUserId,
        name: existingContact?.name || phone,
        phone,
        loan_id: existingContact?.loan_id || '',
        is_deleted: false,
        deleted_at: null,
        created_at: new Date().toISOString(),
      };

      const { data, error } = existingContact
        ? await supabase.from('contacts').update(payload).eq('id', existingContact.id).select().maybeSingle()
        : await supabase.from('contacts').insert(payload).select().maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Contact could not be saved.');

      const newContact: Contact = {
        id: data.id, loanId: data.loan_id, name: data.name, phone: data.phone,
        createdAt: new Date(data.created_at), updatedAt: new Date(data.updated_at),
        isPinned: false, isMuted: false, isArchived: false,
      };
      addContact(newContact);
      // Open chat directly after adding
      handleSelect(newContact);
      toast({ title: 'Quick chat created' });
    } catch (err: unknown) {
      toast({ title: 'Failed to create quick chat', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setCreatingQuickChat(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[80vh] p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle>New Chat</DialogTitle>
        </DialogHeader>
        
        <div className="p-4 pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts or enter phone number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        {isPhoneNumber && !existingContactForPhone && (
          <div className="px-4 pb-2">
            <button
              onClick={handleQuickChat}
              disabled={creatingQuickChat}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-primary/5 hover:bg-primary/10 border border-primary/20 transition-colors"
            >
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Phone className="h-5 w-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="font-medium text-primary">Chat with {search}</p>
                <p className="text-xs text-muted-foreground">{creatingQuickChat ? 'Creating...' : 'Start a conversation with this number'}</p>
              </div>
            </button>
          </div>
        )}

        <ScrollArea className="max-h-[400px]">
          {filteredContacts.length === 0 && !isPhoneNumber ? (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-sm">No contacts found</p>
              <p className="text-xs mt-1">Enter a phone number to start a quick chat</p>
            </div>
          ) : (
            <div className="pb-4">
              {filteredContacts.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => handleSelect(contact)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors"
                >
                  <ContactAvatar name={contact.name} avatar={contact.avatar} isOnline={contact.isOnline} size="md" />
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-medium truncate">{contact.name}</p>
                    <p className="text-sm text-muted-foreground truncate">{contact.phone}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
