import { useState, useEffect, useRef } from 'react';
import { Mic, Square, Trash2, Send, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { globalVoiceRecorder, RecordingController } from '@/lib/globalVoiceRecorder';
import { useToast } from '@/hooks/use-toast';

interface VoiceRecorderButtonProps {
  onRecordingComplete: (blob: Blob) => void;
  disabled?: boolean;
}

export function VoiceRecorderButton({ onRecordingComplete, disabled }: VoiceRecorderButtonProps) {
  const { toast } = useToast();
  const [controller, setController] = useState<RecordingController>(globalVoiceRecorder.getState());
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const unsub = globalVoiceRecorder.subscribe(setController);
    return () => { unsub(); };
  }, []);

  const handleStart = async () => {
    const result = await globalVoiceRecorder.start();
    if (!result.success) {
      toast({ title: 'Recording failed', description: result.error, variant: 'destructive' });
    }
  };

  const handleStop = () => { globalVoiceRecorder.stop(); };
  const handleCancel = () => { globalVoiceRecorder.cancel(); setPlaying(false); };
  const handleSend = () => {
    const blob = controller.audioBlob;
    if (blob) {
      onRecordingComplete(blob);
      globalVoiceRecorder.reset();
      setPlaying(false);
    }
  };

  const togglePlayback = () => {
    if (!audioRef.current || !controller.audioUrl) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
    setPlaying(!playing);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Preview state — after recording stopped
  if (controller.state === 'stopped' && controller.audioUrl) {
    return (
      <div className="flex items-center gap-2 flex-1 bg-muted rounded-full px-3 py-2 animate-fade-in">
        <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive/80" onClick={handleCancel} disabled={disabled}>
          <Trash2 className="h-5 w-5" strokeWidth={2.25} />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={togglePlayback} disabled={disabled}>
          {playing ? <Pause className="h-5 w-5" strokeWidth={2.25} /> : <Play className="h-5 w-5" strokeWidth={2.25} />}
        </Button>
        <span className="text-sm flex-1 font-bold tabular-nums">{formatTime(controller.duration)}</span>
        <audio ref={audioRef} src={controller.audioUrl} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} className="hidden" />
        <Button size="icon" className="h-[46px] w-[46px] rounded-full bg-primary hover:bg-primary/90 shadow-md" onClick={handleSend} disabled={disabled}>
          <Send className="h-5 w-5" strokeWidth={2.25} />
        </Button>
      </div>
    );
  }

  // Recording state
  if (controller.state === 'recording') {
    return (
      <div className="flex items-center gap-2 flex-1 bg-destructive/10 rounded-full px-4 py-2 animate-fade-in">
        <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive/80" onClick={handleCancel}>
          <Trash2 className="h-5 w-5" strokeWidth={2.25} />
        </Button>
        <div className="flex items-center gap-2 flex-1">
          <div className="h-3 w-3 rounded-full bg-destructive animate-pulse" />
          <span className="text-sm font-bold text-destructive tabular-nums">{formatTime(controller.duration)}</span>
          {/* Simple wave animation */}
          <div className="flex items-center gap-[3px] flex-1 px-2">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="w-[3px] rounded-full bg-destructive/60"
                style={{
                  height: `${8 + Math.sin((controller.duration * 3) + i * 0.7) * 8 + Math.random() * 4}px`,
                  transition: 'height 0.15s ease',
                }}
              />
            ))}
          </div>
        </div>
        <Button size="icon" className="h-[46px] w-[46px] rounded-full bg-primary hover:bg-primary/90 shadow-md" onClick={handleStop}>
          <Square className="h-5 w-5 fill-current" strokeWidth={2.25} />
        </Button>
      </div>
    );
  }

  // Idle — mic button
  return (
    <Button
      variant="ghost" size="icon"
      className="h-[54px] w-[54px] shrink-0 rounded-full bg-[hsl(143_75%_18%)] hover:bg-[hsl(143_80%_14%)] dark:bg-[hsl(143_70%_16%)] dark:hover:bg-[hsl(143_75%_12%)] shadow-lg"
      onClick={handleStart}
      disabled={disabled || !navigator.mediaDevices}
      title={!navigator.mediaDevices ? 'Voice recording not supported' : 'Record voice message'}
    >
      <Mic className="h-6 w-6 text-white" strokeWidth={2.5} />
    </Button>
  );
}
