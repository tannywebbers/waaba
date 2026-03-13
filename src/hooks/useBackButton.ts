import { useEffect } from 'react';

/**
 * Handles Android hardware back button / browser popstate
 * for native-like navigation in the mobile app.
 */
export function useBackButton(onBack: () => boolean) {
  useEffect(() => {
    // Push a dummy state so popstate fires on back press
    window.history.pushState({ waba: true }, '');

    const handler = (e: PopStateEvent) => {
      const handled = onBack();
      if (handled) {
        // Re-push so back button keeps working
        window.history.pushState({ waba: true }, '');
      }
    };

    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [onBack]);
}

