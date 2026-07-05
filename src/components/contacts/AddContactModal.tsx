// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { X, User, Phone, CreditCard, Banknote, Users, Plus, Calendar, Smartphone, Trash2, Tag } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { normalizePhoneNumber } from '@/lib/utils/phone';
import { useApps } from '@/hooks/useApps';

interface AccountDetail {
  bank: string;
  accountNumber: string;
  accountName: string;
}

function autoFormatPhone(phone: string): string {
  return normalizePhoneNumber(phone);
}



export function AddContactModal() {
  const { showAddContactModal, setShowAddContactModal, addContact, addContacts } = useAppStore();
  const { user } = useAuth();
  const { isSharedUser, superUserId } = useSharedInbox();
  const { apps: userApps } = useApps();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [singleForm, setSingleForm] = useState({
    loanId: '',
    name: '',
    phone: '',
    amount: '',
    appType: '',
    appTypeCustom: '',
    dayType: '0',
  });
  const [accountDetails, setAccountDetails] = useState<AccountDetail[]>([]);
  
  const [bulkForm, setBulkForm] = useState({
    contactIds: '',
    customerNames: '',
    phoneNumbers: '',
    appType: '',
    dayType: '0',
  });

  // Seed default appType from user's first app once loaded
  useEffect(() => {
    if (userApps.length === 0) return;
    const first = userApps[0].name.toLowerCase();
    setSingleForm((f) => f.appType ? f : { ...f, appType: first });
    setBulkForm((f) => f.appType ? f : { ...f, appType: first });
  }, [userApps]);

  // Labels
  interface LabelOption { id: string; name: string; color: string }
  const [availableLabels, setAvailableLabels] = useState<LabelOption[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [bulkSelectedLabelIds, setBulkSelectedLabelIds] = useState<string[]>([]);

  const fetchLabels = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('labels').select('*').eq('user_id', user.id);
    setAvailableLabels((data || []) as LabelOption[]);
  }, [user]);

  useEffect(() => { fetchLabels(); }, [fetchLabels]);

  const resetForms = () => {
    const first = userApps[0]?.name.toLowerCase() || '';
    setSingleForm({ loanId: '', name: '', phone: '', amount: '', appType: first, appTypeCustom: '', dayType: '0' });
    setAccountDetails([]);
    setBulkForm({ contactIds: '', customerNames: '', phoneNumbers: '', appType: first, dayType: '0' });
    setSelectedLabelIds([]);
    setBulkSelectedLabelIds([]);
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
    if (!singleForm.name || !singleForm.phone) {
      toast({ title: 'Missing required fields', description: 'Please fill in Name and Phone number.', variant: 'destructive' });
      return;
    }
    if (!user) return;

    if (userApps.length === 0) {
      toast({ title: 'No apps found', description: 'Go to Settings → Apps to create your first App.', variant: 'destructive' });
      return;
    }
    const resolvedAppType = singleForm.appType;
    const formattedPhone = autoFormatPhone(singleForm.phone);
    setLoading(true);
    try {
      // Shared users create contacts under their own user_id
      const contactOwnerId = user.id;
      const assignedUserId = isSharedUser ? user.id : null;

      const { data: existingContact } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', contactOwnerId)
        .eq('phone', formattedPhone)
        .maybeSingle();

      const contactPayload = {
        user_id: contactOwnerId,
        assigned_user_id: assignedUserId,
        loan_id: singleForm.loanId || existingContact?.loan_id || '',
        name: singleForm.name,
        phone: formattedPhone,
        amount: singleForm.amount ? parseFloat(singleForm.amount) : existingContact?.amount ?? null,
        app_type: resolvedAppType,
        day_type: isNaN(parseInt(singleForm.dayType)) ? 0 : parseInt(singleForm.dayType),
        is_deleted: false,
        deleted_at: null,
        created_at: new Date().toISOString(),
      };

      const { data: contactData, error: contactError } = existingContact
        ? await supabase.from('contacts').update(contactPayload).eq('id', existingContact.id).select().maybeSingle()
        : await supabase
        .from('contacts')
        .insert(contactPayload)
        .select()
        .maybeSingle();

      if (contactError) throw contactError;
      if (!contactData) throw new Error('Contact could not be saved.');

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

      // Assign labels
      if (selectedLabelIds.length > 0) {
        const { data: existingLabels } = await supabase.from('chat_labels').select('label_id').eq('chat_id', contactData.id).eq('user_id', user.id);
        const existingLabelIds = new Set(((existingLabels || []) as any[]).map((l) => l.label_id));
        const labelsToAdd = selectedLabelIds.filter((labelId) => !existingLabelIds.has(labelId));
        if (labelsToAdd.length > 0) await supabase.from('chat_labels').insert(
          labelsToAdd.map(labelId => ({
            chat_id: contactData.id,
            label_id: labelId,
            user_id: user.id,
          }))
        );
      }

      addContact({
        id: contactData.id,
        loanId: contactData.loan_id,
        name: contactData.name,
        phone: contactData.phone,
        amount: contactData.amount ? Number(contactData.amount) : undefined,
        appType: contactData.app_type || '',
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
    const ids = bulkForm.contactIds.trim().split(/[\n,]+/).filter(Boolean);
    const names = bulkForm.customerNames.trim().split(/[\n,]+/).filter(Boolean);
    const phones = bulkForm.phoneNumbers.trim().split(/[\n,]+/).filter(Boolean).map(autoFormatPhone);

    if (names.length === 0 || phones.length === 0) {
      toast({ title: 'Missing data', description: 'Please fill in Names and Phone Numbers.', variant: 'destructive' });
      return;
    }
    if ((ids.length > 0 && ids.length !== names.length) || names.length !== phones.length) {
      toast({ title: 'Data mismatch', description: `Loan IDs (${ids.length || 'optional'}), Names (${names.length}), and Phones (${phones.length}) must line up.`, variant: 'destructive' });
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      const contactOwnerId = isSharedUser && superUserId ? superUserId : user.id;
      const assignedUserId = isSharedUser ? user.id : null;

      const contactsData: any[] = [];
      for (let i = 0; i < ids.length; i++) {
        const { data: existingContact } = await supabase
          .from('contacts')
          .select('*')
          .eq('user_id', contactOwnerId)
          .eq('phone', phones[i])
          .maybeSingle();

        const payload = {
        user_id: contactOwnerId,
        assigned_user_id: assignedUserId,
          loan_id: ids[i]?.trim() || existingContact?.loan_id || '',
        name: names[i].trim(),
          phone: phones[i],
        app_type: bulkForm.appType,
        day_type: isNaN(parseInt(bulkForm.dayType)) ? 0 : parseInt(bulkForm.dayType),
          is_deleted: false,
          deleted_at: null,
          created_at: new Date().toISOString(),
        };

        const { data: savedContact, error } = existingContact
          ? await supabase.from('contacts').update(payload).eq('id', existingContact.id).select().maybeSingle()
          : await supabase.from('contacts').insert(payload).select().maybeSingle();
        if (error) throw error;
        if (savedContact) contactsData.push(savedContact);
      }

      const newContacts = (contactsData || []).map(c => ({
        id: c.id, loanId: c.loan_id, name: c.name, phone: c.phone,
        createdAt: new Date(c.created_at), updatedAt: new Date(c.updated_at),
      }));

      // Assign labels to all bulk contacts
      if (bulkSelectedLabelIds.length > 0 && contactsData.length > 0) {
        const { data: existingLabels } = await supabase.from('chat_labels').select('chat_id,label_id').eq('user_id', user.id).in('chat_id', contactsData.map(c => c.id) as any);
        const existingLabelKeys = new Set(((existingLabels || []) as any[]).map((l) => `${l.chat_id}:${l.label_id}`));
        const labelInserts = contactsData.flatMap(c =>
          bulkSelectedLabelIds.filter(labelId => !existingLabelKeys.has(`${c.id}:${labelId}`)).map(labelId => ({
            chat_id: c.id,
            label_id: labelId,
            user_id: user.id,
          }))
        );
        if (labelInserts.length > 0) await supabase.from('chat_labels').insert(labelInserts);
      }

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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="loanId" className="flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5" /> Loan ID
                  </Label>
                  <Input id="loanId" value={singleForm.loanId} onChange={(e) => setSingleForm({ ...singleForm, loanId: e.target.value })} placeholder="Optional" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount" className="flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5" /> Amount</Label>
                  <Input id="amount" type="number" value={singleForm.amount} onChange={(e) => setSingleForm({ ...singleForm, amount: e.target.value })} placeholder="50000" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" /> App Type</Label>
                  {userApps.length === 0 ? (
                    <div className="rounded-md border border-dashed border-input p-3 text-xs text-muted-foreground">
                      No Apps Found. Go to <span className="font-medium text-foreground">Settings → Apps</span> to create your first App.
                    </div>
                  ) : (
                    <select
                      value={singleForm.appType}
                      onChange={(e) => setSingleForm({ ...singleForm, appType: e.target.value })}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {userApps.map((a) => (
                        <option key={a.id} value={a.name.toLowerCase()}>{a.name}</option>
                      ))}
                    </select>
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

              {/* Label Selector */}
              {availableLabels.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> Labels</Label>
                  <div className="flex flex-wrap gap-2">
                    {availableLabels.map((label) => (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() => setSelectedLabelIds(prev => prev.includes(label.id) ? prev.filter(id => id !== label.id) : [...prev, label.id])}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-semibold border transition-colors",
                          selectedLabelIds.includes(label.id) ? "ring-2 ring-offset-1" : "opacity-60"
                        )}
                        style={{
                          backgroundColor: label.color + '22',
                          color: label.color,
                          borderColor: label.color + '55',
                          ...(selectedLabelIds.includes(label.id) ? { ringColor: label.color } : {}),
                        }}
                      >
                        {label.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                  <Label className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Loan IDs (optional)</Label>
                  <Textarea value={bulkForm.contactIds} onChange={(e) => setBulkForm({ ...bulkForm, contactIds: e.target.value })} placeholder={`Optional\nLN-002`} rows={8} className="font-mono text-sm" />
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" /> App Type (all)</Label>
                  {userApps.length === 0 ? (
                    <div className="rounded-md border border-dashed border-input p-3 text-xs text-muted-foreground">
                      No Apps Found. Go to <span className="font-medium text-foreground">Settings → Apps</span> to create your first App.
                    </div>
                  ) : (
                    <select
                      value={bulkForm.appType}
                      onChange={(e) => setBulkForm({ ...bulkForm, appType: e.target.value })}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {userApps.map((a) => (
                        <option key={a.id} value={a.name.toLowerCase()}>{a.name}</option>
                      ))}
                    </select>
                  )}
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

              {/* Label Selector for Bulk */}
              {availableLabels.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> Labels (all)</Label>
                  <div className="flex flex-wrap gap-2">
                    {availableLabels.map((label) => (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() => setBulkSelectedLabelIds(prev => prev.includes(label.id) ? prev.filter(id => id !== label.id) : [...prev, label.id])}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-semibold border transition-colors",
                          bulkSelectedLabelIds.includes(label.id) ? "ring-2 ring-offset-1" : "opacity-60"
                        )}
                        style={{
                          backgroundColor: label.color + '22',
                          color: label.color,
                          borderColor: label.color + '55',
                        }}
                      >
                        {label.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
