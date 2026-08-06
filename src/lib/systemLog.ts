/**
 * Global system log buffer.
 *
 * Installed once at app boot (see src/main.tsx) so EVERY console call,
 * uncaught error, promise rejection and explicit `logEvent()` from anywhere in
 * the app is captured — not only while the Settings → System Logs screen is open.
 */

export type SystemLogLevel = 'log' | 'info' | 'warn' | 'error';

export interface SystemLogEntry {
  id: string;
  timestamp: string;
  level: SystemLogLevel;
  source: string;
  message: string;
  details?: unknown;
}

const MAX_LOGS = 500;
const STORAGE_KEY = 'waaba-system-logs';

declare global {
  interface Window {
    __waabaSystemLogs?: SystemLogEntry[];
    __waabaSystemLogsInstalled?: boolean;
  }
}

let buffer: SystemLogEntry[] = [];
const listeners = new Set<(entries: SystemLogEntry[]) => void>();

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value, (_k, v) => {
      if (typeof v === 'string' && v.length > 4000) return `${v.slice(0, 4000)}…[truncated]`;
      return v;
    }, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function formatArgs(args: unknown[]): string {
  return args.map((a) => (typeof a === 'string' ? a : safeStringify(a))).join(' ');
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer.slice(0, 150)));
  } catch {
    /* storage full / unavailable — in-memory buffer still works */
  }
}

function emit() {
  window.__waabaSystemLogs = buffer;
  listeners.forEach((fn) => fn(buffer));
}

function loadPersisted() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) buffer = JSON.parse(raw) as SystemLogEntry[];
  } catch {
    buffer = [];
  }
}

/** Push an entry into the system log. Safe to call from anywhere. */
export function logEvent(
  level: SystemLogLevel,
  source: string,
  message: string,
  details?: unknown,
) {
  if (typeof window === 'undefined') return;
  const entry: SystemLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    details,
  };
  buffer = [entry, ...buffer].slice(0, MAX_LOGS);
  persist();
  emit();
}

export function getSystemLogs(): SystemLogEntry[] {
  return buffer;
}

export function subscribeSystemLogs(fn: (entries: SystemLogEntry[]) => void): () => void {
  listeners.add(fn);
  fn(buffer);
  return () => listeners.delete(fn);
}

export function clearSystemLogs() {
  buffer = [];
  persist();
  emit();
  logEvent('info', 'system', 'System log buffer cleared by the user.');
}

export function exportSystemLogs(): string {
  return buffer
    .slice()
    .reverse()
    .map((e) => {
      const head = `[${e.timestamp}] ${e.level.toUpperCase()} (${e.source}) ${e.message}`;
      return e.details === undefined ? head : `${head}\n${safeStringify(e.details)}`;
    })
    .join('\n\n');
}

/** Installs global console / error interceptors exactly once. */
export function installSystemLogCapture() {
  if (typeof window === 'undefined' || window.__waabaSystemLogsInstalled) return;
  window.__waabaSystemLogsInstalled = true;

  loadPersisted();

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  const wrap = (level: SystemLogLevel, fn: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      try {
        logEvent(level, 'console', formatArgs(args));
      } catch {
        /* never break the app because of logging */
      }
      fn(...args);
    };

  console.log = wrap('log', original.log);
  console.debug = wrap('log', original.debug);
  console.info = wrap('info', original.info);
  console.warn = wrap('warn', original.warn);
  console.error = wrap('error', original.error);

  window.addEventListener('error', (event) => {
    logEvent('error', 'window', event.message, {
      filename: (event as ErrorEvent).filename,
      lineno: (event as ErrorEvent).lineno,
      colno: (event as ErrorEvent).colno,
      stack: (event as ErrorEvent).error?.stack,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    logEvent('error', 'unhandled-rejection', reason instanceof Error ? reason.message : String(reason), {
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  logEvent('info', 'system', 'System log capture initialized (global).');
}
