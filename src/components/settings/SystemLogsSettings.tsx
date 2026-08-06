import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ListRestart, Info, SquarePen, Terminal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface SystemLogEntry {
  id: string;
  timestamp: string;
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
  source: string;
}

declare global {
  interface Window {
    __waabaSystemLogs?: SystemLogEntry[];
  }
}

const MAX_LOGS = 250;
const LOG_STORAGE_KEY = 'waaba-system-logs';

const levelStyle: Record<SystemLogEntry['level'], string> = {
  log: 'text-muted-foreground',
  info: 'text-sky-500',
  warn: 'text-amber-500',
  error: 'text-destructive',
};

const levelLabel: Record<SystemLogEntry['level'], string> = {
  log: 'LOG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

function getInitialEntries(): SystemLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(LOG_STORAGE_KEY);
    if (!raw) {
      const starter: SystemLogEntry[] = [{
        id: `log-${Date.now()}-init`,
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'System log capture initialized.',
        source: 'system',
      }];
      window.__waabaSystemLogs = starter;
      window.sessionStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(starter));
      return starter;
    }
    const parsed = JSON.parse(raw) as SystemLogEntry[];
    window.__waabaSystemLogs = parsed;
    return parsed;
  } catch {
    const fallback: SystemLogEntry[] = [{
      id: `log-${Date.now()}-fallback`,
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'System log capture initialized.',
      source: 'system',
    }];
    window.__waabaSystemLogs = fallback;
    return fallback;
  }
}

function formatLogMessage(args: unknown[]): string {
  return args.map((arg) => {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }).join(' ');
}

export function SystemLogsSettings() {
  const [entries, setEntries] = useState<SystemLogEntry[]>(() => getInitialEntries());
  const [filter, setFilter] = useState<'all' | SystemLogEntry['level']>('all');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const originalConsole = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };

    const saveEntries = (next: SystemLogEntry[]) => {
      window.__waabaSystemLogs = next;
      window.sessionStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(next));
      setEntries(next);
    };

    const pushLog = (level: SystemLogEntry['level'], source: string, args: unknown[]) => {
      const nextEntry: SystemLogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        level,
        source,
        message: formatLogMessage(args),
      };

      const existing = window.__waabaSystemLogs || [];
      const updated = [nextEntry, ...existing].slice(0, MAX_LOGS);
      saveEntries(updated);
    };

    const handleConsole = (level: SystemLogEntry['level'], originalMethod: (...args: unknown[]) => void) =>
      (...args: unknown[]) => {
        pushLog(level, 'console', args);
        originalMethod(...args);
      };

    const handleWindowError = (event: ErrorEvent) => {
      pushLog('error', 'window', [event.message]);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      pushLog('error', 'unhandled-rejection', [event.reason instanceof Error ? event.reason.message : String(event.reason)]);
    };

    console.log = handleConsole('log', originalConsole.log);
    console.info = handleConsole('info', originalConsole.info);
    console.warn = handleConsole('warn', originalConsole.warn);
    console.error = handleConsole('error', originalConsole.error);
    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      console.log = originalConsole.log;
      console.info = originalConsole.info;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  const filteredEntries = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter((entry) => entry.level === filter);
  }, [entries, filter]);

  const clearLogs = () => {
    if (typeof window === 'undefined') return;
    const reset: SystemLogEntry[] = [{
      id: `log-${Date.now()}-clear`,
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'System log buffer cleared by the user.',
      source: 'system',
    }];
    window.__waabaSystemLogs = reset;
    window.sessionStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(reset));
    setEntries(reset);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-[17px]">
            <Terminal className="h-5 w-5 text-primary" />
            System Logs
          </CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'all' | SystemLogEntry['level'])}
              className="h-9 rounded-lg border border-input bg-background px-2 text-[12px]"
            >
              <option value="all">All</option>
              <option value="log">Log</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
            <Button variant="outline" size="sm" onClick={clearLogs}>
              <ListRestart className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-2 max-h-[420px] overflow-y-auto rounded-lg border border-border bg-background/50 p-3 text-[12px]">
          {filteredEntries.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">No logs available yet.</p>
          ) : (
            filteredEntries.map((entry) => (
              <div key={entry.id} className="rounded-md border border-border/60 bg-card px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${levelStyle[entry.level]}`}>{levelLabel[entry.level]}</span>
                    <span className="text-muted-foreground">{entry.source}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">{new Date(entry.timestamp).toLocaleString()}</span>
                </div>
                <p className="mt-1 break-words whitespace-pre-wrap text-foreground">{entry.message}</p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
