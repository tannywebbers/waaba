import { useState, useRef, useEffect } from 'react';
import { Smile } from 'lucide-react';
import EmojiPicker, { Theme } from 'emoji-picker-react';

interface EmojiPickerButtonProps {
  onEmojiSelect: (emoji: string) => void;
}

export function EmojiPickerButton({ onEmojiSelect }: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        <div className="absolute bottom-10 left-0 z-50">
          <EmojiPicker
            theme={Theme.AUTO}
            width={300}
            height={380}
            onEmojiClick={(emojiData) => {
              onEmojiSelect(emojiData.emoji);
              setOpen(false);
            }}
            searchDisabled={false}
            skinTonesDisabled
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}
    </div>
  );
}
