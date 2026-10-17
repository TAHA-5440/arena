import type { Settings } from '../types/game';
import type { AudioQuality } from './types';

export const AUDIO_DEFAULTS = {
  masterVolume: 0.85,
  sfxVolume: 0.7,
  musicVolume: 0.32,
  uiVolume: 0.55,
  muted: false,
  audioQuality: 'high' as AudioQuality,
};

export function detectMobile(): boolean {
  try {
    if (typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) return true;
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches) return true;
  } catch { /* ignore */ }
  return false;
}

export function defaultAudioQuality(): AudioQuality {
  return detectMobile() ? 'standard' : 'high';
}

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function normalizeAudioSettings(s: Settings): Settings {
  s.masterVolume = clamp01(s.masterVolume ?? AUDIO_DEFAULTS.masterVolume);
  s.sfxVolume = clamp01(s.sfxVolume ?? AUDIO_DEFAULTS.sfxVolume);
  s.musicVolume = clamp01(s.musicVolume ?? AUDIO_DEFAULTS.musicVolume);
  s.uiVolume = clamp01(s.uiVolume ?? AUDIO_DEFAULTS.uiVolume);
  s.muted = !!s.muted;
  const q = s.audioQuality;
  s.audioQuality = q === 'low' || q === 'standard' || q === 'high' ? q : defaultAudioQuality();
  return s;
}
