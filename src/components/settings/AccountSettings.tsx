// @ts-nocheck
import { useState, useEffect } from 'react';
import { User, Mail, Lock, LogOut, Camera, Loader2, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ContactAvatar } from '@/components/shared/ContactAvatar';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function AccountSettings() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [profile, setProfile] = useState({ name: '', email: '', avatarUrl: '' });
  const [newEmail, setNewEmail] = useState('');
  const [passwords, setPasswords] = useState({ new: '', confirm: '' });

  useEffect(() => {
    if (user) loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      setProfile({
        name: data?.name || user.user_metadata?.name || user.email?.split('@')[0] || '',
        email: user.email || '',
        avatarUrl: data?.avatar_url || '',
      });
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAll = async () => {
    if (!user) return;
    setSaving(true);
    const errors: string[] = [];

    try {
      // 1. Save profile name
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ user_id: user.id, name: profile.name, email: profile.email, avatar_url: profile.avatarUrl }, { onConflict: 'user_id' });
      if (profileError) errors.push(`Profile: ${profileError.message}`);

      // 2. Update email if changed
      if (newEmail && newEmail !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({ email: newEmail });
        if (emailError) errors.push(`Email: ${emailError.message}`);
        else {
          toast({ title: 'Verification email sent', description: 'Check both old and new email to confirm.' });
          setNewEmail('');
        }
      }

      // 3. Update password if provided
      if (passwords.new) {
        if (passwords.new !== passwords.confirm) {
          errors.push('Passwords do not match');
        } else if (passwords.new.length < 6) {
          errors.push('Password must be at least 6 characters');
        } else {
          const { error: pwError } = await supabase.auth.updateUser({ password: passwords.new });
          if (pwError) errors.push(`Password: ${pwError.message}`);
          else setPasswords({ new: '', confirm: '' });
        }
      }

      if (errors.length > 0) {
        toast({ title: 'Some updates failed', description: errors.join('\n'), variant: 'destructive' });
      } else {
        toast({ title: 'Account updated', description: 'All changes saved successfully.' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      if (user) {
        await supabase.from('messages').delete().eq('user_id', user.id);
        await supabase.from('chat_labels').delete().eq('user_id', user.id);
        await supabase.from('contacts').delete().eq('user_id', user.id);
        await supabase.from('labels').delete().eq('user_id', user.id);
        await supabase.from('whatsapp_settings').delete().eq('user_id', user.id);
        await supabase.from('whatsapp_templates').delete().eq('user_id', user.id);
        await supabase.from('app_templates').delete().eq('user_id', user.id);
        await supabase.from('template_mappings').delete().eq('user_id', user.id);
        await supabase.from('push_tokens').delete().eq('user_id', user.id);
        await supabase.from('shared_inbox_users').delete().eq('super_user_id', user.id);
        await supabase.from('profiles').delete().eq('user_id', user.id);
      }
      await signOut();
      toast({ title: 'Account data deleted', description: 'Your data has been removed.' });
      window.location.href = '/auth';
    } catch (error: any) {
      toast({ title: 'Error deleting account', description: error.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/auth';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Combined Profile, Email & Password Card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> Account Settings
          </CardTitle>
          <CardDescription>Update your profile, email, and password</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar + Name */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <ContactAvatar name={profile.name || 'User'} avatar={profile.avatarUrl} size="lg" />
              <button className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors">
                <Camera className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1">
              <p className="font-medium text-lg">{profile.name || 'User'}</p>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
            </div>
          </div>

          <Separator />

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Display Name</Label>
            <Input id="name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="Enter your name" />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="newEmail" className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Email Address
            </Label>
            <Input id="currentEmail" value={profile.email} disabled className="bg-muted text-sm" />
            <Input
              id="newEmail"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="New email (leave blank to keep current)"
            />
            <p className="text-xs text-muted-foreground">A verification link will be sent to both old and new email.</p>
          </div>

          <Separator />

          {/* Password */}
          <div className="space-y-4">
            <Label className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" /> Change Password
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-sm text-muted-foreground">New Password</Label>
                <Input id="newPassword" type="password" value={passwords.new} onChange={(e) => setPasswords({ ...passwords, new: e.target.value })} placeholder="••••••••" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm text-muted-foreground">Confirm Password</Label>
                <Input id="confirmPassword" type="password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} placeholder="••••••••" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Leave blank to keep current password.</p>
          </div>

          <Separator />

          {/* Single Save Button */}
          <Button onClick={handleSaveAll} disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save All Changes
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone: Sign Out + Delete */}
      <Card className="border-destructive/30">
        <CardContent className="pt-6 space-y-3">
          <Button variant="outline" className="w-full gap-2" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full gap-2">
                <Trash2 className="h-4 w-4" /> Delete Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all your contacts, messages, templates, settings and other data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteAccount} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Yes, Delete Everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
