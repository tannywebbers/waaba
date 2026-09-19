// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Pencil, Download, Upload, MessageSquareReply, X, Save, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { insertAtCursor } from '@/lib/templateVariables';
import { VariablePills } from '@/components/settings/VariablePills';
import { KeywordPillInput } from '@/components/settings/KeywordPillInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAutoReplies } from '@/hooks/useAutoReplies';
import {
  AUTO_REPLY_DEMO_JSON, AutoReply, AutoReplyStep, newStep,
  parseAutoReplyJSON, toStoredSteps,
} from '@/lib/autoReply';
import { cn } from '@/lib/utils';

export function AutoReplySettings() {
  const { autoReplies, loading, createAutoReply, updateAutoReply, deleteAutoReply } = useAutoReplies();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState<AutoReply | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftActive, setDraftActive] = useState(true);
  const [draftSteps, setDraftSteps] = useState<AutoReplyStep[]>([newStep()]);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { user } = useAuth();
  const [appTemplates, setAppTemplates] = useState<any[]>([]);
  const messageRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const templateFileRef = useRef<HTMLInputElement>(null);
  const templateTargetIndex = useRef<number>(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('app_templates' as any)
      .select('id, name, body')
      .eq('user_id', user.id)
      .order('name')
      .then(({ data }) => setAppTemplates((data as any[]) || []));
  }, [user]);

  /** Inserts text into a step's reply message at the caret. */
  const insertIntoMessage = (index: number, text: string) => {
    const step = draftSteps[index];
    if (!step) return;
    const el = messageRefs.current[step.id] || null;
    const { value, caret } = insertAtCursor(el, step.message || '', text);
    updateStep(index, { message: value });
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(caret, caret);
      }
    });
  };

  const importTemplateFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const index = templateTargetIndex.current;
    try {
      const text = await file.text();
      let body = text;
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(text);
        const first = Array.isArray(parsed) ? parsed[0] : parsed;
        body = first?.body || first?.message || '';
        if (!body) throw new Error('No "body" found in that file');
      }
      insertIntoMessage(index, String(body).trim());
      toast({ title: 'Template added to the reply message' });
    } catch (err: any) {
      toast({ title: 'Could not read that file', description: err?.message, variant: 'destructive' });
    }
  };

  const startNew = () => {
    setEditing({ id: '', userId: '', name: '', isActive: true, steps: [] });
    setDraftName('');
    setDraftActive(true);
    setDraftSteps([newStep()]);
  };

  const startEdit = (reply: AutoReply) => {
    setEditing(reply);
    setDraftName(reply.name);
    setDraftActive(reply.isActive);
    setDraftSteps(reply.steps?.length ? reply.steps.map((s) => ({ ...s })) : [newStep()]);
  };

  const closeEditor = () => setEditing(null);

  const updateStep = (index: number, patch: Partial<AutoReplyStep>) => {
    setDraftSteps((steps) => steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const removeStep = (index: number) => {
    setDraftSteps((steps) => (steps.length === 1 ? steps : steps.filter((_, i) => i !== index)));
  };

  const handleSave = async () => {
    if (!draftName.trim()) {
      toast({ title: 'Give this auto reply a name', variant: 'destructive' });
      return;
    }
    const cleaned = draftSteps
      .map((s) => ({
        ...s,
        keywords: (Array.isArray(s.keywords) ? s.keywords : String(s.keywords).split(','))
          .map((k) => String(k).trim())
          .filter(Boolean),
        message: (s.message || '').trim(),
        delaySeconds: Number(s.delaySeconds) || 0,
      }))
      .filter((s) => s.keywords.length > 0 && s.message);

    if (cleaned.length === 0) {
      toast({ title: 'Add at least one trigger word and a reply message', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (editing?.id) {
        await updateAutoReply(editing.id, { name: draftName.trim(), steps: cleaned, isActive: draftActive });
        toast({ title: 'Auto reply updated' });
      } else {
        await createAutoReply(draftName.trim(), cleaned, draftActive);
        toast({ title: 'Auto reply created' });
      }
      closeEditor();
    } catch (err: any) {
      toast({ title: 'Could not save', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const downloadDemo = () => {
    const blob = new Blob([JSON.stringify(AUTO_REPLY_DEMO_JSON, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'auto-replies-template.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportCurrent = () => {
    const payload = autoReplies.map((r) => ({
      name: r.name,
      isActive: r.isActive,
      steps: (r.steps || []).map((s) => ({
        keywords: s.keywords,
        matchType: s.matchType,
        message: s.message,
        delaySeconds: s.delaySeconds || 0,
      })),
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'auto-replies-export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const { valid, errors } = parseAutoReplyJSON(parsed);
      if (errors.length > 0) {
        toast({ title: 'Some items were skipped', description: errors.slice(0, 4).join(' · '), variant: 'destructive' });
      }
      let imported = 0;
      for (const item of valid) {
        await createAutoReply(item.name, toStoredSteps(item), item.isActive !== false);
        imported++;
      }
      if (imported > 0) toast({ title: `Imported ${imported} auto ${imported === 1 ? 'reply' : 'replies'}` });
    } catch {
      toast({ title: 'That file is not valid JSON', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquareReply className="h-5 w-5 text-primary" /> Auto Reply
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Reply automatically when an incoming message matches your trigger words.
        </p>
      </div>

      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />

      <div className="flex flex-wrap gap-2">
        <Button onClick={startNew} className="gap-2">
          <Plus className="h-4 w-4" /> New auto reply
        </Button>
        <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
          <Upload className="h-4 w-4" /> Import JSON
        </Button>
        <Button variant="outline" onClick={downloadDemo} className="gap-2">
          <Download className="h-4 w-4" /> Sample file
        </Button>
        {autoReplies.length > 0 && (
          <Button variant="ghost" onClick={exportCurrent} className="gap-2">
            <Download className="h-4 w-4" /> Export all
          </Button>
        )}
      </div>

      {/* Editor */}
      {editing && (
        <div className="rounded-xl border border-panel-border p-4 space-y-4 bg-muted/30">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <Label>Auto reply name</Label>
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="e.g. Greetings flow"
              />
            </div>
            <Button variant="ghost" size="icon" onClick={closeEditor} className="mt-6">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="ar-active">Active</Label>
            <Switch id="ar-active" checked={draftActive} onCheckedChange={setDraftActive} />
          </div>

          <Separator />

          <div className="space-y-4">
            {draftSteps.map((step, index) => (
              <div key={step.id} className="rounded-lg border border-panel-border bg-background p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Trigger {index + 1}</p>
                  {draftSteps.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeStep(index)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Trigger words / keywords</Label>
                  <KeywordPillInput
                    keywords={Array.isArray(step.keywords)
                      ? step.keywords
                      : String(step.keywords || '').split(',').map((k) => k.trim()).filter(Boolean)}
                    onChange={(keywords) => updateStep(index, { keywords })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Match</Label>
                  <div className="flex gap-2">
                    {(['contains', 'exact'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updateStep(index, { matchType: mode })}
                        className={cn(
                          'flex-1 rounded-lg border px-3 py-2 text-sm transition-colors',
                          step.matchType === mode
                            ? 'border-primary bg-primary/10 text-primary font-medium'
                            : 'border-panel-border hover:bg-accent/50'
                        )}
                      >
                        {mode === 'contains' ? 'Contains the word' : 'Exact match, word for word'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label>Reply message</Label>
                    <div className="flex items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1 h-8">
                            <FileText className="h-3.5 w-3.5" /> Use app template
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                          {appTemplates.length === 0 ? (
                            <DropdownMenuItem disabled>No app templates yet</DropdownMenuItem>
                          ) : (
                            appTemplates.map((t) => (
                              <DropdownMenuItem
                                key={t.id}
                                onClick={() => insertIntoMessage(index, t.body || '')}
                              >
                                {t.name}
                              </DropdownMenuItem>
                            ))
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 h-8"
                        onClick={() => {
                          templateTargetIndex.current = index;
                          templateFileRef.current?.click();
                        }}
                      >
                        <Upload className="h-3.5 w-3.5" /> Import
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    ref={(el) => { messageRefs.current[step.id] = el; }}
                    value={step.message}
                    onChange={(e) => updateStep(index, { message: e.target.value })}
                    placeholder="Hello {{customer_name}}, your loan {{loan_id}} is due on {{due_date}}..."
                    rows={3}
                  />
                  <VariablePills onInsert={(v) => insertIntoMessage(index, `{{${v}}}`)} />
                </div>

                <div className="space-y-2">
                  <Label>Delay before replying (seconds)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={step.delaySeconds ?? 0}
                    onChange={(e) => updateStep(index, { delaySeconds: Number(e.target.value) })}
                    className="w-28"
                  />
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" onClick={() => setDraftSteps((s) => [...s, newStep()])} className="gap-2 w-full">
            <Plus className="h-4 w-4" /> Add another trigger &amp; response
          </Button>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1 gap-2">
              <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save auto reply'}
            </Button>
            <Button variant="outline" onClick={closeEditor}>Cancel</Button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!loading && autoReplies.length === 0 && (
          <p className="text-sm text-muted-foreground">No auto replies yet. Create your first one above.</p>
        )}
        {autoReplies.map((reply) => (
          <div
            key={reply.id}
            className="flex items-center gap-3 rounded-lg border border-panel-border p-3"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{reply.name}</p>
              <p className="text-sm text-muted-foreground truncate">
                {(reply.steps || []).length} trigger{(reply.steps || []).length === 1 ? '' : 's'}
                {reply.steps?.[0]?.keywords?.length ? ` · ${reply.steps[0].keywords.slice(0, 3).join(', ')}` : ''}
              </p>
            </div>
            <Switch
              checked={reply.isActive}
              onCheckedChange={(checked) => updateAutoReply(reply.id, { isActive: checked })}
            />
            <Button variant="ghost" size="icon" onClick={() => startEdit(reply)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setDeleteId(reply.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this auto reply?</AlertDialogTitle>
            <AlertDialogDescription>
              It will stop replying to those trigger words. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteId) {
                  await deleteAutoReply(deleteId);
                  toast({ title: 'Auto reply deleted' });
                }
                setDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
