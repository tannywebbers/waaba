declare module 'vmsg' {
  export interface RecorderOptions {
    wasmURL: string;
    [key: string]: unknown;
  }

  export default class Recorder {
    constructor(options: RecorderOptions);
    initAudio(): Promise<void>;
    initWorker(): Promise<void>;
    startRecording(): Promise<void>;
    stopRecording(): Promise<Blob>;
    close(): void;
  }
}
