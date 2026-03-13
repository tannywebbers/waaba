import { X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface MediaPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  fileName?: string;
}

export function MediaPreviewModal({ open, onOpenChange, mediaUrl, mediaType, fileName }: MediaPreviewModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden bg-black/95 border-none">
        <div className="flex items-center justify-between p-3 bg-black/80">
          <span className="text-white text-sm truncate">{fileName || 'Media'}</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" asChild>
              <a href={mediaUrl} download={fileName} target="_blank" rel="noopener noreferrer">
                <Download className="h-5 w-5" />
              </a>
            </Button>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => onOpenChange(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-center p-4 min-h-[300px]">
          {mediaType === 'image' && (
            <img src={mediaUrl} alt={fileName} className="max-w-full max-h-[70vh] object-contain" />
          )}
          {mediaType === 'video' && (
            <video src={mediaUrl} controls autoPlay className="max-w-full max-h-[70vh]" />
          )}
          {mediaType === 'audio' && (
            <div className="w-full max-w-md p-6">
              <audio src={mediaUrl} controls autoPlay className="w-full" />
            </div>
          )}
          {mediaType === 'document' && (
            <div className="text-center text-white">
              <p className="mb-4">{fileName}</p>
              <Button asChild>
                <a href={mediaUrl} download={fileName} target="_blank" rel="noopener noreferrer">
                  Download Document
                </a>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
