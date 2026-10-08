import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Plus, Trash2, Upload, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { uploadUserImage } from '@/lib/uploadImage';

export interface ContactListItemForm {
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

interface ContactExtrasProps {
  userId?: string;
  imageUrl: string;
  onImageUrlChange: (url: string) => void;
  bvn: string;
  onBvnChange: (value: string) => void;
  items: ContactListItemForm[];
  onItemsChange: (items: ContactListItemForm[]) => void;
}

export function ContactExtras({
  userId,
  imageUrl,
  onImageUrlChange,
  bvn,
  onBvnChange,
  items,
  onItemsChange,
}: ContactExtrasProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!userId) {
      toast({ title: 'Not signed in', description: 'Sign in again to upload images.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadUserImage(userId, file, 'avatars');
      if (url) {
        onImageUrlChange(url);
        toast({ title: 'Image uploaded' });
      } else {
        toast({ title: 'Upload failed', description: 'The image could not be uploaded. Try again.', variant: 'destructive' });
      }
    } finally {
      setUploading(false);
    }
  };

  const addItem = () =>
    onItemsChange([...items, { name: '', phone: '', email: '', role: '', notes: '', bankName: '', accountNumber: '', recipientName: '', isPrimary: items.length === 0 }]);

  const removeItem = (index: number) => onItemsChange(items.filter((_, i) => i !== index));

  const updateItem = (index: number, field: keyof ContactListItemForm, value: string | boolean) =>
    onItemsChange(items.map((cc, i) => (i === index ? { ...cc, [field]: value } : cc)));

  return (
    <>
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <ImagePlus className="h-3.5 w-3.5" /> Profile Image
        </Label>
        <div className="flex items-center gap-3">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Contact"
              className="h-16 w-16 rounded-full object-cover border"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="h-16 w-16 rounded-full border border-dashed flex items-center justify-center text-muted-foreground">
              <User className="h-6 w-6" />
            </div>
          )}
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <div className="flex gap-1.5">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                {uploading ? 'Uploading...' : 'Upload image'}
              </Button>
              {imageUrl && (
                <Button type="button" variant="ghost" size="sm" onClick={() => onImageUrlChange('')}>
                  <Trash2 className="h-4 w-4 mr-1.5" /> Remove
                </Button>
              )}
            </div>
            <Input
              value={imageUrl}
              onChange={(e) => onImageUrlChange(e.target.value)}
              placeholder="https://image-url (paste a link instead)"
              className="h-9"
            />
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-bvn">BVN</Label>
        <Input
          id="contact-bvn"
          inputMode="numeric"
          maxLength={11}
          value={bvn}
          onChange={(e) => onBvnChange(e.target.value.replace(/\D/g, ''))}
          placeholder="11-digit Bank Verification Number"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" /> Contact List
          </Label>
          <Button type="button" variant="outline" size="sm" onClick={addItem} data-testid="add-contact-item">
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground">No extra contacts yet. Add people linked to this customer.</p>
        )}
        {items.map((cc, index) => (
          <div key={index} className="p-3 border rounded-lg space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Contact {index + 1}</span>
              <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input placeholder="Name" data-testid="contact-item-name" value={cc.name || ''} onChange={(e) => updateItem(index, 'name', e.target.value)} />
              <Input placeholder="Phone" data-testid="contact-item-phone" value={cc.phone || ''} onChange={(e) => updateItem(index, 'phone', e.target.value)} />
              <Input placeholder="Email" type="email" value={cc.email || ''} onChange={(e) => updateItem(index, 'email', e.target.value)} />
              <Input placeholder="Role (e.g. guarantor)" value={cc.role || ''} onChange={(e) => updateItem(index, 'role', e.target.value)} />
              <Input placeholder="Bank name" value={cc.bankName || ''} onChange={(e) => updateItem(index, 'bankName', e.target.value)} />
              <Input placeholder="Account number" value={cc.accountNumber || ''} onChange={(e) => updateItem(index, 'accountNumber', e.target.value)} />
            </div>
            <Input placeholder="Account holder name" value={cc.recipientName || ''} onChange={(e) => updateItem(index, 'recipientName', e.target.value)} />
            <Input placeholder="Notes" value={cc.notes || ''} onChange={(e) => updateItem(index, 'notes', e.target.value)} />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={!!cc.isPrimary}
                onChange={(e) => updateItem(index, 'isPrimary', e.target.checked)}
              />
              Primary contact for repayments
            </label>
          </div>
        ))}
      </div>
    </>
  );
}
