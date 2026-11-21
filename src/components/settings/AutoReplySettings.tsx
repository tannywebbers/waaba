// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Pencil, Download, Upload, MessageSquareReply, X, Save, FileText, Image as ImageIcon, Paperclip } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { insertAtCursor } from '@/lib/templateVariables';
import { uploadUserFile } from '@/lib/uploadImage';
import { useApps } from '@/hooks/useApps';
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
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
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
  const { apps } = useApps();
  const [appTemplates, setAppTemplates] = useState<any[]>([]);
  const messageRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const templateFileRef = useRef<HTMLInputElement>(null);
  const templateTargetIndex = useRef<number>(0);
  const imageFileRef = useRef<HTMLInputElement>(null);
  const imageTargetIndex = useRef<number>(0);
  const fileFileRef = useRef<HTMLInputElement>(null);
  const fileTargetIndex = useRef<number>(0);
  const [uploadingImageIndex, setUploadingImageIndex] = useState<number | null>(null);
  const [uploadingFileIndex, setUploadingFileIndex] = useState<number | null>(null);

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

  const uploadStepImage = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    setUploadingImageIndex(index);
    try {
      const url = await uploadUserFile(user.id, file, 'auto-reply-images');
      if (!url) throw new Error('Upload failed');
      updateStep(index, { imageUrl: url });
      toast({ title: 'Image added to this response' });
    } catch (err: any) {
      toast({ title: 'Could not upload that image', description: err?.message, variant: 'destructive' });
    } finally {
      setUploadingImageIndex(null);
    }
  };

  const uploadStepFile = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    setUploadingFileIndex(index);
    try {
      const url = await uploadUserFile(user.id, file, 'auto-reply-files');
      if (!url) throw new Error('Upload failed');
      updateStep(index, { fileUrl: url, fileName: file.name, fileMimeType: file.type || '' });
      toast({ title: 'File added to this response' });
    } catch (err: any) {
      toast({ title: 'Could not upload that file', description: err?.message, variant: 'destructive' });
    } finally {
      setUploadingFileIndex(null);
    }
  };

  const toggleTargetApp = (index: number, appName: string) => {
    const step = draftSteps[index];
    const selected = Array.isArray(step.targetApps)
      ? step.targetApps
      : step.appName ? [step.appName] : [];
    const exists = selected.includes(appName);
    updateStep(index, {
      targetApps: exists ? selected.filter((name) => name !== appName) : [...selected, appName],
    });
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
        cooldownMinutes: Number(s.cooldownMinutes) || 0,
        targetApps: Array.isArray(s.targetApps)
          ? s.targetApps
          : s.appName ? [s.appName] : [],
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
        cooldownMinutes: s.cooldownMinutes || 0,
        imageUrl: s.imageUrl,
        fileUrl: s.fileUrl,
        fileName: s.fileName,
        fileMimeType: s.fileMimeType,
        targetApps: s.targetApps || (s.appName ? [s.appName] : []),
        appName: s.appName,
        recipients: s.recipients,
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
      <input ref={templateFileRef} type="file" accept=".json,.txt" className="hidden" onChange={importTemplateFile} />
      <input ref={imageFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadStepImage(e, imageTargetIndex.current)} />
      <input ref={fileFileRef} type="file" accept="*/*" className="hidden" onChange={(e) => uploadStepFile(e, fileTargetIndex.current)} />

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

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) closeEditor(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit auto reply' : 'New auto reply'}</DialogTitle>
            <DialogDescription>Set triggers, reply text, attachments, recipients and cooldown.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>Auto reply name</Label>
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="e.g. Greetings flow"
            />
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
                  <Label>Attach image (sent after the text)</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 h-8"
                      disabled={uploadingImageIndex === index}
                      onClick={() => {
                        imageTargetIndex.current = index;
                        imageFileRef.current?.click();
                      }}
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      {uploadingImageIndex === index ? 'Uploading...' : step.imageUrl ? 'Change image' : 'Add image'}
                    </Button>
                    {step.imageUrl && (
                      <>
                        <img src={step.imageUrl} alt="Auto reply attachment" className="h-12 w-12 rounded object-cover border" />
                        <Button variant="ghost" size="icon" onClick={() => updateStep(index, { imageUrl: undefined })}>
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Attach file: APK, ZIP, document or any other file (sent after the text)</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 h-8"
                      disabled={uploadingFileIndex === index}
                      onClick={() => {
                        fileTargetIndex.current = index;
                        fileFileRef.current?.click();
                      }}
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      {uploadingFileIndex === index ? 'Uploading...' : step.fileUrl ? 'Change file' : 'Add file / APK'}
                    </Button>
                    {step.fileUrl && (
                      <>
                        <a href={step.fileUrl} target="_blank" rel="noreferrer" className="max-w-[220px] truncate text-sm text-primary underline">
                          {step.fileName || 'Open file'}
                        </a>
                        <Button variant="ghost" size="icon" onClick={() => updateStep(index, { fileUrl: undefined, fileName: undefined, fileMimeType: undefined })}>
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Send to apps</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-panel-border bg-background p-2 max-h-40 overflow-y-auto">
                    {apps.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-1">No apps yet. Add apps in Settings first.</p>
                    ) : (
                      apps.map((app) => {
                        const selected = Array.isArray(step.targetApps)
                          ? step.targetApps
                          : step.appName ? [step.appName] : [];
                        return (
                          <label key={app.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent/50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selected.includes(app.name)}
                              onChange={() => toggleTargetApp(index, app.name)}
                            />
                            <span className="truncate">{app.name}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Selecting apps automatically includes every non-deleted contact in those apps. Leave all unselected to reply only to the number that messaged you.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <div className="space-y-2">
                    <Label>Cooldown (minutes)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={step.cooldownMinutes ?? 0}
                      onChange={(e) => updateStep(index, { cooldownMinutes: Number(e.target.value) })}
                      className="w-28"
                    />
                    <p className="text-xs text-muted-foreground">Skip when the same reply was already sent to that contact within this time.</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" onClick={() => setDraftSteps((s) => [...s, newStep()])} className="gap-2 w-full">
            <Plus className="h-4 w-4" /> Add another trigger &amp; response
          </Button>

          <DialogFooter>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save auto reply'}
            </Button>
            <Button variant="outline" onClick={closeEditor}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* List */}
      <div className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!loading && autoReplies.length === 0 && (
          <p className="text-sm text-muted-foreground">No auto replies yet. Use “New auto reply” to create one.</p>
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
