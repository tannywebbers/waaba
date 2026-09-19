export interface TemplateVariable {
  value: string;
  label: string;
}

/** Variables available to app templates and auto replies. */
export const APP_VARIABLES: TemplateVariable[] = [
  { value: 'customer_name', label: 'Customer Name' },
  { value: 'loan_id', label: 'Loan ID' },
  { value: 'amount', label: 'Amount' },
  { value: 'due_date', label: 'Due Date' },
  { value: 'account_number', label: 'Account Number' },
  { value: 'phone_number', label: 'Phone Number' },
  { value: 'app_name', label: 'App Name' },
  { value: 'day_type', label: 'Day Type' },
  { value: 'current_date', label: 'Current Date' },
  { value: 'current_time', label: 'Current Time' },
  { value: 'payment_details', label: 'Payment Details' },
];

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
