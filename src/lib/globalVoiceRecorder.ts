/**
 * Global voice recorder controller.
 * Uses native MediaRecorder with opus/webm for clean, low-latency recording.
 * Falls back to audio/mp4 on Safari.
 */

type RecordingState = 'idle' | 'recording' | 'stopped';

export interface RecordingController {
  state: RecordingState;
  startTime: number | null;
  duration: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
}

class VoiceRecorderController {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
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

  private getMimeType(): string {
    // Prefer opus in webm (best quality/size for voice)
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
    if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) return 'audio/ogg;codecs=opus';
    if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
    return '';
  }

  async start(): Promise<{ success: boolean; error?: string }> {
    if (this.controller.state !== 'idle') {
      return { success: false, error: 'Already recording' };
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('BROWSER_UNSUPPORTED');
      }

      // Request mic with echo cancellation and noise suppression for cleaner audio
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        },
      });

      const mimeType = this.getMimeType();
      if (!mimeType) {
        throw new Error('No supported audio recording format found');
      }

      this.chunks = [];
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };

      this.mediaRecorder.start(250); // Collect data every 250ms for smooth recording

      this.startTimeMs = Date.now();
      this.controller.state = 'recording';
      this.controller.startTime = this.startTimeMs;
      this.controller.duration = 0;

      this.timerInterval = setInterval(() => {
        if (!this.startTimeMs) return;
        this.controller.duration = Math.floor((Date.now() - this.startTimeMs) / 1000);
        this.notify();
      }, 1000);

      this.notify();
      return { success: true };

    } catch (error: any) {
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
      } else if (error.message) {
        errorMessage = error.message;
      }

      return { success: false, error: errorMessage };
    }
  }

  async stop() {
    if (this.controller.state !== 'recording' || !this.mediaRecorder) {
      return;
    }

    return new Promise<void>((resolve) => {
      this.mediaRecorder!.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mediaRecorder!.mimeType });

        if (blob.size === 0) {
          this.cleanupRecorder();
          this.controller.state = 'idle';
          this.notify();
          resolve();
          return;
        }

        const url = URL.createObjectURL(blob);
        this.controller.audioBlob = blob;
        this.controller.audioUrl = url;
        this.controller.state = 'stopped';

        if (this.timerInterval) {
          clearInterval(this.timerInterval);
          this.timerInterval = null;
        }

        // Stop mic stream tracks
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;

        this.notify();
        resolve();
      };

      this.mediaRecorder!.stop();
    });
  }

  cancel() {
    if (this.mediaRecorder && this.controller.state === 'recording') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
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

    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.startTimeMs = null;
  }
}

export const globalVoiceRecorder = new VoiceRecorderController();
