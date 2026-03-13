export type AdminAppearance = {
  appName: string;
  primaryColor: string;
  fontFamily: string;
  darkMode: boolean;
  brandingLogo: string;
  notificationSound: string;
};

const DEFAULTS: AdminAppearance = {
  appName: 'waba',
  primaryColor: '#25D366',
  fontFamily: 'sf-pro',
  darkMode: false,
  brandingLogo: '',
  notificationSound: 'default',
};

export const ADMIN_APPEARANCE_EVENT = 'waba:admin-appearance-changed';

export function readAdminAppearance(): AdminAppearance {
  return {
    appName: localStorage.getItem('admin_app_name') || DEFAULTS.appName,
    primaryColor: localStorage.getItem('admin_primary_color') || DEFAULTS.primaryColor,
    fontFamily: localStorage.getItem('admin_font_family') || DEFAULTS.fontFamily,
    darkMode: localStorage.getItem('admin_dark_mode') === '1',
    brandingLogo: localStorage.getItem('admin_branding_logo') || DEFAULTS.brandingLogo,
    notificationSound: localStorage.getItem('admin_notification_sound') || DEFAULTS.notificationSound,
  };
}

const hexToHsl = (hex: string) => {
  const cleaned = hex.replace('#', '');
  const full = cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned;
  const r = parseInt(full.substring(0, 2), 16) / 255;
  const g = parseInt(full.substring(2, 4), 16) / 255;
  const b = parseInt(full.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return '0 0% 50%';
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
    case g: h = (b - r) / d + 2; break;
    case b: h = (r - g) / d + 4; break;
  }
  h /= 6;
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

export function applyAdminAppearance() {
  const settings = readAdminAppearance();
  const root = document.documentElement;
  root.style.setProperty('--primary', hexToHsl(settings.primaryColor));
  root.dataset.appName = settings.appName;

  root.style.setProperty('--admin-font-family', "'SF Pro Text', 'SF Pro Display', 'Roboto', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI', sans-serif");
  root.style.setProperty('--admin-font-family', "'SF Pro Text', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI', sans-serif");
  if (settings.fontFamily === 'inter') {
    root.style.setProperty('--admin-font-family', "Inter, 'SF Pro Text', -apple-system, sans-serif");
  } else {
    root.style.setProperty('--admin-font-family', "'SF Pro Text', 'SF Pro Display', -apple-system, sans-serif");
  }

  root.classList.toggle('dark', settings.darkMode);
  window.dispatchEvent(new CustomEvent(ADMIN_APPEARANCE_EVENT, { detail: settings }));
}

export function saveAndApplyAdminAppearance(updates: Partial<AdminAppearance>) {
  const current = readAdminAppearance();
  const next = { ...current, ...updates };
  localStorage.setItem('admin_app_name', next.appName);
  localStorage.setItem('admin_primary_color', next.primaryColor);
  localStorage.setItem('admin_font_family', next.fontFamily);
  localStorage.setItem('admin_dark_mode', next.darkMode ? '1' : '0');
  localStorage.setItem('admin_branding_logo', next.brandingLogo);
  localStorage.setItem('admin_notification_sound', next.notificationSound);
  applyAdminAppearance();
}
