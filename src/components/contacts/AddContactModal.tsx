import { useState } from 'react';
import { X, User, Phone, CreditCard, Banknote, Users, Plus, Calendar, Smartphone, Trash2 } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';
import { useSharedInbox } from '@/hooks/useSharedInbox';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface AccountDetail {
  bank: string;
  accountNumber: string;
  accountName: string;
}

function autoFormatPhone(phone: string): string {
  const cleaned = phone.replace(/\s+/g, '');
  if (/^0[789]\d{9}$/.test(cleaned)) return '+234' + cleaned.substring(1);
  if (cleaned.startsWith('+')) return cleaned;
  return cleaned;
}

const APP_TYPE_OPTIONS = ['tloan', 'quickash', 'others'];

export function AddContactModal() {
  const { showAddContactModal, setShowAddContactModal, addContact, addContacts } = useAppStore();
  const { user } = useAuth();
  const { isSharedUser, superUserId } = useSharedInbox();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [singleForm, setSingleForm] = useState({
    loanId: '',
    name: '',
    phone: '',
    amount: '',
    appType: 'tloan',
    appTypeCustom: '',
    dayType: '0',
  });
  const [accountDetails, setAccountDetails] = useState<AccountDetail[]>([]);
  
  const [bulkForm, setBulkForm] = useState({
    contactIds: '',
    customerNames: '',
    phoneNumbers: '',
    appType: 'tloan',
    dayType: '0',
  });

  const resetForms = () => {
    setSingleForm({ loanId: '', name: '', phone: '', amount: '', appType: 'tloan', appTypeCustom: '', dayType: '0' });
    setAccountDetails([]);
    setBulkForm({ contactIds: '', customerNames: '', phoneNumbers: '', appType: 'tloan', dayType: '0' });
  };

  const handleClose = () => {
    setShowAddContactModal(false);
    resetForms();
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

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleForm.loanId || !singleForm.name || !singleForm.phone) {
      toast({ title: 'Missing required fields', description: 'Please fill in Loan ID, Name, and Phone number.', variant: 'destructive' });
      return;
    }
    if (!user) return;

    const resolvedAppType = singleForm.appType === 'others' ? (singleForm.appTypeCustom.trim() || 'others') : singleForm.appType;
    const formattedPhone = autoFormatPhone(singleForm.phone);
    setLoading(true);
    try {
      // Shared users create contacts under their own user_id
      const contactOwnerId = user.id;
      const assignedUserId = isSharedUser ? user.id : null;

      const { data: contactData, error: contactError } = await supabase
        .from('contacts')
        .insert({
          user_id: contactOwnerId,
          assigned_user_id: assignedUserId,
          loan_id: singleForm.loanId,
          name: singleForm.name,
          phone: formattedPhone,
          amount: singleForm.amount ? parseFloat(singleForm.amount) : null,
          app_type: resolvedAppType,
          day_type: isNaN(parseInt(singleForm.dayType)) ? 0 : parseInt(singleForm.dayType),
        })
        .select()
        .single();

      if (contactError) throw contactError;

      const validAccounts = accountDetails.filter(ad => ad.bank.trim() && ad.accountNumber.trim());
      if (validAccounts.length > 0) {
        const { error: accountError } = await supabase
          .from('account_details')
          .insert(validAccounts.map(ad => ({
            contact_id: contactData.id,
            bank: ad.bank.trim(),
            account_number: ad.accountNumber.trim(),
            account_name: ad.accountName.trim(),
          })));
        if (accountError) console.error('Error saving account details:', accountError);
      }

      addContact({
        id: contactData.id,
        loanId: contactData.loan_id,
        name: contactData.name,
        phone: contactData.phone,
        amount: contactData.amount ? Number(contactData.amount) : undefined,
        appType: contactData.app_type || 'tloan',
        dayType: contactData.day_type ?? 0,
        createdAt: new Date(contactData.created_at),
        updatedAt: new Date(contactData.updated_at),
        accountDetails: validAccounts.map((ad, idx) => ({
          id: `new-${idx}`,
          bank: ad.bank,
          accountNumber: ad.accountNumber,
          accountName: ad.accountName,
        })),
      });

      toast({ title: 'Contact added', description: `${contactData.name} has been added successfully.` });
      handleClose();
    } catch (error: any) {
      const msg = error?.message || 'Unknown error';
      const isDbError = msg.includes('duplicate') || msg.includes('unique');
      toast({
        title: isDbError ? 'Duplicate contact' : 'Error adding contact',
        description: isDbError ? 'A contact with this Loan ID or phone number already exists.' : msg,
        variant: 'destructive',
        duration: 6000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ids = bulkForm.contactIds.trim().split('\n').filter(Boolean);
    const names = bulkForm.customerNames.trim().split('\n').filter(Boolean);
    const phones = bulkForm.phoneNumbers.trim().split('\n').filter(Boolean);

    if (ids.length === 0 || names.length === 0 || phones.length === 0) {
      toast({ title: 'Missing data', description: 'Please fill in all three fields.', variant: 'destructive' });
      return;
    }
    if (ids.length !== names.length || names.length !== phones.length) {
      toast({ title: 'Data mismatch', description: `IDs (${ids.length}), Names (${names.length}), and Phones (${phones.length}) must have the same count.`, variant: 'destructive' });
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      const contactOwnerId = isSharedUser && superUserId ? superUserId : user.id;
      const assignedUserId = isSharedUser ? user.id : null;

      const contacts = ids.map((id, i) => ({
        user_id: contactOwnerId,
        assigned_user_id: assignedUserId,
        loan_id: id.trim(),
        name: names[i].trim(),
        phone: autoFormatPhone(phones[i].trim()),
        app_type: bulkForm.appType,
        day_type: isNaN(parseInt(bulkForm.dayType)) ? 0 : parseInt(bulkForm.dayType),
      }));

      const { data: contactsData, error } = await supabase.from('contacts').insert(contacts).select();
      if (error) throw error;

      const newContacts = (contactsData || []).map(c => ({
        id: c.id, loanId: c.loan_id, name: c.name, phone: c.phone,
        createdAt: new Date(c.created_at), updatedAt: new Date(c.updated_at),
      }));
      addContacts(newContacts);
      toast({ title: 'Contacts added', description: `${newContacts.length} contacts added.` });
      handleClose();
    } catch (error: unknown) {
      toast({ title: 'Error adding contacts', description: (error as Error).message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={showAddContactModal} onOpenChange={setShowAddContactModal}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Add Contact
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="single" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="single" className="gap-2"><User className="h-4 w-4" /> Single Contact</TabsTrigger>
            <TabsTrigger value="bulk" className="gap-2"><Users className="h-4 w-4" /> Bulk Import</TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="mt-4">
            <form onSubmit={handleSingleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="loanId" className="flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5" /> Loan ID <span className="text-destructive">*</span>
                  </Label>
                  <Input id="loanId" value={singleForm.loanId} onChange={(e) => setSingleForm({ ...singleForm, loanId: e.target.value })} placeholder="LN-001" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount" className="flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5" /> Amount</Label>
                  <Input id="amount" type="number" value={singleForm.amount} onChange={(e) => setSingleForm({ ...singleForm, amount: e.target.value })} placeholder="50000" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" /> Customer Name <span className="text-destructive">*</span>
                  </Label>
                  <Input id="name" value={singleForm.name} onChange={(e) => setSingleForm({ ...singleForm, name: e.target.value })} placeholder="John Doe" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> Phone Number <span className="text-destructive">*</span>
                  </Label>
                  <Input id="phone" value={singleForm.phone} onChange={(e) => setSingleForm({ ...singleForm, phone: e.target.value })} placeholder="08012345678" />
                  <p className="text-[11px] text-muted-foreground">Country code auto-added for Nigerian numbers</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" /> App Type</Label>
                  <select
                    value={singleForm.appType}
                    onChange={(e) => setSingleForm({ ...singleForm, appType: e.target.value })}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="tloan">Tloan</option>
                    <option value="quickash">Quickash</option>
                    <option value="others">Others</option>
                  </select>
                  {singleForm.appType === 'others' && (
                    <Input
                      placeholder="Enter app name"
                      value={singleForm.appTypeCustom}
                      onChange={(e) => setSingleForm({ ...singleForm, appTypeCustom: e.target.value })}
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Day Type</Label>
                  <Input
                    type="number"
                    value={singleForm.dayType}
                    onChange={(e) => setSingleForm({ ...singleForm, dayType: e.target.value })}
                    placeholder="0"
                  />
                  <p className="text-[11px] text-muted-foreground">Can be negative (e.g. -1, -7)</p>
                </div>
              </div>

              {/* Account Details */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Account Details</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addAccountDetail}>
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>

                {accountDetails.map((ad, index) => (
                  <div key={index} className="p-3 border rounded-lg space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Account {index + 1}</span>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeAccountDetail(index)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <Input placeholder="Bank name" value={ad.bank} onChange={(e) => updateAccountDetail(index, 'bank', e.target.value)} />
                    <Input placeholder="Account number" value={ad.accountNumber} onChange={(e) => updateAccountDetail(index, 'accountNumber', e.target.value)} />
                    <Input placeholder="Account name" value={ad.accountName} onChange={(e) => updateAccountDetail(index, 'accountName', e.target.value)} />
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>Cancel</Button>
                <Button type="submit" disabled={loading}>{loading ? 'Adding...' : 'Add Contact'}</Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="bulk" className="mt-4">
            <form onSubmit={handleBulkSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Contact IDs (one per line)</Label>
                  <Textarea value={bulkForm.contactIds} onChange={(e) => setBulkForm({ ...bulkForm, contactIds: e.target.value })} placeholder={`ID001\nID002`} rows={8} className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Customer Names (one per line)</Label>
                  <Textarea value={bulkForm.customerNames} onChange={(e) => setBulkForm({ ...bulkForm, customerNames: e.target.value })} placeholder={`John Doe\nJane Smith`} rows={8} className="text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Phone Numbers (one per line)</Label>
                  <Textarea value={bulkForm.phoneNumbers} onChange={(e) => setBulkForm({ ...bulkForm, phoneNumbers: e.target.value })} placeholder={`08012345678\n08098765432`} rows={8} className="font-mono text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" /> App Type (all)</Label>
                  <select
                    value={bulkForm.appType}
                    onChange={(e) => setBulkForm({ ...bulkForm, appType: e.target.value })}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="tloan">Tloan</option>
                    <option value="quickash">Quickash</option>
                    <option value="others">Others</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Day Type (all)</Label>
                  <Input
                    type="number"
                    value={bulkForm.dayType}
                    onChange={(e) => setBulkForm({ ...bulkForm, dayType: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>Cancel</Button>
                <Button type="submit" disabled={loading}>{loading ? 'Adding...' : 'Add Contacts'}</Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
