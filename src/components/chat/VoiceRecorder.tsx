// @ts-nocheck
import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Send, Trash2, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
// VoiceRecorder is legacy - globalVoiceRecorder with vmsg is used instead

interface VoiceRecorderProps {
  onRecordingComplete: (blob: Blob) => void;
  onCancel: () => void;
  isRecording: boolean;
  setIsRecording: (recording: boolean) => void;
}

export function VoiceRecorder({ onRecordingComplete, onCancel, isRecording, setIsRecording }: VoiceRecorderProps) {
  const { toast } = useToast();
  const [recordingTime, setRecordingTime] = useState(0);
  const [recorded, setRecorded] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const encoderRef = useRef<any>(null);
  const mp3BuffersRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const SAMPLE_RATE = 44100;
  const BIT_RATE = 256;
  const BUFFER_SIZE = 2048;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, []);

  const floatTo16BitPCM = (input: Float32Array): Int16Array => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: SAMPLE_RATE, echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;

      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = ctx;

      // Legacy: encoder stub (globalVoiceRecorder with vmsg is primary)
      encoderRef.current = { encodeBuffer: () => new Uint8Array(0), flush: () => new Uint8Array(0) };
      mp3BuffersRef.current = [];

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        const float32 = event.inputBuffer.getChannelData(0);
        const int16 = floatTo16BitPCM(float32);
        const maxSamples = 2304;
        for (let i = 0; i < int16.length; i += maxSamples) {
          const chunk = int16.subarray(i, i + maxSamples);
          const mp3buf = encoderRef.current.encodeBuffer(chunk);
          if (mp3buf.length > 0) mp3BuffersRef.current.push(new Uint8Array(mp3buf));
        }
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      setIsRecording(true);
      setRecordingTime(0);
      setRecorded(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setAudioProgress(0);

      timerRef.current = setInterval(() => { setRecordingTime(prev => prev + 1); }, 1000);
    } catch (error: any) {
      toast({ title: 'Microphone access denied', description: 'Please allow microphone access in your browser settings.', variant: 'destructive' });
    }
  }, [setIsRecording, toast, previewUrl]);

  const stopRecording = useCallback(() => {
    // Flush encoder
    if (encoderRef.current) {
      const flushBuf = encoderRef.current.flush();
      if (flushBuf.length > 0) mp3BuffersRef.current.push(new Uint8Array(flushBuf));
    }

    // Create MP3 blob
    const blob = new Blob(mp3BuffersRef.current, { type: 'audio/mp3' });

    // Cleanup audio nodes
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
    if (sourceRef.current) { sourceRef.current.disconnect(); sourceRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    if (blob.size === 0) {
      toast({ title: 'Recording failed', description: 'No audio was captured.', variant: 'destructive' });
      setIsRecording(false);
      return;
    }
    setRecorded(blob);
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
  }, [setIsRecording, toast]);

  const cancelAll = useCallback(() => {
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
    if (sourceRef.current) { sourceRef.current.disconnect(); sourceRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setIsRecording(false); setRecorded(null); setPreviewUrl(null); setRecordingTime(0); setAudioProgress(0);
    mp3BuffersRef.current = [];
    onCancel();
  }, [setIsRecording, onCancel, previewUrl]);

  const sendRecording = useCallback(() => {
    if (recorded) {
      onRecordingComplete(recorded);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setRecorded(null); setPreviewUrl(null); setRecordingTime(0); setAudioProgress(0); setIsRecording(false);
    }
  }, [recorded, onRecordingComplete, setIsRecording, previewUrl]);

  const togglePreview = useCallback(() => {
    if (!audioRef.current || !previewUrl) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play().catch(console.error);
    setPlaying(!playing);
  }, [playing, previewUrl]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (recorded && previewUrl) {
    return (
      <div className="flex items-center gap-2 flex-1 bg-muted rounded-full px-3 py-1.5">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={cancelAll}><Trash2 className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={togglePreview}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <input type="range" min={0} max={100} value={audioProgress}
            onChange={(e) => {
              const pct = Number(e.target.value);
              setAudioProgress(pct);
              if (audioRef.current && audioDuration > 0) audioRef.current.currentTime = (pct / 100) * audioDuration;
            }}
            className="w-full h-1 accent-primary cursor-pointer"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">{formatTime(recordingTime)}</span>
        </div>
        <audio ref={audioRef} src={previewUrl} preload="metadata"
          onLoadedMetadata={() => { if (audioRef.current && isFinite(audioRef.current.duration)) setAudioDuration(audioRef.current.duration); }}
          onTimeUpdate={() => { if (audioRef.current && audioDuration > 0) setAudioProgress((audioRef.current.currentTime / audioDuration) * 100); }}
          onEnded={() => { setPlaying(false); setAudioProgress(0); }}
          className="hidden"
        />
        <Button size="icon" className="h-9 w-9 rounded-full bg-primary shrink-0" onClick={sendRecording}><Send className="h-4 w-4" /></Button>
      </div>
    );
  }

  if (isRecording) {
    return (
      <div className="flex items-center gap-2 flex-1 bg-destructive/10 rounded-full px-4 py-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={cancelAll}><Trash2 className="h-5 w-5" /></Button>
        <div className="flex items-center gap-2 flex-1">
          <div className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />
          <span className="text-sm font-bold text-destructive tabular-nums">{formatTime(recordingTime)}</span>
        </div>
        <Button size="icon" className="h-10 w-10 rounded-full" onClick={stopRecording}><Square className="h-4 w-4" /></Button>
      </div>
    );
  }

  return (
    <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={startRecording}>
      <Mic className="h-5 w-5 text-muted-foreground" />
    </Button>
  );
}
