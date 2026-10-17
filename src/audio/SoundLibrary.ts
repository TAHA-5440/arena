import type { BusMap, Pos } from './types';
import { REACTOR_MOTIF } from './types';
import type { Synthesizer } from './Synthesizer';
import type { AudioEventRouter } from './AudioEventRouter';
import type { AudioSpatializer } from './AudioSpatializer';

type TowerKind = 'BOLT' | 'CRYO' | 'ARC' | 'RAIL' | 'NOVA' | 'AMP' | string;
type EnemyKind = string;

/**
 * Original procedural sound identities. Every call is event-driven;
 * the library never schedules "fake" gameplay.
 */
export class SoundLibrary {
  private rng = 1723;
  private lastError = -99;
  private reactor: ReactorVoice | null = null;
  private quality: 'low' | 'standard' | 'high' = 'high';

  constructor(
    private syn: Synthesizer,
    private buses: BusMap,
    private router: AudioEventRouter,
    private spatial: AudioSpatializer,
  ) {}

  setQuality(q: 'low' | 'standard' | 'high') { this.quality = q; }

  private rnd(): number {
    this.rng = (this.rng * 16807) % 2147483647;
    return (this.rng - 1) / 2147483646;
  }
  private vary(x: number, pct = 0.045) { return x * (1 + (this.rnd() * 2 - 1) * pct); }

  private t() { return this.syn.now(); }

  private spat(pos?: Pos): { pan?: number; dist?: number } {
    if (!pos || this.quality === 'low') return {};
    return { pan: this.spatial.panFor(pos), dist: this.spatial.distGain(pos) };
  }

  private gate(key: string, priority: number, minInterval: number, dur: number): boolean {
    if (!this.router.allow(key, priority, minInterval)) return false;
    this.router.hold(dur);
    return true;
  }

