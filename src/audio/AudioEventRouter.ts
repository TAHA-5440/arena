import type { AudioQuality, GameAudioEvent } from './types';
import { detectMobile } from './AudioSettings';

/**
 * Voice limits, rate-limiting and clustering for repetitive combat events.
 * High-priority alerts always keep reserved headroom.
 */
export class AudioEventRouter {
  active = 0;
  maxVoices = 24;
  reserved = 4;
  now: () => number = () => (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);

  private last = new Map<string, number>();
  private recent = new Map<string, number[]>();

  configure(quality: AudioQuality, mobile = detectMobile()) {
    if (quality === 'low') this.maxVoices = 8;
    else if (quality === 'standard' || mobile) this.maxVoices = 12;
    else this.maxVoices = 24;
  }

  allow(key: string, priority: number, minInterval: number): boolean {
    const t = this.now();
    const prev = this.last.get(key) ?? -99;
    if (t - prev < minInterval) return false;
    const cap = priority >= 3 ? this.maxVoices : this.maxVoices - this.reserved;
    if (this.active >= cap && priority < 3) return false;
    this.last.set(key, t);
    return true;
  }

  /** How many times `key` fired inside `window` seconds (includes this call). */
  cluster(key: string, window = 0.18): number {
    const t = this.now();
    const arr = (this.recent.get(key) ?? []).filter(x => t - x < window);
    arr.push(t);
    if (arr.length > 40) arr.splice(0, arr.length - 24);
    this.recent.set(key, arr);
    return arr.length;
  }

  acquire() {
    this.active++;
  }

  release() {
    this.active = Math.max(0, this.active - 1);
  }

  hold(dur: number) {
    this.acquire();
    const ms = Math.max(40, dur * 1000 + 30);
    setTimeout(() => this.release(), ms);
  }

  reset() {
    this.active = 0;
    this.last.clear();
    this.recent.clear();
  }
}

export type EventPriority = 0 | 1 | 2 | 3;

export const EVENT_PRIORITY: Partial<Record<GameAudioEvent, EventPriority>> = {
  'ui.hover': 2,
  'ui.click': 2,
  'ui.error': 2,
  'core.damage': 3,
  'core.critical': 3,
  'core.destroy': 3,
  'boss.enter': 3,
  'boss.phase': 3,
  'campaign.victory': 3,
  'game.defeat': 3,
  'wave.start': 2,
  'ability.emp': 2,
  'ability.orbital.impact': 2,
};
