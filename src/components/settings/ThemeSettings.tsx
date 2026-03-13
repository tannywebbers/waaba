import { useState, useEffect } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const themes = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
];

export function ThemeSettings() {
  const [theme, setTheme] = useState(() => localStorage.getItem('app_theme') || 'light');

  useEffect(() => {
    applyTheme(theme);
  }, []);

  const applyTheme = (value: string) => {
    const isDark = value === 'dark' || (value === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.add('theme-transition');
    setTimeout(() => document.documentElement.classList.remove('theme-transition'), 300);
  };

  const handleThemeChange = (value: string) => {
    setTheme(value);
    localStorage.setItem('app_theme', value);
    applyTheme(value);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[17px]">
            <img src="/icons/appearance.png" alt="Appearance" className="h-5 w-5 object-contain" />
            Appearance
          </CardTitle>
          <CardDescription className="text-[13px]">
            Customize how WABA looks on your device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup 
            value={theme} 
            onValueChange={handleThemeChange}
            className="grid grid-cols-3 gap-3"
          >
            {themes.map(({ id, label, icon: Icon }) => (
              <Label
                key={id}
                htmlFor={id}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border-2 p-4 cursor-pointer transition-all',
                  theme === id 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-primary/50'
                )}
              >
                <RadioGroupItem value={id} id={id} className="sr-only" />
                <Icon className="h-7 w-7" />
                <span className="text-[14px] font-semibold">{label}</span>
              </Label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>
    </div>
  );
}