// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { Key, Smartphone, Building, Link, TestTube, Copy, RefreshCw, Loader2, CheckCircle2, AlertCircle, Shield, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useSharedInbox } from '@/hooks/useSharedInbox';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface WhatsAppApiSettingsProps {
  onConnectionChange?: (connected: boolean) => void;
}

export function WhatsAppApiSettings({ onConnectionChange }: WhatsAppApiSettingsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isSharedUser, superUserName, loading: sharedLoading, refresh: refreshShared } = useSharedInbox();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [webhookGenerated, setWebhookGenerated] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Track whether the user has unsaved edits in the credential inputs.
  // Prevents tab-switch / focus-return from wiping half-typed credentials.
  const hasDraft = useRef(false);

  const defaultSettings = {
    apiToken: '',
    phoneNumberId: '',
    businessAccountId: '',
    webhookUrl: '',
    verifyToken: '',
    isConnected: false,
  };

  const [settings, setSettings] = useState(defaultSettings);

  const buildWebhookUrl = (userId: string, verifyToken: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const connectionKey = verifyToken.split('-')[0];
    return `${supabaseUrl}/functions/v1/whatsapp-webhook?user_id=${userId}&connection=${connectionKey}`;
  };

  const createVerifyToken = () => crypto.randomUUID();

  const applySettingsState = (overrides = {}) => {
    const nextSettings = { ...defaultSettings, ...overrides };
    hasDraft.current = false;
    setSettings(nextSettings);
    setWebhookGenerated(Boolean(nextSettings.webhookUrl && nextSettings.verifyToken));
  };

  const clearSettings = () => {
    applySettingsState();
  };

  const resetStoredConnectionState = async () => {
    if (!user) return;

    const { error: logsError } = await supabase
      .from('webhook_logs')
      .delete()
      .eq('user_id', user.id);

    if (logsError) throw logsError;

    const resetPayload = {
      api_token: null,
      phone_number_id: null,
      business_account_id: null,
      webhook_url: null,
      verify_token: null,
      is_connected: false,
    };

    const { data: existing, error: existingError } = await supabase
      .from('whatsapp_settings')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingError && existingError.code !== 'PGRST116') throw existingError;

    if (existing) {
      const { error: resetError } = await supabase
        .from('whatsapp_settings')
        .update(resetPayload)
        .eq('user_id', user.id);

      if (resetError) throw resetError;
    }
  };

  const persistFreshWebhookCredentials = async () => {
    if (!user) throw new Error('User not found');

    const newVerifyToken = createVerifyToken();
    const webhookUrl = buildWebhookUrl(user.id, newVerifyToken);

    const { data: existing, error: existingError } = await supabase
      .from('whatsapp_settings')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingError && existingError.code !== 'PGRST116') throw existingError;

    if (existing) {
      const { error: updateError } = await supabase
        .from('whatsapp_settings')
        .update({
          verify_token: newVerifyToken,
          webhook_url: webhookUrl,
          is_connected: false,
        })
        .eq('user_id', user.id);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from('whatsapp_settings')
        .insert({
          user_id: user.id,
          verify_token: newVerifyToken,
          webhook_url: webhookUrl,
          is_connected: false,
        });

      if (insertError) throw insertError;
    }

    return { newVerifyToken, webhookUrl };
  };

  useEffect(() => {
    if (user) loadSettings();
  }, [user]);

  // Auto-provision credentials for shared users if missing
  useEffect(() => {
    if (!user || sharedLoading || !isSharedUser) return;
    if (settings.isConnected) return;

    const autoProvision = async () => {
      const { data: existing } = await supabase
        .from('whatsapp_settings')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!existing) {
        const { data: membership } = await supabase
          .from('shared_inbox_users' as any)
          .select('super_user_id')
          .eq('shared_user_id', user.id)
          .eq('status', 'active')
          .limit(1);

        const superUserId = (membership as any[])?.[0]?.super_user_id;
        if (superUserId) {
          await supabase.rpc('copy_super_user_credentials', {
            _super_user_id: superUserId,
            _shared_user_id: user.id,
          });
          await loadSettings();
        }
      }
    };
    autoProvision();
  }, [user, isSharedUser, sharedLoading]);

  const loadSettings = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('whatsapp_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setSettings(prev => ({
          apiToken:           hasDraft.current ? prev.apiToken           : (data.api_token || ''),
          phoneNumberId:      hasDraft.current ? prev.phoneNumberId      : (data.phone_number_id || ''),
          businessAccountId:  hasDraft.current ? prev.businessAccountId  : (data.business_account_id || ''),
          webhookUrl:   data.webhook_url   || '',
          verifyToken:  data.verify_token  || '',
          isConnected:  data.is_connected  || false,
        }));
        setWebhookGenerated(!!data.webhook_url);
        onConnectionChange?.(data.is_connected || false);
      } else {
        if (!hasDraft.current) {
          clearSettings();
        }
        onConnectionChange?.(false);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // ─── FIXED: Reliable upsert for credential saving ─────────────────────────
  const handleSave = async () => {
    if (!user) return;
    if (!settings.apiToken || !settings.phoneNumberId) {
      toast({ title: 'Missing required fields', description: 'Please enter API Token and Phone Number ID', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        api_token: settings.apiToken.trim(),
        phone_number_id: settings.phoneNumberId.trim(),
        business_account_id: settings.businessAccountId.trim() || null,
        webhook_url: settings.webhookUrl || null,
        verify_token: settings.verifyToken || null,
        is_connected: settings.isConnected,
      };

      // Use upsert so it works whether or not a row exists
      const { error } = await supabase
        .from('whatsapp_settings')
        .upsert(payload, { onConflict: 'user_id' });

      if (error) throw error;

      hasDraft.current = false;
      toast({ title: '✅ Credentials saved successfully' });

      // Reload to confirm persisted values
      await loadSettings();
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast({ title: 'Error saving settings', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateWebhook = async () => {
    if (!user) return;
    if (!settings.apiToken || !settings.phoneNumberId) {
      toast({ title: 'Save credentials first', description: 'Please enter and save your API credentials before generating webhook', variant: 'destructive' });
      return;
    }

    const verifyToken = createVerifyToken();
    const webhookUrl = buildWebhookUrl(user.id, verifyToken);

    const newSettings = { ...settings, webhookUrl, verifyToken, isConnected: false };
    setSettings(newSettings);
    setWebhookGenerated(true);
    onConnectionChange?.(false);

    try {
      const { error } = await supabase
        .from('whatsapp_settings')
        .upsert({
          user_id: user.id,
          api_token: newSettings.apiToken.trim(),
          phone_number_id: newSettings.phoneNumberId.trim(),
          business_account_id: newSettings.businessAccountId.trim() || null,
          webhook_url: webhookUrl,
          verify_token: verifyToken,
          is_connected: false,
        }, { onConflict: 'user_id' });

      if (error) throw error;

      hasDraft.current = false;
      toast({ title: '✅ Webhook generated!', description: 'Copy the URL and verify token to Meta.' });
    } catch (error) {
      console.error('Error saving webhook:', error);
      toast({ title: 'Error saving webhook', variant: 'destructive' });
    }
  };

  const handleRegenerateWebhook = async () => {
    if (!user) return;

    setRegenerating(true);
    try {
      await resetStoredConnectionState();
      const { newVerifyToken, webhookUrl } = await persistFreshWebhookCredentials();

      applySettingsState({
        apiToken: settings.apiToken,
        phoneNumberId: settings.phoneNumberId,
        businessAccountId: settings.businessAccountId,
        webhookUrl,
        verifyToken: newVerifyToken,
        isConnected: false,
      });

      onConnectionChange?.(false);

      toast({
        title: 'Webhook regenerated',
        description: 'Reconnect it in Meta using the new credentials below.',
      });
    } catch (error: any) {
      console.error('Error regenerating webhook:', error);
      toast({
        title: 'Webhook regeneration failed',
        description: error.message || 'Failed to regenerate webhook credentials',
        variant: 'destructive',
      });
    } finally {
      setRegenerating(false);
    }
  };

  const handleTestConnection = async () => {
    if (!settings.apiToken || !settings.phoneNumberId) {
      toast({ title: 'Missing credentials', description: 'Please enter API token and Phone Number ID', variant: 'destructive' });
      return;
    }

    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-api', {
        body: { action: 'test_connection', token: settings.apiToken, phoneNumberId: settings.phoneNumberId },
      });

      if (error) throw error;

      if (data?.success) {
        const newSettings = { ...settings, isConnected: true };
        setSettings(newSettings);
        onConnectionChange?.(true);

        // Persist connected state
        await supabase
          .from('whatsapp_settings')
          .update({ is_connected: true })
          .eq('user_id', user!.id);

        toast({ title: '✅ Connection successful!', description: `Connected to ${data.phoneNumber || 'WhatsApp'}` });
      } else {
        throw new Error(data?.error || 'Connection failed');
      }
    } catch (error: any) {
      setSettings(prev => ({ ...prev, isConnected: false }));
      onConnectionChange?.(false);
      if (user) {
        await supabase.from('whatsapp_settings').update({ is_connected: false }).eq('user_id', user.id);
      }
      toast({ title: 'Connection failed', description: error.message || 'Please check your credentials', variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  // ─── FIXED: Template sync — works with or without isConnected ────────────
  const handleSyncTemplates = async () => {
    if (!user) return;

    setSyncing(true);
    try {
      // Always pull fresh from DB to get actual stored credentials
      const { data: dbSettings, error: dbErr } = await supabase
        .from('whatsapp_settings')
        .select('api_token, business_account_id, phone_number_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (dbErr) throw dbErr;

      let token = dbSettings?.api_token || settings.apiToken;
      let businessAccountId = dbSettings?.business_account_id || settings.businessAccountId;

      // Shared inbox users sync through the inbox owner's connection.
      // RLS lets them read the super user's whatsapp_settings row, so use it directly.
      if (isSharedUser && (!token || !businessAccountId)) {
        const { data: membership } = await supabase
          .from('shared_inbox_users' as any)
          .select('super_user_id')
          .eq('shared_user_id', user.id)
          .eq('status', 'active')
          .limit(1);

        const superUserId = (membership as any[])?.[0]?.super_user_id;
        if (superUserId) {
          const { data: ownerSettings } = await supabase
            .from('whatsapp_settings')
            .select('api_token, business_account_id')
            .eq('user_id', superUserId)
            .maybeSingle();

          if (ownerSettings?.api_token) token = ownerSettings.api_token;
          if (ownerSettings?.business_account_id) businessAccountId = ownerSettings.business_account_id;
        }

        if (!token || !businessAccountId) {
          toast({
            title: 'Owner connection unavailable',
            description: 'The shared inbox owner has not finished setting up their WhatsApp API connection yet.',
            variant: 'destructive',
          });
          setSyncing(false);
          return;
        }
      }


      if (!token) {
        toast({ title: 'Missing API token', description: 'Please save your API token first.', variant: 'destructive' });
        setSyncing(false);
        return;
      }

      if (!businessAccountId) {
        toast({ title: 'Missing Business Account ID', description: 'Please enter your WhatsApp Business Account ID to sync templates.', variant: 'destructive' });
        setSyncing(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('whatsapp-api', {
        body: { action: 'sync_templates', token, businessAccountId, userId: user.id },
      });
      if (error) throw error;

      if (!data?.success) throw new Error(data?.error || 'Sync failed');

      toast({ title: '✅ Templates synced', description: `${data?.count || 0} templates imported` });
    } catch (error: any) {
      toast({ title: 'Sync failed', description: error.message || 'Failed to sync templates', variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  };

  const handleRevokeSharedAccess = async () => {
    if (!user) return;
    setRevoking(true);
    try {
      const { data: membership } = await supabase
        .from('shared_inbox_users' as any)
        .select('super_user_id')
        .eq('shared_user_id', user.id)
        .limit(1);

      const superUserId = (membership as any[])?.[0]?.super_user_id;
      if (superUserId) {
        await (supabase.from('contacts') as any)
          .update({ assigned_user_id: null })
          .eq('user_id', superUserId)
          .eq('assigned_user_id', user.id);
      }

      await supabase.rpc('remove_shared_credentials', { _shared_user_id: user.id });

      await supabase
        .from('shared_inbox_users' as any)
        .delete()
        .eq('shared_user_id', user.id);

      await supabase
        .from('whatsapp_settings')
        .delete()
        .eq('user_id', user.id);

      clearSettings();

      toast({
        title: '✅ Left shared inbox',
        description: 'Connection reset. You can now connect your own WhatsApp API.',
      });

      setShowRevokeDialog(false);
      onConnectionChange?.(false);
      refreshShared();
      await loadSettings();
    } catch (err: any) {
      toast({ title: 'Failed to revoke', description: err.message, variant: 'destructive' });
    } finally {
      setRevoking(false);
    }
  };

  const handleManualReset = async () => {
    if (!user) return;
    setResetting(true);
    try {
      await resetStoredConnectionState();
      clearSettings();
      onConnectionChange?.(false);
      toast({ title: '✅ Connection Reset', description: 'Your WhatsApp connection has been reset.' });
      setShowResetDialog(false);
    } catch (error: any) {
      toast({ title: 'Reset failed', description: error.message || 'Failed to reset connection', variant: 'destructive' });
    } finally {
      setResetting(false);
    }
  };

  const handleResetConnection = async () => {
    if (!user) return;
    setResetting(true);
    try {
      // Remove credentials from shared users
      const { data: sharedUsers } = await supabase
        .from('shared_inbox_users' as any)
        .select('shared_user_id')
        .eq('super_user_id', user.id)
        .eq('status', 'active');

      const sharedCount = sharedUsers?.length || 0;

      if (sharedCount > 0) {
        for (const sharedUser of sharedUsers || []) {
          await supabase.rpc('remove_shared_credentials', { _shared_user_id: sharedUser.shared_user_id });
          await (supabase.from('contacts') as any)
            .update({ assigned_user_id: null })
            .eq('user_id', user.id)
            .eq('assigned_user_id', sharedUser.shared_user_id);
        }
        await supabase.from('shared_inbox_users' as any).delete().eq('super_user_id', user.id);
      }

      await resetStoredConnectionState();
      clearSettings();
      onConnectionChange?.(false);

      toast({
        title: '✅ WhatsApp API Reset Complete',
        description: sharedCount > 0
          ? `Connection reset. ${sharedCount} shared user(s) disconnected.`
          : 'Connection reset successfully.',
      });

      setShowResetDialog(false);
      refreshShared();
    } catch (error: any) {
      toast({ title: 'Reset failed', description: error.message || 'Failed to reset connection', variant: 'destructive' });
    } finally {
      setResetting(false);
    }
  };

  if (loading || sharedLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Shared user view ──────────────────────────────────────────────────────
  if (isSharedUser) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 p-4 bg-primary/10 rounded-xl border border-primary/20">
          <CheckCircle2 className="h-6 w-6 text-primary" />
          <div>
            <p className="font-semibold text-[15px] text-primary">Connected via Shared Inbox</p>
            <p className="text-[13px] text-muted-foreground">
              You are using {superUserName || 'a super user'}'s WhatsApp API connection
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[17px]">
              <Shield className="h-5 w-5 text-primary" />
              Shared API Connection
            </CardTitle>
            <CardDescription className="text-[13px]">
              Your API credentials are managed by {superUserName || 'the workspace owner'}.
              You can send messages and sync templates through their connection.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Connection Status</span>
                <Badge variant="default">Connected</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Workspace Owner</span>
                <span className="text-sm font-medium">{superUserName || 'Unknown'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">API Credentials</span>
                <span className="text-sm text-muted-foreground italic">Hidden (managed by owner)</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                To use your own WhatsApp API credentials, you must first leave the shared inbox.
              </p>
              <Button variant="destructive" className="w-full" onClick={() => setShowRevokeDialog(true)}>
                Leave Shared Inbox & Use Own Credentials
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-[17px]">Message Templates</CardTitle>
            <CardDescription className="text-[13px]">Sync templates from the shared workspace</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={handleSyncTemplates} disabled={syncing} className="text-[15px]">
              {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sync Templates
            </Button>
          </CardContent>
        </Card>

        <AlertDialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave shared inbox?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the shared API connection and all your assigned conversations will be returned to the workspace owner.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRevokeSharedAccess}
                className="bg-destructive text-destructive-foreground"
                disabled={revoking}
              >
                {revoking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Leave & Disconnect
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ── Super user / regular user view ───────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Connection Status Banner */}
      {settings.isConnected && (
        <div className="flex items-center gap-3 p-4 bg-primary/10 rounded-xl border border-primary/20">
          <CheckCircle2 className="h-6 w-6 text-primary" />
          <div>
            <p className="font-semibold text-[15px] text-primary">Connected to WhatsApp</p>
            <p className="text-[13px] text-muted-foreground">Your WhatsApp Business API is active</p>
          </div>
        </div>
      )}

      {/* API Credentials */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-[17px]">
                <Key className="h-5 w-5 text-primary" />
                API Credentials
              </CardTitle>
              <CardDescription className="text-[13px]">
                Enter your WhatsApp Cloud API credentials from Meta Business Suite
              </CardDescription>
            </div>
            <Badge variant={settings.isConnected ? 'default' : 'secondary'} className="text-[11px]">
              {settings.isConnected ? 'Connected' : 'Not Connected'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiToken" className="text-[14px] font-medium">Access Token *</Label>
            <Input
              id="apiToken"
              type="password"
              value={settings.apiToken}
              onChange={(e) => {
                hasDraft.current = true;
                setSettings(prev => ({ ...prev, apiToken: e.target.value, isConnected: false }));
              }}
              placeholder="Enter your permanent access token"
              className="text-[15px]"
            />
            <p className="text-[12px] text-muted-foreground">
              Get this from Meta Business Suite → WhatsApp → API Setup → Permanent Token
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phoneNumberId" className="flex items-center gap-1.5 text-[14px] font-medium">
                <Smartphone className="h-3.5 w-3.5" /> Phone Number ID *
              </Label>
              <Input
                id="phoneNumberId"
                value={settings.phoneNumberId}
                onChange={(e) => {
                  hasDraft.current = true;
                  setSettings(prev => ({ ...prev, phoneNumberId: e.target.value, isConnected: false }));
                }}
                placeholder="123456789012345"
                className="text-[15px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessAccountId" className="flex items-center gap-1.5 text-[14px] font-medium">
                <Building className="h-3.5 w-3.5" /> Business Account ID
              </Label>
              <Input
                id="businessAccountId"
                value={settings.businessAccountId}
                onChange={(e) => {
                  hasDraft.current = true;
                  setSettings(prev => ({ ...prev, businessAccountId: e.target.value }));
                }}
                placeholder="987654321098765"
                className="text-[15px]"
              />
              <p className="text-[12px] text-muted-foreground">Required for template sync</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving} className="text-[15px]">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save Credentials
            </Button>
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing || !settings.apiToken || !settings.phoneNumberId}
              className="text-[15px]"
            >
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <TestTube className="h-4 w-4 mr-2" />}
              Test Connection
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[17px]">
            <Link className="h-5 w-5 text-primary" /> Webhook Configuration
          </CardTitle>
          <CardDescription className="text-[13px]">
            Generate your unique webhook URL to receive messages from WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!webhookGenerated ? (
            <div className="text-center py-6">
              <p className="text-[14px] text-muted-foreground mb-4">
                After saving your credentials, generate a webhook URL to receive incoming messages
              </p>
              <Button
                onClick={handleGenerateWebhook}
                disabled={!settings.apiToken || !settings.phoneNumberId}
                className="text-[15px]"
              >
                <Link className="h-4 w-4 mr-2" /> Generate Webhook URL
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-[14px] font-medium">Callback URL</Label>
                <div className="flex gap-2">
                  <Input value={settings.webhookUrl} readOnly className="bg-muted font-mono text-[12px]" />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(settings.webhookUrl, 'Webhook URL')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[14px] font-medium">Verify Token</Label>
                <div className="flex gap-2">
                  <Input value={settings.verifyToken} readOnly className="bg-muted font-mono text-[12px]" />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(settings.verifyToken, 'Verify token')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Separator className="my-4" />
              <div className="p-4 bg-muted rounded-xl">
                <h4 className="font-semibold text-[14px] mb-2">Setup Instructions:</h4>
                <ol className="text-[13px] text-muted-foreground space-y-1.5 list-decimal list-inside">
                  <li>Go to <strong>Meta Business Suite → WhatsApp → Configuration</strong></li>
                  <li>Click <strong>"Edit"</strong> on the Webhook section</li>
                  <li>Paste the <strong>Callback URL</strong> above</li>
                  <li>Paste the <strong>Verify Token</strong> above</li>
                  <li>Click <strong>"Manage"</strong> and enable <strong>"messages"</strong> and <strong>"message_status"</strong> subscriptions</li>
                  <li>Click <strong>"Verify and Save"</strong></li>
                </ol>
              </div>

              {webhookGenerated && !settings.isConnected && (
                <>
                  <Separator className="my-4" />
                  <div className="flex gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
                    <div className="space-y-1">
                      <p className="text-[13px] font-medium">Connection not tested yet</p>
                      <p className="text-[12px] text-muted-foreground">
                        Use "Test Connection" above to verify your credentials work, then configure the webhook in Meta.
                      </p>
                    </div>
                  </div>
                </>
              )}

              <Separator className="my-4" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-medium">Regenerate Credentials</p>
                  <p className="text-[12px] text-muted-foreground">Issue a fresh verify token and force a clean Meta reconnect</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleRegenerateWebhook} disabled={regenerating} className="text-[13px]">
                  {regenerating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                  Regenerate Webhook
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Message Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[17px]">Message Templates</CardTitle>
          <CardDescription className="text-[13px]">Sync your approved WhatsApp message templates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="outline"
            onClick={handleSyncTemplates}
            disabled={syncing || !settings.apiToken || !settings.businessAccountId}
            className="text-[15px]"
          >
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sync Templates
          </Button>
          {!settings.businessAccountId && (
            <p className="text-[12px] text-muted-foreground">Enter your Business Account ID above to enable template sync</p>
          )}
          {settings.businessAccountId && !settings.apiToken && (
            <p className="text-[12px] text-muted-foreground">Enter your Access Token above to enable template sync</p>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone / Reset */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[17px] text-destructive">
            <Trash2 className="h-5 w-5" />
            {settings.isConnected || settings.apiToken ? 'Danger Zone' : 'Reset Connection'}
          </CardTitle>
          <CardDescription className="text-[13px]">
            {settings.isConnected || settings.apiToken
              ? 'Reset your WhatsApp API connection and disconnect all shared users'
              : 'Clear the form and start fresh'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(settings.isConnected || settings.apiToken) ? (
            <>
              <div className="p-4 bg-destructive/10 rounded-xl border border-destructive/20">
                <h4 className="font-semibold text-[14px] mb-2 text-destructive">⚠️ This action cannot be undone</h4>
                <ul className="text-[13px] text-muted-foreground space-y-1.5 list-disc list-inside">
                  <li>All WhatsApp API credentials will be permanently deleted</li>
                  <li>Webhook URL and verify token will be cleared</li>
                  <li>All shared users will be immediately disconnected</li>
                  <li>You will need to reconfigure everything from scratch</li>
                </ul>
              </div>
              <Button variant="destructive" className="w-full" onClick={() => setShowResetDialog(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Reset WhatsApp API Connection
              </Button>
            </>
          ) : (
            <>
              <div className="p-4 bg-muted rounded-xl">
                <p className="text-[13px] text-muted-foreground">
                  Clear the form and reset to a brand new state.
                </p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => setShowResetDialog(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Reset to Brand New
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              {settings.isConnected || settings.apiToken ? 'Reset WhatsApp API Connection?' : 'Reset to Brand New?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {settings.isConnected || settings.apiToken ? (
                'This will permanently delete all credentials, disconnect all shared users, and clear your webhook. This cannot be undone.'
              ) : (
                'This will clear the form and reset your connection to a fresh state.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={settings.isConnected || settings.apiToken ? handleResetConnection : handleManualReset}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={resetting}
            >
              {resetting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Resetting...</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-2" />{settings.isConnected || settings.apiToken ? 'Yes, Reset Everything' : 'Reset to Brand New'}</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
