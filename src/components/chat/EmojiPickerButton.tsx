import { useState, useRef, useEffect } from 'react';
import { Smile } from 'lucide-react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface EmojiPickerButtonProps {
  onEmojiSelect: (emoji: string) => void;
}

export function EmojiPickerButton({ onEmojiSelect }: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Smile className="h-5 w-5" />
      </button>
      {open && (
        isMobile ? (
          /* Mobile: render in keyboard area below input */
          <div className="fixed left-0 right-0 bottom-0 z-50 bg-background border-t border-border">
            <EmojiPicker
              theme={Theme.AUTO}
              width="100%"
              height={300}
              onEmojiClick={(emojiData) => {
                onEmojiSelect(emojiData.emoji);
                // Don't close — user can pick multiple emojis
              }}
              searchDisabled={false}
              skinTonesDisabled
              previewConfig={{ showPreview: false }}
            />
          </div>
        ) : (
          /* Desktop: popover above button */
          <div className="absolute bottom-10 left-0 z-50">
            <EmojiPicker
              theme={Theme.AUTO}
              width={320}
              height={400}
              onEmojiClick={(emojiData) => {
                onEmojiSelect(emojiData.emoji);
                // Don't close — user can pick multiple emojis like WhatsApp
              }}
              searchDisabled={false}
              skinTonesDisabled
              previewConfig={{ showPreview: false }}
            />
          </div>
        )
      )}
    </div>
  );
}
