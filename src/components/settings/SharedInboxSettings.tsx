import { useState } from 'react';
import { Users, Search, Plus, Ban, Trash2, RotateCcw, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useSharedInbox } from '@/hooks/useSharedInbox';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

export function SharedInboxSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isSuperUser, isSharedUser, sharedUsers, superUserName, balance, refresh } = useSharedInbox();

  const [searchEmail, setSearchEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<{ user_id: string; name: string; email: string } | null>(null);

  const [showCreditsDialog, setShowCreditsDialog] = useState(false);
  const [creditsUserId, setCreditsUserId] = useState('');
  const [creditsAmount, setCreditsAmount] = useState('10');

  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [removeUserId, setRemoveUserId] = useState('');
  const [removeUserName, setRemoveUserName] = useState('');

  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  const handleSearchUser = async () => {
    if (!searchEmail.trim() || !user) return;
    setSearching(true);
    setFoundUser(null);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, name, email')
        .ilike('email', searchEmail.trim())
        .limit(1);
      if (error) throw error;

      const result = data?.[0];
      if (!result) {
        toast({ title: 'User not found', description: 'No account found with that email.', variant: 'destructive' });
        return;
      }
      if (result.user_id === user.id) {
        toast({ title: 'Cannot add yourself', variant: 'destructive' });
        return;
      }
      if (sharedUsers.some(u => u.sharedUserId === result.user_id)) {
        toast({ title: 'User already in shared inbox', variant: 'destructive' });
        return;
      }
      setFoundUser({ user_id: result.user_id, name: result.name || 'Unknown', email: result.email || '' });
    } catch (err: any) {
      toast({ title: 'Search failed', description: err.message, variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  const handleAddUser = async () => {
    if (!foundUser || !user) return;
    try {
      const { error } = await supabase.from('shared_inbox_users' as any).insert({
        super_user_id: user.id,
        shared_user_id: foundUser.user_id,
        balance: 0,
        status: 'active',
      } as any);
      if (error) throw error;

      const { error: copyErr } = await supabase.rpc('copy_super_user_credentials' as any, {
        _super_user_id: user.id,
        _shared_user_id: foundUser.user_id,
      });
      if (copyErr) console.error('Failed to copy credentials:', copyErr);

      toast({ title: '✅ User added to shared inbox' });
      setFoundUser(null);
      setSearchEmail('');
      refresh();
    } catch (err: any) {
      toast({ title: 'Failed to add user', description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleStatus = async (sharedUserId: string, currentStatus: string) => {
    if (!user) return;
    const newStatus = currentStatus === 'active' ? 'revoked' : 'active';
    try {
      const { error } = await supabase
        .from('shared_inbox_users' as any)
        .update({ status: newStatus } as any)
        .eq('super_user_id', user.id)
        .eq('shared_user_id', sharedUserId);
      if (error) throw error;

      if (newStatus === 'revoked') {
        await (supabase.from('contacts') as any)
          .update({ assigned_user_id: null })
          .eq('user_id', user.id)
          .eq('assigned_user_id', sharedUserId);
        await supabase.rpc('remove_shared_credentials' as any, { _shared_user_id: sharedUserId });
      } else {
        await supabase.rpc('copy_super_user_credentials' as any, {
          _super_user_id: user.id,
          _shared_user_id: sharedUserId,
        });
      }

      toast({ title: newStatus === 'active' ? '✅ Access restored' : '⛔ Access revoked' });
      refresh();
    } catch (err: any) {
      toast({ title: 'Failed to update status', description: err.message, variant: 'destructive' });
    }
  };

  const handleRemoveUser = async () => {
    if (!user || !removeUserId) return;
    try {
      await (supabase.from('contacts') as any)
        .update({ assigned_user_id: null })
        .eq('user_id', user.id)
        .eq('assigned_user_id', removeUserId);

      await supabase.rpc('remove_shared_credentials' as any, { _shared_user_id: removeUserId });

      const { error } = await supabase
        .from('shared_inbox_users' as any)
        .delete()
        .eq('super_user_id', user.id)
        .eq('shared_user_id', removeUserId);
      if (error) throw error;

      toast({ title: '✅ User removed from shared inbox' });
      setShowRemoveDialog(false);
      refresh();
    } catch (err: any) {
      toast({ title: 'Failed to remove user', description: err.message, variant: 'destructive' });
    }
  };

  const handleAddCredits = async () => {
    if (!user || !creditsUserId) return;
    const amount = parseInt(creditsAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }
    try {
      const current = sharedUsers.find(u => u.sharedUserId === creditsUserId);
      const newBalance = (current?.balance || 0) + amount;

      const { error } = await supabase
        .from('shared_inbox_users' as any)
        .update({ balance: newBalance } as any)
        .eq('super_user_id', user.id)
        .eq('shared_user_id', creditsUserId);
      if (error) throw error;

      toast({ title: `✅ Added ${amount} credits` });
      setShowCreditsDialog(false);
      refresh();
    } catch (err: any) {
      toast({ title: 'Failed to add credits', description: err.message, variant: 'destructive' });
    }
  };

  const handleLeaveSharedInbox = async () => {
    if (!user) return;
    try {
      const { data: membership } = await supabase
        .from('shared_inbox_users' as any)
        .select('super_user_id')
        .eq('shared_user_id', user.id)
        .limit(1);

      const superUserId = (membership as any[])?.[0]?.super_user_id;
      if (superUserId) {
        await (supabase.from('contacts') as any)
          .update({ assigned_user_id: null })
          .eq('user_id', superUserId)
          .eq('assigned_user_id', user.id);
      }

      await supabase.rpc('remove_shared_credentials' as any, { _shared_user_id: user.id });

      const { error } = await supabase
        .from('shared_inbox_users' as any)
        .delete()
        .eq('shared_user_id', user.id);
      if (error) throw error;

      toast({ title: '✅ Left shared inbox. You can now connect your own WhatsApp.' });
      setShowLeaveDialog(false);
      refresh();
    } catch (err: any) {
      toast({ title: 'Failed to leave', description: err.message, variant: 'destructive' });
    }
  };

  // ── Shared user view ──────────────────────────────────────────────────────
  if (isSharedUser) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Shared Inbox
            </CardTitle>
            <CardDescription>
              You are operating in {superUserName || 'a shared'} workspace
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/10">
              <div>
                <p className="text-sm font-medium">Template Credits Remaining</p>
                <p className="text-2xl font-bold text-primary">{balance}</p>
              </div>
              <Badge variant={balance > 0 ? 'default' : 'destructive'}>
                {balance > 0 ? 'Active' : 'No Credits'}
              </Badge>
            </div>
            <Button variant="destructive" className="w-full" onClick={() => setShowLeaveDialog(true)}>
              <LogOut className="h-4 w-4 mr-2" /> Leave Shared Inbox
            </Button>
          </CardContent>
        </Card>

        <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave shared inbox?</AlertDialogTitle>
              <AlertDialogDescription>
                You will lose access to all assigned conversations. You can then connect your own WhatsApp number.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleLeaveSharedInbox}
                className="bg-destructive text-destructive-foreground"
              >
                Leave
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ── Super user view ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Shared Inbox
          </CardTitle>
          <CardDescription>Share your WhatsApp inbox with other users</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Search & Add */}
          <div className="flex gap-2">
            <Input
              placeholder="Search by email..."
              value={searchEmail}
              onChange={(e) => { setSearchEmail(e.target.value); setFoundUser(null); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchUser()}
            />
            <Button onClick={handleSearchUser} disabled={searching || !searchEmail.trim()}>
              <Search className="h-4 w-4 mr-1" /> Search
            </Button>
          </div>

          {/* Found user preview */}
          {foundUser && (
            <div className="flex items-center justify-between p-3 rounded-lg border bg-accent/50">
              <div>
                <p className="font-medium">{foundUser.name}</p>
                <p className="text-sm text-muted-foreground">{foundUser.email}</p>
              </div>
              <Button size="sm" onClick={handleAddUser}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          )}

          {/* Shared users table */}
          {sharedUsers.length > 0 ? (
            <div className="rounded-lg border overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 p-3 bg-muted/50 text-sm font-medium border-b">
                <span>User</span>
                <span className="text-center">Credits</span>
                <span className="text-center">Status</span>
                <span className="text-center">Actions</span>
              </div>
              {sharedUsers.map((su) => (
                <div
                  key={su.id}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-2 p-3 items-center border-b last:border-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{su.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{su.email}</p>
                  </div>
                  <div className="text-center">
                    <Badge variant="outline">{su.balance}</Badge>
                  </div>
                  <div className="text-center">
                    <Badge variant={su.status === 'active' ? 'default' : 'destructive'}>
                      {su.status === 'active' ? 'Active' : 'Revoked'}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      title="Add Credits"
                      onClick={() => {
                        setCreditsUserId(su.sharedUserId);
                        setCreditsAmount('10');
                        setShowCreditsDialog(true);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      title={su.status === 'active' ? 'Revoke Access' : 'Restore Access'}
                      onClick={() => handleToggleStatus(su.sharedUserId, su.status)}
                    >
                      {su.status === 'active'
                        ? <Ban className="h-4 w-4" />
                        : <RotateCcw className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                      title="Remove User"
                      onClick={() => {
                        setRemoveUserId(su.sharedUserId);
                        setRemoveUserName(su.name);
                        setShowRemoveDialog(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>No shared users yet</p>
              <p className="text-sm">Search by email to add users</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Credits Dialog */}
      <Dialog open={showCreditsDialog} onOpenChange={setShowCreditsDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Template Credits</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Number of credits to add</Label>
            <Input
              type="number"
              min="1"
              value={creditsAmount}
              onChange={(e) => setCreditsAmount(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreditsDialog(false)}>Cancel</Button>
            <Button onClick={handleAddCredits}>Add Credits</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove User Dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeUserName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their assigned conversations will be returned to you. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveUser}
              className="bg-destructive text-destructive-foreground"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
