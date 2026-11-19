export {
  APP_VARIABLES,
  computeDueDate,
  formatCurrentDate,
  formatCurrentTime,
  resolveMappedField,
  resolveTemplateBody,
  resolveVariable,
  formatTemplateForComposer,
} from '../../supabase/functions/_shared/templateVariables';
export type { TemplateVariable, VariableContext } from '../../supabase/functions/_shared/templateVariables';

/**
 * Inserts text into a textarea/input at the caret position and returns the new value
 * plus the caret offset to restore afterwards.
 */
export function insertAtCursor(
  el: HTMLTextAreaElement | HTMLInputElement | null,
  current: string,
  text: string
): { value: string; caret: number } {
  if (!el) {
    return { value: `${current}${text}`, caret: current.length + text.length };
  }
  const start = el.selectionStart ?? current.length;
  const end = el.selectionEnd ?? start;
  const value = current.slice(0, start) + text + current.slice(end);
  return { value, caret: start + text.length };
}
