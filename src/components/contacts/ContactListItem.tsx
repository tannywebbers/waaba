import { useState, useRef } from 'react';
import { Contact } from '@/types';
import { ContactAvatar } from '@/components/shared/ContactAvatar';
import { formatCurrency } from '@/lib/utils/format';
import { Edit2, Trash2, CheckSquare } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppStore } from '@/store/appStore';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface LabelBadge {
  id: string;
  name: string;
  color: string;
}

interface ContactListItemProps {
  contact: Contact;
  onClick: () => void;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  selectionMode?: boolean;
  labels?: LabelBadge[];
  onEnterSelectionMode?: () => void;
}

export function ContactListItem({
  contact,
  onClick,
  selected,
  onToggleSelect,
  selectionMode,
  labels = [],
  onEnterSelectionMode,
}: ContactListItemProps) {
  const { setEditContactId, deleteContact } = useAppStore();
  const { toast } = useToast();

  const [showOptions, setShowOptions] = useState(false);

  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);
  const touchStartY = useRef(0);
  const isScrolling = useRef(false);
  const touchHandled = useRef(false);

  // =========================
  // TOUCH EVENTS (MOBILE)
  // =========================

  const handleTouchStart = (e: React.TouchEvent) => {
    touchHandled.current = true;
    isLongPress.current = false;
    isScrolling.current = false;
    touchStartY.current = e.touches[0].clientY;

    // Only long press when NOT in selection mode
    if (!selectionMode) {
      longPressTimer.current = setTimeout(() => {
        isLongPress.current = true;
        setShowOptions(true);
      }, 500);
    }
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

    // SINGLE TAP
    if (!isLongPress.current && !isScrolling.current) {
      if (selectionMode && onToggleSelect) {
        onToggleSelect(contact.id); // ✅ mobile single tap select
      } else {
        onClick(); // ✅ open chat
      }
    }

    // prevent ghost click
    setTimeout(() => {
      touchHandled.current = false;
    }, 0);
  };

  // =========================
  // DESKTOP CLICK
  // =========================

  const handleClick = () => {
    if (touchHandled.current) return;

    if (selectionMode && onToggleSelect) {
      onToggleSelect(contact.id);
    } else {
      onClick();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowOptions(true);
  };

  // =========================
  // DELETE
  // =========================

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${contact.name}?`)) return;

    try {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', contact.id);

      if (error) throw error;

      deleteContact(contact.id);
      toast({ title: 'Contact deleted' });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
    }

    setShowOptions(false);
  };

  // =========================
  // UI
  // =========================

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={handleContextMenu}
        className={cn(
          "w-full flex items-center gap-3 p-3 transition-colors text-left hover:bg-accent/50 border-b border-panel-border/50",
          selected && "bg-primary/10"
        )}
      >
        {selectionMode && (
          <div
            className={cn(
              "h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
              selected
                ? "bg-primary border-primary"
                : "border-muted-foreground/40"
            )}
          >
            {selected && (
              <CheckSquare className="h-4 w-4 text-primary-foreground" />
            )}
          </div>
        )}

        <ContactAvatar
          name={contact.name}
          avatar={contact.avatar}
          isOnline={contact.isOnline}
          lastSeen={contact.lastSeen}
          size="md"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-semibold truncate text-[15px]">
              {contact.name}
            </h3>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="truncate">{contact.phone}</span>
            {contact.amount && (
              <>
                <span>•</span>
                <span className="font-medium">
                  {formatCurrency(contact.amount)}
                </span>
              </>
            )}
          </div>
        </div>
      </button>

      {/* OPTIONS MENU */}
      <DropdownMenu open={showOptions} onOpenChange={setShowOptions}>
        <DropdownMenuTrigger asChild>
          <span className="sr-only">Options</span>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={() => {
              setEditContactId(contact.id);
              setShowOptions(false);
            }}
          >
            <Edit2 className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>

          {onToggleSelect && (
            <DropdownMenuItem
              onClick={() => {
                onEnterSelectionMode?.();
                onToggleSelect(contact.id);
                setShowOptions(false);
              }}
            >
              <CheckSquare className="h-4 w-4 mr-2" />
              Select
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleDelete}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}