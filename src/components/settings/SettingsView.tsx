import { Key, Palette, User, ChevronRight, ArrowLeft, FileText } from 'lucide-react';
import { useState } from 'react';
import { WhatsAppApiSettings } from '@/components/settings/WhatsAppApiSettings';
import { ThemeSettings } from '@/components/settings/ThemeSettings';
import { AccountSettings } from '@/components/settings/AccountSettings';
import { TemplateMappingSettings } from '@/components/settings/TemplateMappingSettings';
import { AppTemplateSettings } from '@/components/settings/AppTemplateSettings';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SettingsTab } from '@/types';
import { useIsMobile } from '@/hooks/use-mobile';
import { ScrollArea } from '@/components/ui/scroll-area';

const settingsTabs: { id: SettingsTab; label: string; icon: typeof Key; description: string }[] = [
  { id: 'api', label: 'WhatsApp API', icon: Key, description: 'Configure WhatsApp Cloud API' },
  { id: 'templates', label: 'Templates', icon: FileText, description: 'App templates & mapping' },
  { id: 'theme', label: 'Appearance', icon: Palette, description: 'Theme and colors' },
  { id: 'account', label: 'Account', icon: User, description: 'Profile and security' },
];

// Note: AppTemplateSettings is imported and used in the templates tab

export function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab | null>(null);
  const isMobile = useIsMobile();

  // Mobile: show list first, then detail on click
  if (isMobile) {
    if (!activeTab) {
      return (
        <div className="h-full overflow-y-auto custom-scrollbar">
          <div className="divide-y divide-panel-border">
            {settingsTabs.map(({ id, label, icon: Icon, description }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="w-full flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium">{label}</p>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      );
    }

    // Show detail view
    const currentTab = settingsTabs.find(t => t.id === activeTab);
    
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 bg-panel-header border-b border-panel-border shrink-0">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setActiveTab(null)}
            className="h-9 w-9"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">{currentTab?.label}</h1>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4">
            {activeTab === 'api' && <WhatsAppApiSettings />}
            {activeTab === 'templates' && (
              <div className="space-y-8">
                <AppTemplateSettings />
                <TemplateMappingSettings />
              </div>
            )}
            {activeTab === 'theme' && <ThemeSettings />}
            {activeTab === 'account' && <AccountSettings />}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Desktop: show sidebar with content
  return (
    <div className="h-full flex">
      {/* Settings Sidebar */}
      <div className="w-64 border-r border-panel-border bg-panel-header/50">
        <div className="p-4">
          <h2 className="font-semibold text-lg">Settings</h2>
        </div>
        <nav className="space-y-1 px-2">
          {settingsTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left',
                activeTab === id 
                  ? 'bg-accent text-primary' 
                  : 'hover:bg-accent/50 text-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="font-medium">{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="max-w-2xl">
          {(!activeTab || activeTab === 'api') && <WhatsAppApiSettings />}
          {activeTab === 'templates' && (
            <div className="space-y-8">
              <AppTemplateSettings />
              <TemplateMappingSettings />
            </div>
          )}
          {activeTab === 'theme' && <ThemeSettings />}
          {activeTab === 'account' && <AccountSettings />}
        </div>
      </div>
    </div>
  );
}
