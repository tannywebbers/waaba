import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Save, X, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface AppTemplate {
  id: string;
  name: string;
  body: string;
  created_at: string;
  updated_at: string;
}

const APP_VARIABLES = [
  { value: 'customer_name', label: 'Customer Name' },
  { value: 'loan_id', label: 'Loan ID' },
  { value: 'amount', label: 'Amount' },
  { value: 'due_date', label: 'Due Date' },
  { value: 'account_number', label: 'Account Number' },
  { value: 'phone_number', label: 'Phone Number' },
  { value: 'app_name', label: 'App Name' },
  { value: 'day_type', label: 'Day Type' },
  { value: 'current_date', label: 'Current Date' },
  { value: 'current_time', label: 'Current Time' },
  { value: 'payment_details', label: 'Payment Details' },
];

export function AppTemplateSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<AppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AppTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<AppTemplate | null>(null);

  useEffect(() => {
    if (user) fetchTemplates();
  }, [user]);

  const ensureTemplateTableReady = async () => {
    // Schema cache can lag after migrations in hosted environments.
    await supabase.from('app_templates' as any).select('id').limit(1);
  };

  const fetchTemplates = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('app_templates' as any)
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      const msg = String(error.message || '');
      if (msg.toLowerCase().includes('schema cache') || msg.toLowerCase().includes('could not find the table')) {
        toast({ title: 'Template table not ready', description: 'Schema cache is refreshing. Please retry in a moment.', variant: 'destructive' });
      }
    } else {
      setTemplates((data as any[]) || []);
    }

    setLoading(false);
  };

  const insertVariable = (varName: string) => {
    setBody(prev => prev + `{{${varName}}}`);
  };

  const handleSave = async () => {
    if (!user || !name.trim() || !body.trim()) {
      toast({ title: 'Name and body are required', variant: 'destructive' });
      return;
    }
    if (name.trim().length < 2 || body.trim().length < 3) {
      toast({ title: 'Template is too short', description: 'Provide a longer name and body.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await ensureTemplateTableReady();
      if (editing) {
        const { error } = await supabase
          .from('app_templates' as any)
          .update({ name: name.trim(), body: body.trim() } as any)
          .eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Template updated' });
      } else {
        const { error } = await supabase
          .from('app_templates' as any)
          .insert({ user_id: user.id, name: name.trim(), body: body.trim() } as any);
        if (error) throw error;
        toast({ title: 'Template created' });
      }
      resetForm();
      fetchTemplates();
    } catch (err: any) {
      toast({ title: 'Error saving template', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('app_templates' as any).delete().eq('id', id);
    if (!error) {
      toast({ title: 'Template deleted' });
      fetchTemplates();
    }
  };

  const startEdit = (t: AppTemplate) => {
    setEditing(t);
    setCreating(true);
    setName(t.name);
    setBody(t.body);
  };

  const resetForm = () => {
    setEditing(null);
    setCreating(false);
    setName('');
    setBody('');
  };

  const extractVariables = (text: string) => {
    const matches = text.match(/\{\{(\w+)\}\}/g);
    return matches ? [...new Set(matches)] : [];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">App Templates</h3>
          <p className="text-sm text-muted-foreground">Create reusable message templates with dynamic variables</p>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> New Template
          </Button>
        )}
      </div>

      {/* Create / Edit Form */}
      {creating && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Payment Reminder" />
            </div>

            <div className="space-y-2">
              <Label>Template Body</Label>
              <Textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Hello {{customer_name}}, your loan {{loan_id}} is due..."
                rows={5}
              />
            </div>

            {/* Variable Chips */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Click to insert variable:</Label>
              <div className="flex flex-wrap gap-1.5">
                {APP_VARIABLES.map(v => (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => insertVariable(v.value)}
                    className="px-2.5 py-1 text-xs rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    {`{{${v.value}}}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            {body && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs font-medium text-muted-foreground mb-1">Preview</p>
                <p className="text-sm whitespace-pre-wrap">{body}</p>
                {extractVariables(body).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {extractVariables(body).map(v => (
                      <Badge key={v} variant="outline" className="text-[10px]">{v}</Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" /> {editing ? 'Update' : 'Create'}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Template List */}
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading templates...</p>
      ) : templates.length === 0 && !creating ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No app templates yet.</p>
          <p className="text-xs mt-1">Create your first template to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <Card key={t.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.body}</p>
                    {extractVariables(t.body).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {extractVariables(t.body).map(v => (
                          <Badge key={v} variant="secondary" className="text-[10px]">{v}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewTemplate(t)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(t.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{previewTemplate?.name}</DialogTitle>
          </DialogHeader>
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm whitespace-pre-wrap">{previewTemplate?.body}</p>
          </div>
          {previewTemplate && extractVariables(previewTemplate.body).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {extractVariables(previewTemplate.body).map(v => (
                <Badge key={v} variant="outline" className="text-[10px]">{v}</Badge>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
