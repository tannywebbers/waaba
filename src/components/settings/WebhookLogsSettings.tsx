// @ts-nocheck
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import {
  Activity, ArrowDownLeft, ArrowUpRight, Loader2, Trash2, Search,
  RefreshCw, Wifi, AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';

interface WebhookLog {
  id: string;
  event_type: string;
  direction: string;
  phone_number?: string;
  message_type?: string;
  status?: string;
  payload?: any;
  error?: string;
  created_at: string;
}

function EventBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    message_received: 'bg-primary/20 text-primary',
    message_sent: 'bg-accent text-accent-foreground',
    status_update: 'bg-muted text-muted-foreground',
    webhook_verified: 'bg-[hsl(145,63%,49%)]/20 text-[hsl(145,63%,49%)]',
    error: 'bg-destructive/20 text-destructive',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${colors[type] || 'bg-muted text-muted-foreground'}`}>
      {type.replace(/_/g, ' ')}
    </span>
  );
}

export function WebhookLogsSettings() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null);
  const [isLive, setIsLive] = useState(true);

  useEffect(() => {
    if (user) loadLogs();
  }, [user]);

  // Real-time subscription for new logs
  useEffect(() => {
    if (!user || !isLive) return;

    const channel = supabase
      .channel('webhook-logs-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'webhook_logs',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const newLog = payload.new as WebhookLog;
        setLogs(prev => {
          // Prevent duplicates
          if (prev.find(l => l.id === newLog.id)) return prev;
          return [newLog, ...prev].slice(0, 200);
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, isLive]);

  // Polling fallback every 10s for resilience
  useEffect(() => {
    if (!user || !isLive) return;
    const interval = setInterval(() => {
      loadLogs(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [user, isLive]);

  const loadLogs = async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    const { data, error } = await supabase
      .from('webhook_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (!error && data) {
      setLogs(prev => {
        if (silent && prev.length > 0) {
          // Merge: keep new items that aren't already in the list
          const existingIds = new Set(prev.map(l => l.id));
          const newItems = data.filter(d => !existingIds.has(d.id));
          if (newItems.length === 0) return prev;
          return [...newItems, ...prev].slice(0, 200);
        }
        return data;
      });
    }
    if (!silent) setLoading(false);
  };

  const clearLogs = async () => {
    if (!user) return;
    await supabase.from('webhook_logs').delete().eq('user_id', user.id);
    setLogs([]);
  };

  const filtered = logs.filter(l =>
    l.event_type.includes(search.toLowerCase()) ||
    l.phone_number?.includes(search) ||
    l.message_type?.includes(search.toLowerCase()) ||
    l.status?.includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-foreground">Webhook Logs</h3>
          <span className="text-xs text-muted-foreground">{logs.length} events</span>
          <button
            onClick={() => setIsLive(!isLive)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              isLive ? 'bg-primary/20 text-primary animate-pulse' : 'bg-muted text-muted-foreground'
            }`}
          >
            <Wifi className="h-3 w-3" />
            {isLive ? 'LIVE' : 'Paused'}
          </button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => loadLogs()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={clearLogs} className="text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter logs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 bg-muted/50 border-0 h-9"
        />
      </div>

      {/* Logs list */}
      <div className="border rounded-lg overflow-hidden max-h-[500px] overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No webhook events yet</p>
            <p className="text-xs text-muted-foreground mt-1">Events will appear here in real-time</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(log => (
              <button
                key={log.id}
                onClick={() => setSelectedLog(log)}
                className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors text-left"
              >
                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                  log.error ? 'bg-destructive/20 text-destructive' :
                  log.direction === 'incoming' ? 'bg-primary/20 text-primary' : 'bg-accent text-accent-foreground'
                }`}>
                  {log.error ? <AlertCircle className="h-4 w-4" /> :
                   log.direction === 'incoming' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <EventBadge type={log.event_type} />
                    {log.message_type && (
                      <span className="text-[10px] text-muted-foreground">{log.message_type}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {log.phone_number && (
                      <span className="text-xs text-muted-foreground">{log.phone_number}</span>
                    )}
                    {log.status && (
                      <Badge variant="outline" className="h-4 text-[10px] px-1">{log.status}</Badge>
                    )}
                    {log.error && (
                      <span className="text-xs text-destructive truncate">{log.error}</span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {format(new Date(log.created_at), 'HH:mm:ss')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" /> Event Details
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Type:</span> <EventBadge type={selectedLog.event_type} /></div>
                <div><span className="text-muted-foreground">Direction:</span> {selectedLog.direction}</div>
                {selectedLog.phone_number && <div><span className="text-muted-foreground">Phone:</span> {selectedLog.phone_number}</div>}
                {selectedLog.message_type && <div><span className="text-muted-foreground">Msg Type:</span> {selectedLog.message_type}</div>}
                {selectedLog.status && <div><span className="text-muted-foreground">Status:</span> {selectedLog.status}</div>}
                <div className="col-span-2"><span className="text-muted-foreground">Time:</span> {format(new Date(selectedLog.created_at), 'yyyy-MM-dd HH:mm:ss')}</div>
              </div>
              {selectedLog.error && (
                <div className="p-2 rounded-md bg-destructive/10 text-destructive text-sm">{selectedLog.error}</div>
              )}
              {selectedLog.payload && (
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Payload</p>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-[300px] text-muted-foreground">
                    {JSON.stringify(selectedLog.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
