import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { isContactOnline } from '@/lib/utils/presence';
import { User } from 'lucide-react';

interface ContactAvatarProps {
  name: string;
  avatar?: string;
  isOnline?: boolean;
  lastSeen?: Date;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-10 w-10',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
};

const iconSizeClasses = {
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

const statusSizeClasses = {
  sm: 'h-2.5 w-2.5 right-0 bottom-0',
  md: 'h-3 w-3 right-0.5 bottom-0.5',
  lg: 'h-4 w-4 right-0.5 bottom-0.5',
};

export function ContactAvatar({ name, avatar, isOnline, lastSeen, size = 'md', className }: ContactAvatarProps) {
  const realOnline = isContactOnline(lastSeen, isOnline);

  return (
    <div className="relative shrink-0">
      <Avatar className={cn(sizeClasses[size], 'bg-muted', className)}>
        <AvatarImage src={avatar} alt={name} />
        <AvatarFallback className="bg-muted text-muted-foreground">
          {/* Default profile icon instead of initials */}
          <User className={cn(iconSizeClasses[size], 'stroke-[1.5px]')} />
        </AvatarFallback>
      </Avatar>
      {(isOnline !== undefined || lastSeen !== undefined) && (
        <span
          className={cn(
            'absolute rounded-full border-2 border-background',
            statusSizeClasses[size],
            realOnline ? 'bg-[hsl(var(--status-online))]' : 'bg-[hsl(var(--status-offline))]'
          )}
        />
      )}
    </div>
  );
}
