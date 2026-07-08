import { useEffect, useRef } from 'react';

/**
 * When `open` is true, pressing the Android hardware back button (or browser back)
 * calls `onClose` instead of navigating away. Each open dialog pushes exactly one
 * history entry so stacked dialogs unwind one at a time.
 */
export function useDialogBackButton(open: boolean, onClose: () => void) {
  const pushedRef = useRef(false);
  const closingRef = useRef(false);

  useEffect(() => {
    if (!open) {
      // If we programmatically closed, pop our own entry so history stays clean.
      if (pushedRef.current && !closingRef.current) {
        closingRef.current = true;
        try { window.history.back(); } catch {}
      }
      pushedRef.current = false;
      closingRef.current = false;
      return;
    }

    // Dialog just opened: push a sentinel history entry.
    window.history.pushState({ wabaDialog: true }, '');
    pushedRef.current = true;

    const handler = () => {
      if (!pushedRef.current) return;
      pushedRef.current = false;
      closingRef.current = true; // prevents the cleanup effect from popping again
      onClose();
    };

    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
