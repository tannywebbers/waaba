// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Copy, FileText, Image as ImageIcon, Music, MoreVertical, Pause, Play, Trash2, Video as VideoIcon, Play as PlayIcon, Reply, Smile, Sticker as StickerIcon, BookmarkPlus } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Message } from '@/types';
import { MessageStatus } from '@/components/shared/MessageStatus';
import { MediaPreviewModal } from '@/components/chat/MediaPreviewModal';
import { formatMessageTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { voiceQueue } from '@/lib/voiceQueue';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getMessagePreview } from '@/lib/utils/messagePreview';

interface MessageBubbleProps {
  message: Message;
  onDelete?: () => void;
  onReply?: (message: Message) => void;
  onReact?: (message: Message, emoji: string) => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export function MessageBubble({ message, onDelete, onReply, onReact }: MessageBubbleProps) {
  const { content, isOutgoing, timestamp, status, type, mediaUrl, replySnapshot, reactions } = message;
  const [mediaPreview, setMediaPreview] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const isSticker = (type as string) === 'sticker' || (type === 'image' && content === '[Sticker]');

  // Register voice notes with the sequential player queue
  useEffect(() => {
    if (type === 'audio' && audioRef.current && message.id) {
      const order = new Date(timestamp).getTime();
      voiceQueue.register(message.id, message.contactId, order, audioRef.current, setAudioPlaying);
      return () => voiceQueue.unregister(message.id);
    }
  }, [type, message.id, message.contactId, timestamp]);

  const getDisplayName = () => {
    if (!content || content.startsWith('[')) return null;
    return content;
  };

  const toggleAudio = () => {
    if (audioError || !message.id) return;
    if (audioPlaying) voiceQueue.pause(message.id);
    else voiceQueue.play(message.id);
  };

  const [savingSticker, setSavingSticker] = useState(false);
  const handleSaveSticker = async () => {
    if (!user || !mediaUrl || savingSticker) return;
    setSavingSticker(true);
    const { saveRemoteStickerToLibrary } = await import('@/lib/utils/stickerUpload');
    const r = await saveRemoteStickerToLibrary(mediaUrl, user.id, message.id);
    setSavingSticker(false);
    if (!r.ok) toast({ title: 'Failed to save', description: r.error, variant: 'destructive' });
    else toast({ title: '✅ Sticker saved', description: 'Available in Stickers section.' });
  };

  const renderReplyQuote = () => {
    if (!replySnapshot) return null;
    return (
      <div className="mb-1.5 pl-2 border-l-[3px] border-primary bg-black/5 dark:bg-white/5 rounded-r-md py-1 pr-2 cursor-pointer">
        <p className="text-[11px] font-semibold text-primary truncate">
          {replySnapshot.isOutgoing ? 'You' : (replySnapshot.fromName || 'Contact')}
        </p>
        <p className="text-[12px] text-muted-foreground truncate">
          {getMessagePreview({ type: replySnapshot.type, content: replySnapshot.content })}
        </p>
      </div>
    );
  };

  const renderContent = () => {
    if (isSticker && mediaUrl) {
      return (
        <div className="relative group/sticker">
          <img src={mediaUrl} alt="Sticker" className="max-w-[140px] max-h-[140px] object-contain cursor-pointer" onClick={() => setMediaPreview(true)} />
          {!isOutgoing && (
            <button
              onClick={handleSaveSticker}
              disabled={savingSticker}
              className="absolute -top-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md disabled:opacity-50 hover:scale-105 transition-transform"
              title="Save sticker"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      );
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

    if (type === 'video' && mediaUrl) {
      const fileName = getDisplayName();
      return (
        <div className="space-y-0.5">
          <div className="relative rounded-lg overflow-hidden max-w-[260px] sm:max-w-[320px] cursor-pointer group/video" onClick={() => setMediaPreview(true)}>
            <video src={mediaUrl} preload="metadata" className="w-full max-h-[280px] object-cover bg-black" playsInline muted />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/video:bg-black/30 transition-colors">
              <div className="h-12 w-12 rounded-full bg-black/60 flex items-center justify-center">
                <PlayIcon className="h-6 w-6 text-white ml-0.5" fill="white" />
              </div>
            </div>
          </div>
          {fileName && fileName !== '[Video]' && (
            <div className="flex items-center gap-1 pt-0.5">
              <VideoIcon className="h-3 w-3 text-muted-foreground shrink-0" />
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
            <div className="h-9 w-9 rounded-full bg-destructive/20 flex items-center justify-center shrink-0"><AlertCircle className="h-4 w-4" /></div>
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
                onEnded={() => {
                  setAudioProgress(0);
                  if (message.id) voiceQueue.ended(message.id);
                }}
                onPause={() => setAudioPlaying(false)}
                onPlay={() => setAudioPlaying(true)}
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

  // Group reactions by emoji and count
  const reactionCounts: Record<string, number> = {};
  (reactions || []).forEach(r => { if (r.emoji) reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1; });
  const hasReactions = Object.keys(reactionCounts).length > 0;

  return (
    <>
      <div className={cn('flex animate-message-in', isOutgoing ? 'justify-end' : 'justify-start')}>
        <div className="relative group">
          {/* Action buttons (reply, react, menu) */}
          <div className={cn('absolute -top-1 z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity', isOutgoing ? '-left-20' : '-right-20')}>
            {onReact && (
              <Popover open={reactOpen} onOpenChange={setReactOpen}>
                <PopoverTrigger asChild>
                  <button className="h-7 w-7 rounded-full bg-card border border-border shadow-sm flex items-center justify-center hover:bg-accent" title="React">
                    <Smile className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-1.5" side="top">
                  <div className="flex gap-1">
                    {QUICK_REACTIONS.map(emoji => (
                      <button
                        key={emoji}
                        className="h-9 w-9 rounded-full hover:bg-accent text-xl flex items-center justify-center"
                        onClick={() => { onReact(message, emoji); setReactOpen(false); }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            {onReply && (
              <button
                onClick={() => onReply(message)}
                className="h-7 w-7 rounded-full bg-card border border-border shadow-sm flex items-center justify-center hover:bg-accent"
                title="Reply"
              >
                <Reply className="h-3.5 w-3.5" />
              </button>
            )}
            {onDelete && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="h-7 w-7 rounded-full bg-card border border-border shadow-sm flex items-center justify-center hover:bg-accent">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isOutgoing ? 'start' : 'end'}>
                  {onReply && (
                    <DropdownMenuItem onClick={() => onReply(message)}>
                      <Reply className="h-4 w-4 mr-2" />Reply
                    </DropdownMenuItem>
                  )}
                  {isSticker && mediaUrl && !isOutgoing && (
                    <DropdownMenuItem onClick={handleSaveSticker}>
                      <BookmarkPlus className="h-4 w-4 mr-2" />Save sticker
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={async () => {
                    await navigator.clipboard.writeText(content || '');
                    toast({ title: 'Message copied' });
                  }}>
                    <Copy className="h-4 w-4 mr-2" />Copy message
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />Delete message
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div
            className={cn(
              isSticker ? 'message-sticker' : 'message-bubble',
              !isSticker && (isOutgoing ? 'message-bubble-outgoing' : 'message-bubble-incoming'),
              !isSticker && 'px-3 py-2 max-w-[85vw] sm:max-w-[420px] shadow-sm',
              !isSticker && (isOutgoing ? 'bg-[hsl(var(--bubble-outgoing))] text-[hsl(var(--bubble-text))]' : 'bg-[hsl(var(--bubble-incoming))] text-[hsl(var(--bubble-text))]')
            )}
          >
            {!isSticker && renderReplyQuote()}
            {renderContent()}
            {!isSticker && (
              <div className={cn('flex items-center gap-1 mt-0.5', isOutgoing ? 'justify-end' : 'justify-start')}>
                <span className="text-[11px] text-muted-foreground">{formatMessageTime(timestamp)}</span>
                {isOutgoing && <MessageStatus status={status} className="h-3.5 w-3.5" />}
              </div>
            )}
            {status === 'failed' && isOutgoing && (
              <div className="flex items-center gap-1 mt-1 text-destructive">
                <AlertCircle className="h-3 w-3" />
                <span className="text-[11px] font-medium">Failed to send</span>
              </div>
            )}
          </div>

          {/* Reactions row */}
          {hasReactions && (
            <div className={cn('flex gap-1 -mt-1.5 px-1', isOutgoing ? 'justify-end' : 'justify-start')}>
              {Object.entries(reactionCounts).map(([emoji, count]) => (
                <span key={emoji} className="bg-card border border-border rounded-full px-1.5 py-0.5 text-[11px] shadow-sm flex items-center gap-0.5">
                  <span>{emoji}</span>
                  {count > 1 && <span className="text-muted-foreground">{count}</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {mediaUrl && <MediaPreviewModal open={mediaPreview} onOpenChange={setMediaPreview} mediaUrl={mediaUrl} mediaType={type as any} fileName={content} />}
    </>
  );
}
