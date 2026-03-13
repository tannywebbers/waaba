import { Phone, Edit2, Trash2, CreditCard, Banknote, Smartphone, Calendar, X } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { ContactAvatar } from '@/components/shared/ContactAvatar';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatLastSeen } from '@/lib/utils/format';
import { isContactOnline } from '@/lib/utils/presence';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';

export function ContactPanel() {
  const { activeChat, setShowContactPanel, deleteContact, setEditContactId } = useAppStore();
  const { user } = useAuth();
  const { toast } = useToast();

  if (!activeChat) return null;

  const { contact } = activeChat;

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${contact.name}?`)) return;
    
    try {
      const { error } = await supabase.from('contacts').delete().eq('id', contact.id);
      if (error) throw error;
      deleteContact(contact.id);
      setShowContactPanel(false);
      toast({ title: 'Contact deleted', description: `${contact.name} has been removed.` });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <div className="w-full md:w-80 h-full bg-panel flex flex-col md:border-l md:border-panel-border overflow-hidden">
      {/* Close button header */}
      <div className="flex items-center justify-between px-4 py-3 bg-panel-header border-b border-panel-border shrink-0">
        <h3 className="font-semibold text-[17px]">Contact Info</h3>
        <Button variant="ghost" size="icon" onClick={() => setShowContactPanel(false)} className="h-9 w-9">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Profile */}
        <div className="flex flex-col items-center py-8 px-4 bg-panel-header/50">
          <ContactAvatar name={contact.name} avatar={contact.avatar} isOnline={contact.isOnline} lastSeen={contact.lastSeen} size="lg" />
          <h2 className="mt-4 text-xl font-medium">{contact.name}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isContactOnline(contact.lastSeen) ? 'Online' : contact.lastSeen ? formatLastSeen(contact.lastSeen) : 'Offline'}
          </p>
        </div>

        <Separator />

        {/* CRM Details */}
        <div className="p-4 space-y-4">
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Loan Details</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <CreditCard className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Loan ID</p>
                  <p className="font-medium">{contact.loanId}</p>
                </div>
              </div>
              
              {contact.amount && (
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-lotus-green/10 flex items-center justify-center">
                    <Banknote className="h-4 w-4 text-lotus-green" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="font-medium">{formatCurrency(contact.amount)}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center">
                  <Smartphone className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">App Type</p>
                  <p className="font-medium capitalize">{contact.appType || 'Tloan'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center">
                  <Calendar className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Day Type</p>
                  <p className="font-medium">{contact.dayType ?? 0} Day</p>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Contact Information</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center">
                  <Phone className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="font-medium">{contact.phone}</p>
                </div>
              </div>
            </div>
          </div>

          {contact.accountDetails && contact.accountDetails.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Bank Accounts</h4>
                <div className="space-y-3">
                  {contact.accountDetails.map((account, index) => (
                    <div key={account.id || index} className="p-3 rounded-lg bg-muted/50">
                      <p className="font-medium text-sm">{account.bank}</p>
                      <p className="text-xs text-muted-foreground mt-1">{account.accountNumber}</p>
                      <p className="text-xs text-muted-foreground">{account.accountName}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-panel-border space-y-2 shrink-0">
        <Button 
          variant="outline" 
          className="w-full justify-start gap-2"
          onClick={() => { setEditContactId(contact.id); }}
        >
          <Edit2 className="h-4 w-4" />
          Edit Contact
        </Button>
        <Button 
          variant="outline" 
          className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleDelete}
        >
          <Trash2 className="h-4 w-4" />
          Delete Contact
        </Button>
      </div>
    </div>
  );
}
