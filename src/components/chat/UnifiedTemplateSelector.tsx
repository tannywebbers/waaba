// @ts-nocheck
import { useState, useEffect } from 'react';
import { FileText, Search, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Contact } from '@/types';
import { format } from 'date-fns';

interface MetaTemplate {
  id: string; template_id: string; name: string; language: string; category: string; status: string; components: any;
}

interface UnifiedTemplateSelectorProps {
  contact: Contact;
  onSelectMetaTemplate: (template: MetaTemplate, params: Record<string, string>) => void;
  onInsertAppTemplate: (text: string) => void;
}

// Resolve a mapped field name to actual contact data
// Supports: CRM fields, current_date, and app_template:template_name
function calculateDueDate(dayType: number | undefined): string {
  if (dayType === undefined || dayType === null) return '';
  // due_date = today - dayType days
  // dayType 0 = due today, dayType -2 = due in 2 days (future), dayType 3 = overdue by 3 days
  const today = new Date();
  const dueDate = new Date(today);
  dueDate.setDate(today.getDate() - dayType);
  return format(dueDate, 'dd/MM/yyyy');
}

function resolveField(field: string, contact: Contact, appTemplatesMap: Record<string, string>): string {
  // Handle app_template:xxx — inject template CONTENT, not name
  if (field.startsWith('app_template:')) {
    const templateName = field.replace('app_template:', '');
    const content = appTemplatesMap[templateName];
    if (!content) return `[Missing template: ${templateName}]`;
    return content;
  }

  const paymentDetails = contact.accountDetails?.length
    ? contact.accountDetails.map(a => `${a.bank} - ${a.accountNumber} (${a.accountName})`).join('; ')
    : '';

  switch (field) {
    case 'customer_name': return contact.name;
    case 'loan_id': return contact.loanId;
    case 'amount': return contact.amount?.toString() || '';
    case 'payment_details': return paymentDetails;
    case 'app_name': return contact.appType || 'Tloan';
    case 'due_date': return calculateDueDate(contact.dayType);
    case 'phone_number': return contact.phone;
    case 'day_type': return contact.dayType?.toString() || '';
    case 'current_date': return format(new Date(), 'dd MMM yyyy');
    default: return '';
  }
}

function mapNamedVariables(text: string, contact: Contact): string {
  const paymentDetails = contact.accountDetails?.length
    ? contact.accountDetails.map(a => `${a.bank} - ${a.accountNumber} (${a.accountName})`).join('; ')
    : '';
  return text
    .replace(/\{\{customer_name\}\}/gi, contact.name)
    .replace(/\{\{loan_id\}\}/gi, contact.loanId)
    .replace(/\{\{amount\}\}/gi, contact.amount?.toString() || '')
    .replace(/\{\{payment_details\}\}/gi, paymentDetails)
    .replace(/\{\{app_name\}\}/gi, contact.appType || 'Tloan')
    .replace(/\{\{due_date\}\}/gi, calculateDueDate(contact.dayType))
    .replace(/\{\{day_type\}\}/gi, contact.dayType?.toString() || '')
    .replace(/\{\{current_date\}\}/gi, format(new Date(), 'dd MMM yyyy'))
    .replace(/\{\{phone_number\}\}/gi, contact.phone);
}

const APP_VARIABLE_MAP: Record<string, (c: Contact) => string> = {
  customer_name: (c) => c.name,
  loan_id: (c) => c.loanId,
  amount: (c) => c.amount?.toString() || '',
  phone_number: (c) => c.phone,
  app_name: (c) => c.appType || 'Tloan',
  day_type: (c) => c.dayType?.toString() || '',
  due_date: (c) => calculateDueDate(c.dayType),
  account_number: (c) => c.accountDetails?.[0]?.accountNumber || '',
  payment_details: (c) => c.accountDetails?.map(a => `${a.bank} - ${a.accountNumber} (${a.accountName})`).join('; ') || '',
  current_date: () => format(new Date(), 'dd MMM yyyy'),
  current_time: () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

function resolveAppTemplate(body: string, contact: Contact): string {
  return body.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    const resolver = APP_VARIABLE_MAP[varName];
    return resolver ? resolver(contact) || match : match;
  });
}

