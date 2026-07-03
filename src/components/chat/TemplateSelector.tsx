// @ts-nocheck
import { useState, useEffect } from 'react';
import { FileText, Search, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Template {
  id: string; template_id: string; name: string; language: string; category: string; status: string; components: any;
}

interface TemplateSelectorProps {
  contact: { loanId: string; name: string; phone: string; amount?: number; appType?: string; dayType?: number; accountDetails?: { bank: string; accountNumber: string; accountName: string }[] };
  onSelectTemplate: (template: Template, params: Record<string, string>) => void;
}

// Resolve a mapped field name to actual contact data
function resolveField(field: string, contact: TemplateSelectorProps['contact']): string {
  const paymentDetails = contact.accountDetails?.length
    ? contact.accountDetails.map(a => `${a.bank} - ${a.accountNumber} (${a.accountName})`).join('; ')
    : '';

  switch (field) {
    case 'customer_name': return contact.name;
    case 'loan_id': return contact.loanId;
    case 'amount': return contact.amount?.toString() || '';
    case 'payment_details': return paymentDetails;
    case 'app_name': return contact.appType || '';
    case 'due_date': {
      const dayType = contact.dayType;
      if (dayType === undefined || dayType === null) return '';
      const today = new Date();
      const dueDate = new Date(today);
      dueDate.setDate(today.getDate() - dayType);
      const dd = String(dueDate.getDate()).padStart(2, '0');
      const mm = String(dueDate.getMonth() + 1).padStart(2, '0');
      const yyyy = dueDate.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
    case 'phone_number': return contact.phone;
    case 'day_type': return contact.dayType?.toString() || '';
    default: return '';
  }
}

// Also support named variables like {{customer_name}} for backward compat
function mapNamedVariables(text: string, contact: TemplateSelectorProps['contact']): string {
  const paymentDetails = contact.accountDetails?.length
    ? contact.accountDetails.map(a => `${a.bank} - ${a.accountNumber} (${a.accountName})`).join('; ')
    : '';

  const calculateDue = (dayType: number | undefined): string => {
    if (dayType === undefined || dayType === null) return '';
    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(today.getDate() - dayType);
    const dd = String(dueDate.getDate()).padStart(2, '0');
    const mm = String(dueDate.getMonth() + 1).padStart(2, '0');
    const yyyy = dueDate.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  return text
    .replace(/\{\{customer_name\}\}/gi, contact.name)
    .replace(/\{\{loan_id\}\}/gi, contact.loanId)
    .replace(/\{\{amount\}\}/gi, contact.amount?.toString() || '')
    .replace(/\{\{payment_details\}\}/gi, paymentDetails)
    .replace(/\{\{app_name\}\}/gi, contact.appType || '')
    .replace(/\{\{due_date\}\}/gi, calculateDue(contact.dayType))
    .replace(/\{\{day_type\}\}/gi, contact.dayType?.toString() || '')
    .replace(/\{\{current_date\}\}/gi, new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))
    .replace(/\{\{phone_number\}\}/gi, contact.phone);
}

export function TemplateSelector({ contact, onSelectTemplate }: TemplateSelectorProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [mappings, setMappings] = useState<Record<number, string>>({});
  const [unmappedVars, setUnmappedVars] = useState<number[]>([]);

  useEffect(() => { if (open && user) fetchTemplates(); }, [open, user]);

  const fetchTemplates = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('whatsapp_templates' as any).select('*').eq('user_id', user.id);
      if (error) throw error;
      setTemplates((data as any[]) || []);
    } catch (error) { console.error('Error fetching templates:', error); }
    finally { setLoading(false); }
  };

  const handleSelectTemplate = async (template: Template) => {
    setSelectedTemplate(template);

    // Load mappings from database
    if (!user) return;
    const { data: mappingData } = await supabase
      .from('template_mappings' as any)
      .select('*')
      .eq('user_id', user.id)
      .eq('template_name', template.name);

    const dbMappings: Record<number, string> = {};
    ((mappingData as any[]) || []).forEach((m: any) => {
      dbMappings[m.variable_number] = m.mapped_field;
    });
    setMappings(dbMappings);

    // Extract variables from template body
    const body = template.components?.find((c: any) => c.type === 'BODY');
    const text = body?.text || '';
    const varMatches: string[] = text.match(/\{\{(\d+)\}\}/g) || [];
    const parsedNums = varMatches.map((m: string) => parseInt(m.replace(/[{}]/g, '')));
    const varNums: number[] = parsedNums.filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);

    // Build params from mappings
    const resolvedParams: Record<string, string> = {};
    const unmapped: number[] = [];
    varNums.forEach((num: number) => {
      const field = dbMappings[num];
      if (field) {
        resolvedParams[`{{${num}}}`] = resolveField(field, contact);
      } else {
        resolvedParams[`{{${num}}}`] = '';
        unmapped.push(num);
      }
    });

    // Fallback: if no DB mappings exist, try example-based params
    if (Object.keys(dbMappings).length === 0 && template.components) {
      const components = template.components;
      components.forEach((comp: any) => {
        if (comp.type === 'BODY' && comp.example?.body_text) {
          comp.example.body_text[0]?.forEach((param: string, index: number) => {
            const paramKey = `{{${index + 1}}}`;
            const lower = param.toLowerCase();
            if (lower.includes('name') || lower.includes('customer')) resolvedParams[paramKey] = contact.name;
            else if (lower.includes('loan') || lower.includes('id')) resolvedParams[paramKey] = contact.loanId;
            else if (lower.includes('amount')) resolvedParams[paramKey] = contact.amount?.toString() || '';
            else if (lower.includes('app')) resolvedParams[paramKey] = contact.appType || 'Tloan';
            else if (lower.includes('due') || lower.includes('date')) resolvedParams[paramKey] = resolveField('due_date', contact);
            else if (lower.includes('day')) resolvedParams[paramKey] = contact.dayType?.toString() || '';
            else if ((lower.includes('account') || lower.includes('payment')) && contact.accountDetails?.[0]) {
              resolvedParams[paramKey] = `${contact.accountDetails[0].bank} - ${contact.accountDetails[0].accountNumber} (${contact.accountDetails[0].accountName})`;
            }
            else resolvedParams[paramKey] = param;
          });
        }
      });
    }

    setParams(resolvedParams);
    setUnmappedVars(unmapped);
  };
  
  const handleConfirm = () => {
    if (selectedTemplate) {
      // Block if there are unmapped variables with no values
      const emptyParams = Object.entries(params).filter(([_, v]) => !v);
      if (emptyParams.length > 0 && Object.keys(mappings).length > 0) {
        // Only block if mappings exist but are incomplete
        return;
      }
      onSelectTemplate(selectedTemplate, params);
      setOpen(false);
      setSelectedTemplate(null);
    }
  };

  const filteredTemplates = templates.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const renderTemplatePreview = (template: Template) => {
    const body = template.components?.find((c: any) => c.type === 'BODY');
    let text = body?.text || 'No preview available';
    Object.entries(params).forEach(([key, value]) => { text = text.replace(key, value || key); });
    text = mapNamedVariables(text, contact);
    return text;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
        <DialogHeader><DialogTitle>Send Template Message</DialogTitle></DialogHeader>
        {!selectedTemplate ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search templates..." className="pl-9" />
            </div>
            <ScrollArea className="h-[400px]">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading templates...</div>
              ) : filteredTemplates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No templates found</p>
                  <p className="text-xs mt-1">Connect to WhatsApp API and sync templates first</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredTemplates.map((template) => (
                    <button key={template.id} onClick={() => handleSelectTemplate(template)} className="w-full text-left p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{template.name}</span>
                        <Badge variant={template.status === 'APPROVED' ? 'default' : 'secondary'}>{template.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{template.components?.find((c: any) => c.type === 'BODY')?.text || 'No preview'}</p>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 pr-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium truncate">{selectedTemplate.name}</h3>
                <Button variant="ghost" size="sm" onClick={() => setSelectedTemplate(null)}><X className="h-4 w-4" /></Button>
              </div>
              <div className="p-4 bg-muted rounded-lg overflow-hidden">
                <p className="text-sm whitespace-pre-wrap break-words" style={{ overflowWrap: 'anywhere' }}>{renderTemplatePreview(selectedTemplate)}</p>
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Template Parameters</h4>
                {Object.entries(params).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground w-16 shrink-0">{key}</span>
                    <Input value={value} onChange={(e) => setParams({ ...params, [key]: e.target.value })} placeholder={`Value for ${key}`} />
                  </div>
                ))}
                {unmappedVars.length > 0 && Object.keys(mappings).length > 0 && (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>Variables {unmappedVars.map(v => `{{${v}}}`).join(', ')} not mapped. Go to Settings → Template Mapping.</span>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedTemplate(null)}>Back</Button>
                <Button onClick={handleConfirm}>Send Template</Button>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
