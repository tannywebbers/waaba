// @ts-nocheck
import { useState } from 'react';
import { Users, Search, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useSharedInbox } from '@/hooks/useSharedInbox';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/stores/appStore';

interface AssignContactModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contactName: string;
  currentAssignedUserId?: string | null;
}

export function AssignContactModal({ open, onOpenChange, contactId, contactName, currentAssignedUserId }: AssignContactModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { sharedUsers } = useSharedInbox();
  const { chats, setChats, setMessages } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(null);
  const [showUnassignConfirm, setShowUnassignConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const filtered = sharedUsers
    .filter(u => u.status === 'active')
    .filter(u =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const handleAssign = async (sharedUserId: string) => {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc('assign_conversation', {
        _contact_id: contactId,
        _super_user_id: user.id,
        _shared_user_id: sharedUserId,
      });
      if (error) throw error;

      // Remove from super user's local chat list since they no longer own it
      const updatedChats = chats.filter(c => c.id !== contactId);
      setChats(updatedChats);
      setMessages(contactId, []);

      // Clear localStorage cache so stale data doesn't resurrect the contact
      try { localStorage.removeItem('waba-crm-cache'); } catch {};

      // Clear active chat if it's this one
      const store = useAppStore.getState();
      if (store.activeChat?.id === contactId) {
        useAppStore.setState({ activeChat: null, showContactPanel: false });
      }

      toast({ title: '✅ Conversation assigned & transferred' });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Failed to assign', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
      setConfirmTarget(null);
    }
  };

  const handleUnassign = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc('unassign_conversation', {
        _contact_id: contactId,
        _super_user_id: user.id,
      });
      if (error) throw error;

      // Refresh chats to pick up the returned contact
      toast({ title: '✅ Conversation returned to your inbox' });
      onOpenChange(false);
      // Reload the page to refresh chat list with the returned contact
      window.location.reload();
    } catch (err: any) {
      toast({ title: 'Failed to unassign', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
      setShowUnassignConfirm(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Assign "{contactName}"
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search shared users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {currentAssignedUserId && (
              <Button variant="outline" className="w-full justify-start text-destructive" onClick={() => setShowUnassignConfirm(true)}>
                <UserMinus className="h-4 w-4 mr-2" /> Unassign (return to me)
              </Button>
            )}

            <div className="max-h-[300px] overflow-y-auto space-y-1">
              {filtered.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No shared users found</p>
                  <p className="text-xs">Add users in Settings → Shared Inbox</p>
                </div>
              ) : (
                filtered.map((su) => (
                  <button
                    key={su.id}
                    disabled={loading}
                    onClick={() => setConfirmTarget({ id: su.sharedUserId, name: su.name })}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors text-left ${
                      currentAssignedUserId === su.sharedUserId ? 'bg-primary/10 border border-primary/20' : ''
                    }`}
                  >
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-semibold text-primary">
                        {su.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{su.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{su.email}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0">{su.balance} credits</Badge>
                    {currentAssignedUserId === su.sharedUserId && (
                      <Badge className="shrink-0">Assigned</Badge>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Confirmation */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(v) => { if (!v) setConfirmTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assign conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will transfer the conversation with <strong>"{contactName}"</strong> to <strong>{confirmTarget?.name}</strong>. 
              All messages, contact details, and conversation data will move to their inbox. 
              You will no longer have access to this conversation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={loading}
              onClick={() => confirmTarget && handleAssign(confirmTarget.id)}
            >
              {loading ? 'Transferring...' : 'Assign & Transfer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unassign Confirmation */}
      <AlertDialog open={showUnassignConfirm} onOpenChange={setShowUnassignConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will return the conversation with <strong>"{contactName}"</strong> back to your inbox. 
              The shared user will lose access to this conversation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={loading} onClick={handleUnassign}>
              {loading ? 'Returning...' : 'Return to my inbox'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
