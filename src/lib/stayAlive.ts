/**
 * Stay-alive pinger — keeps the app URL warm to prevent cold starts.
 * Pings every 60 seconds.
 */

let pingInterval: ReturnType<typeof setInterval> | null = null;

export function startStayAlive(webhookUrl?: string) {
  if (pingInterval) return; // Already running

  const ping = async () => {
    try {
      const url = webhookUrl || `${window.location.origin}`;
      await fetch(url, { method: 'GET', mode: 'no-cors' });
    } catch {
      // Silently ignore — we just want to keep the connection alive
    }
  };

  // Immediate first ping
  ping();

  // Then every 60 seconds
  pingInterval = setInterval(ping, 20_000);
}

export function stopStayAlive() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}
