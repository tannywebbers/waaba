import { useState, useRef, useEffect } from 'react';
import { Smile, Keyboard, Delete, Sticker as StickerIcon } from 'lucide-react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { StickerGrid } from '@/components/chat/StickerGrid';
import { cn } from '@/lib/utils';

type Tab = 'emoji' | 'sticker';

interface EmojiPickerButtonProps {
  onEmojiSelect: (emoji: string) => void;
  onDeleteChar?: () => void;
  onToggle?: (open: boolean) => void;
  onStickerSelect?: (sticker: { mediaUrl: string; mimeType: string }) => void;
}

function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-card">
      <button
        type="button"
        onClick={() => setTab('emoji')}
        className={cn(
          'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors',
          tab === 'emoji' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'
        )}
      >
        <Smile className="h-4 w-4" /> Emoji
      </button>
      <button
        type="button"
        onClick={() => setTab('sticker')}
        className={cn(
          'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors',
          tab === 'sticker' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'
        )}
      >
        <StickerIcon className="h-4 w-4" /> Stickers
      </button>
    </div>
  );
}

export function EmojiPickerButton({ onEmojiSelect, onDeleteChar, onToggle, onStickerSelect }: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('emoji');
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
        className="p-1.5 text-zinc-500 hover:text-zinc-600 hover:bg-zinc-500/10 rounded-full transition-colors"
      >
        {open
          ? <Keyboard className="h-6 w-6" strokeWidth={2.25} />
          : <Smile className="h-6 w-6" strokeWidth={2.25} />
        }
      </button>

      {/* Desktop popover */}
      {open && !isMobile && (
        <div className="absolute bottom-10 left-0 z-50 bg-card border border-border rounded-lg shadow-xl overflow-hidden" style={{ width: 320 }}>
          {onStickerSelect && <TabBar tab={tab} setTab={setTab} />}
          {tab === 'emoji' ? (
            <EmojiPicker
              theme={Theme.AUTO}
              width={320}
              height={onStickerSelect ? 360 : 400}
              onEmojiClick={(emojiData) => onEmojiSelect(emojiData.emoji)}
              searchDisabled={false}
              skinTonesDisabled
              previewConfig={{ showPreview: false }}
            />
          ) : (
            onStickerSelect && (
              <StickerGrid
                height={360}
                onSelect={(s) => { onStickerSelect(s); setOpen(false); onToggle?.(false); }}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

/* Mobile emoji panel — rendered externally by ChatView */
export function MobileEmojiPanel({
  onEmojiSelect,
  onDeleteChar,
  onStickerSelect,
}: {
  onEmojiSelect: (emoji: string) => void;
  onDeleteChar: () => void;
  onStickerSelect?: (sticker: { mediaUrl: string; mimeType: string }) => void;
}) {
  const [tab, setTab] = useState<Tab>('emoji');
  return (
    <div className="w-full bg-card border-t border-border relative">
      {onStickerSelect && <TabBar tab={tab} setTab={setTab} />}
      {tab === 'emoji' ? (
        <div className="relative">
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
            height={280}
            onEmojiClick={(emojiData) => onEmojiSelect(emojiData.emoji)}
            searchDisabled
            skinTonesDisabled
            previewConfig={{ showPreview: false }}
          />
        </div>
      ) : (
        onStickerSelect && (
          <StickerGrid height={280} onSelect={onStickerSelect} />
        )
      )}
    </div>
  );
}
