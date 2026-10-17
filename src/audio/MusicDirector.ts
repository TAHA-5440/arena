import type { AudioWorld, MusicState } from './types';

export function combatIntensity(w: AudioWorld): number {
  let i = 0;
  i += Math.min(1, w.enemyCount / 18) * 0.34;
  i += Math.min(1, w.nearCoreCount / 5) * 0.22;
  i += w.hasBoss ? 0.28 : 0;
  const maxHp = Math.max(1, w.maxIntegrity);
  i += (1 - w.integrity / maxHp) * 0.18;
  i += Math.max(0, w.routes - 1) * 0.07;
  i += (w.act - 1) * 0.04;
  return Math.max(0, Math.min(1, i));
}

const MENU_STATES = new Set(['MAIN_MENU', 'LEADERBOARD', 'HOW_TO', 'BOOT']);

/**
 * Adaptive music state with hysteresis so layers don't chatter
 * when intensity flickers around a threshold.
 */
export function pickMusicState(
  world: AudioWorld,
  prev: MusicState,
  held: number,
): { state: MusicState; resetHold: boolean } {
  if (world.state === 'VICTORY') return { state: 'VICTORY', resetHold: prev !== 'VICTORY' };
  if (world.state === 'GAME_OVER') return { state: 'DEFEAT', resetHold: prev !== 'DEFEAT' };
  if (MENU_STATES.has(world.state)) return { state: 'MENU', resetHold: prev !== 'MENU' };
  if (world.paused || world.state === 'PAUSED') {
    return { state: 'PAUSE', resetHold: prev !== 'PAUSE' };
  }
  if (world.state === 'SETTINGS') return { state: 'MENU', resetHold: prev !== 'MENU' };

  if (world.hasBoss && world.state === 'COMBAT_PHASE') {
    return { state: 'BOSS', resetHold: prev !== 'BOSS' };
  }

  if (world.state === 'BUILD_PHASE') {
    return { state: 'BUILD', resetHold: prev !== 'BUILD' };
  }

  if (world.state === 'COMBAT_PHASE') {
    const hi = combatIntensity(world);
    const late = world.wave >= 6 || world.act >= 2;
    if (prev === 'INTENSE') {
      if (!late && hi < 0.36 && held > 4) return { state: 'EARLY', resetHold: true };
      return { state: 'INTENSE', resetHold: false };
    }
    if (prev === 'EARLY') {
      if ((late || hi > 0.55) && held > 3) return { state: 'INTENSE', resetHold: true };
      return { state: 'EARLY', resetHold: false };
    }
    if (prev === 'BOSS' && held < 1.2) return { state: 'BOSS', resetHold: false };
    const next: MusicState = (!late && hi < 0.5) ? 'EARLY' : 'INTENSE';
    return { state: next, resetHold: true };
  }

  return { state: 'MENU', resetHold: prev !== 'MENU' };
}

export interface Arrangement {
  state: MusicState;
  act: 1 | 2 | 3 | 4;
  intensity: number;
  boss: 'none' | 'colossus' | 'archon';
  glitch: number;
  ambient: number;
  rhythm: number;
  bass: number;
  intensityLayer: number;
  pad: number;
  arp: number;
  motif: number;
  percussionDensity: number;
}

export function arrangementFor(world: AudioWorld, state: MusicState): Arrangement {
  const intensity = combatIntensity(world);
  const boss: Arrangement['boss'] =
    state === 'BOSS' ? (world.bossKind === 'BOSS' ? 'archon' : 'colossus') : 'none';
  const glitch = world.reducedMotion ? 0 : world.disruptorCharging ? 0.55 : world.act >= 3 && state !== 'MENU' && state !== 'BUILD' ? 0.12 : 0;
  const quiet = world.reducedMotion ? 0.55 : 1;
  const base: Arrangement = {
    state, act: world.act, intensity, boss, glitch,
    ambient: 0.7, rhythm: 0, bass: 0, intensityLayer: 0,
    pad: 0.4, arp: 0.25, motif: 0.35, percussionDensity: 0.2,
  };

  switch (state) {
    case 'MENU':
      return { ...base, ambient: 1, rhythm: 0, bass: 0.18, pad: 0.85, arp: 0.22 * quiet, motif: 0.5, percussionDensity: 0, intensityLayer: 0 };
    case 'PAUSE':
      return { ...base, ambient: 0.7, rhythm: 0, bass: 0.06, pad: 0.5, arp: 0, motif: 0.08, percussionDensity: 0, intensityLayer: 0 };
    case 'BUILD':
      return { ...base, ambient: 0.9, rhythm: 0, bass: 0.16, pad: 0.7, arp: 0.12 * quiet, motif: 0.2, percussionDensity: 0, intensityLayer: 0 };
    case 'EARLY':
      return {
        ...base, ambient: 0.75, rhythm: 0.28 * quiet, bass: 0.32, pad: 0.55, arp: 0.18 * quiet, motif: 0.22,
        percussionDensity: 0.22 * quiet, intensityLayer: (0.08 + intensity * 0.12) * quiet,
      };
    case 'INTENSE':
      return {
        ...base, ambient: 0.65, rhythm: 0.5 * quiet, bass: 0.48, pad: 0.5, arp: 0.28 * quiet, motif: 0.25,
        percussionDensity: (0.4 + intensity * 0.2) * quiet, intensityLayer: (0.22 + intensity * 0.25) * quiet,
      };
    case 'BOSS':
      return {
        ...base, ambient: 0.7, rhythm: 0.55 * quiet, bass: 0.55, pad: 0.6, arp: (boss === 'archon' ? 0.28 : 0.16) * quiet,
        motif: boss === 'archon' ? 0.4 : 0.28,
        percussionDensity: 0.5 * quiet, intensityLayer: (0.35 + (1 - world.bossHpRatio) * 0.2) * quiet,
      };
    case 'VICTORY':
      return { ...base, ambient: 0.85, rhythm: 0, bass: 0.2, pad: 0.75, arp: 0.22 * quiet, motif: 0.7, percussionDensity: 0, intensityLayer: 0 };
    case 'DEFEAT':
      return { ...base, ambient: 0.65, rhythm: 0, bass: 0.08, pad: 0.45, arp: 0, motif: 0.35, percussionDensity: 0, intensityLayer: 0 };
  }
}
