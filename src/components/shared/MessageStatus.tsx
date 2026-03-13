import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Message } from '@/types';

interface MessageStatusProps {
  status: Message['status'];
  className?: string;
  strokeWidth?: number;
}

export function MessageStatus({ status, className, strokeWidth = 2.5 }: MessageStatusProps) {
  const iconClass = cn('h-4 w-4 shrink-0', className);

  switch (status) {
    case 'sending':
      return <Clock className={cn(iconClass, 'text-muted-foreground')} strokeWidth={strokeWidth} />;
    case 'sent':
      return <Check className={cn(iconClass, 'text-muted-foreground')} strokeWidth={strokeWidth} />;
    case 'delivered':
      return <CheckCheck className={cn(iconClass, 'text-muted-foreground')} strokeWidth={strokeWidth} />;
    case 'read':
      return <CheckCheck className={cn(iconClass, 'text-lotus-blue')} strokeWidth={strokeWidth} />;
    case 'failed':
      return <AlertCircle className={cn(iconClass, 'text-destructive')} strokeWidth={strokeWidth} />;
    default:
      return null;
  }
}
