// @ts-nocheck
import { useState, useEffect } from 'react';
import { FileText, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Contact } from '@/types';
import { useDisplayName } from '@/hooks/useDisplayName';
import { generateMessageId } from '@/lib/utils/messageId';
import { resolveTemplateBody } from '@/lib/templateVariables';

interface AppTemplateSelectorProps {
  contact: Contact;
  onInsertText: (text: string) => void;
}

export function AppTemplateSelector({ contact, onInsertText }: AppTemplateSelectorProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const senderName = useDisplayName();

  useEffect(() => {
    if (open && user) {
      setLoading(true);
      supabase
        .from('app_templates' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('name')
        .then(({ data }) => {
          setTemplates((data as any[]) || []);
          setLoading(false);
        });
    }
  }, [open, user]);

  const filtered = templates.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (template: any) => {
    const resolved = resolveTemplateBody(template.body, contact, {
      senderName,
      messageId: generateMessageId(),
    }).text;
    onInsertText(resolved);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          title="Insert app template"
        >
          <span className="font-bold text-lg text-muted-foreground leading-none">T</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[70vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>App Templates</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates..." className="pl-9" />
        </div>
        <ScrollArea className="h-[350px]">
          {loading ? (
            <p className="text-center py-8 text-muted-foreground text-sm">Loading...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No app templates found</p>
              <p className="text-xs mt-1">Create templates in Settings → Templates</p>
            </div>
          ) : (
            <div className="space-y-2 pr-2">
              {filtered.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleSelect(t)}
                  className="w-full text-left p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                >
                  <p className="font-medium text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {resolveTemplateBody(t.body, contact, { senderName }).text}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
