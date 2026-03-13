// @ts-nocheck
import { useState, useEffect } from 'react';
import { Save, Trash2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface Template {
  id: string;
  name: string;
  components: any;
  status: string;
}

interface Mapping {
  variable_number: number;
  mapped_field: string;
}

// Static CRM fields
const STATIC_FIELDS = [
  { value: 'customer_name', label: 'Customer Name' },
  { value: 'loan_id', label: 'Loan ID' },
  { value: 'amount', label: 'Amount' },
  { value: 'payment_details', label: 'Payment Details' },
  { value: 'app_name', label: 'App Name' },
  { value: 'due_date', label: 'Due Date' },
  { value: 'phone_number', label: 'Phone Number' },
  { value: 'day_type', label: 'Day Type' },
  { value: 'current_date', label: 'Current Date (auto)' },
];

function extractVariables(text: string): number[] {
  const matches = text.match(/\{\{(\d+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => parseInt(m.replace(/[{}]/g, ''))))].sort((a, b) => a - b);
}

export function TemplateMappingSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [variables, setVariables] = useState<number[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templateText, setTemplateText] = useState('');
  const [appTemplates, setAppTemplates] = useState<{ id: string; name: string; body: string }[]>([]);

  useEffect(() => {
    if (user) {
      fetchTemplates();
      fetchAppTemplates();
    }
  }, [user]);

  const fetchTemplates = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from('whatsapp_templates' as any).select('*').eq('user_id', user.id);
    setTemplates((data as any[]) || []);
    setLoading(false);
  };

  const fetchAppTemplates = async () => {
    if (!user) return;
    const { data } = await supabase.from('app_templates' as any).select('*').eq('user_id', user.id).order('name');
    setAppTemplates((data as any[]) || []);
  };

  // Build the full list of available data fields including app templates
  const getDataFields = () => {
    const fields = [...STATIC_FIELDS];
    appTemplates.forEach(t => {
      fields.push({ value: `app_template:${t.name}`, label: `📝 ${t.name}` });
    });
    return fields;
  };

  const handleSelectTemplate = async (templateName: string) => {
    setSelectedTemplate(templateName);
    const template = templates.find(t => t.name === templateName);
    if (!template) return;

    const body = template.components?.find((c: any) => c.type === 'BODY');
    const text = body?.text || '';
    setTemplateText(text);
    const vars = extractVariables(text);
    setVariables(vars);

    if (!user) return;
    const { data } = await supabase
      .from('template_mappings' as any)
      .select('*')
      .eq('user_id', user.id)
      .eq('template_name', templateName);

    const existing = (data as any[]) || [];
    const newMappings = vars.map(v => {
      const found = existing.find((m: any) => m.variable_number === v);
      return { variable_number: v, mapped_field: found?.mapped_field || '' };
    });
    setMappings(newMappings);
  };

  const updateMapping = (varNum: number, field: string) => {
    setMappings(prev => prev.map(m =>
      m.variable_number === varNum ? { ...m, mapped_field: field } : m
    ));
  };

  const usedFields = mappings.filter(m => m.mapped_field).map(m => m.mapped_field);
  const dataFields = getDataFields();

  const handleSave = async () => {
    if (!user || !selectedTemplate) return;

    const unmapped = mappings.find(m => !m.mapped_field);
    if (unmapped) {
      toast({ title: `Variable {{${unmapped.variable_number}}} not mapped`, variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await supabase
        .from('template_mappings' as any)
        .delete()
        .eq('user_id', user.id)
        .eq('template_name', selectedTemplate);

      if (mappings.length > 0) {
        const { error } = await supabase.from('template_mappings' as any).insert(
          mappings.map(m => ({
            user_id: user.id,
            template_name: selectedTemplate,
            variable_number: m.variable_number,
            mapped_field: m.mapped_field,
          }))
        );
        if (error) throw error;
      }

      toast({ title: 'Template mapping saved' });
    } catch (err: any) {
      toast({ title: 'Failed to save mapping', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMapping = async () => {
    if (!user || !selectedTemplate) return;
    await supabase
      .from('template_mappings' as any)
      .delete()
      .eq('user_id', user.id)
      .eq('template_name', selectedTemplate);
    setMappings(prev => prev.map(m => ({ ...m, mapped_field: '' })));
    toast({ title: 'Mapping cleared' });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Template Variable Mapping</h3>
        <p className="text-sm text-muted-foreground">
          Map template variables ({"{{1}}"}, {"{{2}}"}, etc.) to your CRM data fields. This controls what data is inserted when sending templates.
        </p>
      </div>

      {/* Template selector */}
      <div>
        <label className="text-sm font-medium mb-2 block">Select Template</label>
        <Select value={selectedTemplate || ''} onValueChange={handleSelectTemplate}>
          <SelectTrigger>
            <SelectValue placeholder={loading ? 'Loading...' : 'Choose a template'} />
          </SelectTrigger>
          <SelectContent>
            {templates.map(t => (
              <SelectItem key={t.id} value={t.name}>
                <div className="flex items-center gap-2">
                  <span>{t.name}</span>
                  <Badge variant={t.status === 'APPROVED' ? 'default' : 'secondary'} className="text-[10px]">{t.status}</Badge>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedTemplate && (
        <>
          {/* Template preview */}
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-xs font-medium text-muted-foreground mb-1">Template Body</p>
            <p className="text-sm whitespace-pre-wrap">{templateText}</p>
          </div>

          {/* Variable mappings */}
          {variables.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <p className="text-sm">No variables detected in this template.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Variable Mappings</h4>
              {mappings.map(mapping => (
                <div key={mapping.variable_number} className="flex items-center gap-3">
                  <div className="w-16 shrink-0">
                    <Badge variant="outline" className="font-mono">{`{{${mapping.variable_number}}}`}</Badge>
                  </div>
                  <span className="text-muted-foreground">→</span>
                  <Select
                    value={mapping.mapped_field}
                    onValueChange={(val) => updateMapping(mapping.variable_number, val)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select data field..." />
                    </SelectTrigger>
                    <SelectContent>
                      {dataFields.map(field => (
                        <SelectItem
                          key={field.value}
                          value={field.value}
                          disabled={usedFields.includes(field.value) && mapping.mapped_field !== field.value}
                        >
                          {field.label}
                          {usedFields.includes(field.value) && mapping.mapped_field !== field.value && ' (used)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}

              {/* Unmapped warning */}
              {mappings.some(m => !m.mapped_field) && (
                <div className="flex items-center gap-2 text-amber-600 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>All variables must be mapped before sending.</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Mapping'}
                </Button>
                <Button variant="outline" onClick={handleDeleteMapping}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {templates.length === 0 && !loading && (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No templates found.</p>
          <p className="text-xs mt-1">Go to WhatsApp API settings and sync your templates first.</p>
        </div>
      )}
    </div>
  );
}
