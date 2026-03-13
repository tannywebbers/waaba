import { useState } from 'react';
import { useSharedInbox } from '@/hooks/useSharedInbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Users, Trash2 } from 'lucide-react';

export function SharedInboxSettings() {
  const { user } = useAuth();
  const { sharedUsers, isSuperUser, loading, refresh } = useSharedInbox();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAddUser = async () => {
    if (!email.trim() || !user) return;
    setAdding(true);
    try {
      // Look up user by email in profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('email', email.trim())
        .maybeSingle();

      if (!profile) {
        toast({ title: 'User not found', description: 'No account found with that email.', variant: 'destructive' });
        return;
      }

      await supabase.from('shared_inbox_users' as any).insert({
        super_user_id: user.id,
        shared_user_id: profile.user_id,
        status: 'active',
        balance: 0,
      });

      toast({ title: 'User added', description: `${email} has been added to your shared inbox.` });
      setEmail('');
      await refresh();
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to add user.', variant: 'destructive' });
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveUser = async (id: string) => {
    await supabase.from('shared_inbox_users' as any).delete().eq('id', id);
    await refresh();
    toast({ title: 'User removed' });
  };

  if (loading) return <div className="text-muted-foreground text-sm">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Shared Inbox</h3>
        <p className="text-sm text-muted-foreground">Share your inbox with other users so they can send and receive messages on your behalf.</p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Enter user email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddUser()}
        />
        <Button onClick={handleAddUser} disabled={adding || !email.trim()}>
          Add
        </Button>
      </div>

      {sharedUsers.length > 0 ? (
        <div className="space-y-2">
          {sharedUsers.map((u) => (
            <div key={u.id} className="flex items-center justify-between p-3 bg-card rounded-lg border">
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email} · {u.status}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleRemoveUser(u.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No shared users yet.</p>
      )}
    </div>
  );
}
