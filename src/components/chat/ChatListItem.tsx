// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { Archive, BellOff, MessageSquareOff, Pin, Star, Tag } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ContactAvatar } from '@/components/shared/ContactAvatar';
import { MessageStatus } from '@/components/shared/MessageStatus';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatChatTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { Chat } from '@/types';

interface Label {
  id: string;
  name: string;
  color: string;
}

interface ChatListItemProps {
  chat: Chat;
  isActive: boolean;
  onClick: () => void;
  chatLabels?: Label[];
  allLabels?: Label[];
}

export function ChatListItem({ chat, isActive, onClick, chatLabels = [], allLabels: labelsProp = [] }: ChatListItemProps) {
  const { contact, lastMessage, unreadCount, isPinned, isMuted, isArchived } = chat;
  const { updateContact, setMessages, chats, setChats, favorites, toggleFavorite } = useAppStore();
  const { toast } = useToast();
  const { user } = useAuth();

  const [showOptions, setShowOptions] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [allLabels, setAllLabels] = useState<Label[]>(labelsProp);
  const [assignedLabelIds, setAssignedLabelIds] = useState<string[]>(chatLabels.map((l) => l.id));

  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const [isLongPress, setIsLongPress] = useState(false);
  const touchStartY = useRef(0);
  const isScrolling = useRef(false);

  const isFav = favorites[chat.id];
  const hasUnread = unreadCount > 0;

  useEffect(() => {
    setAssignedLabelIds(chatLabels.map((l) => l.id));
    setAllLabels(labelsProp);
  }, [chatLabels, labelsProp]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    isScrolling.current = false;
    longPressTimer.current = setTimeout(() => {
      if (!isScrolling.current) {
        setIsLongPress(true);
        setShowOptions(true);
      }
    }, 450);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaY = Math.abs(e.touches[0].clientY - touchStartY.current);
    if (deltaY > 8) {
      isScrolling.current = true;
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    if (!isLongPress && !isScrolling.current) onClick();
    setIsLongPress(false);
  };

  const loadLabelsForMenu = async () => {
    if (!user) return;

    const [labelsRes, assignedRes] = await Promise.all([
      supabase.from('labels' as any).select('*').eq('user_id', user.id).order('name', { ascending: true }),
      supabase.from('chat_labels' as any).select('label_id').eq('user_id', user.id).eq('chat_id', chat.id),
    ]);

    setAllLabels(((labelsRes.data as any[]) || []) as Label[]);
    setAssignedLabelIds((((assignedRes.data as any[]) || []).map((x: any) => x.label_id)));
  };

  const toggleLabelAssignment = async (labelId: string, checked: boolean) => {
    if (!user) return;

    if (checked) {
      const { error } = await supabase.from('chat_labels' as any).insert({ user_id: user.id, chat_id: chat.id, label_id: labelId } as any);
      if (error) {
        toast({ title: 'Failed to assign label', description: error.message, variant: 'destructive' });
        return;
      }
      setAssignedLabelIds((prev) => [...new Set([...prev, labelId])]);
      return;
    }

    const { error } = await supabase
      .from('chat_labels' as any)
      .delete()
      .eq('user_id', user.id)
      .eq('chat_id', chat.id)
      .eq('label_id', labelId);

    if (error) {
      toast({ title: 'Failed to remove label', description: error.message, variant: 'destructive' });
      return;
    }

    setAssignedLabelIds((prev) => prev.filter((id) => id !== labelId));
  };

  const handleDeleteChat = async () => {
    const { error } = await supabase.from('messages').delete().eq('contact_id', chat.id);
    if (error) {
      toast({ title: 'Failed to clear chat', description: error.message, variant: 'destructive' });
      return;
    }

    setMessages(chat.id, []);
    setChats(chats.map((c) => (c.id === chat.id ? { ...c, lastMessage: undefined, unreadCount: 0 } : c)));
    setShowDeleteDialog(false);
    setShowOptions(false);
    toast({ title: 'Chat cleared' });
  };

  const handleAction = async (action: 'pin' | 'mute' | 'archive') => {
    const field = action === 'pin' ? 'is_pinned' : action === 'mute' ? 'is_muted' : 'is_archived';
    const currentValue = action === 'pin' ? isPinned : action === 'mute' ? isMuted : (isArchived || contact.isArchived);

    const { error } = await supabase.from('contacts').update({ [field]: !currentValue }).eq('id', chat.id);
    if (error) {
      toast({ title: `Failed to ${action} chat`, description: error.message, variant: 'destructive' });
      return;
    }

    updateContact(chat.id, {
      [action === 'pin' ? 'isPinned' : action === 'mute' ? 'isMuted' : 'isArchived']: !currentValue,
    } as any);

    setShowOptions(false);
  };

  // ---- HELPER: render the last message preview text ----
  const getPreviewText = () => {
    if (!lastMessage) return 'No messages yet';
    if (lastMessage.type === 'template') {
      // Show short preview of the actual template content
      const preview = lastMessage.content?.split('\n')[0]?.trim() || 'Template';
      return `📋 ${preview.length > 40 ? preview.slice(0, 40) + '…' : preview}`;
    }
    if (lastMessage.type === 'image') return '📷 Image';
    if (lastMessage.type === 'audio') return '🎵 Voice note';
    if (lastMessage.type === 'video') return '🎬 Video';
    if (lastMessage.type === 'document') return '📄 Document';
    return lastMessage.content;
  };

  return (
    <>
      <div className={cn(
        'relative border-b border-panel-border/70',
        isActive && 'bg-[hsl(var(--highlight-active))]',
        hasUnread && 'chat-item-unread'
      )}>
        <button
          onClick={onClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onContextMenu={(e) => {
            e.preventDefault();
            setShowOptions(true);
          }}
          className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/50"
        >
          <ContactAvatar name={contact.name} avatar={contact.avatar} isOnline={contact.isOnline} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className={cn("text-[15px] sm:text-[14.5px] truncate chat-item-name", hasUnread ? "font-extrabold" : "font-semibold")}>
                {contact.name}
              </span>
              {lastMessage && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatChatTime(lastMessage.timestamp)}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between mt-1 gap-2">
              <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                {/* Tick always shrink-0 so it never gets squeezed out */}
                {lastMessage?.isOutgoing && (
                  <MessageStatus
                    status={lastMessage.status}
                    className="h-[18px] w-[18px] shrink-0"
                    strokeWidth={2.8}
                  />
                )}
                <span className={cn(
                  "text-sm truncate min-w-0 flex-1 chat-item-preview",
                  hasUnread ? "font-bold text-foreground" : "text-muted-foreground"
                )}>
                  {getPreviewText()}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {chatLabels.slice(0, 2).map((label) => (
                  <span
                    key={label.id}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white"
                    style={{ backgroundColor: label.color }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
                    {label.name}
                  </span>
                ))}
                {isFav && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                {isPinned && <Pin className="h-3.5 w-3.5 text-foreground" />}
                {isMuted && <BellOff className="h-3.5 w-3.5 text-foreground" />}
                {hasUnread && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                    {unreadCount}
                  </span>
                )}
              </div>
            </div>
          </div>
        </button>

        <DropdownMenu open={showOptions} onOpenChange={(open) => { setShowOptions(open); if (open) loadLabelsForMenu(); }}>
          <DropdownMenuTrigger asChild>
            <span className="sr-only">Open chat options</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => toggleFavorite(chat.id)}>
              <Star className={cn('h-4 w-4 mr-2', isFav && 'fill-amber-500 text-amber-500')} />
              {isFav ? 'Remove from favorites' : 'Add to favorites'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAction('pin')}>
              <Pin className="h-4 w-4 mr-2" />{isPinned ? 'Unpin chat' : 'Pin chat'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAction('mute')}>
              <BellOff className="h-4 w-4 mr-2" />{isMuted ? 'Unmute notifications' : 'Mute notifications'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAction('archive')}>
              <Archive className="h-4 w-4 mr-2" />{(isArchived || contact.isArchived) ? 'Unarchive chat' : 'Archive chat'}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger><Tag className="h-4 w-4 mr-2" />Labels</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                {allLabels.length === 0 ? (
                  <DropdownMenuItem disabled>No labels created</DropdownMenuItem>
                ) : allLabels.map((label) => (
                  <DropdownMenuCheckboxItem
                    key={label.id}
                    checked={assignedLabelIds.includes(label.id)}
                    onCheckedChange={(checked) => toggleLabelAssignment(label.id, checked === true)}
                  >
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: label.color }} />
                    {label.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              <MessageSquareOff className="h-4 w-4 mr-2" />Delete chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat messages?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears messages for {contact.name}. Contact remains in your list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteChat}>Delete messages</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
