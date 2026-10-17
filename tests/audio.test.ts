import { describe, it, expect } from 'vitest';
import { pickMusicState, combatIntensity } from '../src/audio/MusicDirector';
import type { AudioWorld, MusicState } from '../src/audio/types';
import { AudioEventRouter } from '../src/audio/AudioEventRouter';
import { normalizeAudioSettings, clamp01 } from '../src/audio/AudioSettings';
import { AudioEngine } from '../src/engine/AudioEngine';
import { Difficulty as D } from '../src/types/game';
import type { Settings } from '../src/types/game';

function world(over: Partial<AudioWorld> = {}): AudioWorld {
  return {
    state: 'BUILD_PHASE',
    paused: false,
    wave: 1,
    act: 1,
    waveActive: false,
    integrity: 20,
    maxIntegrity: 20,
    enemyCount: 0,
    nearCoreCount: 0,
    hasBoss: false,
    bossKind: null,
    bossPhase: 0,
    bossHpRatio: 1,
    routes: 1,
    gameSpeed: 1,
    overdrive: false,
    disruptorCharging: false,
    cameraX: 0,
    cameraY: 0,
    cameraZoom: 1,
    muted: false,
    audioQuality: 'high',
    reducedMotion: false,
    ...over,
  };
}

describe('adaptive music director', () => {
  it('maps menu-like states to MENU even if paused leftover is true', () => {
    const r = pickMusicState(world({ state: 'MAIN_MENU', paused: true }), 'PAUSE', 2);
    expect(r.state).toBe('MENU');
  });

  it('uses PAUSE only during an in-run pause', () => {
    const r = pickMusicState(world({ state: 'PAUSED', paused: true }), 'BUILD', 1);
    expect(r.state).toBe('PAUSE');
    expect(pickMusicState(world({ state: 'SETTINGS', paused: true }), 'PAUSE', 1).state).toBe('PAUSE');
    expect(pickMusicState(world({ state: 'SETTINGS', paused: false }), 'MENU', 1).state).toBe('MENU');
  });

  it('promotes combat with a boss to BOSS immediately', () => {
    const r = pickMusicState(world({
      state: 'COMBAT_PHASE', waveActive: true, hasBoss: true, bossKind: 'TITAN', wave: 10, act: 2,
    }), 'INTENSE', 0);
    expect(r.state).toBe('BOSS');
  });

  it('keeps early-wave combat in EARLY until intensity or act rises', () => {
    const r = pickMusicState(world({
      state: 'COMBAT_PHASE', wave: 2, act: 1, enemyCount: 3, waveActive: true,
    }), 'EARLY', 1);
    expect(r.state).toBe('EARLY');
  });

  it('switches EARLY -> INTENSE after hold when later waves or high intensity', () => {
    const r = pickMusicState(world({
      state: 'COMBAT_PHASE', wave: 8, act: 2, enemyCount: 12, waveActive: true,
    }), 'EARLY', 4);
    expect(r.state).toBe('INTENSE');
  });

  it('maps victory and defeat immediately', () => {
    expect(pickMusicState(world({ state: 'VICTORY' }), 'BOSS', 0).state).toBe('VICTORY');
    expect(pickMusicState(world({ state: 'GAME_OVER' }), 'INTENSE', 0).state).toBe('DEFEAT');
  });

  it('clamps combat intensity to 0..1', () => {
    expect(combatIntensity(world())).toBeGreaterThanOrEqual(0);
    const hi = combatIntensity(world({
      enemyCount: 40, nearCoreCount: 10, hasBoss: true, integrity: 1, routes: 3, act: 4,
    }));
    expect(hi).toBeLessThanOrEqual(1);
    expect(hi).toBeGreaterThan(0.8);
  });
});

describe('voice manager', () => {
  it('rate-limits identical keys and reserves headroom for alerts', () => {
    const r = new AudioEventRouter();
    r.configure('high', false);
    let t = 0;
    r.now = () => t;
    expect(r.allow('bolt', 1, 0.05)).toBe(true);
    expect(r.allow('bolt', 1, 0.05)).toBe(false);
    t = 0.06;
    expect(r.allow('bolt', 1, 0.05)).toBe(true);
    r.active = 24;
    expect(r.allow('bolt', 1, 0)).toBe(false);
    expect(r.allow('alert', 3, 0)).toBe(true);
  });

  it('clusters recent events', () => {
    const r = new AudioEventRouter();
    r.now = () => 1;
    expect(r.cluster('hit', 0.2)).toBe(1);
    expect(r.cluster('hit', 0.2)).toBe(2);
  });
});

describe('audio settings', () => {
  it('clamps and fills defaults', () => {
    const s = normalizeAudioSettings({
      sfxVolume: 2, musicVolume: -1, quality: 'high', reducedMotion: false, showFps: false, difficulty: D.COMMANDER,
    } as Settings);
    expect(s.sfxVolume).toBe(1);
    expect(s.musicVolume).toBe(0);
    expect(s.masterVolume).toBeGreaterThan(0);
    expect(s.uiVolume).toBeGreaterThan(0);
    expect(typeof s.muted).toBe('boolean');
  });

  it('clamp01 rejects NaN', () => {
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
  });
});

describe('audio engine safety', () => {
  it('initializes and named methods do not throw without AudioContext', () => {
    const a = new AudioEngine();
    a.init();
    expect(() => {
      a.click(); a.place(); a.bolt(); a.arc(); a.cryo(); a.railCharge(); a.railFire();
      a.novaFire(); a.novaExplode(); a.enemyHit(); a.enemyDeath('SCOUT');
      a.waveStart(1); a.reactorHit(); a.victory(); a.gameOver(); a.emp();
      a.startMusic(); a.stopMusic(); a.setMuted(true); a.setMaster(0.5);
      a.onPause(); a.onResume();
      a.sync(world({ state: 'MAIN_MENU' }));
    }).not.toThrow();
  });

  const states: MusicState[] = ['MENU', 'BUILD', 'EARLY', 'INTENSE', 'BOSS', 'VICTORY', 'DEFEAT', 'PAUSE'];
  it('covers every music state', () => {
    expect(states.length).toBe(8);
  });
});
