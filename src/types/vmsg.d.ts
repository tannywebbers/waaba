declare module 'vmsg' {
  interface RecorderOptions {
    wasmURL?: string;
    shimURL?: string;
  }

  class Recorder {
    constructor(options?: RecorderOptions);
    initAudio(): Promise<void>;
    initWorker(): Promise<void>;
    startRecording(): Promise<void>;
    stopRecording(): Promise<Blob>;
    close(): void;
  }

  export default Recorder;
}
