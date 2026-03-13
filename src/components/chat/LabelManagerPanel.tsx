import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Save, X, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface Label {
  id: string;
  name: string;
  color: string;
}

interface LabelManagerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLabelsChanged?: () => void;
}

const PRESET_COLORS = [
  '#25D366', '#128C7E', '#075E54', '#34B7F1',
  '#FF6B6B', '#FFA500', '#9B59B6', '#E74C3C',
  '#3498DB', '#2ECC71', '#F39C12', '#1ABC9C',
];

export function LabelManagerPanel({ open, onOpenChange, onLabelsChanged }: LabelManagerPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [labels, setLabels] = useState<Label[]>([]);
  const [editing, setEditing] = useState<Label | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#25D366');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && user) fetchLabels();
  }, [open, user]);

  const fetchLabels = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('labels' as any)
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    setLabels(((data as unknown) as Label[]) || []);
  };

  const handleSave = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from('labels' as any)
          .update({ name: name.trim(), color } as any)
          .eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Label updated' });
      } else {
        const { error } = await supabase
          .from('labels' as any)
          .insert({ user_id: user.id, name: name.trim(), color } as any);
        if (error) throw error;
        toast({ title: 'Label created' });
      }
      resetForm();
      await fetchLabels();
      onLabelsChanged?.();
    } catch (err: any) {
      toast({ title: 'Error saving label', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (label: Label) => {
    if (!user) return;
    try {
      // Remove all chat_labels assignments first
      await supabase.from('chat_labels' as any).delete().eq('label_id', label.id);
      // Delete the label
      const { error } = await supabase.from('labels' as any).delete().eq('id', label.id);
      if (error) throw error;
      toast({ title: 'Label deleted' });
      await fetchLabels();
      onLabelsChanged?.();
    } catch (err: any) {
      toast({ title: 'Error deleting label', description: err.message, variant: 'destructive' });
    }
  };

  const startEdit = (label: Label) => {
    setEditing(label);
    setName(label.name);
    setColor(label.color);
    setCreating(true);
  };

  const resetForm = () => {
    setEditing(null);
    setCreating(false);
    setName('');
    setColor('#25D366');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            Manage Labels
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Create/Edit form */}
          {creating ? (
            <div className="space-y-3 p-3 bg-muted rounded-lg">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Label name"
                className="bg-background"
                autoFocus
              />
              {/* Color picker */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Badge color</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: c,
                        borderColor: color === c ? 'hsl(var(--foreground))' : 'transparent',
                      }}
                    />
                  ))}
                </div>
                {/* Preview */}
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className="px-2.5 py-0.5 rounded-full text-white text-xs font-semibold"
                    style={{ backgroundColor: color }}
                  >
                    {name || 'Preview'}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
                  <Save className="h-3.5 w-3.5 mr-1" /> {editing ? 'Update' : 'Create'}
                </Button>
                <Button size="sm" variant="outline" onClick={resetForm}>
                  <X className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" onClick={() => setCreating(true)} className="w-full">
              <Plus className="h-4 w-4 mr-1" /> New Label
            </Button>
          )}

          {/* Label list */}
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {labels.length === 0 && !creating ? (
              <p className="text-sm text-muted-foreground text-center py-4">No labels yet</p>
            ) : (
              labels.map((label) => (
                <div key={label.id} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-muted/50">
                  <span
                    className="px-2.5 py-0.5 rounded-full text-white text-xs font-semibold"
                    style={{ backgroundColor: label.color }}
                  >
                    {label.name}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(label)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(label)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
