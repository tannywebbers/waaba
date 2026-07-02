// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAppStore } from '@/stores/appStore';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { normalizePhoneNumber } from '@/lib/utils/phone';
import { useApps } from '@/hooks/useApps';

interface AccountDetail {
  id?: string;
  bank: string;
  accountNumber: string;
  accountName: string;
}

interface EditContactModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
}

export function EditContactModal({ open, onOpenChange, contactId }: EditContactModalProps) {
  const { contacts, updateContact } = useAppStore();
  const { apps: userApps } = useApps();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const contact = contacts.find(c => c.id === contactId);
  
  // Use refs so closing/switching tabs doesn't reset the form
  const [formData, setFormData] = useState({
    loanId: '',
    name: '',
    phone: '',
    amount: '',
    appType: 'tloan',
    appTypeCustom: '',
    dayType: '0',
  });
  const [accountDetails, setAccountDetails] = useState<AccountDetail[]>([]);
  const initializedRef = useRef(false);

  // Only initialize once when modal opens (not on every re-render)
  useEffect(() => {
    if (contact && open && !initializedRef.current) {
      initializedRef.current = true;
      const knownAppTypes = [...userApps.map(a => a.name.toLowerCase()), 'others'];
      const currentAppType = (contact.appType || '').toLowerCase();
      const appTypeIsKnown = knownAppTypes.includes(currentAppType);

      setFormData({
        loanId: contact.loanId || '',
        name: contact.name || '',
        phone: contact.phone || '',
        amount: contact.amount?.toString() || '',
        appType: appTypeIsKnown ? currentAppType : 'others',
        appTypeCustom: appTypeIsKnown ? '' : (contact.appType || ''),
        dayType: contact.dayType?.toString() || '0',
      });
      setAccountDetails(contact.accountDetails?.map(ad => ({
        id: ad.id,
        bank: ad.bank || '',
        accountNumber: ad.accountNumber || '',
        accountName: ad.accountName || '',
      })) || []);
    }

    if (!open) {
      initializedRef.current = false;
    }
  }, [contact, open]);

  const handleSave = async () => {
    if (!contact) return;
    setLoading(true);

    const resolvedAppType = formData.appType === 'others' ? (formData.appTypeCustom.trim() || 'others') : formData.appType;

    try {
      const parsedDayType = parseInt(formData.dayType);
      const normalizedPhone = normalizePhoneNumber(formData.phone);
      const updatePayload: Record<string, any> = {
        loan_id: formData.loanId || '',
        name: formData.name,
        phone: normalizedPhone,
        amount: formData.amount ? parseFloat(formData.amount) : null,
        app_type: resolvedAppType,
        day_type: isNaN(parsedDayType) ? 0 : parsedDayType,
      };

      const { error: contactError } = await supabase
        .from('contacts')
        .update(updatePayload)
        .eq('id', contactId);

      if (contactError) throw contactError;

      await supabase.from('account_details').delete().eq('contact_id', contactId);

      if (accountDetails.length > 0) {
        const { error: accountError } = await supabase
          .from('account_details')
          .insert(
            accountDetails
              .filter(ad => ad.bank.trim() || ad.accountNumber.trim())
              .map(ad => ({
                contact_id: contactId,
                bank: ad.bank,
                account_number: ad.accountNumber,
                account_name: ad.accountName,
              }))
          );
        if (accountError) throw accountError;
      }

      updateContact(contactId, {
        loanId: formData.loanId || '',
        name: formData.name,
        phone: normalizedPhone,
        amount: formData.amount ? parseFloat(formData.amount) : undefined,
        appType: resolvedAppType,
        dayType: parseInt(formData.dayType),
        accountDetails: accountDetails.map((ad, idx) => ({
          id: ad.id || `temp-${idx}`,
          bank: ad.bank,
          accountNumber: ad.accountNumber,
          accountName: ad.accountName,
        })),
      });

      toast({ title: 'Contact updated successfully' });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating contact:', error);
      toast({ title: 'Error updating contact', description: error?.message || 'Please check all fields and try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const addAccountDetail = () => {
    setAccountDetails([...accountDetails, { bank: '', accountNumber: '', accountName: '' }]);
  };

  const removeAccountDetail = (index: number) => {
    setAccountDetails(accountDetails.filter((_, i) => i !== index));
  };

  const updateAccountDetail = (index: number, field: keyof AccountDetail, value: string) => {
    setAccountDetails(accountDetails.map((ad, i) => i === index ? { ...ad, [field]: value } : ad));
  };

  if (!contact) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Contact</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Loan ID</Label>
            <Input value={formData.loanId} onChange={(e) => setFormData({ ...formData, loanId: e.target.value })} placeholder="Optional" />
          </div>

          <div className="space-y-2">
            <Label>Customer Name</Label>
            <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Enter customer name" />
          </div>

          <div className="space-y-2">
            <Label>Phone Number</Label>
            <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="Enter phone number" />
          </div>

          <div className="space-y-2">
            <Label>Amount</Label>
            <Input type="number" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} placeholder="Enter amount" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>App Type</Label>
              <select
                value={formData.appType}
                onChange={(e) => setFormData({ ...formData, appType: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {userApps.map((a) => (
                  <option key={a.id} value={a.name.toLowerCase()}>{a.name}</option>
                ))}
                <option value="others">Others</option>
              </select>
              {formData.appType === 'others' && (
                <Input
                  placeholder="Enter app name"
                  value={formData.appTypeCustom}
                  onChange={(e) => setFormData({ ...formData, appTypeCustom: e.target.value })}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Day Type</Label>
              <Input
                type="number"
                value={formData.dayType}
                onChange={(e) => setFormData({ ...formData, dayType: e.target.value })}
                placeholder="0"
              />
              <p className="text-[11px] text-muted-foreground">Can be negative (e.g. -1)</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Account Details</Label>
              <Button variant="outline" size="sm" onClick={addAccountDetail}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>

            {accountDetails.map((ad, index) => (
              <div key={index} className="p-3 border rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Account {index + 1}</span>
                  <Button variant="ghost" size="icon" onClick={() => removeAccountDetail(index)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <Input
                  placeholder="Bank name"
                  value={ad.bank}
                  onChange={(e) => updateAccountDetail(index, 'bank', e.target.value)}
                />
                <Input
                  placeholder="Account number"
                  value={ad.accountNumber}
                  onChange={(e) => updateAccountDetail(index, 'accountNumber', e.target.value)}
                />
                <Input
                  placeholder="Account name"
                  value={ad.accountName}
                  onChange={(e) => updateAccountDetail(index, 'accountName', e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading} className="flex-1">
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
