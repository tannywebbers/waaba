import { useState, useEffect } from 'react';
import { User, Mail, Lock, Smartphone, LogOut, Camera, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ContactAvatar } from '@/components/shared/ContactAvatar';
import { useToast } from '@/hooks/use-toast';

export function AccountSettings() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    avatarUrl: '',
  });
  const [passwords, setPasswords] = useState({
    new: '',
    confirm: '',
  });

  useEffect(() => {
    if (user) {
      loadProfile();
    }
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

      if (data) {
        setProfile({
          name: data.name || user.email?.split('@')[0] || '',
          email: user.email || '',
          avatarUrl: data.avatar_url || '',
        });
      } else {
        setProfile({
          name: user.user_metadata?.name || user.email?.split('@')[0] || '',
          email: user.email || '',
          avatarUrl: '',
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSave = async () => {
    if (!user) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({ 
          user_id: user.id,
          name: profile.name,
          email: profile.email,
          avatar_url: profile.avatarUrl,
        }, { onConflict: 'user_id' });

      if (error) throw error;

      toast({
        title: 'Profile updated',
        description: 'Your profile has been saved successfully.',
      });
    } catch (error: any) {
      toast({
        title: 'Error updating profile',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (passwords.new !== passwords.confirm) {
      toast({
        title: 'Passwords do not match',
        description: 'Please make sure your new passwords match.',
        variant: 'destructive',
      });
      return;
    }

    if (passwords.new.length < 6) {
      toast({
        title: 'Password too short',
        description: 'Password must be at least 6 characters.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwords.new
      });

      if (error) throw error;

      toast({
        title: 'Password changed',
        description: 'Your password has been updated successfully.',
      });
      setPasswords({ new: '', confirm: '' });
    } catch (error: any) {
      toast({
        title: 'Error changing password',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
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
      {/* Profile Card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Profile
          </CardTitle>
          <CardDescription>
            Manage your personal information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar Section */}
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

          {/* Form Fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Display Name</Label>
              <Input
                id="name"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                placeholder="Enter your name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                value={profile.email}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">Email cannot be changed</p>
            </div>
          </div>

          <Button onClick={handleProfileSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* Password Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Security
          </CardTitle>
          <CardDescription>
            Update your password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={passwords.new}
                onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                placeholder="••••••••"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={passwords.confirm}
                onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                placeholder="••••••••"
              />
            </div>
          </div>

          <Button 
            onClick={handlePasswordChange} 
            disabled={saving || !passwords.new || passwords.new !== passwords.confirm}
            variant="outline"
            className="w-full sm:w-auto"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Update Password
          </Button>
        </CardContent>
      </Card>

      {/* Session Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Current Session
          </CardTitle>
          <CardDescription>
            Manage your active session
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Smartphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">This Device</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-lotus-green/10 text-lotus-green">
              Active
            </span>
          </div>

          <Separator />

          <Button 
            variant="destructive" 
            className="w-full gap-2"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}