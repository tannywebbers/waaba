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
  const [webhookGenerated, setWebhookGenerated] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [resetting, setResetting] = useState(false);

  // ✅ FIX: Track whether the user has unsaved edits in the credential inputs.
  // If true, loadSettings() will NOT overwrite those fields — only non-editable
  // fields (isConnected, webhookUrl, verifyToken) are refreshed from DB.
  // This prevents tab-switch / focus-return from wiping half-typed credentials.
  const hasDraft = useRef(false);

  const [settings, setSettings] = useState({
    apiToken: '',
    phoneNumberId: '',
    businessAccountId: '',
    webhookUrl: '',
    verifyToken: '',
    isConnected: false,
  });

  // Helper to clear all settings (only called on explicit reset/revoke)
  const clearSettings = () => {
    hasDraft.current = false;
    setSettings({
      apiToken: '',
      phoneNumberId: '',
      businessAccountId: '',
      webhookUrl: '',
      verifyToken: '',
      isConnected: false,
    });
    setWebhookGenerated(false);
  };

  useEffect(() => {
    if (user) loadSettings();
  }, [user]);

  // Auto-provision credentials for shared users if missing
  useEffect(() => {
    if (!user || sharedLoading || !isSharedUser) return;
    if (settings.isConnected) return; // Already has credentials
    
    const autoProvision = async () => {
      // Check if shared user already has settings
      const { data: existing } = await supabase
        .from('whatsapp_settings')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!existing) {
        // Find super user and copy credentials
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
          // ✅ FIX: Only restore credential fields from DB if the user hasn't
          // started typing yet. This is what prevents tab-switching from
          // clearing half-entered tokens/IDs.
          apiToken:           hasDraft.current ? prev.apiToken           : (data.api_token || ''),
          phoneNumberId:      hasDraft.current ? prev.phoneNumberId      : (data.phone_number_id || ''),
          businessAccountId:  hasDraft.current ? prev.businessAccountId  : (data.business_account_id || ''),
          // Non-editable fields always sync from DB
          webhookUrl:   data.webhook_url   || '',
          verifyToken:  data.verify_token  || '',
          isConnected:  data.is_connected  || false,
        }));
        setWebhookGenerated(!!data.webhook_url);
        onConnectionChange?.(data.is_connected || false);
      } else {
        // No settings found — only clear if no draft in progress
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

  const generateVerifyToken = () => {
    return 'waba_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!settings.apiToken || !settings.phoneNumberId) {
      toast({ title: 'Missing required fields', description: 'Please enter API Token and Phone Number ID', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      // Check if record exists
      const { data: existing } = await supabase
        .from('whatsapp_settings')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      let error;
      if (existing) {
        // Update
        ({ error } = await supabase
          .from('whatsapp_settings')
          .update({
            api_token: settings.apiToken,
            phone_number_id: settings.phoneNumberId,
            business_account_id: settings.businessAccountId,
            webhook_url: settings.webhookUrl,
            verify_token: settings.verifyToken,
            is_connected: settings.isConnected,
          })
          .eq('user_id', user.id));
      } else {
        // Insert
        ({ error } = await supabase
          .from('whatsapp_settings')
          .insert({
            user_id: user.id,
            api_token: settings.apiToken,
            phone_number_id: settings.phoneNumberId,
            business_account_id: settings.businessAccountId,
            webhook_url: settings.webhookUrl,
            verify_token: settings.verifyToken,
            is_connected: settings.isConnected,
          }));
      }

      if (error) throw error;
      // ✅ FIX: Draft is now persisted — clear the dirty flag
      hasDraft.current = false;
      toast({ title: 'Settings saved successfully' });
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

    const verifyToken = generateVerifyToken();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook?user_id=${user.id}`;
    
    const newSettings = { ...settings, webhookUrl, verifyToken };
    setSettings(newSettings);
    setWebhookGenerated(true);

    // Save immediately
    try {
      const { data: existing } = await supabase.from('whatsapp_settings').select('id').eq('user_id', user.id).maybeSingle();
      
      if (existing) {
        await supabase.from('whatsapp_settings').update({
          api_token: newSettings.apiToken,
          phone_number_id: newSettings.phoneNumberId,
          business_account_id: newSettings.businessAccountId,
          webhook_url: webhookUrl,
          verify_token: verifyToken,
          is_connected: newSettings.isConnected,
        }).eq('user_id', user.id);
      } else {
        await supabase.from('whatsapp_settings').insert({
          user_id: user.id,
          api_token: newSettings.apiToken,
          phone_number_id: newSettings.phoneNumberId,
          business_account_id: newSettings.businessAccountId,
          webhook_url: webhookUrl,
          verify_token: verifyToken,
          is_connected: newSettings.isConnected,
        });
      }

      // ✅ FIX: Saved to DB — clear dirty flag
      hasDraft.current = false;
      toast({ title: 'Webhook generated!', description: 'Copy the URL and verify token to Meta.' });
    } catch (error) {
      console.error('Error saving webhook:', error);
      toast({ title: 'Error saving webhook', variant: 'destructive' });
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
        const { data: existing } = await supabase.from('whatsapp_settings').select('id').eq('user_id', user!.id).maybeSingle();
        if (existing) {
          await supabase.from('whatsapp_settings').update({ is_connected: true }).eq('user_id', user!.id);
        }

        toast({ title: 'Connection successful!', description: `Connected to ${data.phoneNumber || 'WhatsApp'}` });
      } else {
        throw new Error(data?.error || 'Connection failed');
      }
    } catch (error: any) {
      setSettings(prev => ({ ...prev, isConnected: false }));
      onConnectionChange?.(false);
      toast({ title: 'Connection failed', description: error.message || 'Please check your credentials', variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const handleSyncTemplates = async () => {
    if (!user) return;

    setSyncing(true);
    try {
      // For shared users, fetch credentials from DB since they're hidden in UI
      let token = settings.apiToken;
      let businessAccountId = settings.businessAccountId;

      // Always check DB for actual credentials
      const { data: dbSettings } = await supabase
        .from('whatsapp_settings')
        .select('api_token, business_account_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (dbSettings?.api_token) token = dbSettings.api_token;
      if (dbSettings?.business_account_id) businessAccountId = dbSettings.business_account_id;

      // If shared user and still no credentials, try to copy them from super user first
      if (isSharedUser && (!token || !businessAccountId)) {
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

          // Re-fetch after copy
          const { data: refreshed } = await supabase
            .from('whatsapp_settings')
            .select('api_token, business_account_id')
            .eq('user_id', user.id)
            .maybeSingle();

          if (refreshed?.api_token) token = refreshed.api_token;
          if (refreshed?.business_account_id) businessAccountId = refreshed.business_account_id;
        }
      }

      if (!token || !businessAccountId) {
        toast({ title: 'Missing credentials', description: 'No API connection found. Please configure your API or join a shared inbox.', variant: 'destructive' });
        setSyncing(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('whatsapp-api', {
        body: { action: 'sync_templates', token, businessAccountId, userId: user.id },
      });
      if (error) throw error;
      toast({ title: 'Templates synced', description: `${data?.count || 0} templates imported` });
    } catch (error: any) {
      toast({ title: 'Sync failed', description: error.message || 'Failed to sync templates', variant: 'destructive' });
    } finally { setSyncing(false); }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  };

  const handleRevokeSharedAccess = async () => {
    if (!user) return;
    setRevoking(true);
    try {
      console.log('[Shared User Leave] Starting disconnect process...');
      
      // Find membership
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

      // Remove credentials from database
      await supabase.rpc('remove_shared_credentials', { _shared_user_id: user.id });
      console.log('[Shared User Leave] ✅ Credentials removed from database');

      // Delete the membership
      await supabase
        .from('shared_inbox_users' as any)
        .delete()
        .eq('shared_user_id', user.id);
      console.log('[Shared User Leave] ✅ Membership deleted');

      // CRITICAL: Delete user's whatsapp_settings to ensure clean slate
      await supabase
        .from('whatsapp_settings')
        .delete()
        .eq('user_id', user.id);
      console.log('[Shared User Leave] ✅ WhatsApp settings deleted');

      // CRITICAL FIX: Clear all input fields immediately
      clearSettings();
      console.log('[Shared User Leave] ✅ UI cleared');

      toast({ 
        title: '✅ Left shared inbox', 
        description: 'Connection reset. You can now connect your own WhatsApp API.' 
      });
      
      setShowRevokeDialog(false);
      onConnectionChange?.(false);
      refreshShared();
      
      // Reload to confirm everything is clean
      await loadSettings();
    } catch (err: any) {
      console.error('[Shared User Leave] ❌ Error:', err);
      toast({ title: 'Failed to revoke', description: err.message, variant: 'destructive' });
    } finally {
      setRevoking(false);
    }
  };

  const handleManualReset = async () => {
    if (!user) return;
    setResetting(true);
    
    try {
      console.log('[Manual Reset] Starting reset process for user:', user.id);

      // Delete user's whatsapp_settings (clears everything)
      const { error: deleteError } = await supabase
        .from('whatsapp_settings')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) {
        console.error('[Manual Reset] Error deleting settings:', deleteError);
        throw deleteError;
      }

      console.log('[Manual Reset] ✅ Settings deleted from database');

      // Clear local state
      clearSettings();
      onConnectionChange?.(false);
      console.log('[Manual Reset] ✅ UI cleared');

      toast({ 
        title: '✅ Connection Reset', 
        description: 'Your WhatsApp connection has been reset to brand new.' 
      });

      setShowResetDialog(false);
      
    } catch (error: any) {
      console.error('[Manual Reset] ❌ Error:', error);
      toast({ 
        title: 'Reset failed', 
        description: error.message || 'Failed to reset connection', 
        variant: 'destructive' 
      });
    } finally {
      setResetting(false);
    }
  };

  const handleResetConnection = async () => {
    if (!user) return;
    setResetting(true);
    
    try {
      console.log('[Reset] Starting WhatsApp API reset for user:', user.id);

      // Step 1: Check if user is a super user with shared connections
      const { data: sharedUsers } = await supabase
        .from('shared_inbox_users' as any)
        .select('shared_user_id, shared_users!inner(email)')
        .eq('super_user_id', user.id)
        .eq('status', 'active');

      const sharedCount = sharedUsers?.length || 0;

      // Step 2: Remove all shared user credentials
      if (sharedCount > 0) {
        console.log(`[Reset] Removing credentials from ${sharedCount} shared users`);
        
        for (const sharedUser of sharedUsers || []) {
          const sharedUserId = sharedUser.shared_user_id;
          
          // Remove their credentials
          await supabase.rpc('remove_shared_credentials', { 
            _shared_user_id: sharedUserId 
          });
          
          // Unassign their contacts
          await (supabase.from('contacts') as any)
            .update({ assigned_user_id: null })
            .eq('user_id', user.id)
            .eq('assigned_user_id', sharedUserId);
        }

        // Delete all shared inbox memberships
        await supabase
          .from('shared_inbox_users' as any)
          .delete()
          .eq('super_user_id', user.id);
          
        console.log('[Reset] ✅ Removed all shared user connections');
      }

      // Step 3: Delete super user's own WhatsApp settings
      const { error: deleteError } = await supabase
        .from('whatsapp_settings')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) {
        console.error('[Reset] Error deleting settings:', deleteError);
        throw deleteError;
      }

      console.log('[Reset] ✅ Deleted WhatsApp settings');

      // Step 4: Clear local state
      clearSettings();
      onConnectionChange?.(false);

      // Step 5: Show success message
      const message = sharedCount > 0 
        ? `Connection reset successfully. ${sharedCount} shared user(s) disconnected.`
        : 'Connection reset successfully.';

      toast({ 
        title: '✅ WhatsApp API Reset Complete', 
        description: message 
      });

      setShowResetDialog(false);
      refreshShared();
      
    } catch (error: any) {
      console.error('[Reset] Error during reset:', error);
      toast({ 
        title: 'Reset failed', 
        description: error.message || 'Failed to reset connection', 
        variant: 'destructive' 
      });
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

  // Shared user view — hide credentials, show connected status & revoke button
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
                This will disconnect you from the shared workspace.
              </p>
              <Button 
                variant="destructive" 
                className="w-full" 
                onClick={() => setShowRevokeDialog(true)}
              >
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

        {/* Manual Reset for Shared Users */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[17px] text-destructive">
              <Trash2 className="h-5 w-5" />
              Reset Connection
            </CardTitle>
            <CardDescription className="text-[13px]">
              Start fresh with a clean slate (different from leaving shared inbox)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-xl">
              <p className="text-[13px] text-muted-foreground">
                This will clear your connection and reset the form to look brand new, 
                as if you just created your account. Your shared inbox access will remain.
              </p>
            </div>
            
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setShowResetDialog(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Reset to Brand New
            </Button>
          </CardContent>
        </Card>

        <AlertDialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave shared inbox?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the shared API connection and all your assigned conversations will be returned to the workspace owner. 
                You can then set up your own WhatsApp API credentials.
                <br /><br />
                <strong>Note:</strong> This also resets your connection to look brand new.
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

        {/* Reset Dialog for Shared Users */}
        <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                Reset Connection to Brand New?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will clear your WhatsApp connection settings and reset the form to look brand new.
                <br /><br />
                <strong>You will remain in the shared inbox.</strong> This only clears your local connection state.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleManualReset}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={resetting}
              >
                {resetting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Reset to Brand New
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

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
                hasDraft.current = true; // ✅ FIX: mark as dirty
                setSettings({ ...settings, apiToken: e.target.value });
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
                  hasDraft.current = true; // ✅ FIX: mark as dirty
                  setSettings({ ...settings, phoneNumberId: e.target.value });
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
                  hasDraft.current = true; // ✅ FIX: mark as dirty
                  setSettings({ ...settings, businessAccountId: e.target.value });
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
            <Button variant="outline" onClick={handleTestConnection}
              disabled={testing || !settings.apiToken || !settings.phoneNumberId} className="text-[15px]">
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <TestTube className="h-4 w-4 mr-2" />}
              Test Connection
            </Button>
          </div>
        </CardContent>
      </Card>

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
              <Button onClick={handleGenerateWebhook} disabled={!settings.apiToken || !settings.phoneNumberId} className="text-[15px]">
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
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-[17px]">Message Templates</CardTitle>
          <CardDescription className="text-[13px]">Sync your approved WhatsApp message templates</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleSyncTemplates}
            disabled={syncing || !settings.apiToken || !settings.businessAccountId || !settings.isConnected} className="text-[15px]">
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sync Templates
          </Button>
          {!settings.isConnected && (
            <p className="text-[12px] text-muted-foreground mt-2">Connect your API first to sync templates</p>
          )}
        </CardContent>
      </Card>

      {/* Reset Connection Card */}
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
            // Connected user - show full danger zone
            <>
              <div className="p-4 bg-destructive/10 rounded-xl border border-destructive/20">
                <h4 className="font-semibold text-[14px] mb-2 text-destructive">⚠️ Warning: This action cannot be undone</h4>
                <ul className="text-[13px] text-muted-foreground space-y-1.5 list-disc list-inside">
                  <li>All WhatsApp API credentials will be permanently deleted</li>
                  <li>Webhook URL and verify token will be cleared</li>
                  <li>All shared users will be immediately disconnected</li>
                  <li>You will need to reconfigure everything from scratch</li>
                </ul>
              </div>
              
              <Button 
                variant="destructive" 
                className="w-full"
                onClick={() => setShowResetDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Reset WhatsApp API Connection
              </Button>
            </>
          ) : (
            // No connection - simple reset to brand new
            <>
              <div className="p-4 bg-muted rounded-xl">
                <p className="text-[13px] text-muted-foreground">
                  Clear the form and reset to a brand new state, as if you just created your account.
                </p>
              </div>
              
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => setShowResetDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Reset to Brand New
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              {settings.isConnected || settings.apiToken ? 'Reset WhatsApp API Connection?' : 'Reset to Brand New?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              {settings.isConnected || settings.apiToken ? (
                // Full reset warning for connected users
                <>
                  <p className="font-semibold">This will permanently:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Delete all API credentials (token, phone ID, business ID)</li>
                    <li>Remove webhook configuration</li>
                    <li>Disconnect ALL shared users from your API</li>
                    <li>Clear connection status</li>
                  </ul>
                  <p className="text-destructive font-semibold">
                    ⚠️ This action cannot be undone. You will need to set up everything again.
                  </p>
                </>
              ) : (
                // Simple reset message for non-connected users
                <p>
                  This will clear the form and reset your connection to look brand new, 
                  as if you just created your account.
                </p>
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
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {settings.isConnected || settings.apiToken ? 'Yes, Reset Everything' : 'Reset to Brand New'}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
