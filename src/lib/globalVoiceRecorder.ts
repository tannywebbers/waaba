/**
 * Global voice recorder controller.
 * Uses vmsg (WebAssembly LAME) for reliable MP3 encoding.
 */
import vmsg from 'vmsg';
const Recorder = (vmsg as any).Recorder || (vmsg as any).default || vmsg;

type RecordingState = 'idle' | 'recording' | 'stopped';

export interface RecordingController {
  state: RecordingState;
  startTime: number | null;
  duration: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
}

class VoiceRecorderController {
  private recorder: any = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private startTimeMs: number | null = null;

  private controller: RecordingController = {
    state: 'idle',
    startTime: null,
    duration: 0,
    audioBlob: null,
    audioUrl: null,
  };

  private listeners = new Set<(controller: RecordingController) => void>();

  subscribe(listener: (controller: RecordingController) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((listener) => listener({ ...this.controller }));
  }

  getState(): RecordingController {
    return { ...this.controller };
  }

  getAudioBlob(): Blob | null {
    return this.controller.audioBlob;
  }

  async start(): Promise<{ success: boolean; error?: string }> {
    if (this.controller.state !== 'idle') {
      return { success: false, error: 'Already recording' };
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('BROWSER_UNSUPPORTED');
      }

      console.log('[VoiceRecorder] Initializing vmsg recorder...');

      this.recorder = new Recorder({
        wasmURL: 'https://unpkg.com/vmsg@0.3.0/vmsg.wasm',
      });

      console.log('[VoiceRecorder] Loading WebAssembly encoder...');
      await this.recorder.initAudio();
      await this.recorder.initWorker();
      console.log('[VoiceRecorder] ✅ Encoder ready');

      console.log('[VoiceRecorder] Starting recording...');
      await this.recorder.startRecording();

      this.startTimeMs = Date.now();
      this.controller.state = 'recording';
      this.controller.startTime = this.startTimeMs;
      this.controller.duration = 0;

      this.timerInterval = setInterval(() => {
        if (!this.startTimeMs) return;
        this.controller.duration = Math.floor((Date.now() - this.startTimeMs) / 1000);
        this.notify();
      }, 1000);

      console.log('[VoiceRecorder] ✅ Recording started successfully');
      this.notify();
      return { success: true };

    } catch (error: any) {
      console.error('[VoiceRecorder] ❌ Recording initialization failed:', error);
      this.cleanupRecorder();

      let errorMessage = 'Failed to start recording. Please try again.';

      if (error.message === 'BROWSER_UNSUPPORTED') {
        errorMessage = 'Microphone not supported in this browser.';
      } else if (error?.name === 'NotAllowedError') {
        errorMessage = 'Microphone access denied. Please allow microphone access in your browser settings.';
      } else if (error?.name === 'NotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone.';
      } else if (error?.name === 'NotReadableError' || error?.name === 'AbortError') {
        errorMessage = 'Microphone is busy or unavailable. Close other apps using the mic and try again.';
      } else if (error.message && error.message.includes('wasm')) {
        errorMessage = 'Failed to load audio encoder. Please check your internet connection and try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      return { success: false, error: errorMessage };
    }
  }

  async stop() {
    if (this.controller.state !== 'recording' || !this.recorder) {
      console.warn('[VoiceRecorder] Cannot stop - not recording');
      return;
    }

    console.log('[VoiceRecorder] Stopping recording...');

    try {
      const blob = await this.recorder.stopRecording();

      if (!blob || blob.size === 0) {
        throw new Error('No audio data recorded');
      }

      const url = URL.createObjectURL(blob);

      console.log('[VoiceRecorder] ✅ Recording complete:', {
        size: blob.size,
        type: blob.type
      });

      this.controller.audioBlob = blob;
      this.controller.audioUrl = url;
      this.controller.state = 'stopped';

      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }

      this.notify();

    } catch (error: any) {
      console.error('[VoiceRecorder] ❌ Stop recording failed:', error);
      this.cleanupRecorder();
      this.controller.state = 'idle';
      this.notify();
    }
  }

  cancel() {
    console.log('[VoiceRecorder] Cancelling recording...');

    if (this.recorder && this.controller.state === 'recording') {
      try {
        this.recorder.close();
      } catch (e) {
        console.error('[VoiceRecorder] Error closing recorder:', e);
      }
    }

    this.cleanupRecorder();
    this.reset();
  }

  reset() {
    if (this.controller.audioUrl) {
      URL.revokeObjectURL(this.controller.audioUrl);
    }

    this.controller = {
      state: 'idle',
      startTime: null,
      duration: 0,
      audioBlob: null,
      audioUrl: null,
    };

    this.notify();
  }

  private cleanupRecorder() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.recorder) {
      try {
        this.recorder.close();
      } catch (e) {
        console.error('[VoiceRecorder] Error closing recorder:', e);
      }
      this.recorder = null;
    }

    this.startTimeMs = null;
  }
}

export const globalVoiceRecorder = new VoiceRecorderController();
