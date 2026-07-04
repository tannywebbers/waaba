import { useState, useEffect } from 'react';
import { ChevronRight, ArrowLeft, BarChart3, FileText, LayoutTemplate, Users, AppWindow } from 'lucide-react';
import { WhatsAppApiSettings } from '@/components/settings/WhatsAppApiSettings';
import { ThemeSettings } from '@/components/settings/ThemeSettings';
import { AccountSettings } from '@/components/settings/AccountSettings';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { WhatsAppBusinessProfile } from '@/components/settings/WhatsAppBusinessProfile';
import { ApiStatsPage } from '@/components/settings/ApiStatsPage';
import { TemplateMappingSettings } from '@/components/settings/TemplateMappingSettings';
import { AppTemplateSettings } from '@/components/settings/AppTemplateSettings';
import { AppsSettings } from '@/components/settings/AppsSettings';
import { SharedInboxSettings } from '@/components/settings/SharedInboxSettings';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

type SettingsTab = 'api' | 'theme' | 'account' | 'notifications' | 'business' | 'stats' | 'template-mapping' | 'apps' | 'app-templates' | 'shared-inbox';

interface SettingsItem {
  id: SettingsTab;
  label: string;
  description: string;
  iconSrc?: string;
  iconBg: string;
  showBadge?: boolean;
}

const settingsTabs: SettingsItem[] = [
  { id: 'business',         label: 'Business Profile',   description: 'WhatsApp Business info',            iconSrc: '/icons/business-profile.png', iconBg: 'bg-[hsl(168,100%,18%)]' },
  { id: 'api',              label: 'WhatsApp API',        description: 'Configure Cloud API',               iconSrc: '/icons/webhook.png',           iconBg: 'bg-[hsl(145,63%,49%)]', showBadge: true },
  { id: 'stats',            label: 'API Stats',           description: 'Message analytics & usage',         iconBg: 'bg-[hsl(199,89%,48%)]' },
  { id: 'template-mapping', label: 'Template Mapping',    description: 'Map template variables to data',    iconBg: 'bg-[hsl(32,95%,52%)]' },
  { id: 'apps',             label: 'Apps',                description: 'Manage your app names',              iconBg: 'bg-[hsl(280,70%,50%)]' },
  { id: 'app-templates',    label: 'App Templates',       description: 'Create & manage message templates',  iconBg: 'bg-[hsl(262,83%,58%)]' },
  { id: 'shared-inbox',     label: 'Shared Inbox',        description: 'Share inbox with other users',       iconBg: 'bg-[hsl(210,70%,50%)]' },
  { id: 'notifications',    label: 'Notifications',       description: 'Message alerts and sounds',         iconBg: 'bg-[hsl(0,84%,60%)]' },
  { id: 'theme',            label: 'Appearance',          description: 'Theme and colors',                  iconSrc: '/icons/appearance.png', iconBg: 'bg-[hsl(262,83%,58%)]' },
  { id: 'account',          label: 'Account',             description: 'Profile and security',              iconBg: 'bg-[hsl(199,89%,48%)]' },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (user) checkConnectionStatus();
  }, [user]);

  const checkConnectionStatus = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('whatsapp_settings')
        .select('is_connected')
        .eq('user_id', user.id)
        .maybeSingle();
      setIsConnected(data?.is_connected || false);
    } catch {}
  };

  if (activeTab) {
    const currentTab = settingsTabs.find(t => t.id === activeTab);
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex items-center gap-1 px-2 pt-2 pb-1 bg-panel shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setActiveTab(null)} className="h-9 w-9 text-primary">
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <h1 className="text-[17px] font-semibold">{currentTab?.label}</h1>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-4">
            {activeTab === 'business'         && <WhatsAppBusinessProfile />}
            {activeTab === 'api'              && <WhatsAppApiSettings onConnectionChange={setIsConnected} />}
            {activeTab === 'stats'            && <ApiStatsPage />}
            {activeTab === 'template-mapping' && <TemplateMappingSettings />}
            {activeTab === 'app-templates'    && <AppTemplateSettings />}
            {activeTab === 'shared-inbox'     && <SharedInboxSettings />}
            {activeTab === 'notifications'    && <NotificationSettings />}
            {activeTab === 'theme'            && <ThemeSettings />}
            {activeTab === 'account'          && <AccountSettings />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 pt-3 pb-1 bg-panel shrink-0">
        <h1 className="text-[34px] font-bold tracking-tight text-foreground">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="bg-card mt-2 rounded-xl mx-3 overflow-hidden">
          {settingsTabs.map(({ id, label, description, iconSrc, iconBg, showBadge }, index) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="ios-settings-row"
            >
              <div className={`ios-settings-icon ${iconBg}`}>
                {iconSrc ? (
                  <img src={iconSrc} alt={label} className="h-[18px] w-[18px] object-contain brightness-0 invert" />
                ) : id === 'stats' ? (
                  <BarChart3 className="h-[18px] w-[18px] text-white" />
                ) : id === 'template-mapping' ? (
                  <FileText className="h-[18px] w-[18px] text-white" />
                ) : id === 'app-templates' ? (
                  <LayoutTemplate className="h-[18px] w-[18px] text-white" />
                ) : id === 'shared-inbox' ? (
                  <Users className="h-[18px] w-[18px] text-white" />
                ) : id === 'notifications' ? (
                  <svg className="h-[18px] w-[18px] text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                ) : id === 'account' ? (
                  <svg className="h-[18px] w-[18px] text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                ) : null}
              </div>
              <div className={cn(
                "flex-1 text-left min-w-0",
                index < settingsTabs.length - 1 && "border-b border-panel-border pb-[13px]"
              )}>
                <div className="flex items-center gap-2">
                  <p className="text-[17px] font-medium">{label}</p>
                  {showBadge && (
                    <Badge
                      variant={isConnected ? 'default' : 'secondary'}
                      className="text-[10px] px-1.5 py-0 h-[18px]"
                    >
                      {isConnected ? 'Connected' : 'Not Connected'}
                    </Badge>
                  )}
                </div>
                <p className="text-[13px] text-muted-foreground">{description}</p>
              </div>
              <ChevronRight className="h-[18px] w-[18px] text-muted-foreground/50 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
