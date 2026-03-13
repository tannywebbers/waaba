import { useState, useEffect } from 'react';
import { Bell, BellOff, Volume2, VolumeX, Vibrate, MessageCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function NotificationSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  
  const [settings, setSettings] = useState({
    enabled: false,
    sound: true,
    vibrate: true,
    preview: true,
    permission: 'default' as NotificationPermission,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = () => {
    // Check browser notification permission
    if ('Notification' in window) {
      setSettings(prev => ({
        ...prev,
        permission: Notification.permission,
        enabled: Notification.permission === 'granted',
      }));
    }

    // Load saved preferences from localStorage
    const saved = localStorage.getItem('notification_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error('Error loading notification settings:', e);
      }
    }
    setLoading(false);
  };

  const saveSettings = (newSettings: typeof settings) => {
    setSettings(newSettings);
    localStorage.setItem('notification_settings', JSON.stringify(newSettings));
  };

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      toast({ 
        title: 'Notifications not supported', 
        description: 'Your browser does not support notifications',
        variant: 'destructive' 
      });
      return;
    }

    setRequesting(true);
    
    // FIXED: Better error handling for notification permission request
    try {
      // Request permission
      const permission = await Notification.requestPermission();
      
      // Update settings based on permission result
      const newSettings = {
        ...settings,
        permission,
        enabled: permission === 'granted',
      };
      saveSettings(newSettings);

      // Show appropriate feedback
      if (permission === 'granted') {
        toast({ 
          title: 'Notifications enabled',
          description: 'You will now receive notifications for new messages'
        });
        
        // Show test notification
        try {
          new Notification('waba', {
            body: 'Notifications are now enabled!',
            icon: '/pwa-192x192.png',
          });
        } catch (notifError) {
          console.error('Error showing test notification:', notifError);
          // Don't show error to user - permission was granted successfully
        }
      } else if (permission === 'denied') {
        toast({ 
          title: 'Notifications blocked', 
          description: 'Please enable notifications in your browser settings',
          variant: 'destructive' 
        });
      } else {
        // Permission was dismissed/default
        toast({ 
          title: 'Notification permission not granted',
          description: 'You can enable notifications later from settings',
        });
      }
    } catch (error) {
      // FIXED: Only show error for actual errors, not for user dismissal
      console.error('Error requesting notification permission:', error);
      
      // Check if it's a real error or just user dismissal
      if (error instanceof Error) {
        toast({ 
          title: 'Error enabling notifications', 
          description: 'Please try again or check your browser settings',
          variant: 'destructive' 
        });
      } else {
        // User likely dismissed the prompt
        toast({ 
          title: 'Notification permission not granted',
          description: 'You can enable notifications later from settings',
        });
      }
    } finally {
      setRequesting(false);
    }
  };

  const handleToggle = (key: keyof typeof settings, value: boolean) => {
    if (key === 'enabled' && value && settings.permission !== 'granted') {
      requestPermission();
      return;
    }
    
    const newSettings = { ...settings, [key]: value };
    saveSettings(newSettings);
    
    toast({ title: `${key.charAt(0).toUpperCase() + key.slice(1)} ${value ? 'enabled' : 'disabled'}` });
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Push Notifications
          </CardTitle>
          <CardDescription>
            Get notified when you receive new messages
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable Notifications */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {settings.enabled ? (
                <Bell className="h-5 w-5 text-primary" />
              ) : (
                <BellOff className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <Label htmlFor="notifications" className="font-medium">
                  Enable Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  {settings.permission === 'denied' 
                    ? 'Blocked in browser settings' 
                    : 'Receive push notifications for new messages'}
                </p>
              </div>
            </div>
            <Switch
              id="notifications"
              checked={settings.enabled}
              onCheckedChange={(checked) => handleToggle('enabled', checked)}
              disabled={settings.permission === 'denied'}
            />
          </div>

          {settings.permission === 'denied' && (
            <div className="p-4 bg-destructive/10 rounded-lg">
              <p className="text-sm text-destructive font-medium mb-2">
                Notifications are blocked
              </p>
              <p className="text-sm text-muted-foreground">
                To enable notifications, you need to:
              </p>
              <ol className="text-sm text-muted-foreground list-decimal list-inside mt-2 space-y-1">
                <li>Click the lock icon in your browser's address bar</li>
                <li>Find "Notifications" in the permissions list</li>
                <li>Change it from "Block" to "Allow"</li>
                <li>Reload this page</li>
              </ol>
            </div>
          )}

          {settings.permission === 'default' && (
            <Button 
              onClick={requestPermission} 
              disabled={requesting}
              className="w-full"
            >
              {requesting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Bell className="h-4 w-4 mr-2" />
              )}
              Enable Notifications
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5 text-primary" />
            Sound & Vibration
          </CardTitle>
          <CardDescription>
            Customize notification alerts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Sound */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {settings.sound ? (
                <Volume2 className="h-5 w-5 text-primary" />
              ) : (
                <VolumeX className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <Label htmlFor="sound" className="font-medium">
                  Notification Sound
                </Label>
                <p className="text-sm text-muted-foreground">
                  Play sound for new messages
                </p>
              </div>
            </div>
            <Switch
              id="sound"
              checked={settings.sound}
              onCheckedChange={(checked) => handleToggle('sound', checked)}
            />
          </div>

          {/* Vibration */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Vibrate className={settings.vibrate ? 'h-5 w-5 text-primary' : 'h-5 w-5 text-muted-foreground'} />
              <div>
                <Label htmlFor="vibrate" className="font-medium">
                  Vibration
                </Label>
                <p className="text-sm text-muted-foreground">
                  Vibrate on new messages (mobile)
                </p>
              </div>
            </div>
            <Switch
              id="vibrate"
              checked={settings.vibrate}
              onCheckedChange={(checked) => handleToggle('vibrate', checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            Message Preview
          </CardTitle>
          <CardDescription>
            Privacy settings for notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageCircle className={settings.preview ? 'h-5 w-5 text-primary' : 'h-5 w-5 text-muted-foreground'} />
              <div>
                <Label htmlFor="preview" className="font-medium">
                  Show Message Preview
                </Label>
                <p className="text-sm text-muted-foreground">
                  Display message content in notifications
                </p>
              </div>
            </div>
            <Switch
              id="preview"
              checked={settings.preview}
              onCheckedChange={(checked) => handleToggle('preview', checked)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