  private clusterGain(key: string, window = 0.16, softness = 0.14): number {
    const n = this.router.cluster(key, window);
    return 1 / (1 + softness * Math.max(0, n - 1));
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  hover() {
    if (!this.gate('ui.hover', 2, 0.09, 0.05)) return;
    this.syn.osc({ type: 'sine', freq: this.vary(1860, 0.03), t: this.t(), dur: 0.035, gain: 0.035, attack: 0.002, dest: this.buses.ui });
  }

  click() {
    if (!this.gate('ui.click', 2, 0.04, 0.08)) return;
    const t = this.t();
    this.syn.osc({ type: 'triangle', freq: 720, freqEnd: 540, t, dur: 0.055, gain: 0.09, attack: 0.002, dest: this.buses.ui });
    this.syn.osc({ type: 'sine', freq: 1440, t, dur: 0.03, gain: 0.04, attack: 0.001, dest: this.buses.ui });
  }

  error() {
    const now = this.t();
    if (now - this.lastError < 0.28) return;
    this.lastError = now;
    if (!this.gate('ui.error', 2, 0.25, 0.16)) return;
    this.syn.osc({ type: 'triangle', freq: 196, freqEnd: 130, t: now, dur: 0.14, gain: 0.11, attack: 0.006, dest: this.buses.ui });
    this.syn.noise({ t: now, dur: 0.08, gain: 0.03, filterType: 'lowpass', filterFreq: 400, dest: this.buses.ui });
  }

  menuOpen() {
    if (!this.gate('ui.menuOpen', 2, 0.12, 0.28)) return;
    const t = this.t();
    [392, 523, 659].forEach((f, i) => {
      this.syn.osc({ type: 'sine', freq: f, t: t + i * 0.05, dur: 0.16, gain: 0.07, dest: this.buses.ui });
    });
  }

  menuClose() {
    if (!this.gate('ui.menuClose', 2, 0.12, 0.18)) return;
    this.syn.osc({ type: 'sine', freq: 520, freqEnd: 280, t: this.t(), dur: 0.12, gain: 0.07, dest: this.buses.ui });
  }

  select() {
    if (!this.gate('tower.select', 2, 0.05, 0.09)) return;
    this.syn.osc({ type: 'triangle', freq: 880, freqEnd: 1100, t: this.t(), dur: 0.07, gain: 0.08, dest: this.buses.ui });
  }

  // ---------------------------------------------------------------------------
  // Construction / economy
  // ---------------------------------------------------------------------------

  place(type?: TowerKind, pos?: Pos) {
    if (type === 'AMP') { this.ampPlace(pos); return; }
    if (!this.gate('tower.place', 2, 0.05, 0.28)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.osc({ type: 'triangle', freq: 320, freqEnd: 540, t, dur: 0.12, gain: 0.12, dest: this.buses.ui, ...s });
    this.syn.osc({ type: 'sine', freq: 880, t: t + 0.07, dur: 0.07, gain: 0.07, dest: this.buses.ui, ...s });
    this.syn.noise({ t: t + 0.09, dur: 0.045, gain: 0.05, filterType: 'highpass', filterFreq: 1800, dest: this.buses.ui, ...s });
  }

  upgrade(type?: TowerKind, pos?: Pos) {
    if (!this.gate('tower.upgrade', 2, 0.08, 0.45)) return;
    const t = this.t();
    const s = this.spat(pos);
    const rich = type === 'AMP';
    const notes = rich ? [392, 523, 659, 784, 1046] : [523, 659, 784, 988];
    notes.forEach((f, i) => {
      this.syn.osc({ type: rich ? 'sine' : 'triangle', freq: f, t: t + i * 0.055, dur: 0.16, gain: 0.08, dest: this.buses.ui, ...s });
    });
    this.syn.noise({ t: t + 0.18, dur: 0.12, gain: 0.04, filterType: 'highpass', filterFreq: 2400, pink: true, dest: this.buses.ui, ...s });
  }

  sell(pos?: Pos) {
    if (!this.gate('tower.sell', 2, 0.08, 0.22)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.osc({ type: 'sawtooth', freq: 420, freqEnd: 160, t, dur: 0.16, gain: 0.09, dest: this.buses.ui, ...s });
    this.syn.osc({ type: 'sine', freq: 210, freqEnd: 90, t: t + 0.04, dur: 0.14, gain: 0.06, dest: this.buses.ui, ...s });
  }

  // ---------------------------------------------------------------------------
  // Towers
  // ---------------------------------------------------------------------------

  bolt(pos?: Pos) {
    if (!this.gate('tower.bolt.fire', 1, 0.055, 0.1)) return;
    const cg = this.clusterGain('bolt.fire', 0.14, 0.22);
    const t = this.t();
    const s = this.spat(pos);
    const f0 = this.vary(1240, 0.05);
    this.syn.osc({ type: 'triangle', freq: f0, freqEnd: f0 * 0.48, t, dur: 0.078, gain: 0.055 * cg, attack: 0.002, dest: this.buses.towers, ...s });
    this.syn.osc({ type: 'sine', freq: f0 * 2.15, t, dur: 0.028, gain: 0.03 * cg, attack: 0.001, dest: this.buses.towers, ...s });
    this.syn.noise({ t, dur: 0.022, gain: 0.028 * cg, filterType: 'highpass', filterFreq: 3200, dest: this.buses.towers, ...s });
  }

  boltImpact(pos?: Pos) {
    if (!this.gate('bolt.impact', 1, 0.04, 0.06)) return;
    const cg = this.clusterGain('bolt.impact', 0.12, 0.2);
    const t = this.t();
    const s = this.spat(pos);
    this.syn.osc({ type: 'square', freq: this.vary(740, 0.06), freqEnd: 280, t, dur: 0.035, gain: 0.03 * cg, dest: this.buses.impacts, ...s });
  }

  arc(pos?: Pos) {
    if (!this.gate('tower.arc.fire', 1, 0.12, 0.32)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.noise({ t, dur: 0.22, gain: 0.09, filterType: 'bandpass', filterFreq: 2200, filterFreqEnd: 1400, filterQ: 3.5, dest: this.buses.towers, ...s });
    this.syn.osc({ type: 'sawtooth', freq: this.vary(210, 0.05), freqEnd: 90, t, dur: 0.18, gain: 0.07, dest: this.buses.towers, ...s });
    this.syn.fm({ carrier: 420, modFreq: 90, modGain: 180, t, dur: 0.16, gain: 0.05, dest: this.buses.towers, ...s });
    this.syn.noise({ t: t + 0.02, dur: 0.08, gain: 0.05, filterType: 'highpass', filterFreq: 4500, dest: this.buses.towers, ...s });
  }

  arcChain(index: number, pos?: Pos) {
    if (!this.gate('tower.arc.chain' + (index % 3), 1, 0.03, 0.14)) return;
    const t = this.t();
    const s = this.spat(pos);
    const g = 0.045 / (1 + index * 0.55);
    const f = 2400 + index * 380;
    this.syn.noise({ t, dur: 0.1, gain: g, filterType: 'bandpass', filterFreq: f, filterQ: 4, dest: this.buses.towers, ...s });
    this.syn.osc({ type: 'square', freq: 380 + index * 70, freqEnd: 220, t, dur: 0.07, gain: g * 0.6, dest: this.buses.towers, ...s });
  }

  cryo(pos?: Pos) {
    if (!this.gate('tower.cryo.fire', 1, 0.1, 0.22)) return;
    const t = this.t();
    const s = this.spat(pos);
    const f = this.vary(1180, 0.04);
    this.syn.partials({ freqs: [f, f * 1.5, f * 2.01], gains: [1, 0.45, 0.22], t, dur: 0.18, gain: 0.07, dest: this.buses.towers, slide: -280, ...s });
    this.syn.noise({ t, dur: 0.14, gain: 0.035, filterType: 'highpass', filterFreq: 2800, pink: true, dest: this.buses.towers, ...s });
  }

  cryoImpact(pos?: Pos) {
    if (!this.gate('tower.cryo.impact', 1, 0.07, 0.18)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.partials({ freqs: [1568, 2349, 3136], t, dur: 0.16, gain: 0.055, dest: this.buses.impacts, ...s });
    this.syn.noise({ t, dur: 0.12, gain: 0.03, filterType: 'highpass', filterFreq: 3600, dest: this.buses.impacts, ...s });
  }

  cryoSlow(pos?: Pos) {
    if (!this.gate('tower.cryo.slow', 1, 0.22, 0.35)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.partials({ freqs: [1174, 1760, 2349], t, dur: 0.32, gain: 0.045, dest: this.buses.impacts, slide: -80, ...s });
  }

  railCharge(pos?: Pos) {
    if (!this.gate('tower.rail.charge', 1, 0.2, 0.4)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.osc({ type: 'sawtooth', freq: 140, freqEnd: 520, t, dur: 0.34, gain: 0.08, attack: 0.04, dest: this.buses.towers, ...s });
    this.syn.osc({ type: 'sine', freq: 280, freqEnd: 860, t, dur: 0.34, gain: 0.05, attack: 0.05, dest: this.buses.towers, ...s });
    this.syn.noise({ t, dur: 0.34, gain: 0.03, filterType: 'bandpass', filterFreq: 900, filterFreqEnd: 1800, dest: this.buses.towers, ...s });
  }

  railFire(pos?: Pos) {
    if (!this.gate('tower.rail.fire', 1, 0.18, 0.5)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.osc({ type: 'sine', freq: 92, freqEnd: 36, t, dur: 0.42, gain: 0.18, attack: 0.004, dest: this.buses.towers, ...s });
    this.syn.osc({ type: 'square', freq: 240, freqEnd: 70, t, dur: 0.16, gain: 0.08, dest: this.buses.towers, ...s });
    this.syn.fm({ carrier: 380, carrierEnd: 110, modFreq: 55, modGain: 220, t, dur: 0.22, gain: 0.07, dest: this.buses.towers, ...s });
    this.syn.noise({ t, dur: 0.18, gain: 0.1, filterType: 'lowpass', filterFreq: 1400, filterFreqEnd: 500, dest: this.buses.towers, ...s });
    this.syn.osc({ type: 'triangle', freq: 880, freqEnd: 220, t, dur: 0.12, gain: 0.05, dest: this.buses.towers, ...s });
  }

  railImpact(pos?: Pos) {
    if (!this.gate('tower.rail.impact', 1, 0.12, 0.28)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.osc({ type: 'sine', freq: 70, freqEnd: 32, t, dur: 0.22, gain: 0.14, dest: this.buses.impacts, ...s });
    this.syn.noise({ t, dur: 0.14, gain: 0.08, filterType: 'bandpass', filterFreq: 900, filterQ: 1.6, dest: this.buses.impacts, ...s });
    this.syn.osc({ type: 'triangle', freq: 540, freqEnd: 180, t, dur: 0.1, gain: 0.06, dest: this.buses.impacts, ...s });
  }

  novaFire(pos?: Pos) {
    if (!this.gate('tower.nova.fire', 1, 0.16, 0.28)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.osc({ type: 'sine', freq: 72, freqEnd: 48, t, dur: 0.14, gain: 0.14, dest: this.buses.towers, ...s });
    this.syn.osc({ type: 'triangle', freq: 220, freqEnd: 380, t, dur: 0.16, gain: 0.06, dest: this.buses.towers, ...s });
    this.syn.noise({ t, dur: 0.08, gain: 0.05, filterType: 'lowpass', filterFreq: 500, dest: this.buses.towers, ...s });
    if (this.quality !== 'low') {
      this.syn.osc({ type: 'sine', freq: 480, freqEnd: 720, t: t + 0.04, dur: 0.22, gain: 0.03, dest: this.buses.projectiles, ...s });
    }
  }

  novaExplode(pos?: Pos) {
    if (!this.gate('tower.nova.explode', 1, 0.09, 0.55)) return;
    const cg = this.clusterGain('nova.explode', 0.25, 0.18);
    const t = this.t();
    const s = this.spat(pos);
    this.syn.osc({ type: 'sine', freq: 68, freqEnd: 28, t, dur: 0.55, gain: 0.2 * cg, dest: this.buses.explosions, ...s });
    this.syn.noise({ t, dur: 0.32, gain: 0.14 * cg, filterType: 'lowpass', filterFreq: 1100, filterFreqEnd: 380, dest: this.buses.explosions, ...s });
    this.syn.noise({ t: t + 0.04, dur: 0.2, gain: 0.06 * cg, filterType: 'bandpass', filterFreq: 1800, filterQ: 1.4, dest: this.buses.explosions, ...s });
    this.syn.osc({ type: 'triangle', freq: 180, freqEnd: 70, t, dur: 0.28, gain: 0.07 * cg, dest: this.buses.explosions, ...s });
  }

  ampPlace(pos?: Pos) {
    if (!this.gate('amp.place', 2, 0.1, 0.4)) return;
    const t = this.t();
    const s = this.spat(pos);
    [293.66, 349.23, 440].forEach((f, i) => {
      this.syn.osc({ type: 'sine', freq: f, t: t + i * 0.09, dur: 0.22, gain: 0.09, dest: this.buses.ui, ...s });
    });
  }

  ampActivate(pos?: Pos) {
    if (!this.gate('tower.amplifier.activate', 1, 0.45, 0.28)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.partials({ freqs: [440, 550, 660], t, dur: 0.24, gain: 0.05, dest: this.buses.ui, ...s });
  }

  // ---------------------------------------------------------------------------
  // Enemies
  // ---------------------------------------------------------------------------

  hullHit(type?: EnemyKind, pos?: Pos) {
    if (!this.gate('enemy.hit', 1, 0.045, 0.07)) return;
    const cg = this.clusterGain('enemy.hit', 0.12, 0.22);
    const t = this.t();
    const s = this.spat(pos);
    const heavy = type === 'BRUISER' || type === 'TITAN' || type === 'BOSS' || type === 'SHIELD';
    this.syn.osc({
      type: heavy ? 'sawtooth' : 'square',
      freq: this.vary(heavy ? 180 : 520, 0.06),
      freqEnd: heavy ? 80 : 220,
      t, dur: heavy ? 0.08 : 0.04,
      gain: (heavy ? 0.05 : 0.032) * cg,
      dest: this.buses.impacts, ...s,
    });
  }

  shieldHit(pos?: Pos) {
    if (!this.gate('enemy.shield.hit', 1, 0.05, 0.1)) return;
    const cg = this.clusterGain('shield.hit', 0.14, 0.16);
    const t = this.t();
    const s = this.spat(pos);
    this.syn.osc({ type: 'sine', freq: this.vary(640, 0.04), freqEnd: 420, t, dur: 0.09, gain: 0.07 * cg, dest: this.buses.impacts, ...s });
    this.syn.osc({ type: 'triangle', freq: 1280, t, dur: 0.05, gain: 0.03 * cg, dest: this.buses.impacts, ...s });
  }

  shieldBreak(pos?: Pos) {
    if (!this.gate('enemy.shield.break', 2, 0.12, 0.4)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.osc({ type: 'sawtooth', freq: 520, freqEnd: 140, t, dur: 0.32, gain: 0.12, dest: this.buses.enemies, ...s });
    this.syn.noise({ t, dur: 0.22, gain: 0.08, filterType: 'bandpass', filterFreq: 1600, dest: this.buses.enemies, ...s });
    this.syn.partials({ freqs: [880, 660, 440], t: t + 0.04, dur: 0.2, gain: 0.05, dest: this.buses.enemies, slide: -120, ...s });
  }

  enemySpawn(type: EnemyKind, pos?: Pos) {
    const key = 'spawn.' + type;
    const interval = type === 'SWARMER' ? 0.45 : type === 'SCOUT' ? 0.22 : 0.12;
    if (!this.gate(key, 1, interval, 0.2)) return;
    const t = this.t();
    const s = this.spat(pos);
    switch (type) {
      case 'SCOUT':
        this.syn.osc({ type: 'sine', freq: 640, freqEnd: 480, t, dur: 0.08, gain: 0.03, dest: this.buses.enemies, ...s });
        break;
      case 'BRUISER':
        this.syn.osc({ type: 'sine', freq: 70, freqEnd: 48, t, dur: 0.16, gain: 0.08, dest: this.buses.enemies, ...s });
        this.syn.noise({ t, dur: 0.1, gain: 0.04, filterType: 'lowpass', filterFreq: 280, dest: this.buses.enemies, ...s });
        break;
      case 'DASHER':
        this.syn.osc({ type: 'triangle', freq: 420, freqEnd: 1280, t, dur: 0.14, gain: 0.06, dest: this.buses.enemies, ...s });
        break;
      case 'SWARMER':
        this.syn.osc({ type: 'square', freq: this.vary(1480, 0.08), t, dur: 0.03, gain: 0.018, dest: this.buses.enemies, ...s });
        break;
      case 'SHIELD':
        this.syn.osc({ type: 'sine', freq: 360, freqEnd: 520, t, dur: 0.18, gain: 0.07, dest: this.buses.enemies, ...s });
        this.syn.osc({ type: 'triangle', freq: 720, t, dur: 0.1, gain: 0.03, dest: this.buses.enemies, ...s });
        break;
      case 'SPLITTER':
        this.syn.fm({ carrier: 180, modFreq: 40, modGain: 90, t, dur: 0.16, gain: 0.07, dest: this.buses.enemies, ...s });
        break;
      case 'DISRUPTOR':
        this.syn.osc({ type: 'sawtooth', freq: 90, freqEnd: 70, t, dur: 0.28, gain: 0.09, dest: this.buses.alert, ...s });
        this.syn.noise({ t, dur: 0.2, gain: 0.05, filterType: 'bandpass', filterFreq: 2400, filterQ: 6, dest: this.buses.alert, ...s });
        break;
      default:
        break;
    }
  }

  enemyDestroy(type: EnemyKind, pos?: Pos, child = false) {
    const interval = type === 'SWARMER' || child ? 0.08 : 0.05;
    if (!this.gate('enemy.destroy.' + (child ? 'child' : type), 1, interval, 0.22)) return;
    const cg = this.clusterGain('enemy.destroy', 0.2, type === 'SWARMER' || child ? 0.35 : 0.12);
    const t = this.t();
    const s = this.spat(pos);
    const g = (child ? 0.55 : 1) * cg;
    switch (type) {
      case 'SCOUT':
        this.syn.noise({ t, dur: 0.1, gain: 0.06 * g, filterType: 'highpass', filterFreq: 1400, dest: this.buses.enemies, ...s });
        this.syn.osc({ type: 'triangle', freq: 420, freqEnd: 160, t, dur: 0.09, gain: 0.05 * g, dest: this.buses.enemies, ...s });
        break;
      case 'BRUISER':
        this.syn.osc({ type: 'sine', freq: 70, freqEnd: 32, t, dur: 0.28, gain: 0.14 * g, dest: this.buses.enemies, ...s });
        this.syn.noise({ t, dur: 0.2, gain: 0.1 * g, filterType: 'lowpass', filterFreq: 700, dest: this.buses.enemies, ...s });
        this.syn.osc({ type: 'sawtooth', freq: 180, freqEnd: 60, t, dur: 0.16, gain: 0.06 * g, dest: this.buses.enemies, ...s });
        break;
      case 'DASHER':
        this.syn.osc({ type: 'triangle', freq: 980, freqEnd: 220, t, dur: 0.09, gain: 0.07 * g, dest: this.buses.enemies, ...s });
        this.syn.noise({ t, dur: 0.07, gain: 0.04 * g, filterType: 'highpass', filterFreq: 2500, dest: this.buses.enemies, ...s });
        break;
      case 'SWARMER':
        this.syn.osc({ type: 'sine', freq: this.vary(900, 0.08), freqEnd: 400, t, dur: 0.05, gain: 0.035 * g, dest: this.buses.enemies, ...s });
        break;
      case 'SHIELD':
        this.syn.osc({ type: 'triangle', freq: 280, freqEnd: 90, t, dur: 0.18, gain: 0.08 * g, dest: this.buses.enemies, ...s });
        this.syn.noise({ t, dur: 0.14, gain: 0.06 * g, filterType: 'lowpass', filterFreq: 900, dest: this.buses.enemies, ...s });
        break;
      case 'SPLITTER':
        this.syn.fm({ carrier: 200, carrierEnd: 80, modFreq: 55, modGain: 140, t, dur: 0.18, gain: 0.08 * g, dest: this.buses.enemies, ...s });
        this.syn.noise({ t, dur: 0.12, gain: 0.05 * g, filterType: 'bandpass', filterFreq: 1200, dest: this.buses.enemies, ...s });
        break;
      case 'DISRUPTOR':
        this.syn.noise({ t, dur: 0.16, gain: 0.08 * g, filterType: 'bandpass', filterFreq: 1800, filterQ: 2, dest: this.buses.enemies, ...s });
        this.syn.osc({ type: 'sawtooth', freq: 140, freqEnd: 50, t, dur: 0.16, gain: 0.07 * g, dest: this.buses.enemies, ...s });
        break;
      default:
        this.syn.noise({ t, dur: 0.12, gain: 0.07 * g, filterType: 'lowpass', filterFreq: 900, dest: this.buses.enemies, ...s });
        this.syn.osc({ type: 'sawtooth', freq: 180, freqEnd: 70, t, dur: 0.1, gain: 0.05 * g, dest: this.buses.enemies, ...s });
    }
  }

  enemySplit(pos?: Pos) {
    if (!this.gate('enemy.split', 2, 0.1, 0.28)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.osc({ type: 'triangle', freq: 320, freqEnd: 620, t, dur: 0.16, gain: 0.07, dest: this.buses.enemies, ...s });
    this.syn.osc({ type: 'triangle', freq: 320, freqEnd: 140, t, dur: 0.16, gain: 0.07, dest: this.buses.enemies, ...s });
    this.syn.noise({ t, dur: 0.12, gain: 0.05, filterType: 'bandpass', filterFreq: 1400, dest: this.buses.enemies, ...s });
  }

  enemyMove(type: EnemyKind, pos?: Pos) {
    if (this.quality === 'low') return;
    const interval = type === 'TITAN' || type === 'BOSS' ? 0.85 : type === 'BRUISER' ? 1.15 : 2.4;
    if (!this.gate('move.' + type, 0, interval, 0.12)) return;
    const t = this.t();
    const s = this.spat(pos);
    if (type === 'TITAN' || type === 'BOSS') {
      this.syn.osc({ type: 'sine', freq: 48, freqEnd: 32, t, dur: 0.16, gain: 0.07, dest: this.buses.enemies, ...s });
      this.syn.noise({ t, dur: 0.1, gain: 0.03, filterType: 'lowpass', filterFreq: 180, dest: this.buses.enemies, ...s });
    } else if (type === 'BRUISER') {
      this.syn.osc({ type: 'sine', freq: 62, freqEnd: 44, t, dur: 0.1, gain: 0.04, dest: this.buses.enemies, ...s });
    }
  }

  disruptorCharge(pos?: Pos) {
    if (!this.gate('enemy.disruptor.charge', 2, 0.8, 0.4)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.osc({ type: 'square', freq: 1400, freqEnd: 900, t, dur: 0.12, gain: 0.04, dest: this.buses.alert, ...s });
    this.syn.osc({ type: 'sawtooth', freq: 110, freqEnd: 160, t, dur: 0.35, gain: 0.06, dest: this.buses.alert, ...s });
    this.syn.noise({ t, dur: 0.3, gain: 0.035, filterType: 'bandpass', filterFreq: 2800, filterQ: 8, dest: this.buses.alert, ...s });
  }

  disruptorPulse(pos?: Pos) {
    if (!this.gate('enemy.disruptor.pulse', 2, 0.4, 0.32)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.osc({ type: 'square', freq: 78, freqEnd: 48, t, dur: 0.22, gain: 0.1, dest: this.buses.alert, ...s });
    this.syn.noise({ t, dur: 0.18, gain: 0.07, filterType: 'bandpass', filterFreq: 2200, filterQ: 2.2, dest: this.buses.alert, ...s });
    this.syn.fm({ carrier: 160, modFreq: 32, modGain: 80, t, dur: 0.2, gain: 0.05, dest: this.buses.alert, ...s });
  }

  // ---------------------------------------------------------------------------
  // Core / reactor
  // ---------------------------------------------------------------------------

  coreDamage(pos?: Pos) {
    if (!this.gate('core.damage', 3, 0.12, 0.45)) return;
    const t = this.t();
    this.syn.osc({ type: 'sawtooth', freq: 92, freqEnd: 42, t, dur: 0.28, gain: 0.16, dest: this.buses.alert });
    this.syn.osc({ type: 'sine', freq: 55, freqEnd: 28, t, dur: 0.35, gain: 0.14, dest: this.buses.alert });
    this.syn.noise({ t, dur: 0.22, gain: 0.1, filterType: 'lowpass', filterFreq: 600, dest: this.buses.alert });
    this.syn.osc({ type: 'triangle', freq: 440, freqEnd: 220, t: t + 0.04, dur: 0.12, gain: 0.06, dest: this.buses.alert });
    void pos;
  }

  coreCritical() {
    if (!this.gate('core.critical', 3, 4.0, 0.7)) return;
    const t = this.t();
    this.syn.osc({ type: 'sine', freq: 220, freqEnd: 196, t, dur: 0.4, gain: 0.08, dest: this.buses.alert });
    this.syn.osc({ type: 'sine', freq: 330, freqEnd: 294, t: t + 0.18, dur: 0.4, gain: 0.06, dest: this.buses.alert });
  }

  coreDestroy() {
    if (!this.gate('core.destroy', 3, 2.0, 3.2)) return;
    const t = this.t();
    // Stage 1 — instability
    this.syn.noise({ t, dur: 0.45, gain: 0.1, filterType: 'bandpass', filterFreq: 700, filterFreqEnd: 1400, dest: this.buses.alert });
    this.syn.osc({ type: 'sawtooth', freq: 90, freqEnd: 150, t, dur: 0.45, gain: 0.1, dest: this.buses.alert });
    // Stage 2 — overload
    this.syn.osc({ type: 'sine', freq: 58, freqEnd: 30, t: t + 0.42, dur: 0.7, gain: 0.2, dest: this.buses.alert });
    this.syn.fm({ carrier: 120, carrierEnd: 50, modFreq: 22, modGain: 90, t: t + 0.5, dur: 0.6, gain: 0.1, dest: this.buses.alert });
    this.syn.noise({ t: t + 0.5, dur: 0.5, gain: 0.1, filterType: 'lowpass', filterFreq: 800, dest: this.buses.alert });
    // Stage 3 — explosion
    this.syn.osc({ type: 'sine', freq: 70, freqEnd: 22, t: t + 1.05, dur: 1.15, gain: 0.28, dest: this.buses.alert });
    this.syn.noise({ t: t + 1.05, dur: 0.85, gain: 0.2, filterType: 'lowpass', filterFreq: 900, filterFreqEnd: 220, dest: this.buses.alert });
    this.syn.osc({ type: 'sawtooth', freq: 180, freqEnd: 40, t: t + 1.1, dur: 0.5, gain: 0.08, dest: this.buses.alert });
    // Stage 4 — decay
    this.syn.osc({ type: 'sine', freq: 36, freqEnd: 18, t: t + 1.9, dur: 1.5, gain: 0.1, dest: this.buses.alert });
  }

  startReactor() {
    if (this.reactor) return;
    this.reactor = new ReactorVoice(this.syn, this.buses.reactor);
    this.reactor.start();
  }

  stopReactor() {
    this.reactor?.stop();
    this.reactor = null;
  }

  setReactorHealth(ratio: number, critical: boolean) {
    this.reactor?.setHealth(ratio, critical);
  }

  // ---------------------------------------------------------------------------
  // Abilities
  // ---------------------------------------------------------------------------

  emp(pos?: Pos) {
    if (!this.gate('ability.emp', 2, 0.3, 0.7)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.osc({ type: 'sawtooth', freq: 90, freqEnd: 240, t, dur: 0.12, gain: 0.08, dest: this.buses.alert, ...s });
    this.syn.osc({ type: 'square', freq: 520, freqEnd: 80, t: t + 0.1, dur: 0.08, gain: 0.07, dest: this.buses.alert, ...s });
    this.syn.osc({ type: 'sine', freq: 70, freqEnd: 32, t: t + 0.12, dur: 0.55, gain: 0.16, dest: this.buses.alert, ...s });
    this.syn.noise({ t: t + 0.12, dur: 0.4, gain: 0.08, filterType: 'lowpass', filterFreq: 1400, filterFreqEnd: 400, dest: this.buses.alert, ...s });
  }

  orbitalLock() {
    if (!this.gate('ability.orbital.lock', 2, 0.15, 0.12)) return;
    const t = this.t();
    this.syn.osc({ type: 'square', freq: 1320, t, dur: 0.05, gain: 0.06, dest: this.buses.ui });
    this.syn.osc({ type: 'sine', freq: 880, t: t + 0.04, dur: 0.06, gain: 0.05, dest: this.buses.ui });
  }

  orbitalCharge(pos?: Pos) {
    if (!this.gate('ability.orbital.charge', 2, 0.4, 0.85)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.osc({ type: 'sawtooth', freq: 180, freqEnd: 920, t, dur: 0.75, gain: 0.1, attack: 0.05, dest: this.buses.alert, ...s });
    this.syn.osc({ type: 'sine', freq: 360, freqEnd: 1400, t, dur: 0.75, gain: 0.06, attack: 0.06, dest: this.buses.alert, ...s });
    this.syn.noise({ t: t + 0.2, dur: 0.55, gain: 0.04, filterType: 'bandpass', filterFreq: 2000, filterFreqEnd: 3600, dest: this.buses.alert, ...s });
  }

  orbitalImpact(pos?: Pos) {
    if (!this.gate('ability.orbital.impact', 3, 0.4, 0.9)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.osc({ type: 'sine', freq: 55, freqEnd: 22, t, dur: 0.7, gain: 0.24, dest: this.buses.alert, ...s });
    this.syn.osc({ type: 'sawtooth', freq: 140, freqEnd: 40, t, dur: 0.35, gain: 0.1, dest: this.buses.alert, ...s });
    this.syn.noise({ t, dur: 0.4, gain: 0.14, filterType: 'lowpass', filterFreq: 1200, filterFreqEnd: 300, dest: this.buses.alert, ...s });
    this.syn.fm({ carrier: 240, carrierEnd: 70, modFreq: 40, modGain: 160, t, dur: 0.3, gain: 0.08, dest: this.buses.alert, ...s });
    this.syn.osc({ type: 'triangle', freq: 720, freqEnd: 180, t, dur: 0.18, gain: 0.06, dest: this.buses.alert, ...s });
  }

  overdrive() {
    if (!this.gate('ability.overdrive', 2, 0.4, 0.7)) return;
    const t = this.t();
    [293.66, 369.99, 440, 587.33].forEach((f, i) => {
      this.syn.osc({ type: 'sine', freq: f, t: t + i * 0.06, dur: 0.28, gain: 0.08, dest: this.buses.alert });
    });
    this.syn.osc({ type: 'sawtooth', freq: 110, freqEnd: 220, t, dur: 0.5, gain: 0.05, dest: this.buses.alert });
    this.syn.noise({ t: t + 0.1, dur: 0.35, gain: 0.04, filterType: 'highpass', filterFreq: 2000, dest: this.buses.alert });
  }

  overdriveEnd() {
    if (!this.gate('ability.overdrive.end', 2, 0.4, 0.35)) return;
    this.syn.osc({ type: 'sine', freq: 440, freqEnd: 180, t: this.t(), dur: 0.28, gain: 0.07, dest: this.buses.alert });
  }

  // ---------------------------------------------------------------------------
  // Waves / campaign / bosses
  // ---------------------------------------------------------------------------

  waveStart(wave?: number) {
    if (!this.gate('wave.start', 2, 0.4, 0.55)) return;
    const t = this.t();
    [392, 523, 659].forEach((f, i) => {
      this.syn.osc({ type: 'triangle', freq: f, t: t + i * 0.09, dur: 0.14, gain: 0.09, dest: this.buses.alert });
    });
    this.syn.osc({ type: 'sine', freq: 98, t, dur: 0.28, gain: 0.06, dest: this.buses.alert });
    if (wave === 1) {
      this.syn.osc({ type: 'sawtooth', freq: 160, freqEnd: 320, t: t + 0.28, dur: 0.3, gain: 0.06, dest: this.buses.alert });
    }
    if (wave === 5) {
      [293.66, 349.23, 440].forEach((f, i) => {
        this.syn.osc({ type: 'sine', freq: f, t: t + 0.35 + i * 0.08, dur: 0.2, gain: 0.07, dest: this.buses.alert });
      });
    }
    if (wave === 16) {
      this.syn.osc({ type: 'sine', freq: 55, t: t + 0.2, dur: 0.6, gain: 0.1, dest: this.buses.alert });
      this.syn.osc({ type: 'sawtooth', freq: 110, freqEnd: 70, t: t + 0.2, dur: 0.5, gain: 0.07, dest: this.buses.alert });
    }
  }

  waveComplete() {
    if (!this.gate('wave.complete', 2, 0.6, 0.45)) return;
    const t = this.t();
    [440, 554, 659].forEach((f, i) => {
      this.syn.osc({ type: 'sine', freq: f, t: t + i * 0.07, dur: 0.16, gain: 0.08, dest: this.buses.ui });
    });
  }

  waveSpecial(wave: number, kind: 'bruiser' | 'dasher' | 'shield' | 'splitter' | 'portal3' | 'disruptor' | 'act3' | 'amp') {
    if (!this.gate('wave.special.' + kind, 2, 0.8, 0.6)) return;
    const t = this.t();
    switch (kind) {
      case 'bruiser':
        this.syn.osc({ type: 'sine', freq: 70, t, dur: 0.3, gain: 0.12, dest: this.buses.alert });
        this.syn.osc({ type: 'sawtooth', freq: 140, freqEnd: 80, t: t + 0.08, dur: 0.22, gain: 0.07, dest: this.buses.alert });
        break;
      case 'dasher':
        this.syn.osc({ type: 'triangle', freq: 360, freqEnd: 1400, t, dur: 0.22, gain: 0.08, dest: this.buses.alert });
        break;
      case 'shield':
        this.syn.osc({ type: 'sine', freq: 300, freqEnd: 520, t, dur: 0.28, gain: 0.09, dest: this.buses.alert });
        this.syn.partials({ freqs: [520, 780, 1040], t: t + 0.1, dur: 0.2, gain: 0.05, dest: this.buses.alert });
        break;
      case 'splitter':
        this.syn.fm({ carrier: 160, modFreq: 40, modGain: 120, t, dur: 0.24, gain: 0.09, dest: this.buses.alert });
        break;
      case 'portal3':
        [0, 0.22, 0.44].forEach((off, i) => {
          this.syn.osc({ type: 'sawtooth', freq: 90 + i * 20, freqEnd: 180 + i * 40, t: t + off, dur: 0.28, gain: 0.08, dest: this.buses.alert });
        });
        break;
      case 'disruptor':
        this.syn.noise({ t, dur: 0.35, gain: 0.07, filterType: 'bandpass', filterFreq: 2000, filterQ: 6, dest: this.buses.alert });
        this.syn.osc({ type: 'square', freq: 80, t, dur: 0.3, gain: 0.08, dest: this.buses.alert });
        break;
      case 'act3':
        this.syn.osc({ type: 'sawtooth', freq: 110, freqEnd: 55, t, dur: 0.4, gain: 0.1, dest: this.buses.alert });
        REACTOR_MOTIF.forEach((f, i) => {
          this.syn.osc({ type: 'sine', freq: f * 0.5, t: t + 0.15 + i * 0.1, dur: 0.22, gain: 0.07, dest: this.buses.alert });
        });
        break;
      case 'amp':
        [329.63, 415.3, 493.88, 659.25].forEach((f, i) => {
          this.syn.osc({ type: 'sine', freq: f, t: t + i * 0.08, dur: 0.22, gain: 0.08, dest: this.buses.alert });
        });
        break;
    }
    void wave;
  }

  portalActivate(pos?: Pos, index?: number) {
    if (!this.gate('portal.activate', 2, 0.4, 0.8)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.osc({ type: 'sawtooth', freq: 80, freqEnd: 240, t, dur: 0.7, gain: 0.1, attack: 0.08, dest: this.buses.alert, ...s });
    this.syn.noise({ t, dur: 0.55, gain: 0.06, filterType: 'lowpass', filterFreq: 500, dest: this.buses.alert, ...s });
    this.syn.osc({ type: 'sine', freq: 160, freqEnd: 90, t: t + 0.35, dur: 0.4, gain: 0.07, dest: this.buses.alert, ...s });
    if (index === 2) this.waveSpecial(6, 'portal3');
  }

  bossEnter(kind?: 'TITAN' | 'BOSS', pos?: Pos) {
    if (!this.gate('boss.enter', 3, 1.2, 1.6)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.osc({ type: 'sine', freq: 40, t, dur: 1.2, gain: 0.14, attack: 0.15, dest: this.buses.alert, ...s });
    this.syn.noise({ t, dur: 0.9, gain: 0.08, filterType: 'lowpass', filterFreq: 220, dest: this.buses.alert, ...s });
    this.syn.osc({ type: 'sawtooth', freq: 70, freqEnd: 110, t: t + 0.3, dur: 0.6, gain: 0.08, dest: this.buses.alert, ...s });
    this.syn.osc({ type: 'triangle', freq: 220, t: t + 0.85, dur: 0.18, gain: 0.1, dest: this.buses.alert });
    this.syn.osc({ type: 'triangle', freq: 165, t: t + 1.05, dur: 0.22, gain: 0.1, dest: this.buses.alert });
    if (kind === 'BOSS') {
      REACTOR_MOTIF.forEach((f, i) => {
        this.syn.osc({ type: 'sawtooth', freq: f * 0.5, t: t + 0.5 + i * 0.16, dur: 0.2, gain: 0.06, dest: this.buses.alert });
      });
    }
  }

  bossPhase(phase: number, kind?: 'TITAN' | 'BOSS') {
    if (!this.gate('boss.phase.' + phase, 3, 0.8, 0.8)) return;
    const t = this.t();
    if (phase === 2) {
      this.syn.osc({ type: 'sawtooth', freq: 90, freqEnd: 280, t, dur: 0.55, gain: 0.1, dest: this.buses.alert });
      this.syn.osc({ type: 'sine', freq: 180, freqEnd: 420, t, dur: 0.5, gain: 0.08, dest: this.buses.alert });
      this.syn.noise({ t: t + 0.35, dur: 0.25, gain: 0.08, filterType: 'bandpass', filterFreq: 900, dest: this.buses.alert });
    } else {
      this.syn.osc({ type: 'sine', freq: 55, t, dur: 0.4, gain: 0.12, dest: this.buses.alert });
      this.syn.osc({ type: 'sawtooth', freq: 110, freqEnd: 70, t, dur: 0.3, gain: 0.08, dest: this.buses.alert });
      this.syn.noise({ t, dur: 0.2, gain: 0.06, filterType: 'lowpass', filterFreq: 400, dest: this.buses.alert });
    }
    void kind;
  }

  bossDestroy(kind?: 'TITAN' | 'BOSS', pos?: Pos) {
    if (!this.gate('boss.destroy', 3, 1.5, 2.2)) return;
    const t = this.t();
    const s = this.spat(pos);
    this.syn.noise({ t, dur: 0.35, gain: 0.1, filterType: 'bandpass', filterFreq: 1200, dest: this.buses.alert, ...s });
    this.syn.osc({ type: 'sawtooth', freq: 140, freqEnd: 50, t: t + 0.1, dur: 0.4, gain: 0.1, dest: this.buses.alert, ...s });
    this.syn.noise({ t: t + 0.25, dur: 0.4, gain: 0.1, filterType: 'highpass', filterFreq: 2000, dest: this.buses.alert, ...s });
    this.syn.osc({ type: 'sine', freq: 70, freqEnd: 28, t: t + 0.45, dur: 0.9, gain: 0.2, dest: this.buses.alert, ...s });
    this.syn.noise({ t: t + 0.5, dur: 0.7, gain: 0.14, filterType: 'lowpass', filterFreq: 700, filterFreqEnd: 180, dest: this.buses.alert, ...s });
    if (kind === 'BOSS') {
      this.syn.osc({ type: 'sine', freq: 40, t: t + 0.7, dur: 1.2, gain: 0.16, dest: this.buses.alert });
      this.syn.fm({ carrier: 90, carrierEnd: 30, modFreq: 18, modGain: 70, t: t + 0.6, dur: 0.8, gain: 0.08, dest: this.buses.alert });
    }
    [523, 659, 784].forEach((f, i) => {
      this.syn.osc({ type: 'sine', freq: f, t: t + 1.15 + i * 0.09, dur: 0.2, gain: 0.07, dest: this.buses.alert });
    });
  }

  victory() {
    if (!this.gate('campaign.victory', 3, 2.0, 1.6)) return;
    const t = this.t();
    const notes = [220.0, 277.18, 329.63, 440.0];
    notes.forEach((f, i) => {
      this.syn.osc({ type: 'sine', freq: f, t: t + i * 0.22, dur: 0.7, gain: 0.1, attack: 0.06, dest: this.buses.alert });
      this.syn.osc({ type: 'sine', freq: f * 2, t: t + i * 0.22, dur: 0.4, gain: 0.03, dest: this.buses.alert });
    });
    this.syn.osc({ type: 'sine', freq: 110, t: t + 0.2, dur: 1.6, gain: 0.06, dest: this.buses.alert });
  }

  defeat() {
    if (!this.gate('game.defeat', 3, 2.0, 1.4)) return;
    const t = this.t();
    [220.0, 164.81, 146.83, 110.0].forEach((f, i) => {
      this.syn.osc({ type: 'sine', freq: f, t: t + 2.1 + i * 0.38, dur: 0.7, gain: 0.08, attack: 0.08, dest: this.buses.alert });
    });
  }

  celebrate() {
    if (!this.gate('score.high', 2, 0.8, 0.7)) return;
    const t = this.t();
    [523, 659, 784, 1046, 1318].forEach((f, i) => {
      this.syn.osc({ type: 'sine', freq: f, t: t + i * 0.08, dur: 0.2, gain: 0.07, dest: this.buses.ui });
    });
  }

  unlock() {
    if (!this.gate('tech.unlock', 2, 0.3, 0.5)) return;
    const t = this.t();
    [392, 523, 659, 880].forEach((f, i) => {
      this.syn.osc({ type: 'triangle', freq: f, t: t + i * 0.08, dur: 0.18, gain: 0.08, dest: this.buses.ui });
    });
  }

  finalWarning() {
    if (!this.gate('final.warning', 3, 1.5, 1.1)) return;
    const t = this.t();
    [220, 220, 174.61].forEach((f, i) => {
      this.syn.osc({ type: 'sawtooth', freq: f, t: t + i * 0.32, dur: 0.28, gain: 0.11, dest: this.buses.alert });
      this.syn.osc({ type: 'sine', freq: f * 0.5, t: t + i * 0.32, dur: 0.3, gain: 0.07, dest: this.buses.alert });
    });
  }

  actComplete(act?: number) {
    if (!this.gate('act.complete', 2, 1.0, 0.8)) return;
    const t = this.t();
    REACTOR_MOTIF.forEach((f, i) => {
      this.syn.osc({ type: 'sine', freq: f, t: t + i * 0.1, dur: 0.24, gain: 0.09, dest: this.buses.alert });
    });
    this.syn.osc({ type: 'sine', freq: 587.33, t: t + 0.45, dur: 0.35, gain: 0.08, dest: this.buses.alert });
    void act;
  }

  pausePulse() {
    if (!this.gate('ui.pause', 2, 0.2, 0.15)) return;
    this.syn.osc({ type: 'sine', freq: 330, freqEnd: 220, t: this.t(), dur: 0.12, gain: 0.06, dest: this.buses.ui });
  }
}

class ReactorVoice {
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  private lfo: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private filt: BiquadFilterNode | null = null;
  private pulse: OscillatorNode | null = null;
  private pulseG: GainNode | null = null;
  private stopped = false;

  constructor(private syn: Synthesizer, private dest: AudioNode) {}

  start() {
    const ctx = this.syn.ctx;
    const t = ctx.currentTime;
    try {
      this.gain = ctx.createGain();
      this.gain.gain.setValueAtTime(0.0001, t);
      this.gain.gain.exponentialRampToValueAtTime(0.035, t + 1.2);
      this.filt = ctx.createBiquadFilter();
      this.filt.type = 'lowpass';
      this.filt.frequency.value = 280;
      this.oscA = ctx.createOscillator();
      this.oscB = ctx.createOscillator();
      this.oscA.type = 'sine'; this.oscB.type = 'sine';
      this.oscA.frequency.value = 55;
      this.oscB.frequency.value = 82.5;
      this.lfo = ctx.createOscillator();
      this.lfo.frequency.value = 0.07;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 18;
      this.lfo.connect(lfoG); lfoG.connect(this.filt.frequency);
      this.oscA.connect(this.filt); this.oscB.connect(this.filt);
      this.filt.connect(this.gain); this.gain.connect(this.dest);
      this.pulse = ctx.createOscillator();
      this.pulse.type = 'sine';
      this.pulse.frequency.value = 110;
      this.pulseG = ctx.createGain();
      this.pulseG.gain.value = 0.008;
      this.pulse.connect(this.pulseG); this.pulseG.connect(this.dest);
      this.oscA.start(); this.oscB.start(); this.lfo.start(); this.pulse.start();
    } catch { this.stopped = true; }
  }

  setHealth(ratio: number, critical: boolean) {
    if (!this.gain || !this.filt || !this.pulseG) return;
    const t = this.syn.ctx.currentTime;
    const target = ratio <= 0 ? 0.0001 : critical ? 0.022 : 0.035 * (0.7 + 0.3 * ratio);
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), t);
    this.gain.gain.linearRampToValueAtTime(Math.max(0.0001, target), t + 0.4);
    this.filt.frequency.linearRampToValueAtTime(critical ? 420 : 280, t + 0.4);
    this.pulseG.gain.linearRampToValueAtTime(critical ? 0.016 : 0.008, t + 0.4);
    if (this.pulse) this.pulse.frequency.linearRampToValueAtTime(critical ? 140 : 110, t + 0.4);
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.syn.ctx.currentTime;
    try {
      this.gain?.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      this.oscA?.stop(t + 0.45);
      this.oscB?.stop(t + 0.45);
      this.lfo?.stop(t + 0.45);
      this.pulse?.stop(t + 0.45);
    } catch { /* */ }
    this.oscA = this.oscB = this.lfo = this.pulse = null;
  }
}
