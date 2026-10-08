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
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { normalizePhoneNumber } from '@/lib/utils/phone';
import { saveContactRow, saveContactList } from '@/lib/contactsDb';
import { ContactExtras } from '@/components/contacts/ContactExtras';
import { useApps } from '@/hooks/useApps';
import { ensureAppRegistered } from '@/lib/registerApp';
import { useDialogBackButton } from '@/hooks/useDialogBackButton';
interface ContactListItemForm {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
  role?: string;
  notes?: string;
  bankName?: string;
  accountNumber?: string;
  recipientName?: string;
  isPrimary?: boolean;
}
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
  const { apps: userApps, reload: reloadApps } = useApps();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const contact = contacts.find(c => c.id === contactId);
  
  // Use refs so closing/switching tabs doesn't reset the form
  const [formData, setFormData] = useState({
    loanId: '',
    name: '',
    phone: '',
    amount: '',
    appType: '',
    appTypeCustom: '',
    dayType: '0',
    bvn: '',
    imageUrl: '',
    imageAlt: '',
  });
  const [accountDetails, setAccountDetails] = useState<AccountDetail[]>([]);
  const [contactList, setContactList] = useState<ContactListItemForm[]>([]);
  const initializedRef = useRef(false);

  // Only initialize once when modal opens (not on every re-render)
  useEffect(() => {
    if (contact && open && !initializedRef.current) {
      initializedRef.current = true;
      const currentAppType = (contact.appType || '').trim();
      const isKnownApp = userApps.some((a) => a.name.toLowerCase() === currentAppType.toLowerCase());

      setFormData({
        loanId: contact.loanId || '',
        name: contact.name || '',
        phone: contact.phone || '',
        amount: contact.amount?.toString() || '',
        appType: currentAppType && isKnownApp ? currentAppType.toLowerCase() : currentAppType,
        appTypeCustom: '',
        dayType: contact.dayType?.toString() || '0',
        bvn: contact.bvn || '',
        imageUrl: (contact as any).imageUrl || (contact as any).image_url || (contact as any).avatarUrl || (contact as any).avatar_url || '',
        imageAlt: (contact as any).imageAlt || (contact as any).image_alt || '',
      });
      setAccountDetails(contact.accountDetails?.map(ad => ({
        id: ad.id,
        bank: ad.bank || '',
        accountNumber: ad.accountNumber || '',
        accountName: ad.accountName || '',
      })) || []);
      setContactList(((contact as any).contacts || (contact as any).contactList || []).map((cc: any) => ({
        id: cc.id,
        name: cc.name || '',
        phone: cc.phone || '',
        email: cc.email || '',
        role: cc.role || '',
        notes: cc.notes || '',
        bankName: cc.bankName || cc.bank_name || '',
        accountNumber: cc.accountNumber || cc.account_number || '',
        recipientName: cc.recipientName || cc.recipient_name || '',
        isPrimary: cc.isPrimary || cc.is_primary || false,
      })));
    }

    if (!open) {
      initializedRef.current = false;
    }
  }, [contact, open, userApps]);

  const handleSave = async () => {
    if (!contact) return;
    if (!user) return;
    setLoading(true);

    try {
      // Empty appType is a valid value; only register/resolve when an app is chosen
      const chosenApp = formData.appType?.trim();
      const resolvedAppType = chosenApp ? (await ensureAppRegistered(user.id, chosenApp) || chosenApp) : '';
      const parsedDayType = parseInt(formData.dayType);
      const normalizedPhone = normalizePhoneNumber(formData.phone);
      const updatePayload: Record<string, any> = {
        loan_id: formData.loanId || '',
        name: formData.name,
        phone: normalizedPhone,
        amount: formData.amount ? parseFloat(formData.amount) : null,
        app_type: resolvedAppType,
        day_type: isNaN(parsedDayType) ? 0 : parsedDayType,
        bvn: formData.bvn?.trim() || null,
        avatar_url: formData.imageUrl?.trim() || null,
        image_url: formData.imageUrl?.trim() || null,
      };

      const saved = await saveContactRow(updatePayload, contactId);

      if (saved.error) throw saved.error;

      reloadApps();

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
      let listMissing = false;
      if (contactList.length > 0 && user) {
        const listResult = await saveContactList(contactId, user.id,
          contactList.map(cc => ({
            customer_id: contactId,
            user_id: user.id,
            name: cc.name || '',
            phone: cc.phone || '',
            email: cc.email || '',
            role: cc.role || '',
            notes: cc.notes || '',
            bank_name: cc.bankName || '',
            account_number: cc.accountNumber || '',
            recipient_name: cc.recipientName || '',
            is_primary: cc.isPrimary || false,
          }))
        );
        if (listResult.error) throw listResult.error;
        listMissing = listResult.missingTable;
      }
      updateContact(contactId, {
        loanId: formData.loanId || '',
        name: formData.name,
        phone: normalizedPhone,
        amount: formData.amount ? parseFloat(formData.amount) : undefined,
        appType: resolvedAppType,
        dayType: parseInt(formData.dayType),
        bvn: formData.bvn || '',
        imageUrl: formData.imageUrl || '',
        contacts: contactList,
        accountDetails: accountDetails.map((ad, idx) => ({
          id: ad.id || `temp-${idx}`,
          bank: ad.bank,
          accountNumber: ad.accountNumber,
          accountName: ad.accountName,
        })),
      });

      const warnings: string[] = [];
      if (saved.dropped.indexOf('bvn') !== -1) warnings.push('BVN was not saved: run the DB migration.');
      if (listMissing) warnings.push('Contact list was not saved: run the DB migration to create customer_contacts.');
      toast({
        title: 'Contact updated successfully',
        ...(warnings.length ? { description: warnings.join(' '), variant: 'destructive' as const } : {}),
      });
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
  const addContactItem = () => {
    setContactList([...contactList, { name: '', phone: '', email: '', role: '', notes: '', bankName: '', accountNumber: '', recipientName: '', isPrimary: false }]);
  };
  const removeContactItem = (index: number) => {
    setContactList(contactList.filter((_, i) => i !== index));
  };
  const updateContactItem = (index: number, field: keyof ContactListItemForm, value: string | boolean) => {
    setContactList(contactList.map((cc, i) => i === index ? { ...cc, [field]: value } : cc));
  };

  if (!contact) return null;

  // Keep the contact's own app selectable even if it isn't (or no longer is) in Apps,
  // so saving never silently replaces a custom app with a default one.
  const contactAppType = (contact.appType || '').trim();
  const appTypeChoices = userApps.map((a) => ({ value: a.name.toLowerCase(), label: a.name }));
  if (contactAppType && !appTypeChoices.some((o) => o.value.toLowerCase() === contactAppType.toLowerCase())) {
    appTypeChoices.push({ value: contactAppType, label: contactAppType });
  }

  useDialogBackButton(open, () => onOpenChange(false));

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>App Type</Label>
              {userApps.length === 0 ? (
                <div className="rounded-md border border-dashed border-input p-3 text-xs text-muted-foreground">
                  No Apps Found. Go to <span className="font-medium text-foreground">Settings → Apps</span> to create your first App.
                </div>
              ) : (
                <select
                  value={formData.appType}
                  onChange={(e) => setFormData({ ...formData, appType: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">None (no app)</option>
                  {appTypeChoices.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
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

          <ContactExtras
            userId={user?.id}
            imageUrl={formData.imageUrl}
            onImageUrlChange={(url) => setFormData({ ...formData, imageUrl: url })}
            bvn={formData.bvn}
            onBvnChange={(value) => setFormData({ ...formData, bvn: value })}
            items={contactList}
            onItemsChange={(next) => setContactList(next)}
          />

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










