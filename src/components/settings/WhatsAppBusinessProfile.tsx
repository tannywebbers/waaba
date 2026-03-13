// @ts-nocheck
import { useState, useEffect } from 'react';
import { Building2, Globe, Mail, MapPin, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface BusinessProfile {
  name: string;
  description?: string;
  address?: string;
  email?: string;
  website?: string;
  website2?: string;
  vertical?: string;
  profilePictureUrl?: string;
}

export function WhatsAppBusinessProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadProfile();
  }, [user]);

  const loadProfile = async (isRefresh = false) => {
    if (!user) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);

    try {
      // Use the same pattern as Settings page — fetch settings first, then call edge function
      const { data: settings, error: settingsError } = await supabase
        .from('whatsapp_settings')
        .select('api_token, phone_number_id, is_connected')
        .eq('user_id', user.id)
        .maybeSingle();

      if (settingsError) throw new Error('Failed to load WhatsApp settings');
      if (!settings || !settings.is_connected) { setIsConnected(false); return; }
      if (!settings.api_token || !settings.phone_number_id) {
        setIsConnected(false);
        setError('Missing API credentials. Please reconfigure your WhatsApp API.');
        return;
      }

      setIsConnected(true);

      // Same invocation as Settings page testConnection — this is known to work
      const { data, error: apiError } = await supabase.functions.invoke('whatsapp-api', {
        body: {
          action: 'get_business_profile',
          token: settings.api_token,
          phoneNumberId: settings.phone_number_id,
        },
      });

      if (apiError) throw new Error(apiError.message || 'Edge function error');
      if (!data?.success) throw new Error(data?.error || 'Failed to fetch business profile');

      setProfile(data.profile || null);
      setPhoneNumber(data.phoneNumber || '');

      if (isRefresh) {
        toast({ title: '✅ Profile refreshed' });
      }
    } catch (err: any) {
      console.error('[Business Profile] Error:', err);
      setError(err.message || 'Failed to load business profile');
      if (isRefresh) {
        toast({ title: 'Failed to refresh', description: err.message, variant: 'destructive' });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Not Connected</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Connect your WhatsApp Business Account in Settings → WhatsApp API first.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Error Loading Profile</h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-4">{error}</p>
          <Button variant="outline" onClick={() => loadProfile(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const hasExtraDetails = profile?.vertical || profile?.address || profile?.email || profile?.website || profile?.website2;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base">Business Profile</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => loadProfile(true)} disabled={refreshing} className="h-8 w-8 p-0 shrink-0">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">

        {/* Profile picture + name + phone */}
        <div className="flex items-center gap-4">
          {profile?.profilePictureUrl ? (
            <img
              src={profile.profilePictureUrl}
              alt={profile.name}
              className="h-16 w-16 rounded-full object-cover shrink-0 border"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xl shrink-0">
              {(profile?.name || 'B').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-base truncate">{profile?.name || 'Your Business'}</p>
            {phoneNumber && (
              <p className="text-sm text-muted-foreground">{phoneNumber}</p>
            )}
            <Badge variant="default" className="mt-1 bg-green-600 text-white text-[11px]">
              Connected
            </Badge>
          </div>
        </div>

        {/* Description */}
        {profile?.description ? (
          <>
            <Separator />
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Description</p>
              <p className="text-sm">{profile.description}</p>
            </div>
          </>
        ) : null}

        {/* Extra details — only shown if at least one exists */}
        {hasExtraDetails ? (
          <>
            <Separator />
            <div className="space-y-2.5">
              {profile?.vertical && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{profile.vertical}</span>
                </div>
              )}
              {profile?.address && (
                <div className="flex items-center gap-2.5 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{profile.address}</span>
                </div>
              )}
              {profile?.email && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{profile.email}</span>
                </div>
              )}
              {profile?.website && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a
                    href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline truncate"
                  >
                    {profile.website}
                  </a>
                </div>
              )}
              {profile?.website2 && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a
                    href={profile.website2.startsWith('http') ? profile.website2 : `https://${profile.website2}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline truncate"
                  >
                    {profile.website2}
                  </a>
                </div>
              )}
            </div>
          </>
        ) : null}

        {/* Fallback if truly nothing except name */}
        {!profile?.description && !hasExtraDetails && (
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground text-center">
              No additional profile details set. Update your business profile in Meta Business Suite.
            </p>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
