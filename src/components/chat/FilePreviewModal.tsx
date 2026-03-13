import { X, Send, FileText, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface FilePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  type: 'image' | 'document' | 'audio';
  onSend: () => void;
  sending?: boolean;
}

export function FilePreviewModal({ open, onOpenChange, file, type, onSend, sending }: FilePreviewModalProps) {
  if (!file) return null;

  const previewUrl = type === 'image' ? URL.createObjectURL(file) : null;
  const fileSizeKB = (file.size / 1024).toFixed(1);
  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
  const sizeLabel = file.size > 1024 * 1024 ? `${fileSizeMB} MB` : `${fileSizeKB} KB`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="font-semibold text-[15px]">Send {type === 'image' ? 'Photo' : 'Document'}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center justify-center p-6 min-h-[200px] bg-muted/30">
          {type === 'image' && previewUrl ? (
            <img src={previewUrl} alt={file.name} className="max-w-full max-h-[300px] rounded-lg object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="font-medium text-[15px] truncate max-w-[250px]">{file.name}</p>
                <p className="text-[13px] text-muted-foreground">{sizeLabel}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-3 border-t border-border">
          <div className="text-[13px] text-muted-foreground truncate max-w-[200px]">
            {file.name} · {sizeLabel}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={onSend} disabled={sending}>
              <Send className="h-4 w-4 mr-1.5" />
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