export function UnifiedTemplateSelector({ contact, onSelectMetaTemplate, onInsertAppTemplate }: UnifiedTemplateSelectorProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'meta' | 'app'>('meta');

  // Meta state
  const [metaTemplates, setMetaTemplates] = useState<MetaTemplate[]>([]);
  const [metaSearch, setMetaSearch] = useState('');
  const [metaLoading, setMetaLoading] = useState(false);
  const [selectedMeta, setSelectedMeta] = useState<MetaTemplate | null>(null);
  const [metaParams, setMetaParams] = useState<Record<string, string>>({});
  const [mappings, setMappings] = useState<Record<number, string>>({});
  const [unmappedVars, setUnmappedVars] = useState<number[]>([]);

  // App state
  const [appTemplates, setAppTemplates] = useState<any[]>([]);
  const [appSearch, setAppSearch] = useState('');
  const [appLoading, setAppLoading] = useState(false);

  // App templates map for resolving at send time: { template_name: template_body }
  const [appTemplatesMap, setAppTemplatesMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && user) {
      fetchMetaTemplates();
      fetchAppTemplates();
    }
    if (!open) {
      setSelectedMeta(null);
      setMetaSearch('');
      setAppSearch('');
    }
  }, [open, user]);

  const fetchMetaTemplates = async () => {
    if (!user) return;
    setMetaLoading(true);
    try {
      const { data } = await supabase
        .from('whatsapp_templates' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('name');
      setMetaTemplates((data as any[]) || []);
    } catch (e) { console.error(e); }
    finally { setMetaLoading(false); }
  };

  const fetchAppTemplates = async () => {
    if (!user) return;
    setAppLoading(true);
    try {
      const { data } = await supabase.from('app_templates' as any).select('*').eq('user_id', user.id).order('name');
      const templates = (data as any[]) || [];
      setAppTemplates(templates);
      // Build lookup map
      const map: Record<string, string> = {};
      templates.forEach(t => { map[t.name] = t.body; });
      setAppTemplatesMap(map);
    } catch (e) { console.error(e); }
    finally { setAppLoading(false); }
  };

  const handleSelectMeta = async (template: MetaTemplate) => {
    setSelectedMeta(template);
    if (!user) return;
    const { data: mappingData } = await supabase
      .from('template_mappings' as any).select('*').eq('user_id', user.id).eq('template_name', template.name);
    const dbMappings: Record<number, string> = {};
    ((mappingData as any[]) || []).forEach((m: any) => { dbMappings[m.variable_number] = m.mapped_field; });
    setMappings(dbMappings);

    const body = template.components?.find((c: any) => c.type === 'BODY');
    const text = body?.text || '';
    const varMatches: string[] = text.match(/\{\{(\d+)\}\}/g) || [];
    const varNums = [...new Set(varMatches.map(m => parseInt(m.replace(/[{}]/g, ''))))].sort((a, b) => a - b);

    const resolved: Record<string, string> = {};
    const unmapped: number[] = [];
    varNums.forEach(num => {
      const field = dbMappings[num];
      if (field) {
        resolved[`{{${num}}}`] = resolveField(field, contact, appTemplatesMap);
      } else {
        resolved[`{{${num}}}`] = '';
        unmapped.push(num);
      }
    });

    // Fallback auto-resolve from examples if no mappings saved
    if (Object.keys(dbMappings).length === 0 && template.components) {
      template.components.forEach((comp: any) => {
        if (comp.type === 'BODY' && comp.example?.body_text) {
          comp.example.body_text[0]?.forEach((param: string, index: number) => {
            const paramKey = `{{${index + 1}}}`;
            const lower = param.toLowerCase();
            if (lower.includes('name') || lower.includes('customer')) resolved[paramKey] = contact.name;
            else if (lower.includes('loan') || lower.includes('id')) resolved[paramKey] = contact.loanId;
            else if (lower.includes('amount')) resolved[paramKey] = contact.amount?.toString() || '';
            else if (lower.includes('app')) resolved[paramKey] = contact.appType || 'Tloan';
            else if (lower.includes('due') || lower.includes('date')) resolved[paramKey] = calculateDueDate(contact.dayType);
            else if (lower.includes('day')) resolved[paramKey] = contact.dayType?.toString() || '';
            else resolved[paramKey] = param;
          });
        }
      });
    }
    setMetaParams(resolved);
    setUnmappedVars(unmapped);
  };

  const handleMetaConfirm = () => {
    if (!selectedMeta) return;

    // Validate: check for unresolved app_template references
    for (const [key, value] of Object.entries(metaParams)) {
      if (value.startsWith('[Missing template:')) {
        return; // Block send — the toast/UI already shows the issue
      }
      if (!value.trim()) {
        // Allow empty if user explicitly cleared it
      }
    }

    onSelectMetaTemplate(selectedMeta, metaParams);
    setOpen(false);
    setSelectedMeta(null);
  };

  const handleAppSelect = (template: any) => {
    const resolved = resolveAppTemplate(template.body, contact);
    onInsertAppTemplate(resolved);
    setOpen(false);
  };

  const renderMetaPreview = (template: MetaTemplate) => {
    const body = template.components?.find((c: any) => c.type === 'BODY');
    let text = body?.text || 'No preview available';
    Object.entries(metaParams).forEach(([key, value]) => { text = text.replace(key, value || key); });
    text = mapNamedVariables(text, contact);
    return text;
  };

  const filteredMeta = metaTemplates.filter(t => 
    t.name.toLowerCase().includes(metaSearch.toLowerCase())
  );
  const filteredApp = appTemplates.filter(t => 
    t.name.toLowerCase().includes(appSearch.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" title="Templates">
          <FileText className="h-6 w-6 text-muted-foreground" strokeWidth={2.25} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle>Templates</DialogTitle>
        </DialogHeader>

        {selectedMeta ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-6 pb-6">
            <div className="flex-1 min-h-0 overflow-y-auto pr-2" style={{ maxHeight: 'calc(85vh - 180px)' }}>
              <div className="space-y-4 pb-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium truncate">{selectedMeta.name}</h3>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedMeta(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Template preview */}
                <div className="p-4 bg-muted rounded-lg max-h-[200px] overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap break-words" style={{ overflowWrap: 'anywhere' }}>
                    {renderMetaPreview(selectedMeta)}
                  </p>
                </div>

                {/* Template Parameters */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Template Parameters</h4>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {Object.entries(metaParams).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground w-16 shrink-0">{key}</span>
                        <Input 
                          value={value} 
                          onChange={(e) => setMetaParams({ ...metaParams, [key]: e.target.value })} 
                          placeholder={`Value for ${key}`}
                        />
                      </div>
                    ))}
                  </div>
                  
                  {unmappedVars.length > 0 && Object.keys(mappings).length > 0 && (
                    <div className="flex items-center gap-2 text-destructive text-sm mt-3">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>Variables {unmappedVars.map(v => `{{${v}}}`).join(', ')} not mapped. Go to Settings → Template Mapping.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Fixed action buttons at bottom */}
            <div className="flex justify-end gap-2 pt-4 border-t shrink-0">
              <Button variant="outline" onClick={() => setSelectedMeta(null)}>Back</Button>
              <Button onClick={handleMetaConfirm}>Send Template</Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-6 pb-6">
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'meta' | 'app')} className="flex flex-col flex-1 min-h-0">
              <TabsList className="grid w-full grid-cols-2 shrink-0">
                <TabsTrigger value="meta">Meta Templates</TabsTrigger>
                <TabsTrigger value="app">App Templates</TabsTrigger>
              </TabsList>

              <TabsContent value="meta" className="mt-3 flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="relative shrink-0 mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={metaSearch} onChange={(e) => setMetaSearch(e.target.value)} placeholder="Search meta templates..." className="pl-9" />
                </div>
                
                <div className="flex-1 min-h-0 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 200px)' }}>
                  {metaLoading ? (
                    <div className="text-center py-8 text-muted-foreground">Loading...</div>
                  ) : filteredMeta.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No Meta templates found</p>
                      <p className="text-xs mt-1">{metaSearch ? 'Try different search terms' : 'Connect to WhatsApp API and sync templates first'}</p>
                    </div>
                  ) : (
                    <div className="space-y-2 pb-4">
                      {filteredMeta.map(t => (
                        <button 
                          key={t.id} 
                          onClick={() => handleSelectMeta(t)} 
                          className="w-full text-left p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">{t.name}</span>
                            <Badge variant={t.status === 'APPROVED' ? 'default' : 'secondary'}>{t.status}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {t.components?.find((c: any) => c.type === 'BODY')?.text || 'No preview'}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="app" className="mt-3 flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="relative shrink-0 mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={appSearch} onChange={(e) => setAppSearch(e.target.value)} placeholder="Search app templates..." className="pl-9" />
                </div>
                
                <div className="flex-1 min-h-0 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 200px)' }}>
                  {appLoading ? (
                    <div className="text-center py-8 text-muted-foreground">Loading...</div>
                  ) : filteredApp.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No App templates found</p>
                      <p className="text-xs mt-1">{appSearch ? 'Try different search terms' : 'Create templates in Settings → App Templates'}</p>
                    </div>
                  ) : (
                    <div className="space-y-2 pb-4">
                      {filteredApp.map(t => (
                        <button 
                          key={t.id} 
                          onClick={() => handleAppSelect(t)} 
                          className="w-full text-left p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                        >
                          <div className="font-medium mb-1">{t.name}</div>
                          <p className="text-sm text-muted-foreground line-clamp-2">{t.body}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
