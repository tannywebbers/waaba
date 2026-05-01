// Shared formatter so chat list, notifications, and replies all show
// the same emoji-prefixed preview (📷 Image, 🎵 Voice note, …).
import type { Message } from '@/types';

export function getMessagePreview(input: { type?: string; content?: string } | Message | null | undefined): string {
  if (!input) return '';
  const t = (input as any).type as string;
  const content = ((input as any).content || '').toString();

  switch (t) {
    case 'image':    return content && content !== '[Image]' ? `📷 ${content}` : '📷 Image';
    case 'video':    return content ? `🎬 ${content}` : '🎬 Video';
    case 'audio':    return '🎵 Voice note';
    case 'document': return `📄 ${content || 'Document'}`;
    case 'sticker':  return '🎨 Sticker';
    case 'location': return '📍 Location';
    case 'contacts': return '👤 Contact shared';
    case 'template': {
      const preview = content.split('\n')[0]?.trim() || 'Template';
      return `📋 ${preview.length > 60 ? preview.slice(0, 60) + '…' : preview}`;
    }
    default: return content || (t ? `[${t}]` : '');
  }
}
