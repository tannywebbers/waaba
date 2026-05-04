import { useEffect, useRef, useState } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { uploadStickerFile } from '@/lib/utils/stickerUpload';

export function StickersSettings() {
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

  const handleUpload = async (files: FileList) => {
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Stickers</h2>
          <p className="text-sm text-muted-foreground">Upload stickers or save them from received messages.</p>
        </div>
        <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
          <Upload className="h-4 w-4 mr-2" />Upload
        </Button>
        <input
          ref={fileRef} type="file" accept="image/*,image/webp" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
        />
      </div>

      {stickers.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">No stickers yet.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {stickers.map(s => (
            <div key={s.id} className="relative group aspect-square rounded-lg bg-muted overflow-hidden">
              <img src={s.media_url} alt="sticker" className="w-full h-full object-contain p-2" />
              <button
                onClick={() => handleDelete(s.id)}
                className="absolute top-1 right-1 h-7 w-7 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 flex items-center justify-center"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <span className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-background/80">
                {s.source === 'saved_from_chat' ? 'Saved' : 'Uploaded'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
