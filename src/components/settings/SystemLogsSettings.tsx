import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ListRestart, Copy, Terminal, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  clearSystemLogs,
  exportSystemLogs,
  subscribeSystemLogs,
  type SystemLogEntry,
  type SystemLogLevel,
} from '@/lib/systemLog';

const levelStyle: Record<SystemLogLevel, string> = {
  log: 'text-muted-foreground',
  info: 'text-sky-500',
  warn: 'text-amber-500',
  error: 'text-destructive',
};

const levelLabel: Record<SystemLogLevel, string> = {
  log: 'LOG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

function pretty(details: unknown): string {
  if (typeof details === 'string') return details;
  try {
    return JSON.stringify(details, null, 2) ?? String(details);
  } catch {
    return String(details);
  }
}

export function SystemLogsSettings() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<SystemLogEntry[]>([]);
  const [filter, setFilter] = useState<'all' | SystemLogLevel>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => subscribeSystemLogs(setEntries), []);

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter !== 'all' && entry.level !== filter) return false;
      if (!term) return true;
      return (
        entry.message.toLowerCase().includes(term) ||
        entry.source.toLowerCase().includes(term) ||
        (entry.details !== undefined && pretty(entry.details).toLowerCase().includes(term))
      );
    });
  }, [entries, filter, search]);

  const errorCount = useMemo(() => entries.filter((e) => e.level === 'error').length, [entries]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(exportSystemLogs());
      toast({ title: '📋 Logs copied', description: 'Full log buffer copied to clipboard.' });
    } catch {
      toast({ title: '❌ Could not copy logs', variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-[17px]">
            <Terminal className="h-5 w-5 text-primary" />
            System Logs
            {errorCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
                <AlertTriangle className="h-3 w-3" />
                {errorCount}
              </span>
            )}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'all' | SystemLogLevel)}
              className="h-9 rounded-lg border border-input bg-background px-2 text-[12px]"
            >
              <option value="all">All</option>
              <option value="log">Log</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
            <Button variant="outline" size="sm" onClick={copyAll}>
              <Copy className="h-4 w-4 mr-1" />
              Copy
            </Button>
            <Button variant="outline" size="sm" onClick={clearSystemLogs}>
              <ListRestart className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground pt-1">
          Captures everything app-wide from launch: sends, webhooks, template payloads, Meta error codes and crashes.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search logs (e.g. template, 132000, webhook)…"
          className="h-9 text-[13px]"
        />

        <div className="space-y-2 max-h-[460px] overflow-y-auto rounded-lg border border-border bg-background/50 p-3 text-[12px]">
          {filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <RefreshCw className="h-5 w-5" />
              <p>No logs match this view yet.</p>
            </div>
          ) : (
            filteredEntries.map((entry) => {
              const isOpen = !!expanded[entry.id];
              const hasDetails = entry.details !== undefined && entry.details !== null;
              return (
                <div key={entry.id} className="rounded-md border border-border/60 bg-card px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-semibold ${levelStyle[entry.level]}`}>{levelLabel[entry.level]}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="mt-1 break-words whitespace-pre-wrap text-foreground/90">{entry.message}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">source: {entry.source}</span>
                    {hasDetails && (
                      <button
                        type="button"
                        onClick={() => setExpanded((prev) => ({ ...prev, [entry.id]: !isOpen }))}
                        className="flex items-center gap-1 text-[11px] text-primary"
                      >
                        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        {isOpen ? 'Hide details' : 'Details'}
                      </button>
                    )}
                  </div>
                  {hasDetails && isOpen && (
                    <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted/40 p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words">
                      {pretty(entry.details)}
                    </pre>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default SystemLogsSettings;
