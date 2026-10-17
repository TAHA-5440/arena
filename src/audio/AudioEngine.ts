import type { Settings } from '../types/game';
import type { AudioQuality, AudioWorld, BusMap, GameAudioEvent, MusicState, Pos } from './types';
import { AUDIO_DEFAULTS, clamp01, defaultAudioQuality, detectMobile, normalizeAudioSettings } from './AudioSettings';
import { AudioSpatializer } from './AudioSpatializer';
import { AudioEventRouter } from './AudioEventRouter';
import { Synthesizer } from './Synthesizer';
import { SoundLibrary } from './SoundLibrary';
import { MusicSequencer } from './MusicSequencer';
import { arrangementFor, pickMusicState } from './MusicDirector';

/**
 * Lead audio facade. One AudioContext per session, four mix buses,
 * procedural SFX + adaptive music. Gameplay remains fully playable if
 * audio fails to initialize.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfxGain: GainNode | null = null;
  musicGain: GainNode | null = null;
  musicNodes: AudioNode[] = [];
  musicPlaying = false;
  enabled = true;

  private buses: BusMap | null = null;
  private syn: Synthesizer | null = null;
  private sounds: SoundLibrary | null = null;
  private seq: MusicSequencer | null = null;
  private router = new AudioEventRouter();
  private spatial = new AudioSpatializer();
  private uiGain: GainNode | null = null;

  private masterVol = AUDIO_DEFAULTS.masterVolume;
  private sfxVol = AUDIO_DEFAULTS.sfxVolume;
  private musicVol = AUDIO_DEFAULTS.musicVolume;
  private uiVol = AUDIO_DEFAULTS.uiVolume;
  private muted = false;
  private quality: AudioQuality = defaultAudioQuality();
  private pausedGame = false;
  private sfxPausedMul = 1;

  private musicState: MusicState = 'MENU';
  private hold = 0;
  private lastSync = 0;
  private lastMove = 0;
  private lastWorld: AudioWorld | null = null;
  private unlocked = false;
  private visibilityBound = false;
  private duckTimer = 0;

  init() {
    if (this.ctx) return;
    try {
      const AC = (typeof window !== 'undefined' && ((window as any).AudioContext || (window as any).webkitAudioContext)) as typeof AudioContext | undefined;
      if (!AC) return;
      this.ctx = new AC();
      this.buildGraph();
      this.bindUnlock();
      this.bindVisibility();
      this.router.configure(this.quality, detectMobile());
      this.router.now = () => this.ctx ? this.ctx.currentTime : 0;
      this.applyGains(true);
    } catch {
      this.ctx = null;
      this.enabled = false;
    }
  }

  private buildGraph() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 10;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;

    const master = ctx.createGain();
    master.gain.value = this.masterVol;
    master.connect(compressor);
    compressor.connect(ctx.destination);

    const music = ctx.createGain(); music.gain.value = this.musicVol;
    const musicAmbient = ctx.createGain(); musicAmbient.gain.value = 0.7;
    const musicRhythm = ctx.createGain(); musicRhythm.gain.value = 0;
    const musicBass = ctx.createGain(); musicBass.gain.value = 0;
    const musicIntensity = ctx.createGain(); musicIntensity.gain.value = 0;
    musicAmbient.connect(music);
    musicRhythm.connect(music);
    musicBass.connect(music);
    musicIntensity.connect(music);
    music.connect(master);

    const sfx = ctx.createGain(); sfx.gain.value = this.sfxVol;
    const towers = ctx.createGain(); towers.gain.value = 0.9;
    const projectiles = ctx.createGain(); projectiles.gain.value = 0.7;
    const impacts = ctx.createGain(); impacts.gain.value = 0.75;
    const enemies = ctx.createGain(); enemies.gain.value = 0.85;
    const explosions = ctx.createGain(); explosions.gain.value = 0.95;
    towers.connect(sfx); projectiles.connect(sfx); impacts.connect(sfx);
    enemies.connect(sfx); explosions.connect(sfx);
    sfx.connect(master);

    const ui = ctx.createGain(); ui.gain.value = this.uiVol;
    ui.connect(master);

    const alert = ctx.createGain(); alert.gain.value = 1;
    alert.connect(master);

    const reactor = ctx.createGain(); reactor.gain.value = 0.8;
    reactor.connect(master);

    this.master = master;
    this.sfxGain = sfx;
    this.musicGain = music;
    this.uiGain = ui;
    this.buses = {
      master, compressor, music, musicAmbient, musicRhythm, musicBass, musicIntensity,
      sfx, towers, projectiles, impacts, enemies, explosions, ui, alert, reactor,
    };
    this.syn = new Synthesizer(ctx);
    this.sounds = new SoundLibrary(this.syn, this.buses, this.router, this.spatial);
    this.sounds.setQuality(this.quality);
    this.seq = new MusicSequencer(this.syn, this.buses);
    this.seq.setQuality(this.quality);
  }

  private bindUnlock() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.resume();
      this.unlocked = true;
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  private bindVisibility() {
    if (this.visibilityBound || typeof document === 'undefined') return;
    this.visibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) {
        try { this.ctx.suspend(); } catch { /* */ }
      } else if (!this.muted) {
        this.resume();
      }
    });
  }

  resume() {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => this.seq?.onContextResume()).catch(() => { /* autoplay still blocked */ });
    }
  }

  setSfx(v: number) { this.sfxVol = clamp01(v); this.applyGains(); }
  setMusic(v: number) { this.musicVol = clamp01(v); this.applyGains(); }
  setMaster(v: number) { this.masterVol = clamp01(v); this.applyGains(); }
  setUi(v: number) { this.uiVol = clamp01(v); this.applyGains(); }
  setMuted(m: boolean) { this.muted = m; this.applyGains(); }
  setQuality(q: AudioQuality) {
    this.quality = q;
    this.router.configure(q, detectMobile());
    this.sounds?.setQuality(q);
    this.seq?.setQuality(q);
    this.spatial.enabled = q !== 'low';
  }

  applySettings(s: Settings) {
    normalizeAudioSettings(s);
    this.masterVol = s.masterVolume;
    this.sfxVol = s.sfxVolume;
    this.musicVol = s.musicVolume;
    this.uiVol = s.uiVolume;
    this.muted = s.muted;
    this.setQuality(s.audioQuality);
    this.applyGains();
  }

  private applyGains(instant = false) {
    const t = this.ctx ? this.ctx.currentTime : 0;
    const mute = this.muted ? 0 : 1;
    const set = (node: GainNode | null, value: number) => {
      if (!node) return;
      const v = Math.max(0.0001, value);
      try {
        if (instant || !this.ctx) { node.gain.value = value; return; }
        node.gain.cancelScheduledValues(t);
        node.gain.setValueAtTime(Math.max(0.0001, node.gain.value || 0.0001), t);
        node.gain.linearRampToValueAtTime(v, t + 0.04);
      } catch { node.gain.value = value; }
    };
    set(this.master, this.masterVol * mute);
    set(this.sfxGain, this.sfxVol * this.sfxPausedMul);
    set(this.musicGain, this.musicVol);
    set(this.uiGain, this.uiVol);
  }

  private duckSfx(dur = 0.38) {
    if (!this.sfxGain || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (t < this.duckTimer) return;
    this.duckTimer = t + 0.2;
    const target = Math.max(0.0001, this.sfxVol * this.sfxPausedMul);
    try {
      const g = this.sfxGain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(target, t);
      g.linearRampToValueAtTime(target * 0.55, t + 0.03);
      g.linearRampToValueAtTime(target, t + dur);
    } catch { /* */ }
  }

  // ---------------------------------------------------------------------------
  // Scene / music
  // ---------------------------------------------------------------------------

  startMusic() {
    this.init();
    this.resume();
    if (!this.seq || this.musicPlaying) {
      this.musicPlaying = true;
      return;
    }
    try {
      this.seq.start();
      this.musicPlaying = true;
      this.sounds?.startReactor();
    } catch {
      this.musicPlaying = false;
    }
  }

  stopMusic() {
    this.musicPlaying = false;
    try { this.seq?.stop(); } catch { /* */ }
    this.sounds?.stopReactor();
  }

  onPause() {
    this.pausedGame = true;
    this.sfxPausedMul = 0.0001;
    this.applyGains();
    this.sounds?.pausePulse();
  }

  onResume() {
    this.pausedGame = false;
    this.sfxPausedMul = 1;
    this.applyGains();
    this.resume();
  }

  sync(world: AudioWorld) {
    this.lastWorld = world;
    this.spatial.setCamera(world.cameraX, world.cameraY, world.cameraZoom);
    if (world.audioQuality !== this.quality) this.setQuality(world.audioQuality);
    if (world.muted !== this.muted) this.setMuted(world.muted);

    const now = this.ctx ? this.ctx.currentTime : 0;
    const dt = this.lastSync ? Math.min(0.25, now - this.lastSync) : 0.016;
    this.lastSync = now;
    this.hold += dt;

    const picked = pickMusicState(world, this.musicState, this.hold);
    if (picked.state !== this.musicState) {
      this.musicState = picked.state;
      if (picked.resetHold) this.hold = 0;
    }
    if (this.seq && this.musicPlaying) {
      this.seq.setArrangement(arrangementFor(world, this.musicState));
    }

    const ratio = world.integrity / Math.max(1, world.maxIntegrity);
    this.sounds?.setReactorHealth(ratio, ratio <= 0.25 && world.state !== 'GAME_OVER' && world.state !== 'VICTORY' && world.state !== 'MAIN_MENU');

    if (world.hasBoss && world.bossKind && now - this.lastMove > 0.8 && !world.paused) {
      this.lastMove = now;
      this.sounds?.enemyMove(world.bossKind, undefined);
    }
  }

  emit(event: GameAudioEvent, payload: { pos?: Pos; type?: string; wave?: number; phase?: number; index?: number; first?: boolean; isBoss?: boolean; portal?: number; child?: boolean } = {}) {
    if (!this.sounds) { this.init(); }
    if (!this.sounds) return;
    if (this.pausedGame && (event.startsWith('tower.') || event.startsWith('enemy.') || event.startsWith('ability.') || event.startsWith('core.') || event.startsWith('wave.') || event.startsWith('boss.') || event.startsWith('portal.'))) return;
    const s = this.sounds;
    const p = payload.pos;
    switch (event) {
      case 'ui.hover': s.hover(); break;
      case 'ui.click': s.click(); break;
      case 'ui.error': s.error(); break;
      case 'ui.menuOpen': s.menuOpen(); break;
      case 'ui.menuClose': s.menuClose(); break;
      case 'tower.select': s.select(); break;
      case 'tower.place': s.place(payload.type, p); break;
      case 'tower.upgrade': s.upgrade(payload.type, p); break;
      case 'tower.sell': s.sell(p); break;
      case 'tower.bolt.fire': s.bolt(p); break;
      case 'tower.arc.fire': s.arc(p); break;
      case 'tower.arc.chain': s.arcChain(payload.index || 0, p); break;
      case 'tower.cryo.fire': s.cryo(p); break;
      case 'tower.cryo.impact': s.cryoImpact(p); break;
      case 'tower.cryo.slow': s.cryoSlow(p); break;
      case 'tower.rail.charge': s.railCharge(p); break;
      case 'tower.rail.fire': s.railFire(p); break;
      case 'tower.rail.impact': s.railImpact(p); break;
      case 'tower.nova.fire': s.novaFire(p); break;
      case 'tower.nova.explode': s.novaExplode(p); break;
      case 'tower.amplifier.activate': s.ampActivate(p); break;
      case 'enemy.hit': s.hullHit(payload.type, p); break;
      case 'enemy.shield.hit': s.shieldHit(p); break;
      case 'enemy.shield.break': s.shieldBreak(p); break;
      case 'enemy.split': s.enemySplit(p); break;
      case 'enemy.destroy': s.enemyDestroy(payload.type || 'SCOUT', p, payload.child); break;
      case 'enemy.spawn': s.enemySpawn(payload.type || 'SCOUT', p); break;
      case 'enemy.disruptor.charge': s.disruptorCharge(p); break;
      case 'enemy.disruptor.pulse': s.disruptorPulse(p); break;
      case 'core.damage': s.coreDamage(p); this.duckSfx(0.45); break;
      case 'core.critical': s.coreCritical(); this.duckSfx(0.5); break;
      case 'core.destroy': s.coreDestroy(); this.duckSfx(1.2); break;
      case 'ability.emp': s.emp(p); break;
      case 'ability.orbital.lock': s.orbitalLock(); break;
      case 'ability.orbital.charge': s.orbitalCharge(p); break;
      case 'ability.orbital.impact': s.orbitalImpact(p); break;
      case 'ability.overdrive': s.overdrive(); break;
      case 'ability.overdrive.end': s.overdriveEnd(); break;
      case 'wave.start': s.waveStart(payload.wave); break;
      case 'wave.complete': s.waveComplete(); break;
      case 'boss.enter': s.bossEnter(payload.type === 'BOSS' ? 'BOSS' : 'TITAN', p); this.duckSfx(0.6); break;
      case 'boss.phase': s.bossPhase(payload.phase || 2, payload.type === 'BOSS' ? 'BOSS' : 'TITAN'); break;
      case 'boss.destroy': s.bossDestroy(payload.type === 'BOSS' ? 'BOSS' : 'TITAN', p); break;
      case 'campaign.victory': s.victory(); break;
      case 'game.defeat': s.defeat(); break;
      case 'portal.activate': s.portalActivate(p, payload.portal); break;
      case 'tech.unlock': s.unlock(); break;
      case 'score.high': s.celebrate(); break;
      case 'act.complete': s.actComplete(payload.wave); break;
      default: break;
    }
  }

  // ---------------------------------------------------------------------------
  // Named API — kept for existing Game/UI call sites
  // ---------------------------------------------------------------------------

  hover() { this.emit('ui.hover'); }
  click() { this.emit('ui.click'); }
  place(pos?: Pos, type?: string) { this.emit('tower.place', { pos, type }); }
  upgrade(pos?: Pos, type?: string) { this.emit('tower.upgrade', { pos, type }); }
  sell(pos?: Pos) { this.emit('tower.sell', { pos }); }
  noEnergy() { this.emit('ui.error'); }
  bolt(pos?: Pos) { this.emit('tower.bolt.fire', { pos }); }
  boltImpact(pos?: Pos) { this.sounds?.boltImpact(pos); }
  arc(pos?: Pos) { this.emit('tower.arc.fire', { pos }); }
  arcChain(index: number, pos?: Pos) { this.emit('tower.arc.chain', { index, pos }); }
  cryo(pos?: Pos) { this.emit('tower.cryo.fire', { pos }); }
  cryoImpact(pos?: Pos, firstSlow?: boolean) {
    this.emit('tower.cryo.impact', { pos });
    if (firstSlow) this.emit('tower.cryo.slow', { pos });
  }
  railCharge(pos?: Pos) { this.emit('tower.rail.charge', { pos }); }
  railFire(pos?: Pos) { this.emit('tower.rail.fire', { pos }); }
  railImpact(pos?: Pos) { this.emit('tower.rail.impact', { pos }); }
  plasma(pos?: Pos) { this.emit('tower.nova.explode', { pos }); }
  novaFire(pos?: Pos) { this.emit('tower.nova.fire', { pos }); }
  novaExplode(pos?: Pos) { this.emit('tower.nova.explode', { pos }); }
  amplifierActivate(pos?: Pos) { this.emit('tower.amplifier.activate', { pos }); }
  enemyHit(pos?: Pos, type?: string) { this.emit('enemy.hit', { pos, type }); }
  shieldHit(pos?: Pos) { this.emit('enemy.shield.hit', { pos }); }
  shieldBreak(pos?: Pos) { this.emit('enemy.shield.break', { pos }); }
  enemyDeath(type?: string, pos?: Pos, child?: boolean) { this.emit('enemy.destroy', { type, pos, child }); }
  enemySpawn(type: string, pos?: Pos) { this.emit('enemy.spawn', { type, pos }); }
  enemySplit(pos?: Pos) { this.emit('enemy.split', { pos }); }
  waveStart(wave?: number) { this.emit('wave.start', { wave }); }
  waveComplete() { this.emit('wave.complete'); }
  bossWarn(kind?: string) { this.emit('boss.enter', { type: kind }); }
  reactorHit(pos?: Pos) { this.emit('core.damage', { pos }); }
  victory() { this.emit('campaign.victory'); }
  gameOver() { this.emit('core.destroy'); this.emit('game.defeat'); }
  ability() { this.emit('ability.emp'); }
  emp(pos?: Pos) { this.emit('ability.emp', { pos }); }
  orbitalLock() { this.emit('ability.orbital.lock'); }
  orbitalCharge(pos?: Pos) { this.emit('ability.orbital.charge', { pos }); }
  orbitalImpact(pos?: Pos) { this.emit('ability.orbital.impact', { pos }); }
  overdrive() { this.emit('ability.overdrive'); }
  overdriveEnd() { this.emit('ability.overdrive.end'); }
  unlock() { this.emit('tech.unlock'); }
  portalActivate(pos?: Pos, portal?: number) { this.emit('portal.activate', { pos, portal }); }
  disruptPulse(pos?: Pos) { this.emit('enemy.disruptor.pulse', { pos }); }
  disruptWarn(pos?: Pos) { this.emit('enemy.disruptor.charge', { pos }); }
  bossDeath(kind?: string, pos?: Pos) { this.emit('boss.destroy', { type: kind, pos }); }
  bossPhase(phase: number, kind?: string) { this.emit('boss.phase', { phase, type: kind }); }
  finalWarning() { this.emit('wave.start', { wave: 19 }); this.sounds?.finalWarning(); }
  critical() { this.emit('core.critical'); }
  celebrate() { this.emit('score.high'); }
  menuOpen() { this.emit('ui.menuOpen'); }
  menuClose() { this.emit('ui.menuClose'); }
  select() { this.emit('tower.select'); }
  actComplete(act?: number) { this.emit('act.complete', { wave: act }); }
  waveSpecial(wave: number, kind: 'bruiser' | 'dasher' | 'shield' | 'splitter' | 'portal3' | 'disruptor' | 'act3' | 'amp') {
    this.sounds?.waveSpecial(wave, kind);
  }
}
