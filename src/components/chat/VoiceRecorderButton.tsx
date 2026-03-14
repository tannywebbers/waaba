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
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive/80" onClick={handleCancel} disabled={disabled}>
          <Trash2 className="h-4 w-4" strokeWidth={2.25} />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={togglePlayback} disabled={disabled}>
          {playing ? <Pause className="h-4 w-4" strokeWidth={2.25} /> : <Play className="h-4 w-4" strokeWidth={2.25} />}
        </Button>
        <span className="text-sm flex-1 font-medium">{formatTime(controller.duration)}</span>
        <audio ref={audioRef} src={controller.audioUrl} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} className="hidden" />
        <Button size="icon" className="h-[42px] w-[42px] rounded-full bg-primary hover:bg-primary/90" onClick={handleSend} disabled={disabled}>
          <Send className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </Button>
      </div>
    );
  }

  // Recording state
  if (controller.state === 'recording') {
    return (
      <div className="flex items-center gap-2 flex-1 bg-destructive/10 rounded-full px-4 py-2 animate-fade-in">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive/80" onClick={handleCancel}>
          <Trash2 className="h-5 w-5" strokeWidth={2.25} />
        </Button>
        <div className="flex items-center gap-2 flex-1">
          <div className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />
          <span className="text-sm font-bold text-destructive tabular-nums">{formatTime(controller.duration)}</span>
        </div>
        <Button size="icon" className="h-[42px] w-[42px] rounded-full bg-primary hover:bg-primary/90" onClick={handleStop}>
          <Square className="h-4 w-4" strokeWidth={2.25} />
        </Button>
      </div>
    );
  }

  // Idle — mic button
  return (
    <Button
      variant="ghost" size="icon"
      className="h-[42px] w-[42px] shrink-0 rounded-full bg-primary hover:bg-primary/90 shadow-sm"
      onClick={handleStart}
      disabled={disabled || !navigator.mediaDevices}
      title={!navigator.mediaDevices ? 'Voice recording not supported' : 'Record voice message'}
    >
      <Mic className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
    </Button>
  );
}
