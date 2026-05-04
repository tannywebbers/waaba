import { useEffect, useRef, useState } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { uploadStickerFile } from '@/lib/utils/stickerUpload';

interface StickerGridProps {
  onSelect: (sticker: { mediaUrl: string; mimeType: string }) => void;
  height?: number;
}

export function StickerGrid({ onSelect, height = 360 }: StickerGridProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stickers, setStickers] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('stickers' as any)
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setStickers((data as any[]) || []);
  };

  useEffect(() => { load(); }, [user?.id]);

  const handleUpload = async (files: FileList | File[]) => {
    if (!user) return;
    setUploading(true);
    let okCount = 0;
    let firstErr: string | undefined;
    for (const file of Array.from(files)) {
      const r = await uploadStickerFile(file, user.id);
      if (r.ok) okCount++; else firstErr ??= r.error;
    }
    setUploading(false);
    await load();
    if (okCount > 0) toast({ title: `✅ ${okCount} sticker${okCount > 1 ? 's' : ''} added` });
    if (firstErr) toast({ title: 'Some uploads failed', description: firstErr, variant: 'destructive' });
  };

  const handleDelete = async (id: string) => {
    await supabase.from('stickers' as any).delete().eq('id', id);
    setStickers(s => s.filter(x => x.id !== id));
  };

  return (
    <div className="w-full bg-card flex flex-col" style={{ height }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <p className="font-semibold text-sm">Stickers</p>
        <Button size="sm" variant="ghost" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4 mr-1" />Add
        </Button>
        <input
          ref={fileRef} type="file" accept="image/*,image/webp" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
        />
      </div>
      {stickers.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-10 px-4">
          No stickers yet. Upload one or save received stickers from chats.
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-2 p-3 overflow-y-auto custom-scrollbar flex-1">
          {stickers.map(s => (
            <div key={s.id} className="relative group aspect-square">
              <button
                onClick={() => onSelect({ mediaUrl: s.media_url, mimeType: s.mime_type })}
                className="w-full h-full rounded-lg overflow-hidden bg-muted hover:ring-2 hover:ring-primary"
              >
                <img src={s.media_url} alt="sticker" className="w-full h-full object-contain" />
              </button>
              <button
                onClick={() => handleDelete(s.id)}
                className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 flex items-center justify-center"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
