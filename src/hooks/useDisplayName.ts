import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * The signed-in user's display name, used by the {{user_display_name}} template
 * variable. Prefers the profiles row, falling back to auth metadata.
 */
export function useDisplayName(): string {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    let active = true;
    const metadata = user?.user_metadata || {};
    const fallback = String(metadata.name || metadata.full_name || metadata.display_name || '').trim();

    if (!user) {
      setDisplayName('');
      return;
    }

    setDisplayName(fallback);

    supabase
      .from('profiles')
      .select('name')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const profileName = String(data?.name || '').trim();
        if (active && profileName) setDisplayName(profileName);
      });

    return () => { active = false; };
  }, [user]);

  return displayName;
}