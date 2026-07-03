// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, CheckSquare, MessageCircle, Plus, RotateCcw, Search, Send, Settings2, SortAsc, SortDesc, SquarePen, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/shared/SearchInput';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ChatListItem } from '@/components/chat/ChatListItem';
import { ContactListItem } from '@/components/contacts/ContactListItem';
import { LabelManagerPanel } from '@/components/chat/LabelManagerPanel';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { normalizePhoneNumber, parsePhoneNumbers } from '@/lib/utils/phone';
import { useApps } from '@/hooks/useApps';

type ChatFilter = 'all' | 'unread' | 'archived';
type SortBy = 'recent' | 'name' | 'amount';
type SortDir = 'asc' | 'desc';
type ContactSortBy = 'name' | 'recent' | 'amount' | 'loanId';

interface Label { id: string; name: string; color: string }
interface AppTemplate { id: string; name: string; body: string }
interface MetaTemplate { id: string; name: string; status?: string }

interface ChatListProps {
  onChatSelect?: (chat: any) => void;
  onNewChat?: () => void;
}

const VARIABLE_MAP: Record<string, (c: any) => string> = {
  customer_name: (c) => c.name || '',
  loan_id: (c) => c.loanId || '',
  amount: (c) => c.amount?.toString() || '',
  phone_number: (c) => c.phone || '',
  app_name: (c) => c.appType || '',
  day_type: (c) => c.dayType?.toString() || '',
  payment_details: (c) => {
    const ad = c.accountDetails?.[0];
    if (!ad) return '';
    return `${ad.bank} - ${ad.accountNumber} (${ad.accountName})`;
  },
  // FIX: correctly calculate due_date from dayType (dayType 0 = due today, positive = overdue by N days)
  due_date: (c) => {
    if (c.dayType === undefined || c.dayType === null) return '';
    const today = new Date();
    const due = new Date(today);
    due.setDate(today.getDate() - Number(c.dayType));
    return due.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },
};

const resolveTemplate = (body: string, contact: any): string =>
  body.replace(/\{\{(\w+)\}\}/g, (match, variableName) => VARIABLE_MAP[variableName]?.(contact) || match);

const resolveMappedField = (field: string, contact: any, appTemplatesMap: Record<string, string>) => {
  if (field.startsWith('app_template:')) {
    const templateName = field.replace('app_template:', '');
    return appTemplatesMap[templateName] || '';
  }
  return VARIABLE_MAP[field]?.(contact) || '';
};

const toUtcIsoFromLocalInput = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toDateTimeLocalValue = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toContactModel = (c: any) => ({
  id: c.id, name: c.name, phone: c.phone, loanId: c.loan_id || '',
  amount: c.amount ? Number(c.amount) : undefined,
  appType: c.app_type || 'tloan', dayType: c.day_type ?? 0,
  isDeleted: c.is_deleted || false,
  deletedAt: c.deleted_at ? new Date(c.deleted_at) : undefined,
  createdAt: new Date(c.created_at), updatedAt: new Date(c.updated_at),
  accountDetails: (c.account_details || []).map((ad: any) => ({
    id: ad.id, bank: ad.bank, accountNumber: ad.account_number, accountName: ad.account_name,
  })),
});

