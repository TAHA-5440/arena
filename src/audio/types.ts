/** Shared audio types for HEX DEFENDER: LAST CORE. */

export type AudioQuality = 'low' | 'standard' | 'high';

export type MusicState =
  | 'MENU'
  | 'BUILD'
  | 'EARLY'
  | 'INTENSE'
  | 'BOSS'
  | 'VICTORY'
  | 'DEFEAT'
  | 'PAUSE';

export type GameAudioEvent =
  | 'ui.hover'
  | 'ui.click'
  | 'ui.error'
  | 'ui.menuOpen'
  | 'ui.menuClose'
  | 'tower.select'
  | 'tower.place'
  | 'tower.upgrade'
  | 'tower.sell'
  | 'tower.bolt.fire'
  | 'tower.arc.fire'
  | 'tower.arc.chain'
  | 'tower.cryo.fire'
  | 'tower.cryo.impact'
  | 'tower.cryo.slow'
  | 'tower.rail.charge'
  | 'tower.rail.fire'
  | 'tower.rail.impact'
  | 'tower.nova.fire'
  | 'tower.nova.explode'
  | 'tower.amplifier.activate'
  | 'enemy.hit'
  | 'enemy.shield.hit'
  | 'enemy.shield.break'
  | 'enemy.split'
  | 'enemy.destroy'
  | 'enemy.spawn'
  | 'enemy.disruptor.charge'
  | 'enemy.disruptor.pulse'
  | 'enemy.move'
  | 'core.damage'
  | 'core.critical'
  | 'core.destroy'
  | 'ability.emp'
  | 'ability.orbital.lock'
  | 'ability.orbital.charge'
  | 'ability.orbital.impact'
  | 'ability.overdrive'
  | 'ability.overdrive.end'
  | 'wave.start'
  | 'wave.complete'
  | 'boss.enter'
  | 'boss.phase'
  | 'boss.destroy'
  | 'campaign.victory'
  | 'game.defeat'
  | 'portal.activate'
  | 'tech.unlock'
  | 'score.high'
  | 'act.complete';

export interface Pos {
  x: number;
  y: number;
}

export interface AudioEventPayload {
  pos?: Pos;
  type?: string;
  wave?: number;
  act?: number;
  phase?: number;
  index?: number;
  first?: boolean;
  isBoss?: boolean;
  portal?: number;
  child?: boolean;
}

export interface AudioWorld {
  state: string;
  paused: boolean;
  wave: number;
  act: 1 | 2 | 3 | 4;
  waveActive: boolean;
  integrity: number;
  maxIntegrity: number;
  enemyCount: number;
  nearCoreCount: number;
  hasBoss: boolean;
  bossKind: 'TITAN' | 'BOSS' | null;
  bossPhase: number;
  bossHpRatio: number;
  routes: number;
  gameSpeed: number;
  overdrive: boolean;
  disruptorCharging: boolean;
  cameraX: number;
  cameraY: number;
  cameraZoom: number;
  muted: boolean;
  audioQuality: AudioQuality;
  reducedMotion: boolean;
}

export interface BusMap {
  master: GainNode;
  compressor: DynamicsCompressorNode;
  music: GainNode;
  musicAmbient: GainNode;
  musicRhythm: GainNode;
  musicBass: GainNode;
  musicIntensity: GainNode;
  sfx: GainNode;
  towers: GainNode;
  projectiles: GainNode;
  impacts: GainNode;
  enemies: GainNode;
  explosions: GainNode;
  ui: GainNode;
  alert: GainNode;
  reactor: GainNode;
}

/** Four-note reactor motif: A3 E4 F#4 D4 — open, pentatonic, unhurried. */
export const REACTOR_MOTIF = [220.0, 329.63, 369.99, 293.66] as const;

export const BPM = 96;
export const BEAT = 60 / BPM;

export const A_PENT = [220.0, 246.94, 277.18, 329.63, 369.99, 440.0];
