import { useState, useRef, useEffect } from 'react';
import { Smile, Keyboard, Delete } from 'lucide-react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface EmojiPickerButtonProps {
  onEmojiSelect: (emoji: string) => void;
  onDeleteChar?: () => void;
  onToggle?: (open: boolean) => void;
}

export function EmojiPickerButton({ onEmojiSelect, onDeleteChar, onToggle }: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isMobile) {
      const handler = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) {
          setOpen(false);
          onToggle?.(false);
        }
      };
      if (open) document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [open, isMobile, onToggle]);

  const togglePicker = () => {
    const next = !open;
    setOpen(next);
    onToggle?.(next);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={togglePicker}
        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        {open
          ? <Keyboard className="h-5 w-5" strokeWidth={2.25} />
          : <Smile className="h-5 w-5" strokeWidth={2.25} />
        }
      </button>

      {/* Desktop popover */}
      {open && !isMobile && (
        <div className="absolute bottom-10 left-0 z-50">
          <EmojiPicker
            theme={Theme.AUTO}
            width={320}
            height={400}
            onEmojiClick={(emojiData) => onEmojiSelect(emojiData.emoji)}
            searchDisabled={false}
            skinTonesDisabled
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}
    </div>
  );
}

/* Mobile emoji panel — rendered externally by ChatView */
export function MobileEmojiPanel({
  onEmojiSelect,
  onDeleteChar,
}: {
  onEmojiSelect: (emoji: string) => void;
  onDeleteChar: () => void;
}) {
  return (
    <div className="w-full bg-card border-t border-border relative">
      {/* Delete button in top-right */}
      <button
        type="button"
        onClick={onDeleteChar}
        className="absolute top-2 right-3 z-10 p-2 rounded-full hover:bg-muted transition-colors"
        aria-label="Delete character"
      >
        <Delete className="h-5 w-5 text-muted-foreground" strokeWidth={2.25} />
      </button>
      <EmojiPicker
        theme={Theme.AUTO}
        width="100%"
        height={320}
        onEmojiClick={(emojiData) => onEmojiSelect(emojiData.emoji)}
        searchDisabled={false}
        skinTonesDisabled
        previewConfig={{ showPreview: false }}
      />
    </div>
  );
}
