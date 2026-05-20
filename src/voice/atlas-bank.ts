/** Atlas voice — browser-native speechSynthesis.
 *
 *  Atlas is your AI general: it confirms your orders, narrates battles,
 *  and reports the opponents' turns. One line at a time; a new line
 *  cancels the current utterance.
 *
 *  `onSpoken` fires unconditionally (even muted) so the on-screen
 *  subtitle mirrors every line — a player with audio off misses nothing. */

export interface AtlasSpokenEvent {
  lineId: string;
  text: string;
  estimatedDurationSec: number;
}

export class AtlasBank {
  private voice: SpeechSynthesisVoice | null = null;
  private current: SpeechSynthesisUtterance | null = null;
  private muted = false;
  private rate = 1.05;
  private pitch = 0.92;
  private volume = 0.95;

  onSpoken?: (e: AtlasSpokenEvent) => void;
  onSpeechEnded?: (lineId: string) => void;

  constructor() {
    if (!("speechSynthesis" in window)) {
      console.warn("[Atlas] speechSynthesis unavailable — voice off, subtitles still show.");
      return;
    }
    const pick = () => this.pickVoice();
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
  }

  private pickVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return;
    const prefer = ["Google US English", "Microsoft", "Daniel", "Alex", "Samantha", "natural", "neural"];
    let best: SpeechSynthesisVoice | null = null;
    for (const kw of prefer) {
      best = voices.find((v) => v.lang.startsWith("en") && v.name.includes(kw)) ?? null;
      if (best) break;
    }
    this.voice = best ?? voices.find((v) => v.lang.startsWith("en")) ?? voices[0] ?? null;
  }

  setMuted(m: boolean) { this.muted = m; if (m) this.stop(); }
  get isSpeaking(): boolean { return window.speechSynthesis?.speaking ?? false; }

  /** Speak a line. Fires `onSpoken` even when muted (drives subtitles). */
  speak(lineId: string, text: string): void {
    const words = text.split(/\s+/).filter(Boolean).length;
    const estimatedDurationSec = Math.max(1.6, words / 2.8);
    this.onSpoken?.({ lineId, text, estimatedDurationSec });
    if (this.muted || !("speechSynthesis" in window)) return;
    this.stop();
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.rate = this.rate;
    u.pitch = this.pitch;
    u.volume = this.volume;
    u.onend = () => { this.current = null; this.onSpeechEnded?.(lineId); };
    u.onerror = () => { this.current = null; this.onSpeechEnded?.(lineId); };
    this.current = u;
    window.speechSynthesis.speak(u);
  }

  stop(): void {
    if (!("speechSynthesis" in window)) return;
    if (this.current) {
      window.speechSynthesis.cancel();
      this.current = null;
    }
  }
}