export function ChatList({ onChatSelect, onNewChat }: ChatListProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    viewMode, setViewMode, chats, contacts, activeChat, setActiveChat, searchQuery, setSearchQuery,
    setShowAddContactModal, favorites, deleteContact, updateContact, addContacts, addMessage, setContacts, setChats,
  } = useAppStore();

  const [chatFilter, setChatFilter] = useState<ChatFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [contactSortBy, setContactSortBy] = useState<ContactSortBy>('name');
  const [contactSortDir, setContactSortDir] = useState<SortDir>('asc');
  const [contactAppTypeFilter, setContactAppTypeFilter] = useState('all');
  const [contactDayTypeFilter, setContactDayTypeFilter] = useState('all');

  const [labels, setLabels] = useState<Label[]>([]);
  const [chatLabelMap, setChatLabelMap] = useState<Record<string, string[]>>({});
  const [showLabelManager, setShowLabelManager] = useState(false);

  const [contactSelectionMode, setContactSelectionMode] = useState(false);
  const [chatSelectionMode, setChatSelectionMode] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);

  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [bulkStep, setBulkStep] = useState<'recipients' | 'templates'>('recipients');
  const [bulkSource, setBulkSource] = useState<'app' | 'meta'>('app');
  const [appTemplates, setAppTemplates] = useState<AppTemplate[]>([]);
  const [metaTemplates, setMetaTemplates] = useState<MetaTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [sendingBulk, setSendingBulk] = useState(false);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [bulkAppType, setBulkAppType] = useState('');
  // Day type override in bulk send — defaults to 0 (due today)
  const [bulkDayType, setBulkDayType] = useState('0');
  const [bulkSelectedLabelIds, setBulkSelectedLabelIds] = useState<string[]>([]);
  const [bulkMetaSearch, setBulkMetaSearch] = useState('');
  const [bulkAppSearch, setBulkAppSearch] = useState('');
  const [showTrash, setShowTrash] = useState(false);
  const [bulkScheduleAt, setBulkScheduleAt] = useState('');
  const [bulkNumbers, setBulkNumbers] = useState('');

  const listContainerRef = useRef<HTMLDivElement | null>(null);

  const bulkFilteredMeta = metaTemplates.filter(t => t.name.toLowerCase().includes(bulkMetaSearch.toLowerCase()));
  const bulkFilteredApp = appTemplates.filter(t => t.name.toLowerCase().includes(bulkAppSearch.toLowerCase()));
  const bulkParsedNumbers = parsePhoneNumbers(bulkNumbers);
  const bulkRecipientCount = Array.from(new Set([...selectedContactIds, ...bulkParsedNumbers])).length;
  const { apps: userApps } = useApps();
  const appChoices = useMemo(() => {
    const fromSettings = userApps.map((a) => a.name.toLowerCase());
    const fromContacts = contacts.map((c) => (c.appType || '').toLowerCase()).filter(Boolean);
    return Array.from(new Set([...fromSettings, ...fromContacts]));
  }, [contacts, userApps]);
  const appTemplatesMap = useMemo(() => Object.fromEntries(appTemplates.map((template) => [template.name, template.body])), [appTemplates]);

  const fetchLabels = useCallback(async () => {
    if (!user) return;
    const [labelsRes, chatLabelsRes] = await Promise.all([
      supabase.from('labels' as any).select('*').eq('user_id', user.id),
      supabase.from('chat_labels' as any).select('*').eq('user_id', user.id),
    ]);

    setLabels(((labelsRes.data as any[]) || []) as Label[]);
    const map: Record<string, string[]> = {};
    ((chatLabelsRes.data as any[]) || []).forEach((entry: any) => {
      if (!map[entry.chat_id]) map[entry.chat_id] = [];
      map[entry.chat_id].push(entry.label_id);
    });
    setChatLabelMap(map);
  }, [user]);

  const fetchTemplates = useCallback(async () => {
    if (!user) return;
    const [appRes, metaRes] = await Promise.all([
      supabase.from('app_templates' as any).select('*').eq('user_id', user.id).order('name'),
      supabase.from('whatsapp_templates' as any).select('*').eq('user_id', user.id).order('name'),
    ]);

    setAppTemplates((appRes.data as any[]) || []);
    setMetaTemplates((((metaRes.data as any[]) || []).filter((t: any) => t.status === 'APPROVED')));
  }, [user]);

  useEffect(() => { fetchLabels(); fetchTemplates(); }, [fetchLabels, fetchTemplates]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`labels-sync-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'labels', filter: `user_id=eq.${user.id}` }, fetchLabels)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_labels', filter: `user_id=eq.${user.id}` }, fetchLabels)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchLabels]);

  const archivedCount = chats.filter((c) => c.isArchived || c.contact.isArchived).length;
  const unreadCount = chats.filter((c) => c.unreadCount > 0).length;

  const filteredChats = chats
    .filter((chat) => {
      if (showTrash !== !!chat.contact.isDeleted) return false;
      const matchesSearch = chat.contact.name.toLowerCase().includes(searchQuery.toLowerCase()) || chat.contact.phone.includes(searchQuery);
      if (!matchesSearch) return false;
      if (chatFilter === 'archived') return !!(chat.isArchived || chat.contact.isArchived);
      if (chat.isArchived || chat.contact.isArchived) return false;
      if (chatFilter === 'unread' && chat.unreadCount <= 0) return false;
      if (selectedLabelId) return (chatLabelMap[chat.id] || []).includes(selectedLabelId);
      return true;
    })
    .sort((a, b) => {
      if ((favorites[b.id] ? 1 : 0) !== (favorites[a.id] ? 1 : 0)) return (favorites[b.id] ? 1 : 0) - (favorites[a.id] ? 1 : 0);
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      let cmp = 0;
      if (sortBy === 'name') cmp = a.contact.name.localeCompare(b.contact.name);
      else if (sortBy === 'amount') cmp = (a.contact.amount || 0) - (b.contact.amount || 0);
      else cmp = (b.lastMessage?.timestamp.getTime() || b.contact.createdAt.getTime()) - (a.lastMessage?.timestamp.getTime() || a.contact.createdAt.getTime());

      return sortDir === 'asc' ? cmp : (sortBy === 'recent' ? cmp : -cmp);
    });

  const appTypeOptions = useMemo(() => ['all', ...Array.from(new Set([...userApps.map(a => a.name.toLowerCase()), ...contacts.map((c) => (c.appType || '').toLowerCase()).filter(Boolean)]))], [contacts, userApps]);
  const dayTypeOptions = useMemo(() => ['all', ...Array.from(new Set(contacts.map((c) => String(c.dayType ?? '0'))))], [contacts]);

  // Seed bulk app default from first user app once loaded
  useEffect(() => {
    if (!bulkAppType && userApps.length > 0) setBulkAppType(userApps[0].name.toLowerCase());
  }, [userApps, bulkAppType]);

  const filteredContacts = contacts
    .filter((contact) => showTrash === !!contact.isDeleted)
    .filter((contact) => contact.name.toLowerCase().includes(searchQuery.toLowerCase()) || contact.phone.includes(searchQuery) || contact.loanId.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter((contact) => contactAppTypeFilter === 'all' ? true : (contact.appType || '').toLowerCase() === contactAppTypeFilter)
    .filter((contact) => contactDayTypeFilter === 'all' ? true : String(contact.dayType ?? '0') === contactDayTypeFilter)
    .sort((a, b) => {
      let cmp = 0;
      if (contactSortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (contactSortBy === 'amount') cmp = (a.amount || 0) - (b.amount || 0);
      else if (contactSortBy === 'loanId') cmp = a.loanId.localeCompare(b.loanId);
      else cmp = b.createdAt.getTime() - a.createdAt.getTime();
      return contactSortDir === 'asc' ? cmp : -cmp;
    });

  const toggleContactSelection = (id: string) => {
    setSelectedContactIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const toggleChatSelection = (id: string) => {
    setSelectedContactIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const openBulkDialog = (step: 'recipients' | 'templates' = 'recipients') => {
    setBulkStep(step);
    setSelectedTemplateId('');
    setShowBulkDialog(true);
  };

  const handleDeleteSelectedContacts = async () => {
    if (!user || selectedContactIds.length === 0) return;
    const { error } = await supabase.from('contacts').update({ is_deleted: true, deleted_at: new Date().toISOString() } as any).eq('user_id', user.id).in('id', selectedContactIds as any);
    if (error) {
      toast({ title: 'Failed to delete selected contacts', description: error.message, variant: 'destructive' });
      return;
    }

    selectedContactIds.forEach((id) => deleteContact(id));
    setSelectedContactIds([]);
    setContactSelectionMode(false);
    toast({ title: 'Selected contacts moved to trash' });
  };

  const handleRestoreContacts = async (ids: string[]) => {
    if (!user || ids.length === 0) return;
    const { error } = await supabase.from('contacts').update({ is_deleted: false, deleted_at: null } as any).eq('user_id', user.id).in('id', ids as any);
    if (error) return toast({ title: 'Failed to restore', description: error.message, variant: 'destructive' });
    ids.forEach((id) => updateContact(id, { isDeleted: false, deletedAt: undefined } as any));
    setSelectedContactIds([]);
    setChatSelectionMode(false);
    setContactSelectionMode(false);
    toast({ title: ids.length > 1 ? 'Chats restored' : 'Chat restored' });
  };

  const [confirmPermDelete, setConfirmPermDelete] = useState<{ ids: string[] } | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState<{ ids: string[] } | null>(null);

  const handlePermanentDeleteContacts = async (ids: string[]) => {
    if (!user || ids.length === 0) return;
    await supabase.from('messages').delete().eq('user_id', user.id).in('contact_id', ids as any);
    await supabase.from('chat_labels' as any).delete().eq('user_id', user.id).in('chat_id', ids as any);
    await supabase.from('account_details').delete().in('contact_id', ids as any);
    const { error } = await supabase.from('contacts').delete().eq('user_id', user.id).in('id', ids as any);
    if (error) return toast({ title: 'Failed to delete permanently', description: error.message, variant: 'destructive' });
    setContacts(contacts.filter((contact) => !ids.includes(contact.id)));
    setChats(chats.filter((chat) => !ids.includes(chat.id)));
    setSelectedContactIds([]);
    setChatSelectionMode(false);
    setContactSelectionMode(false);
    toast({ title: ids.length > 1 ? 'Chats permanently deleted' : 'Chat permanently deleted' });
  };

  const handleBulkArchive = async (archive: boolean) => {
    if (!user || selectedContactIds.length === 0) return;
    const { error } = await supabase.from('contacts').update({ is_archived: archive } as any).eq('user_id', user.id).in('id', selectedContactIds as any);
    if (error) return toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
    selectedContactIds.forEach((id) => updateContact(id, { isArchived: archive } as any));
    setSelectedContactIds([]);
    setChatSelectionMode(false);
    toast({ title: archive ? `Archived ${selectedContactIds.length} chat(s)` : `Unarchived ${selectedContactIds.length} chat(s)` });
  };

  const handleBulkSoftDeleteChats = async (ids: string[]) => {
    if (!user || ids.length === 0) return;
    const { error } = await supabase.from('contacts').update({ is_deleted: true, deleted_at: new Date().toISOString() } as any).eq('user_id', user.id).in('id', ids as any);
    if (error) return toast({ title: 'Failed to delete', description: error.message, variant: 'destructive' });
    ids.forEach((id) => deleteContact(id));
    setSelectedContactIds([]);
    setChatSelectionMode(false);
    toast({ title: `Moved ${ids.length} chat(s) to trash` });
  };

  const createOrUpdateBulkContacts = async () => {
    if (!user) return [];
    const manualNumbers = bulkParsedNumbers;
    const selectedContacts = contacts.filter((contact) => selectedContactIds.includes(contact.id));
    const selectedNumbers = selectedContacts.map((contact) => normalizePhoneNumber(contact.phone));
    const allNumbers = Array.from(new Set([...selectedNumbers, ...manualNumbers])).filter(Boolean);

    const savedContacts: any[] = [];
    const labelInserts: any[] = [];
    for (const phone of allNumbers) {
      const selected = selectedContacts.find((contact) => normalizePhoneNumber(contact.phone) === phone);
      const { data: existingContact, error: findError } = await supabase
        .from('contacts')
        .select('*, account_details(*)')
        .eq('user_id', user.id)
        .eq('phone', phone)
        .maybeSingle();
      if (findError) throw findError;

      const payload = {
        user_id: user.id,
        phone,
        name: selected?.name || existingContact?.name || phone,
        loan_id: selected?.loanId || existingContact?.loan_id || '',
        amount: selected?.amount ?? existingContact?.amount ?? null,
        app_type: bulkAppType || selected?.appType || existingContact?.app_type || 'tloan',
        // apply bulkDayType — always a number, defaults to 0 for new contacts, keeps existing for pre-existing ones when user hasn't changed it
        day_type: bulkDayType !== '' ? Number(bulkDayType) : (selected?.dayType ?? existingContact?.day_type ?? 0),
        is_deleted: false,
        deleted_at: null,
      };

      const { data: savedContact, error: saveError } = existingContact
        ? await supabase.from('contacts').update(payload).eq('id', existingContact.id).select('*, account_details(*)').maybeSingle()
        : await supabase.from('contacts').insert(payload).select('*, account_details(*)').maybeSingle();
      if (saveError) throw saveError;
      if (savedContact) {
        savedContacts.push(savedContact);
        bulkSelectedLabelIds.forEach((labelId) => labelInserts.push({ user_id: user.id, chat_id: savedContact.id, label_id: labelId }));
      }
    }

    if (labelInserts.length > 0) {
      const { data: existingLabels } = await supabase
        .from('chat_labels' as any)
        .select('chat_id,label_id')
        .eq('user_id', user.id)
        .in('chat_id', savedContacts.map((contact) => contact.id) as any);
      const existingLabelKeys = new Set(((existingLabels || []) as any[]).map((label) => `${label.chat_id}:${label.label_id}`));
      const labelsToInsert = labelInserts.filter((label) => !existingLabelKeys.has(`${label.chat_id}:${label.label_id}`));
      if (labelsToInsert.length > 0) await supabase.from('chat_labels' as any).insert(labelsToInsert);
    }

    const contactModels = savedContacts.map(toContactModel);
    if (contactModels.length > 0) addContacts(contactModels);
    await fetchLabels();
    return contactModels;
  };

  const handleBulkTemplateSend = async () => {
    if (!user || !selectedTemplateId || bulkRecipientCount === 0) return;
    setSendingBulk(true);
    let sentCount = 0;
    let failedCount = 0;
    const failReasons: string[] = [];
    try {
      const { data: settings } = await supabase.from('whatsapp_settings').select('*').eq('user_id', user.id).maybeSingle();
      if (!settings?.api_token || !settings?.phone_number_id) {
        toast({ title: 'WhatsApp not configured', variant: 'destructive' });
        return;
      }

      const selectedContacts = await createOrUpdateBulkContacts();
      const appTemplate = appTemplates.find((t) => t.id === selectedTemplateId);
      const metaTemplate = metaTemplates.find((t) => t.id === selectedTemplateId);
      const scheduledAtIso = bulkScheduleAt ? toUtcIsoFromLocalInput(bulkScheduleAt) : null;
      if (bulkScheduleAt && !scheduledAtIso) {
        toast({ title: 'Invalid schedule time', variant: 'destructive' });
        return;
      }

      if (bulkSource === 'app' && appTemplate) {
        for (const contact of selectedContacts) {
          const normalizedPhone = normalizePhoneNumber(contact.phone);
          const content = resolveTemplate(appTemplate.body, contact);
          try {
            if (scheduledAtIso) {
              const { error: scheduleError } = await supabase.from('scheduled_messages' as any).insert({
                user_id: user.id, contact_id: contact.id, content, type: 'text', scheduled_at: scheduledAtIso, status: 'pending',
              } as any);
              if (scheduleError) throw scheduleError;
              sentCount++;
              continue;
            }

            const { data, error } = await supabase.functions.invoke('whatsapp-api', {
              body: {
                action: 'send_message', token: settings.api_token, phoneNumberId: settings.phone_number_id,
                to: normalizedPhone, type: 'text', content,
              },
            });

            const success = !error && data?.success;
            const status = success ? 'sent' : 'failed';
            const failReason = data?.error || error?.message || '';

            if (success) sentCount++;
            else {
              failedCount++;
              console.error('Bulk app template send failed', { contactId: contact.id, phone: normalizedPhone, error: failReason, response: data });
              if (failReason) failReasons.push(`${contact.name}: ${failReason}`);
            }

            const { data: msgData } = await supabase.from('messages').insert({
              user_id: user.id, contact_id: contact.id, content, type: 'text',
              status, is_outgoing: true, whatsapp_message_id: data?.messageId || null,
            }).select().maybeSingle();

            if (msgData) {
              addMessage(contact.id, {
                id: msgData.id, contactId: msgData.contact_id, content, type: 'text', status,
                isOutgoing: true, timestamp: new Date(msgData.created_at), whatsappMessageId: data?.messageId,
              });
            }
          } catch (err: any) {
            failedCount++;
            console.error('Bulk app template send exception', { contactId: contact.id, phone: normalizedPhone, error: err });
            failReasons.push(`${contact.name}: ${err.message}`);
          }
        }
      }

      if (bulkSource === 'meta' && metaTemplate) {
        const body = (metaTemplate as any).components?.find?.((c: any) => c.type === 'BODY');
        const previewText = body?.text || metaTemplate.name;

        // Fetch template mappings ONCE
        const { data: mappings } = await supabase
          .from('template_mappings')
          .select('*')
          .eq('user_id', user.id)
          .eq('template_name', metaTemplate.name)
          .order('variable_number', { ascending: true });

        const varMatches = (previewText || '').match(/\{\{\d+\}\}/g) || [];
        const requiredVarCount = varMatches.length;

        if (requiredVarCount > 0 && (!mappings || mappings.length < requiredVarCount)) {
          toast({
            title: 'Template mapping incomplete',
            description: `Please configure parameter mapping for "${metaTemplate.name}" before sending.`,
            variant: 'destructive',
          });
          setSendingBulk(false);
          return;
        }

        for (const contact of selectedContacts) {
          const normalizedPhone = normalizePhoneNumber(contact.phone);

          const templateParams: Record<string, string> = {};
          let hasEmptyParam = false;

          for (const m of (mappings || [])) {
            const fieldKey = (m as any).mapped_field;
            const value = resolveMappedField(fieldKey, contact, appTemplatesMap);
            if (!value) {
              failedCount++;
              failReasons.push(`${contact.name}: Missing field "${fieldKey}"`);
              hasEmptyParam = true;
              break;
            }
            templateParams[`{{${(m as any).variable_number}}}`] = value;
          }

          if (hasEmptyParam) continue;

          try {
            if (scheduledAtIso) {
              let resolvedText = previewText;
              Object.entries(templateParams).forEach(([key, value]) => { resolvedText = resolvedText.replace(key, value || key); });
              const { error: scheduleError } = await supabase.from('scheduled_messages' as any).insert({
                user_id: user.id, contact_id: contact.id, content: resolvedText,
                type: 'template', template_name: metaTemplate.name, template_language: (metaTemplate as any).language || 'en',
                template_params: templateParams, scheduled_at: scheduledAtIso, status: 'pending',
              } as any);
              if (scheduleError) throw scheduleError;
              sentCount++;
              continue;
            }

            const { data, error } = await supabase.functions.invoke('whatsapp-api', {
              body: {
                action: 'send_message', token: settings.api_token, phoneNumberId: settings.phone_number_id,
                to: normalizedPhone, type: 'template', templateName: metaTemplate.name,
                templateParams, templateLanguage: (metaTemplate as any).language || 'en',
              },
            });

            const success = !error && data?.success;
            const status = success ? 'sent' : 'failed';
            const failReason = data?.error || error?.message || '';

            if (success) sentCount++;
            else {
              failedCount++;
              console.error('Bulk meta template send failed', { contactId: contact.id, phone: normalizedPhone, template: metaTemplate.name, error: failReason, response: data });
              if (failReason) failReasons.push(`${contact.name}: ${failReason}`);
            }

            // Resolve template text with actual values
            let resolvedText = previewText;
            Object.entries(templateParams).forEach(([key, value]) => {
              resolvedText = resolvedText.replace(key, value || key);
            });

            const { data: msgData } = await supabase.from('messages').insert({
              user_id: user.id, contact_id: contact.id, content: resolvedText,
              type: 'template', status, is_outgoing: true,
              whatsapp_message_id: data?.messageId || null, template_name: metaTemplate.name,
              template_params: templateParams,
            }).select().maybeSingle();

            if (msgData) {
              addMessage(contact.id, {
                id: msgData.id, contactId: msgData.contact_id, content: resolvedText,
                type: 'template', status, isOutgoing: true,
                timestamp: new Date(msgData.created_at), whatsappMessageId: data?.messageId,
              });
            }
          } catch (err: any) {
            failedCount++;
            console.error('Bulk meta template send exception', { contactId: contact.id, phone: normalizedPhone, template: metaTemplate.name, error: err });
            failReasons.push(`${contact.name}: ${err.message}`);
          }
        }
      }

      // Show detailed results
      if (failedCount === 0) {
        toast({ title: scheduledAtIso ? `✅ Scheduled for ${sentCount} contact(s)` : `✅ Sent to ${sentCount} contact(s)`, duration: 4000 });
      } else {
        toast({
          title: `⚠️ ${sentCount} sent, ${failedCount} failed`,
          description: failReasons.slice(0, 3).join('\n') + (failReasons.length > 3 ? `\n...and ${failReasons.length - 3} more` : ''),
          variant: 'destructive',
          duration: 10000,
        });
      }

      setSelectedContactIds([]);
      setBulkNumbers('');
      setBulkSelectedLabelIds([]);
      // reset day type after send
      setBulkDayType('0');
      setContactSelectionMode(false);
      setShowBulkDialog(false);
      setBulkStep('recipients');
      setBulkScheduleAt('');
    } catch (error: any) {
      toast({ title: 'Bulk send failed', description: error.message, variant: 'destructive' });
    } finally {
      setSendingBulk(false);
    }
  };

  const handleBulkRecipientsNext = async () => {
    if (bulkRecipientCount === 0) return;
    setSendingBulk(true);
    try {
      await createOrUpdateBulkContacts();
      setBulkStep('templates');
      toast({ title: `Prepared ${bulkRecipientCount} contact(s)` });
    } catch (error: any) {
      toast({ title: 'Failed to prepare contacts', description: error.message, variant: 'destructive' });
    } finally {
      setSendingBulk(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-panel border-r border-panel-border">
      <div className="flex items-center justify-between px-4 pt-3 pb-1 bg-panel shrink-0">
        <h1 className="text-[32px] sm:text-[28px] font-extrabold tracking-tight text-foreground ios-header">{showTrash ? 'Trash' : viewMode === 'contacts' ? 'Contacts' : 'Chats'}</h1>
        <div className="flex items-center gap-1">
          {viewMode === 'chats' && (
            <>
              <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => openBulkDialog('recipients')}><Send className="h-5 w-5 stroke-[2.8px]" /></Button>
              <Button variant={chatSelectionMode && !showTrash ? 'default' : 'ghost'} size="icon" className="h-10 w-10" onClick={() => { if (showTrash) return; setChatSelectionMode((v) => !v); setSelectedContactIds([]); }} title="Select chats"><CheckSquare className="h-5 w-5 stroke-[2.8px]" /></Button>
              <Button variant={showTrash ? 'default' : 'ghost'} size="icon" className="h-10 w-10" onClick={() => setShowTrash((v) => !v)}><Trash2 className="h-5 w-5 stroke-[2.8px]" /></Button>
              <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setShowLabelManager(true)}><Settings2 className="h-5 w-5 stroke-[2.8px]" /></Button>
              <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onNewChat}><SquarePen className="h-5 w-5 stroke-[2.8px]" /></Button>
            </>
          )}
          {viewMode === 'contacts' && (
            <>
              <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setShowAddContactModal(true)}><Plus className="h-5 w-5 stroke-[2.8px]" /></Button>
              <Button variant={contactSelectionMode ? 'default' : 'ghost'} size="icon" className="h-10 w-10" onClick={() => { setContactSelectionMode((v) => !v); setSelectedContactIds([]); }}><CheckSquare className="h-5 w-5" /></Button>
            </>
          )}
        </div>
      </div>

      <div className="px-4 py-2 shrink-0">
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder={viewMode === 'contacts' ? 'Search contacts' : 'Search'} />
      </div>

      {viewMode === 'chats' && !showTrash && (
        <div className="px-4 pb-2 shrink-0 flex flex-wrap gap-2">
          <Button size="sm" variant={chatFilter === 'all' ? 'default' : 'secondary'} className={cn('rounded-full', chatFilter === 'all' && 'text-white')} onClick={() => setChatFilter('all')}>All</Button>
          <Button size="sm" variant={chatFilter === 'unread' ? 'default' : 'secondary'} className={cn('rounded-full flex items-center gap-1', chatFilter === 'unread' && 'text-white')} onClick={() => setChatFilter('unread')}>
            Unread
            {unreadCount > 0 && <span className="text-[11px] font-semibold">{unreadCount}</span>}
          </Button>
          <Button size="sm" variant={chatFilter === 'archived' ? 'default' : 'secondary'} className={cn('rounded-full flex items-center gap-1', chatFilter === 'archived' && 'text-white')} onClick={() => setChatFilter('archived')}>
            <Archive className="h-3.5 w-3.5" />Archived
            {archivedCount > 0 && <span className="text-[11px] font-semibold">{archivedCount}</span>}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="sm" variant="secondary" className="rounded-full"><SortAsc className="h-3.5 w-3.5 mr-1" />Sort</Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setSortBy('recent')}>Recent</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('name')}>Name</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('amount')}>Amount</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}>{sortDir === 'asc' ? 'Descending' : 'Ascending'}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {viewMode === 'chats' && showTrash && (
        <div className="px-4 pb-2 shrink-0 flex items-center gap-2 flex-wrap">
          <Button size="sm" variant={chatSelectionMode ? 'default' : 'outline'} onClick={() => { setChatSelectionMode((v) => !v); setSelectedContactIds([]); }}>
            <CheckSquare className="h-4 w-4 mr-1" />Select
          </Button>
          {chatSelectionMode && (
            <>
              <Button size="sm" variant="outline" onClick={() => setSelectedContactIds(selectedContactIds.length === filteredChats.length ? [] : filteredChats.map((chat) => chat.id))}>{selectedContactIds.length === filteredChats.length ? 'Deselect All' : 'Select All'}</Button>
              <Button size="sm" variant="outline" onClick={() => handleRestoreContacts(selectedContactIds)} disabled={selectedContactIds.length === 0}><RotateCcw className="h-4 w-4 mr-1" />Restore ({selectedContactIds.length})</Button>
              <Button size="sm" variant="destructive" onClick={() => setConfirmPermDelete({ ids: selectedContactIds })} disabled={selectedContactIds.length === 0}><Trash2 className="h-4 w-4 mr-1" />Delete ({selectedContactIds.length})</Button>
            </>
          )}
        </div>
      )}

      {viewMode === 'chats' && !showTrash && chatSelectionMode && (
        <div className="px-4 pb-2 shrink-0 flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setSelectedContactIds(selectedContactIds.length === filteredChats.length ? [] : filteredChats.map((chat) => chat.id))}>
            <CheckSquare className="h-4 w-4 mr-1" />{selectedContactIds.length === filteredChats.length ? 'Deselect All' : 'Select All'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleBulkArchive(true)} disabled={selectedContactIds.length === 0}>
            <Archive className="h-4 w-4 mr-1" />Archive ({selectedContactIds.length})
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setConfirmBulkDelete({ ids: selectedContactIds })} disabled={selectedContactIds.length === 0}>
            <Trash2 className="h-4 w-4 mr-1" />Delete ({selectedContactIds.length})
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setChatSelectionMode(false); setSelectedContactIds([]); }}>Cancel</Button>
        </div>
      )}

      {viewMode === 'contacts' && (
        <div className="px-4 pb-2 shrink-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="sm" variant="secondary" className="rounded-full"><SortAsc className="h-3.5 w-3.5 mr-1" />Sort</Button></DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setContactSortBy('name')}>Name</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setContactSortBy('recent')}>Recent</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setContactSortBy('amount')}>Amount</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setContactSortBy('loanId')}>Loan ID</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setContactSortDir(contactSortDir === 'asc' ? 'desc' : 'asc')}>{contactSortDir === 'asc' ? <><SortDesc className='h-3.5 w-3.5 mr-1' />Descending</> : <><SortAsc className='h-3.5 w-3.5 mr-1' />Ascending</>}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <select value={contactDayTypeFilter} onChange={(e) => setContactDayTypeFilter(e.target.value)} className="h-8 rounded-full px-3 text-xs border bg-secondary">
              {dayTypeOptions.map((v) => <option key={v} value={v}>{v === 'all' ? 'All day types' : `Day ${v}`}</option>)}
            </select>

            <select value={contactAppTypeFilter} onChange={(e) => setContactAppTypeFilter(e.target.value)} className="h-8 rounded-full px-3 text-xs border bg-secondary">
              {appTypeOptions.map((v) => <option key={v} value={v}>{v === 'all' ? 'All app types' : v.toUpperCase()}</option>)}
            </select>
          </div>

          {contactSelectionMode && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => {
                if (selectedContactIds.length === filteredContacts.length) {
                  setSelectedContactIds([]);
                } else {
                  setSelectedContactIds(filteredContacts.map(c => c.id));
                }
              }}>
                <CheckSquare className="h-4 w-4 mr-1" />
                {selectedContactIds.length === filteredContacts.length ? 'Deselect All' : 'Select All'}
              </Button>
              <Button size="sm" variant="destructive" onClick={handleDeleteSelectedContacts} disabled={selectedContactIds.length === 0}><Trash2 className="h-4 w-4 mr-1" />Delete ({selectedContactIds.length})</Button>
              <Button size="sm" onClick={() => { setBulkNumbers(''); openBulkDialog('templates'); }} disabled={selectedContactIds.length === 0}><Send className="h-4 w-4 mr-1" />Message ({selectedContactIds.length})</Button>
            </div>
          )}
        </div>
      )}

      <div ref={listContainerRef} className="flex-1 overflow-y-auto custom-scrollbar">
        {viewMode === 'chats' && (
          filteredChats.length === 0
            ? <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4"><MessageCircle className="h-14 w-14 mb-3 opacity-40" /><p className="text-[15px]">No chats yet</p></div>
            : filteredChats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                isActive={activeChat?.id === chat.id}
                onClick={() => {
                  if (showTrash) return;
                  setActiveChat(chat);
                  onChatSelect?.(chat);
                }}
                chatLabels={labels.filter((l) => (chatLabelMap[chat.id] || []).includes(l.id))}
                allLabels={labels}
                isTrash={showTrash}
                selectionMode={chatSelectionMode}
                selected={selectedContactIds.includes(chat.id)}
                onToggleSelect={toggleChatSelection}
                onEnterSelectionMode={() => setChatSelectionMode(true)}
                onRestore={(id) => handleRestoreContacts([id])}
                onPermanentDelete={(id) => setConfirmPermDelete({ ids: [id] })}
              />
            ))
        )}

        {viewMode === 'contacts' && (
          <>
            <button onClick={() => setShowAddContactModal(true)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 border-b border-panel-border">
              <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center"><Plus className="h-5 w-5 text-primary-foreground" /></div>
              <span className="text-[17px] font-medium text-primary">New Contact</span>
            </button>

            {filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground p-4"><Users className="h-14 w-14 mb-3 opacity-40" /><p className="text-[15px]">No contacts found</p></div>
            ) : filteredContacts.map((contact) => (
              <ContactListItem
                key={contact.id}
                contact={contact}
                labels={labels.filter((l) => (chatLabelMap[contact.id] || []).includes(l.id))}
                selectionMode={contactSelectionMode}
                selected={selectedContactIds.includes(contact.id)}
                onToggleSelect={toggleContactSelection}
                onEnterSelectionMode={() => setContactSelectionMode(true)}
                isTrash={showTrash}
                onRestore={(id) => handleRestoreContacts([id])}
                onPermanentDelete={(id) => setConfirmPermDelete({ ids: [id] })}
                onClick={() => {
                  if (showTrash) return;
                  const chat = chats.find((c) => c.contact.id === contact.id);
                  if (chat) {
                    setActiveChat(chat);
                    onChatSelect?.(chat);
                    setViewMode('chats');
                  }
                }}
              />
            ))}
          </>
        )}
      </div>

      <LabelManagerPanel open={showLabelManager} onOpenChange={setShowLabelManager} onLabelsChanged={fetchLabels} />

      <Dialog open={showBulkDialog} onOpenChange={(open) => { setShowBulkDialog(open); if (!open) setBulkStep('recipients'); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader><DialogTitle>{bulkStep === 'recipients' ? 'Bulk message recipients' : 'Bulk message templates'}</DialogTitle></DialogHeader>
          {bulkStep === 'recipients' ? (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
              <Textarea
                value={bulkNumbers}
                onChange={(e) => setBulkNumbers(e.target.value)}
                placeholder="Paste numbers separated by commas or new lines, e.g. 09012345678, 2349012345678"
                rows={8}
              />
              <div className="text-sm text-muted-foreground">{bulkParsedNumbers.length} pasted number(s) parsed. Local 090 numbers will be saved as 23490 international format.</div>

              {/* FIX: App and Day Type side by side */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">App</label>
                  <select value={bulkAppType} onChange={(e) => setBulkAppType(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {appChoices.map((app) => <option key={app} value={app}>{app.toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Day Type</label>
                  <input
                    type="number"
                    value={bulkDayType}
                    onChange={(e) => setBulkDayType(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Labels</label>
                <div className="flex flex-wrap gap-2">
                  {labels.length === 0 ? <span className="text-sm text-muted-foreground">No labels available</span> : labels.map((label) => {
                    const active = bulkSelectedLabelIds.includes(label.id);
                    return (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() => setBulkSelectedLabelIds((prev) => active ? prev.filter((id) => id !== label.id) : [...prev, label.id])}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium border transition-all"
                        style={{
                          backgroundColor: active ? label.color : label.color + '22',
                          borderColor: label.color,
                          color: active ? '#ffffff' : label.color,
                        }}
                      >
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: active ? 'rgba(255,255,255,0.7)' : label.color }}
                        />
                        {label.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Button className="w-full" onClick={handleBulkRecipientsNext} disabled={sendingBulk || bulkRecipientCount === 0}>
                {sendingBulk ? 'Creating contacts...' : `Next: create ${bulkRecipientCount} contact(s)`}
              </Button>
            </div>
          ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <Tabs value={bulkSource} onValueChange={(v) => { setBulkSource(v as 'app' | 'meta'); setSelectedTemplateId(''); }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="meta">Meta Templates</TabsTrigger>
                <TabsTrigger value="app">App Templates</TabsTrigger>
              </TabsList>

              <TabsContent value="meta" className="mt-3 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search meta templates..." className="pl-9" value={bulkMetaSearch} onChange={(e) => setBulkMetaSearch(e.target.value)} />
                </div>
                <ScrollArea className="h-[350px]">
                  <div className="space-y-2 pb-4">
                    {bulkFilteredMeta.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">No Meta templates found</div>
                    ) : bulkFilteredMeta.map(t => (
                      <button key={t.id} onClick={() => setSelectedTemplateId(t.id)}
                        className={cn("w-full text-left p-4 rounded-lg border transition-colors", selectedTemplateId === t.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50")}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{t.name}</span>
                          <Badge variant="default" className="bg-primary text-primary-foreground">APPROVED</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{(t as any).components?.find?.((c: any) => c.type === 'BODY')?.text || 'No preview'}</p>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="app" className="mt-3 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search app templates..." className="pl-9" value={bulkAppSearch} onChange={(e) => setBulkAppSearch(e.target.value)} />
                </div>
                <ScrollArea className="h-[350px]">
                  <div className="space-y-2 pb-4">
                    {bulkFilteredApp.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">No app templates found</div>
                    ) : appTemplates.map(t => (
                      <button key={t.id} onClick={() => setSelectedTemplateId(t.id)}
                        className={cn("w-full text-left p-3 rounded-lg border transition-colors", selectedTemplateId === t.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50")}>
                        <p className="font-medium text-sm">{t.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.body}</p>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
          )}
          {bulkStep === 'templates' && (
          <div className="shrink-0 pt-2 border-t border-border">
            <Input
              type="datetime-local"
              value={bulkScheduleAt}
              onChange={(e) => setBulkScheduleAt(e.target.value)}
              min={toDateTimeLocalValue()}
              className="mb-2"
            />
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <Button variant="outline" onClick={() => setBulkStep('recipients')}>Back</Button>
              <Button onClick={handleBulkTemplateSend} disabled={sendingBulk || !selectedTemplateId || bulkRecipientCount === 0}>
                {sendingBulk ? 'Sending...' : bulkScheduleAt ? `Schedule for ${bulkRecipientCount} contact(s)` : `Send to ${bulkRecipientCount} contact(s)`}
              </Button>
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmPermDelete} onOpenChange={(o) => { if (!o) setConfirmPermDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {confirmPermDelete?.ids.length ?? 0} chat(s) and all their messages. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { const ids = confirmPermDelete?.ids ?? []; setConfirmPermDelete(null); await handlePermanentDeleteContacts(ids); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmBulkDelete} onOpenChange={(o) => { if (!o) setConfirmBulkDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move chats to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmBulkDelete?.ids.length ?? 0} chat(s) will be moved to trash. You can restore them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { const ids = confirmBulkDelete?.ids ?? []; setConfirmBulkDelete(null); await handleBulkSoftDeleteChats(ids); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Move to trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
