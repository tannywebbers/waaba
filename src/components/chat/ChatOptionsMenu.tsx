// @ts-nocheck
import { useState } from 'react';
import { MoreVertical, Archive, Pin, BellOff, Bell, MessageSquareOff, User, Search, Eraser, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAppStore } from '@/stores/appStore';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AssignContactModal } from '@/components/chat/AssignContactModal';
import { useSharedInbox } from '@/hooks/useSharedInbox';

interface ChatOptionsMenuProps {
  chatId: string;
  contactName: string;
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  assignedUserId?: string | null;
  onViewContact?: () => void;
  onSearch?: () => void;
  onClose?: () => void;
}

export function ChatOptionsMenu({ 
  chatId, 
  contactName,
  isPinned, 
  isMuted, 
  isArchived,
  assignedUserId,
  onViewContact,
  onSearch,
  onClose 
}: ChatOptionsMenuProps) {
  const { updateContact, setMessages, chats, setChats } = useAppStore();
  const { toast } = useToast();
  const { isSuperUser } = useSharedInbox();
  const [open, setOpen] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const handleAction = async (action: 'pin' | 'mute' | 'archive') => {
    try {
      const field = action === 'pin' ? 'is_pinned' : action === 'mute' ? 'is_muted' : 'is_archived';
      const currentValue = action === 'pin' ? isPinned : action === 'mute' ? isMuted : isArchived;
      
      const { error } = await supabase
        .from('contacts')
        .update({ [field]: !currentValue })
        .eq('id', chatId);
      
      if (error) throw error;
      
      const updateField = action === 'pin' ? 'isPinned' : action === 'mute' ? 'isMuted' : 'isArchived';
      updateContact(chatId, { [updateField]: !currentValue } as any);
      
      toast({ 
        title: action === 'pin' 
          ? (currentValue ? 'Chat unpinned' : 'Chat pinned')
          : action === 'mute'
          ? (currentValue ? 'Notifications unmuted' : 'Notifications muted')
          : (currentValue ? 'Chat unarchived' : 'Chat archived')
      });
    } catch (error) {
      console.error(`Error ${action}ing chat:`, error);
      toast({ title: 'Error', description: `Failed to ${action} chat`, variant: 'destructive' });
    }
    
    setOpen(false);
    onClose?.();
  };

  // Clear chat - delete messages only
  const handleClearChat = async () => {
    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('contact_id', chatId);
      
      if (error) throw error;

      setMessages(chatId, []);
      
      const updatedChats = chats.map(c => 
        c.id === chatId 
          ? { ...c, lastMessage: undefined, unreadCount: 0 }
          : c
      );
      setChats(updatedChats);
      
      toast({ title: 'Chat cleared' });
    } catch (error) {
      console.error('Error clearing chat:', error);
      toast({ title: 'Failed to clear chat', variant: 'destructive' });
    }
    setShowClearDialog(false);
    setOpen(false);
    onClose?.();
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10">
            <MoreVertical className="h-6 w-6 text-muted-foreground" strokeWidth={2.25} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={onViewContact}>
            <User className="h-4 w-4 mr-3" />
            View contact
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onSearch}>
            <Search className="h-4 w-4 mr-3" />
            Search
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {isSuperUser && (
            <DropdownMenuItem onClick={() => { setOpen(false); setShowAssignModal(true); }}>
              <Users className="h-4 w-4 mr-3" />
              Assign conversation
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => handleAction('mute')}>
            {isMuted ? <Bell className="h-4 w-4 mr-3" /> : <BellOff className="h-4 w-4 mr-3" />}
            {isMuted ? 'Unmute' : 'Mute'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAction('pin')}>
            <Pin className="h-4 w-4 mr-3" />
            {isPinned ? 'Unpin' : 'Pin'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAction('archive')}>
            <Archive className="h-4 w-4 mr-3" />
            {isArchived ? 'Unarchive' : 'Archive'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowClearDialog(true)}>
            <Eraser className="h-4 w-4 mr-3" />
            Clear chat
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => setShowDeleteDialog(true)} 
            className="text-destructive focus:text-destructive"
          >
            <MessageSquareOff className="h-4 w-4 mr-3" />
            Delete chat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Clear Chat Dialog */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all messages in this chat. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleClearChat}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Chat Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all messages in this chat. The contact "{contactName}" will be preserved. 
              To delete the contact, go to Contacts tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleClearChat}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Contact Modal */}
      <AssignContactModal
        open={showAssignModal}
        onOpenChange={setShowAssignModal}
        contactId={chatId}
        contactName={contactName}
        currentAssignedUserId={assignedUserId}
      />
    </>
  );
}