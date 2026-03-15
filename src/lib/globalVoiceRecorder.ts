/**
 * Global voice recorder controller (WebAssembly MP3).
 * Uses vmsg encoder to produce WhatsApp-friendly audio/mpeg blobs.
 */

import Recorder from 'vmsg';

type RecordingState = 'idle' | 'recording' | 'stopped';

export interface RecordingController {
  state: RecordingState;
  startTime: number | null;
  duration: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
}

interface VmsgRecorder {
  initAudio: () => Promise<void>;
  initWorker: () => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob>;
  close: () => void;
}

const VMSG_WASM_URL = 'https://unpkg.com/vmsg@0.4.0/vmsg.wasm';

class VoiceRecorderController {
  private recorder: VmsgRecorder | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private startTimeMs: number | null = null;
  private sessionId = 0;
  private cancelledSessionId: number | null = null;

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

  private revokeAudioUrl() {
    if (this.controller.audioUrl) {
      URL.revokeObjectURL(this.controller.audioUrl);
    }
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private closeRecorder() {
    if (this.recorder) {
      try {
        this.recorder.close();
      } catch {
        // ignore
      }
      this.recorder = null;
    }
  }

  private cleanupRuntime() {
    this.stopTimer();
    this.closeRecorder();
    this.startTimeMs = null;
  }

  async start(): Promise<{ success: boolean; error?: string }> {
    if (this.controller.state !== 'idle') {
      return { success: false, error: 'Already recording' };
    }

    try {
      this.cleanupRuntime();
      this.revokeAudioUrl();

      this.controller.audioBlob = null;
      this.controller.audioUrl = null;
      this.controller.duration = 0;

      this.sessionId += 1;
      const currentSession = this.sessionId;
      this.cancelledSessionId = null;

      const recorder = new Recorder({ wasmURL: VMSG_WASM_URL }) as unknown as VmsgRecorder;
      this.recorder = recorder;

      await recorder.initAudio();
      await recorder.initWorker();
      await recorder.startRecording();

      if (currentSession !== this.sessionId) {
        recorder.close();
        return { success: false, error: 'Recording session changed. Please try again.' };
      }

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
      this.cleanupRuntime();

      let errorMessage = 'Failed to start recording. Please try again.';
      if (error?.name === 'NotAllowedError') {
        errorMessage = 'Microphone access denied. Please allow microphone access in your browser settings.';
      } else if (error?.name === 'NotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone.';
      } else if (error?.name === 'NotReadableError' || error?.name === 'AbortError') {
        errorMessage = 'Microphone is busy or unavailable. Close other apps using the mic and try again.';
      } else if (error?.message) {
        errorMessage = error.message;
      }

      return { success: false, error: errorMessage };
    }
  }

  async stop() {
    if (this.controller.state !== 'recording' || !this.recorder) {
      return;
    }

    const currentSession = this.sessionId;
    const activeRecorder = this.recorder;

    this.stopTimer();

    try {
      const blob = await activeRecorder.stopRecording();
      activeRecorder.close();

      if (this.cancelledSessionId === currentSession || currentSession !== this.sessionId) {
        return;
      }

      this.recorder = null;
      this.startTimeMs = null;

      if (!blob || blob.size === 0) {
        this.controller.state = 'idle';
        this.controller.startTime = null;
        this.controller.duration = 0;
        this.notify();
        return;
      }

      this.revokeAudioUrl();
      const url = URL.createObjectURL(blob);

      this.controller.audioBlob = blob;
      this.controller.audioUrl = url;
      this.controller.state = 'stopped';
      this.controller.startTime = null;

      this.notify();
    } catch {
      if (this.cancelledSessionId === currentSession || currentSession !== this.sessionId) {
        return;
      }

      this.cleanupRuntime();
      this.controller.state = 'idle';
      this.controller.startTime = null;
      this.notify();
    }
  }

  cancel() {
    const currentSession = this.sessionId;
    this.cancelledSessionId = currentSession;

    if (this.recorder && this.controller.state === 'recording') {
      const activeRecorder = this.recorder;
      this.recorder = null;
      this.stopTimer();
      this.startTimeMs = null;

      void activeRecorder
        .stopRecording()
        .catch(() => undefined)
        .finally(() => {
          try {
            activeRecorder.close();
          } catch {
            // ignore
          }
        });
    }

    this.reset();
  }

  reset() {
    this.cleanupRuntime();
    this.revokeAudioUrl();

    this.controller = {
      state: 'idle',
      startTime: null,
      duration: 0,
      audioBlob: null,
      audioUrl: null,
    };

    this.notify();
  }
}

export const globalVoiceRecorder = new VoiceRecorderController();
