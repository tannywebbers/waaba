// @ts-nocheck
import { useRef, useState } from 'react';
import { AlertCircle, FileText, Image as ImageIcon, Music, MoreVertical, Pause, Play, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Message } from '@/types';
import { MessageStatus } from '@/components/shared/MessageStatus';
import { MediaPreviewModal } from '@/components/chat/MediaPreviewModal';
import { formatMessageTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: Message;
  onDelete?: () => void;
}

export function MessageBubble({ message, onDelete }: MessageBubbleProps) {
  const { content, isOutgoing, timestamp, status, type, mediaUrl } = message;
  const [mediaPreview, setMediaPreview] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const isSticker = (type as string) === 'sticker' || (type === 'image' && content === '[Sticker]');

  // Extract a readable filename from content
  const getDisplayName = () => {
    if (!content || content.startsWith('[')) return null;
    return content;
  };

  const toggleAudio = () => {
    if (!audioRef.current || audioError) return;
    if (audioPlaying) audioRef.current.pause();
    else audioRef.current.play();
    setAudioPlaying(!audioPlaying);
  };

  const renderContent = () => {
    if (isSticker && mediaUrl) {
      return <img src={mediaUrl} alt="Sticker" className="max-w-[140px] max-h-[140px] object-contain cursor-pointer" onClick={() => setMediaPreview(true)} />;
    }

    if (type === 'image' && mediaUrl) {
      const fileName = getDisplayName();
      return (
        <div className="space-y-0.5">
          <img src={mediaUrl} alt="Image" className="rounded-lg max-w-[260px] sm:max-w-[320px] max-h-[280px] object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setMediaPreview(true)} />
          {fileName && fileName !== '[Image]' && (
            <div className="flex items-center gap-1 pt-0.5">
              <ImageIcon className="h-3 w-3 text-muted-foreground shrink-0" />
              <p className="text-[12px] text-muted-foreground truncate">{fileName}</p>
            </div>
          )}
        </div>
      );
    }

    if (type === 'audio' && mediaUrl) {
      const fileName = getDisplayName();
      if (audioError) {
        return (
          <div className="flex items-center gap-2.5 min-w-[180px] text-destructive">
            <div className="h-9 w-9 rounded-full bg-destructive/20 flex items-center justify-center shrink-0">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-[80px]">
              <p className="text-xs font-medium">Audio unavailable</p>
              <p className="text-[10px] opacity-70">Failed to load audio file</p>
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-0.5">
          <div className="flex items-center gap-2.5 min-w-[180px]">
            <button
              className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0 hover:bg-primary/30 transition-colors"
              onClick={toggleAudio}
            >
              {audioPlaying ? <Pause className="h-4 w-4 text-primary" /> : <Play className="h-4 w-4 text-primary ml-0.5" />}
            </button>
            <div className="flex-1 min-w-[80px]">
              <input
                type="range" min={0} max={100} value={audioProgress}
                onChange={(e) => {
                  if (audioRef.current && audioRef.current.duration) {
                    const pct = Number(e.target.value);
                    audioRef.current.currentTime = (pct / 100) * audioRef.current.duration;
                    setAudioProgress(pct);
                  }
                }}
                className="w-full h-1 accent-primary cursor-pointer"
              />
              <audio
                ref={audioRef} src={mediaUrl} preload="metadata"
                onLoadedMetadata={() => {
                  if (audioRef.current && isFinite(audioRef.current.duration)) {
                    const secs = Math.floor(audioRef.current.duration);
                    setAudioDuration(`${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`);
                    setAudioError(false);
                  }
                }}
                onTimeUpdate={() => {
                  if (audioRef.current && isFinite(audioRef.current.duration)) {
                    setAudioProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
                    const secs = Math.floor(audioRef.current.currentTime);
                    setAudioDuration(`${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`);
                  }
                }}
                onEnded={() => { setAudioPlaying(false); setAudioProgress(0); }}
                onError={() => { setAudioError(true); setAudioPlaying(false); }}
                className="hidden"
              />
            </div>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{audioDuration ?? '⏳'}</span>
          </div>
          {fileName && (
            <div className="flex items-center gap-1">
              <Music className="h-3 w-3 text-muted-foreground shrink-0" />
              <p className="text-[11px] text-muted-foreground truncate">{fileName}</p>
            </div>
          )}
        </div>
      );
    }

    if (type === 'document' && mediaUrl) {
      const fileName = getDisplayName();
      return (
        <button onClick={() => setMediaPreview(true)} className="flex items-center gap-2.5 p-2.5 bg-background/50 rounded-lg hover:bg-background/70 transition-colors w-full text-left">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><FileText className="h-4 w-4 text-primary" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium truncate">{fileName || 'Document'}</p>
            <p className="text-[11px] text-muted-foreground">Tap to view</p>
          </div>
        </button>
      );
    }

    return <p className="text-[15px] sm:text-[14px] leading-[1.3] whitespace-pre-wrap break-words font-medium" style={{ overflowWrap: 'anywhere' }}>{content}</p>;
  };

  return (
    <>
      <div className={cn('flex animate-message-in', isOutgoing ? 'justify-end' : 'justify-start')}>
        <div className="relative group">
          {onDelete && (
            <div className={cn('absolute top-1 z-10', isOutgoing ? 'left-1' : 'right-1')}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="h-5 w-5 rounded-full bg-black/10 text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreVertical className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isOutgoing ? 'start' : 'end'}>
                  <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />Delete message
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <div
            className={cn(
              isSticker ? 'message-sticker' : 'message-bubble',
              !isSticker && (isOutgoing ? 'message-bubble-outgoing' : 'message-bubble-incoming'),
              !isSticker && 'px-3 py-2 max-w-[85vw] sm:max-w-[75vw] shadow-sm',
              !isSticker && (isOutgoing ? 'bg-[hsl(var(--bubble-outgoing))] text-[hsl(var(--bubble-text))]' : 'bg-[hsl(var(--bubble-incoming))] text-[hsl(var(--bubble-text))]')
            )}
          >
            {renderContent()}
            {!isSticker && (
              <div className={cn('flex items-center gap-1 mt-0.5', isOutgoing ? 'justify-end' : 'justify-start')}>
                <span className="text-[11px] text-muted-foreground">{formatMessageTime(timestamp)}</span>
                {isOutgoing && <MessageStatus status={status} className="h-3.5 w-3.5" />}
              </div>
            )}
            {status === 'failed' && isOutgoing && (
              <div className="flex items-center gap-1 mt-1 text-destructive cursor-pointer" title="Tap for details">
                <AlertCircle className="h-3 w-3" />
                <span className="text-[11px] font-medium">Failed to send</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {mediaUrl && <MediaPreviewModal open={mediaPreview} onOpenChange={setMediaPreview} mediaUrl={mediaUrl} mediaType={type as any} fileName={content} />}
    </>
  );
}
