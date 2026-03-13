import { useState } from 'react';
import { Key, Smartphone, Link, TestTube, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export function ApiSettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState({
    apiToken: '',
    phoneNumberId: '',
    businessAccountId: '',
    webhookUrl: '',
  });
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSave = () => {
    // Would save to backend in real implementation
    toast({
      title: 'Settings saved',
      description: 'Your WhatsApp API settings have been updated.',
    });
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionStatus('idle');
    
    // Simulate API test
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (settings.apiToken && settings.phoneNumberId) {
      setConnectionStatus('success');
      toast({
        title: 'Connection successful',
        description: 'WhatsApp Cloud API is connected and working.',
      });
    } else {
      setConnectionStatus('error');
      toast({
        title: 'Connection failed',
        description: 'Please check your API credentials and try again.',
        variant: 'destructive',
      });
    }
    
    setIsTestingConnection(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            WhatsApp Cloud API
          </CardTitle>
          <CardDescription>
            Connect your WhatsApp Business Account to send and receive messages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiToken">API Token</Label>
            <Input
              id="apiToken"
              type="password"
              value={settings.apiToken}
              onChange={(e) => setSettings({ ...settings, apiToken: e.target.value })}
              placeholder="Enter your WhatsApp Cloud API token"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phoneNumberId" className="flex items-center gap-1.5">
                <Smartphone className="h-3.5 w-3.5" />
                Phone Number ID
              </Label>
              <Input
                id="phoneNumberId"
                value={settings.phoneNumberId}
                onChange={(e) => setSettings({ ...settings, phoneNumberId: e.target.value })}
                placeholder="123456789012345"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessAccountId">Business Account ID</Label>
              <Input
                id="businessAccountId"
                value={settings.businessAccountId}
                onChange={(e) => setSettings({ ...settings, businessAccountId: e.target.value })}
                placeholder="987654321098765"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhookUrl" className="flex items-center gap-1.5">
              <Link className="h-3.5 w-3.5" />
              Webhook URL
            </Label>
            <Input
              id="webhookUrl"
              value={settings.webhookUrl}
              onChange={(e) => setSettings({ ...settings, webhookUrl: e.target.value })}
              placeholder="https://your-domain.com/webhook"
            />
          </div>

          <div className="flex items-center gap-3 pt-4">
            <Button onClick={handleSave}>Save Settings</Button>
            <Button 
              variant="outline" 
              onClick={handleTestConnection}
              disabled={isTestingConnection}
              className="gap-2"
            >
              {isTestingConnection ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Testing...
                </>
              ) : (
                <>
                  <TestTube className="h-4 w-4" />
                  Test Connection
                </>
              )}
            </Button>
            
            {connectionStatus === 'success' && (
              <span className="flex items-center gap-1 text-sm text-lotus-green">
                <Check className="h-4 w-4" />
                Connected
              </span>
            )}
            {connectionStatus === 'error' && (
              <span className="flex items-center gap-1 text-sm text-destructive">
                <X className="h-4 w-4" />
                Failed
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
