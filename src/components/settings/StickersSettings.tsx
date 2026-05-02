import { useEffect, useRef, useState } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

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

  const handleUpload = async (file: File) => {
    if (!user || !file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const path = `${user.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('stickers').upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('stickers').getPublicUrl(path);
      await supabase.from('stickers' as any).insert({
        user_id: user.id, name: file.name, media_url: urlData.publicUrl,
        mime_type: file.type, source: 'uploaded',
      } as any);
      await load();
      toast({ title: '✅ Sticker added' });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally { setUploading(false); }
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
