import { useState, useEffect, useRef } from 'react';
import { X, Send, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface ImagePastePreviewProps {
  file: File | null;
  onConfirm: (file: File, caption: string) => void;
  onCancel: () => void;
}

export function ImagePastePreview({ file, onConfirm, onCancel }: ImagePastePreviewProps) {
  const [caption, setCaption] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setCaption('');
      // Focus input after dialog opens
      setTimeout(() => inputRef.current?.focus(), 100);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [file]);

  const handleSend = () => {
    if (file) {
      onConfirm(file, caption);
      setCaption('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') onCancel();
  };

  return (
    <Dialog open={!!file} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-background">
        <div className="flex items-center justify-between px-4 py-3 bg-panel-header border-b border-panel-border">
          <div className="flex items-center gap-2">
            <Image className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Send Image</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center justify-center bg-black/5 min-h-[200px] max-h-[400px] overflow-hidden">
          {previewUrl && (
            <img src={previewUrl} alt="Preview" className="max-w-full max-h-[400px] object-contain" />
          )}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-panel-border">
          <Input
            ref={inputRef}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a caption..."
            className="flex-1 bg-muted border-0 focus-visible:ring-0"
          />
          <Button
            size="icon"
            className="h-10 w-10 rounded-full bg-primary hover:bg-primary/90 shrink-0"
            onClick={handleSend}
          >
            <Send className="h-4 w-4 text-primary-foreground" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
