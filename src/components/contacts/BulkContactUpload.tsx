// @ts-nocheck
import { useState, useRef } from 'react';
import { Upload, Download, FileJson, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/appStore';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { normalizePhoneNumber } from '@/lib/utils/phone';

interface ContactJSON {
  loanId: string;
  name: string;
  phone: string;
  amount?: number;
  appType?: string;
  dayType?: -1 | 0;
  accountDetails?: {
    bank: string;
    accountNumber: string;
    accountName: string;
  }[];
}

interface BulkContactUploadProps {
  onSuccess?: () => void;
}

const DEMO_JSON: ContactJSON[] = [
  {
    loanId: "LN-100241",
    name: "Chinedu Okafor",
    phone: "08031234567",
    amount: 50000,
    appType: "",
    dayType: 0,
    accountDetails: [
      { bank: "Zenith Bank", accountNumber: "2088341170", accountName: "Chinedu Okafor" }
    ]
  },
  {
    loanId: "LN-100242",
    name: "Aisha Bello",
    phone: "2348098765432",
    amount: 75000,
    appType: "",
    dayType: -1,
    accountDetails: [
      { bank: "GTBank", accountNumber: "0123456789", accountName: "Aisha Bello" },
      { bank: "First Bank", accountNumber: "3112233445", accountName: "Aisha Bello" }
    ]
  },
  {
    loanId: "LN-100243",
    name: "Tunde Adeyemi",
    phone: "+234 802 555 0134",
    amount: 120000,
    appType: "",
    dayType: -7,
    accountDetails: []
  }
];

export function BulkContactUpload({ onSuccess }: BulkContactUploadProps) {
  const { user } = useAuth();
  const { addContacts } = useAppStore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ContactJSON[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const downloadDemo = () => {
    const blob = new Blob([JSON.stringify(DEMO_JSON, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts-template.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const validateContacts = (contacts: any[]): { valid: ContactJSON[]; errors: string[] } => {
    const valid: ContactJSON[] = [];
    const errors: string[] = [];

    contacts.forEach((contact, index) => {
      const rowErrors: string[] = [];

      if (contact.loanId !== undefined && contact.loanId !== null && typeof contact.loanId !== 'string') {
        rowErrors.push('loanId must be text');
      }
      if (!contact.name || typeof contact.name !== 'string') {
        rowErrors.push('name is required');
      }
      if (contact.phone === undefined || contact.phone === null || `${contact.phone}`.trim() === '') {
        rowErrors.push('phone is required');
      } else if (!normalizePhoneNumber(`${contact.phone}`)) {
        rowErrors.push('phone is not a valid number');
      }
      // appType is free-form now (managed in Settings › Apps)
      if (contact.appType && typeof contact.appType !== 'string') {
        rowErrors.push('appType must be a string');
      }
      if (contact.dayType !== undefined && Number.isNaN(Number(contact.dayType))) {
        rowErrors.push('dayType must be a number (e.g. 0, -1, -7)');
      }

      if (rowErrors.length > 0) {
        errors.push(`Row ${index + 1}: ${rowErrors.join(', ')}`);
      } else {
        valid.push({
          loanId: contact.loanId || '',
          name: contact.name,
          phone: `${contact.phone}`.trim(),
          amount: contact.amount ? Number(contact.amount) : undefined,
          appType: contact.appType || '',
          dayType: contact.dayType ?? 0,
          accountDetails: contact.accountDetails || [],
        });
      }
    });

    return { valid, errors };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!Array.isArray(data)) {
        setErrors(['JSON file must contain an array of contacts']);
        setPreview(null);
        return;
      }

      const { valid, errors } = validateContacts(data);
      setErrors(errors);
      setPreview(valid);
    } catch (error) {
      setErrors(['Invalid JSON file format']);
      setPreview(null);
    }

    e.target.value = '';
  };

  const handleUpload = async () => {
    if (!preview || preview.length === 0 || !user) return;
    setLoading(true);

    try {
      const contactsData = await Promise.all(preview.map(async (c) => {
        const phone = normalizePhoneNumber(c.phone);
        const { data: existing } = await supabase.from('contacts').select('id,loan_id').eq('user_id', user.id).eq('phone', phone).maybeSingle();
        const payload = {
          user_id: user.id,
          loan_id: c.loanId || existing?.loan_id || '',
          name: c.name,
          phone,
          amount: c.amount,
          app_type: c.appType,
          day_type: c.dayType,
          is_deleted: false,
          deleted_at: null,
          created_at: new Date().toISOString(),
        };
        const { data, error } = existing
          ? await supabase.from('contacts').update(payload).eq('id', existing.id).select().maybeSingle()
          : await supabase.from('contacts').insert(payload).select().maybeSingle();
        if (error) throw error;
        return data;
      }));

      // Insert account details
      const accountDetailsToInsert: any[] = [];
      contactsData?.forEach((contact, index) => {
        const originalContact = preview[index];
        originalContact.accountDetails?.forEach(ad => {
          accountDetailsToInsert.push({
            contact_id: contact.id,
            bank: ad.bank,
            account_number: ad.accountNumber,
            account_name: ad.accountName,
          });
        });
      });

      if (accountDetailsToInsert.length > 0) {
        const { error: accountError } = await supabase
          .from('account_details')
          .insert(accountDetailsToInsert);

        if (accountError) throw accountError;
      }

      // Update local state
      const newContacts = contactsData?.map((c, index) => ({
        id: c.id,
        loanId: c.loan_id,
        name: c.name,
        phone: c.phone,
        amount: c.amount ? Number(c.amount) : undefined,
        appType: c.app_type || '',
        dayType: c.day_type ?? 0,
        createdAt: new Date(c.created_at),
        updatedAt: new Date(c.updated_at),
        accountDetails: preview[index].accountDetails?.map((ad, i) => ({
          id: `temp-${i}`,
          ...ad,
        })),
      })) || [];

      addContacts(newContacts);
      toast({ title: `Successfully imported ${newContacts.length} contacts` });
      setPreview(null);
      onSuccess?.();
    } catch (error) {
      console.error('Error uploading contacts:', error);
      toast({ title: 'Error uploading contacts', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={downloadDemo}
          className="flex-1"
        >
          <Download className="h-4 w-4 mr-2" />
          Download Template
        </Button>
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1"
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload JSON
        </Button>
      </div>

      <div className="rounded-lg border border-input bg-muted/40 p-3">
        <div className="flex items-center gap-2 mb-2">
          <FileJson className="h-4 w-4 text-primary" />
          <p className="text-xs font-medium">How the file should look</p>
        </div>
        <p className="text-[11px] text-muted-foreground mb-2">
          A list of contacts. Only <span className="font-medium text-foreground">name</span> and{' '}
          <span className="font-medium text-foreground">phone</span> are required — everything else is optional.
          Numbers can be written as 0803…, 234803… or +234 803…
        </p>
        <pre className="max-h-40 overflow-auto rounded bg-background p-2 text-[10px] leading-relaxed">
{JSON.stringify(DEMO_JSON, null, 2)}
        </pre>
      </div>

      {errors.length > 0 && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm font-medium text-destructive mb-2">Validation Errors:</p>
          <ul className="text-sm text-destructive space-y-1">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {preview && preview.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{preview.length} contacts ready to import</p>
            <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="max-h-48 overflow-y-auto space-y-2">
            {preview.slice(0, 5).map((contact, index) => (
              <div key={index} className="p-2 bg-muted rounded-lg text-sm flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500 shrink-0" />
                <span className="truncate">{contact.name}</span>
                <span className="text-muted-foreground">({contact.phone})</span>
              </div>
            ))}
            {preview.length > 5 && (
              <p className="text-sm text-muted-foreground text-center">
                +{preview.length - 5} more contacts
              </p>
            )}
          </div>

          <Button onClick={handleUpload} disabled={loading} className="w-full">
            {loading ? 'Importing...' : `Import ${preview.length} Contacts`}
          </Button>
        </div>
      )}
    </div>
  );
}
