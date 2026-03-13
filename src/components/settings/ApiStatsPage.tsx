import { useState, useEffect } from 'react';
import { BarChart3, Send, CheckCheck, Eye, AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface Stats {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

export function ApiStatsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({ total: 0, sent: 0, delivered: 0, read: 0, failed: 0 });

  useEffect(() => {
    if (user) loadStats();
  }, [user]);

  const loadStats = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('status, is_outgoing')
        .eq('user_id', user.id)
        .eq('is_outgoing', true);

      if (error) throw error;

      const msgs = data || [];
      setStats({
        total: msgs.length,
        sent: msgs.filter(m => m.status === 'sent').length,
        delivered: msgs.filter(m => m.status === 'delivered').length,
        read: msgs.filter(m => m.status === 'read').length,
        failed: msgs.filter(m => m.status === 'failed').length,
      });
    } catch (e) {
      console.error('Error loading stats:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const statCards = [
    { label: 'Total Sent', value: stats.total, icon: Send, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Sent', value: stats.sent, icon: Send, color: 'text-[hsl(199,89%,48%)]', bg: 'bg-[hsl(199,89%,48%)]/10' },
    { label: 'Delivered', value: stats.delivered, icon: CheckCheck, color: 'text-[hsl(145,63%,49%)]', bg: 'bg-[hsl(145,63%,49%)]/10' },
    { label: 'Read', value: stats.read, icon: Eye, color: 'text-[hsl(199,89%,48%)]', bg: 'bg-[hsl(199,89%,48%)]/10' },
    { label: 'Failed', value: stats.failed, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl ${bg} flex items-center justify-center`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <div>
                  <p className="text-[24px] font-bold leading-none">{value}</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[17px]">
            <BarChart3 className="h-5 w-5 text-primary" />
            Delivery Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.total > 0 ? (
            <div className="space-y-3">
              <StatBar label="Delivered" value={stats.delivered} total={stats.total} color="bg-[hsl(145,63%,49%)]" />
              <StatBar label="Read" value={stats.read} total={stats.total} color="bg-[hsl(199,89%,48%)]" />
              <StatBar label="Failed" value={stats.failed} total={stats.total} color="bg-destructive" />
            </div>
          ) : (
            <p className="text-[14px] text-muted-foreground text-center py-4">
              No messages sent yet. Stats will appear once you start messaging.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{pct}% ({value})</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}