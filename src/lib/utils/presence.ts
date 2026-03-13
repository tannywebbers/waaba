// Compute real presence status from lastSeen timestamp
// 70 seconds threshold as per WhatsApp standard
const ONLINE_THRESHOLD_MS = 70 * 1000; // 70 seconds

export function isContactOnline(lastSeen?: Date | string | null, storedOnline?: boolean): boolean {
  if (lastSeen) {
    const lastSeenDate = typeof lastSeen === 'string' ? new Date(lastSeen) : lastSeen;
    return Date.now() - lastSeenDate.getTime() < ONLINE_THRESHOLD_MS;
  }
  // Fall back to stored online status from DB
  return storedOnline || false;
}

export function formatPresenceStatus(lastSeen?: Date | string | null): string {
  if (!lastSeen) return 'offline';
  const lastSeenDate = typeof lastSeen === 'string' ? new Date(lastSeen) : lastSeen;
  const diff = Date.now() - lastSeenDate.getTime();
  if (diff < ONLINE_THRESHOLD_MS) return 'online';

  // Show relative time
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `last seen ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `last seen about ${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `last seen ${days} day${days > 1 ? 's' : ''} ago`;
}
