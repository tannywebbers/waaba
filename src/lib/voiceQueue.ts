// Sequential voice-note player — WhatsApp behaviour: only one voice note plays at a
// time; when the current one ends, the NEXT voice note in the same chat (after the
// one that just played) auto-plays.
//
// Components register their HTMLAudioElement with `register(messageId, chatId, el)`
// and tell us when they were created in `order` (timestamp ms). When the user hits
// play, the bubble calls `play(messageId)`. When playback ends, we look up the
// next message in the same chat with timestamp > current and start it.

type Entry = {
  chatId: string;
  order: number;
  el: HTMLAudioElement;
  setPlaying: (p: boolean) => void;
};

class VoiceQueue {
  private entries = new Map<string, Entry>();
  private currentId: string | null = null;

  register(messageId: string, chatId: string, order: number, el: HTMLAudioElement, setPlaying: (p: boolean) => void) {
    this.entries.set(messageId, { chatId, order, el, setPlaying });
  }

  unregister(messageId: string) {
    if (this.currentId === messageId) this.currentId = null;
    this.entries.delete(messageId);
  }

  async play(messageId: string) {
    // Stop any other audio currently playing
    if (this.currentId && this.currentId !== messageId) {
      const prev = this.entries.get(this.currentId);
      if (prev) {
        prev.el.pause();
        prev.setPlaying(false);
      }
    }
    const entry = this.entries.get(messageId);
    if (!entry) return;
    this.currentId = messageId;
    try {
      await entry.el.play();
      entry.setPlaying(true);
    } catch {
      entry.setPlaying(false);
      this.currentId = null;
    }
  }

  pause(messageId: string) {
    const entry = this.entries.get(messageId);
    if (!entry) return;
    entry.el.pause();
    entry.setPlaying(false);
    if (this.currentId === messageId) this.currentId = null;
  }

  // Called when an audio element finishes — auto-advance to the next voice note in the same chat
  ended(messageId: string) {
    const entry = this.entries.get(messageId);
    if (!entry) return;
    entry.setPlaying(false);
    if (this.currentId === messageId) this.currentId = null;

    // Find next entry in same chat with order > current
    const next = Array.from(this.entries.entries())
      .filter(([id, e]) => id !== messageId && e.chatId === entry.chatId && e.order > entry.order)
      .sort((a, b) => a[1].order - b[1].order)[0];
    if (next) {
      this.play(next[0]);
    }
  }
}

export const voiceQueue = new VoiceQueue();
