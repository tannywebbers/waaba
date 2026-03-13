import { formatDistanceToNow, format, isToday, isYesterday, differenceInCalendarDays } from 'date-fns';

export function formatMessageTime(date: Date): string {
  return format(date, 'HH:mm');
}

export function formatChatTime(date: Date): string {
  if (isToday(date)) {
    return format(date, 'HH:mm');
  }
  if (isYesterday(date)) {
    return 'Yesterday';
  }
  const days = differenceInCalendarDays(new Date(), date);
  if (days < 7) {
    return format(date, 'EEEE');
  }
  return format(date, 'dd/MM/yyyy');
}

export function formatLastSeen(date: Date): string {
  return `last seen ${formatDistanceToNow(date, { addSuffix: true })}`;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function parseAccountDetails(input: string): Array<{ bank: string; accountNumber: string; accountName: string }> {
  const accounts: Array<{ bank: string; accountNumber: string; accountName: string }> = [];
  
  // Split by comma (the only recognized separator)
  const blocks = input.split(',').filter(block => block.trim());
  
  for (const block of blocks) {
    const lines = block.trim().split('\n').filter(line => line.trim());
    const account: { bank: string; accountNumber: string; accountName: string } = {
      bank: '',
      accountNumber: '',
      accountName: '',
    };
    
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;
      
      const key = line.substring(0, colonIndex).trim().toLowerCase();
      const value = line.substring(colonIndex + 1).trim();
      
      if (key.includes('bank')) {
        account.bank = value;
      } else if (key.includes('account') && !key.includes('name')) {
        account.accountNumber = value;
      } else if (key.includes('name')) {
        account.accountName = value;
      }
    }
    
    if (account.bank || account.accountNumber || account.accountName) {
      accounts.push(account);
    }
  }
  
  return accounts;
}

export function parseBulkContacts(input: string): Array<{ loanId: string; name: string; phone: string }> {
  const lines = input.trim().split('\n').filter(line => line.trim());
  
  // Try to detect the format - looking for patterns
  const loanIds: string[] = [];
  const names: string[] = [];
  const phones: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check if it's a phone number (digits only or with + prefix)
    if (/^[\d\s+()-]+$/.test(trimmed) && trimmed.replace(/\D/g, '').length >= 5) {
      phones.push(trimmed);
    }
    // Check if it starts with "Id" or looks like an ID
    else if (/^Id\s*\d+$/i.test(trimmed) || /^[A-Z]{2,}-?\d+$/i.test(trimmed)) {
      loanIds.push(trimmed);
    }
    // Check if it starts with "Customer" or looks like a name
    else if (/^Customer\s+\d+$/i.test(trimmed) || /^[A-Za-z\s]+$/.test(trimmed)) {
      names.push(trimmed);
    }
    // Default: try to categorize by content
    else if (trimmed.length > 0) {
      // If it has letters, treat as name
      if (/[A-Za-z]/.test(trimmed)) {
        names.push(trimmed);
      } else {
        phones.push(trimmed);
      }
    }
  }
  
  const count = Math.min(loanIds.length, names.length, phones.length);
  const contacts: Array<{ loanId: string; name: string; phone: string }> = [];
  
  for (let i = 0; i < count; i++) {
    contacts.push({
      loanId: loanIds[i] || `LN-${Date.now()}-${i}`,
      name: names[i] || `Contact ${i + 1}`,
      phone: phones[i] || '',
    });
  }
  
  return contacts;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function formatCurrency(amount: number): string {
  // No currency symbol — display plain number
  return new Intl.NumberFormat('en-NG', {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getCurrentDate(): string {
  return new Date().toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function getCurrentTime(): string {
  return new Date().toLocaleTimeString('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
