import { GameLoop } from './engine/GameLoop';
import { Camera } from './engine/Camera';
import { InputManager } from './engine/InputManager';
import { ParticleSystem } from './engine/ParticleSystem';
import { AudioEngine } from './engine/AudioEngine';
import { HexBoard } from './grid/HexBoard';
import { axialToPixel, pixelToAxial, hexDistance, HEX_RADIUS, HEX_STEP } from './grid/HexMath';
import { TOWER_DEFS, TOWER_DESC, TOWER_ORDER } from './data/towers';
import { ENEMY_DEFS, SPLIT_CHILD } from './data/enemies';
import { WAVES, getWaveDef, actForWave, routesForWave, waveBonusEnergy, ACTS, generateEndlessWave, difficultyMul, scaleGroups } from './data/waves';
import type { WaveDef, SpawnGroup } from './data/waves';
import { BALANCE } from './data/balance';
import type { TowerInstance, EnemyInstance, Projectile, GameState, Difficulty, TowerType, EnemyType, TargetMode, SaveData, Settings, RunStats } from './types/game';
import { GameState as GS, Difficulty as D, TowerType as TT, EnemyType as ET, TargetMode as TM, TileType as TILE } from './types/game';

let idCounter = 1;
const nid = () => idCounter++;

interface Announce { title: string; sub?: string; color: string; t: number; dur: number; big: boolean; }
interface ScheduledAnnounce { delay: number; a: Announce; }
interface RailShot { towerId: number; targetId: number; timer: number; }

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  input: InputManager;
  particles: ParticleSystem;
  audio: AudioEngine;
  board: HexBoard;
  loop: GameLoop;

  state: GameState = GS.BOOT;
  difficulty: Difficulty = D.COMMANDER;
  mode: 'campaign'|'endless' = 'campaign';

  towers: TowerInstance[] = [] ;
  enemies: EnemyInstance[] = [];
  projectiles: Projectile[] = [];
  reactorIntegrity = BALANCE.reactorIntegrity;
  maxIntegrity = BALANCE.reactorIntegrity;
  energy = BALANCE.startingEnergy;
  score = 0;
  bestScore = 0;
  bestEndlessWave = 0;
  wave = 0;
  waveActive = false;
  waveTimer = 0;
  currentWaveDef: WaveDef | null = null;
  spawnQueue: { type: EnemyType; portal: number; time: number; hpMul:number; speedMul:number; rewardMul:number; spawned?: boolean }[] = [];
  waveTotalEnemies = 0;
  waveKilled = 0;
  waveLeaked = 0;
  waveDamageTaken = false;
  waveCompleteBonusGiven = false;
  lowIntegrityWarned = false;

  cooldowns = { emp: 0, orbital: 0, overdrive: 0 };
  overdriveActive = 0;
  empActive = 0; empX=0; empY=0;
  orbitalTarget: {x:number;y:number} | null = null;
  orbitalTimer = 0;
  orbitalAiming = false;

  selectedTowerType: TowerType | null = null;
  selectedTowerId: number | null = null;
  hoverHex: {q:number;r:number} | null = null;
  hoverScreen: {x:number;y:number} | null = null;
  placementValid = false;

  // campaign progression
  unlockedTowers: TowerType[] = [TT.BOLT];
  unlockToasts: TowerType[] = [];     // consumed by the UI
  routesUnlocked = 1;                 // 1 = A, 2 = A+B, 3 = all
  routeReveal: { index: number; t: number } | null = null;
  preFinal = false;
  lastActAnnounced = 0;
  actShown = 1;
  actBlendT = 1;                      // 0..1 transition progress toward target act
  actTarget = 1;

  // onboarding
  tutorial: { stage: 'title'|'build'|'countdown'; t: number; countdown: number } | null = null;

  // bosses
  bossIntro: { name: string; t: number; portal: number } | null = null;
  flashTimer = 0;
  reactorFlash = 0;
  victoryRingTimer = 0;

  // stats
  stats: RunStats = { towersBuilt: 0, energyEarned: 0, bestCombo: 1, startTime: 0 };
  scoreSubmitted = false;

  combo = 1;
  comboTimer = 0;
  lastKillTime = 0;
  kills = 0;
  totalKills = 0;

  time = 0;
  paused = false;
  gameSpeed = 1;
  uiRoot: HTMLElement;
  uiVersion = 0;   // bumped when the DOM UI should re-render
  settings: Settings = { sfxVolume:0.7, musicVolume:0.35, quality:'high', reducedMotion:false, showFps:false, difficulty:D.COMMANDER };
  fps = 60; frameCount=0; fpsTimer=0;
  leaderboard: any[] = [];
  endlessSeed = 12345;
  private upcomingCache: { key: string; def: WaveDef } | null = null;

  floatingTexts: {x:number;y:number;text:string;color:string;life:number;maxLife:number;vy:number;size?:number}[] = [];
  arcEffects: {x1:number;y1:number;x2:number;y2:number;life:number;maxLife:number}[] = [];
  announcements: Announce[] = [];
  scheduled: ScheduledAnnounce[] = [];
  ampLinks: {x1:number;y1:number;x2:number;y2:number}[] = [];
  pendingRails: RailShot[] = [];
  ambientTimer = 0; pulseTimer = 0; instabilityTimer = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.uiRoot = uiRoot;
    this.camera = new Camera(canvas.width, canvas.height);
    this.input = new InputManager(canvas);
    this.particles = new ParticleSystem(BALANCE.particleBudgetDesktop);
    this.audio = new AudioEngine();
    this.audio.init();
    this.board = new HexBoard();
    this.loop = new GameLoop((dt)=>this.update(dt), (a)=>this.render(a));
    this.endlessSeed = (Date.now() ^ 0x5EED) & 0x7fffffff;
    this.loadSettings();
    this.loadLeaderboard();
    this.loadBestScore();
    this.setupInput();
    this.resize();
    window.addEventListener('resize', ()=>this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w*dpr);
    this.canvas.height = Math.floor(h*dpr);
    this.canvas.style.width = w+'px';
    this.canvas.style.height = h+'px';
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
    this.camera.resize(w,h);
    const boardPx = HEX_STEP*13;
    const fit = Math.min(w,h)/boardPx;
    this.camera.targetZoom = Math.max(0.55, Math.min(1.7, fit*0.92));
    this.camera.zoom = this.camera.targetZoom;
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  setupInput() {
    this.input.onPointerDown = (x,y) => {
      this.audio.resume();
      this.hoverScreen = {x,y};
    };
    this.input.onPointerMove = (x,y) => {
      this.hoverScreen = {x,y};
      if (this.state !== GS.BUILD_PHASE && this.state !== GS.COMBAT_PHASE) return;
      const w = this.camera.screenToWorld({x,y});
      const hex = pixelToAxial(w.x, w.y);
      if (this.board.inBounds(hex.q, hex.r)) this.hoverHex = hex; else this.hoverHex = null;
      this.updatePlacementValid();
    };
    this.input.onPointerUp = (x,y,_btn,dragged) => {
      if (dragged) return; // was a camera pan
      if (this.state !== GS.BUILD_PHASE && this.state !== GS.COMBAT_PHASE) return;
      if (this.orbitalAiming) {
        const w = this.camera.screenToWorld({x,y});
        this.fireOrbital(w.x, w.y);
        return;
      }
      const w = this.camera.screenToWorld({x,y});
      const hex = pixelToAxial(w.x, w.y);
      if (!this.board.inBounds(hex.q, hex.r)) { this.selectedTowerId = null; this.uiVersion++; return; }
      const tile = this.board.tile(hex.q, hex.r)!;
      if (tile.type === TILE.OCCUPIED) {
        const t = this.towers.find(t=>t.q===hex.q && t.r===hex.r);
        if (t) { this.selectedTowerId = t.id; this.selectedTowerType = null; this.audio.click(); this.uiVersion++; }
        return;
      }
      if (this.selectedTowerType && tile.type === TILE.NORMAL) {
        this.tryPlaceTower(this.selectedTowerType, hex.q, hex.r);
      } else {
        this.selectedTowerId = null;
      }
    };
    this.input.onPan = (dx,dy) => {
      if (this.state !== GS.BUILD_PHASE && this.state !== GS.COMBAT_PHASE) return;
      this.camera.x -= dx / this.camera.zoom;
      this.camera.y -= dy / this.camera.zoom;
      this.clampCamera();
    };
    this.input.onPinch = (scale) => {
      this.camera.setZoom(this.camera.zoom * scale);
    };
    this.input.onWheel = (delta) => {
      this.camera.setZoom(this.camera.targetZoom + (delta>0 ? -0.12 : 0.12));
    };
    this.input.onKeyDown = (key) => this.handleKey(key);
  }

  clampCamera() {
    const lim = HEX_STEP * 7;
    this.camera.x = Math.max(-lim, Math.min(lim, this.camera.x));
    this.camera.y = Math.max(-lim, Math.min(lim, this.camera.y));
  }

  handleKey(key:string) {
    if (this.state === GS.PAUSED) {
      if (key === 'Escape' || key === 'p' || key === 'P') this.resume();
      return;
    }
    if (key === 'p' || key === 'P' || key === 'Escape') { if (this.state===GS.BUILD_PHASE||this.state===GS.COMBAT_PHASE) this.pause(); return; }
    if (key === ' ') { this.startWaveIfReady(); return; }
    const hotkeys: Record<string, TowerType> = { '1': TT.BOLT, '2': TT.CRYO, '3': TT.ARC, '4': TT.RAIL, '5': TT.NOVA, '6': TT.AMP };
    if (hotkeys[key]) {
      const t = hotkeys[key];
      if (this.isTowerUnlocked(t)) { this.selectedTowerType = this.selectedTowerType === t ? null : t; this.selectedTowerId = null; this.uiVersion++; }
      return;
    }
    if (key === '-' || key === '_') { this.gameSpeed = Math.max(1, this.gameSpeed-1); this.uiVersion++; }
    if (key === '=' || key === '+') { this.gameSpeed = Math.min(3, this.gameSpeed+1); this.uiVersion++; }
    if (key === 'q' || key === 'Q') this.cycleTarget(-1);
    if (key === 'e' || key === 'E') this.cycleTarget(1);
    if (key === 'z' || key === 'Z') this.activateEmp();
    if (key === 'x' || key === 'X') this.beginOrbitalAim();
    if (key === 'v' || key === 'V') this.activateOverdrive();
    if (key === 'c' || key === 'C') { this.camera.x = 0; this.camera.y = 0; }
  }

  cycleTarget(dir:number) {
    if (!this.selectedTowerId) return;
    const t = this.towers.find(t=>t.id===this.selectedTowerId);
    if (!t) return;
    const modes = [TM.FIRST,TM.LAST,TM.STRONG,TM.WEAK,TM.FAST];
    const i = modes.indexOf(t.targetMode);
    t.targetMode = modes[(i+dir+modes.length)%modes.length];
    this.uiVersion++;
  }

  // -------------------------------------------------------------------------
  // Tower placement
  // -------------------------------------------------------------------------

  isTowerUnlocked(type: TowerType): boolean { return this.unlockedTowers.includes(type); }

  updatePlacementValid() {
    if (!this.selectedTowerType || !this.hoverHex) { this.placementValid=false; return; }
    const {q,r} = this.hoverHex;
    if (!this.board.isBuildable(q,r)) { this.placementValid=false; return; }
    if (!this.isTowerUnlocked(this.selectedTowerType)) { this.placementValid=false; return; }
    const def = TOWER_DEFS[this.selectedTowerType];
    if (this.energy < def.cost) { this.placementValid=false; return; }
    this.placementValid = true;
  }

  tryPlaceTower(type: TowerType, q:number, r:number) {
    if (!this.board.isBuildable(q,r)) return;
    if (!this.isTowerUnlocked(type)) { this.audio.noEnergy(); return; }
    const def = TOWER_DEFS[type];
    if (this.energy < def.cost) { this.audio.noEnergy(); this.spawnFloatingText(axialToPixel(q,r).x, axialToPixel(q,r).y-10, 'NEED ENERGY', '#FF536A'); return; }
    this.energy -= def.cost;
    this.board.tile(q,r)!.type = TILE.OCCUPIED;
    const t: TowerInstance = {
      id: nid(), type, q, r, level:1, spec:0, targetMode: TM.FIRST,
      cooldown: 0, angle: -Math.PI/2, kills:0, damageDealt:0, buffed:false, lastFire:0, charge:0,
      builtAt: this.time, disrupted: 0
    };
    this.towers.push(t);
    this.stats.towersBuilt++;
    this.audio.place();
    const p = axialToPixel(q,r);
    this.particles.burst(p.x,p.y, def.color, 16, 120, 2.5, 0.5);
    this.particles.spawn({x:p.x,y:p.y,vx:0,vy:0,color:def.color,size:6,life:0.6,shape:'ring',alpha:0.9});
    this.spawnFloatingText(p.x,p.y, `-${def.cost}`, '#54F7C5');
    // Onboarding: first tower placed -> select it (range feedback) + short countdown to wave 1
    if (this.tutorial && this.tutorial.stage !== 'countdown') {
      this.tutorial = { stage: 'countdown', t: 0, countdown: BALANCE.tutorialCountdown };
      this.selectedTowerType = null;
      this.selectedTowerId = t.id;
      this.announce('DEFENSES ONLINE', 'Wave 1 inbound — get ready', '#54F7C5', 2.2, false);
    }
    this.uiVersion++;
  }

  // -------------------------------------------------------------------------
  // Floating text & announcements
  // -------------------------------------------------------------------------

  spawnFloatingText(x:number,y:number,text:string,color:string,size=13) {
    this.floatingTexts.push({x,y,text,color,life:1.0,maxLife:1.0,vy:-40,size});
  }

  announce(title: string, sub?: string, color='#EEF6FF', dur=2.4, big=false) {
    this.announcements.push({ title, sub, color, t: 0, dur, big });
  }

  scheduleAnnounce(delay: number, title: string, sub?: string, color='#EEF6FF', dur=2.4, big=false) {
    this.scheduled.push({ delay, a: { title, sub, color, t: 0, dur, big } });
  }

  updateAnnouncements(dt:number) {
    for (let i = this.scheduled.length-1; i >= 0; i--) {
      this.scheduled[i].delay -= dt;
      if (this.scheduled[i].delay <= 0) { this.announcements.push(this.scheduled[i].a); this.scheduled.splice(i,1); }
    }
    for (let i = this.announcements.length-1; i >= 0; i--) {
      this.announcements[i].t += dt;
      if (this.announcements[i].t >= this.announcements[i].dur) this.announcements.splice(i,1);
    }
  }

  // -------------------------------------------------------------------------
  // Run lifecycle
  // -------------------------------------------------------------------------

  startRun(difficulty?: Difficulty) {
    if (difficulty) this.difficulty = difficulty;
    this.settings.difficulty = this.difficulty;
    this.resetRun();
    this.state = GS.BUILD_PHASE;
    this.audio.startMusic();
    // Onboarding: first-10-seconds script
    this.tutorial = { stage: 'title', t: 0, countdown: 0 };
    this.selectedTowerType = TT.BOLT;
    this.scheduleAnnounce(0.4, 'DEFEND THE LAST CORE', 'Protect the reactor at all costs', '#00E5FF', 2.4, true);
    this.scheduleAnnounce(3.2, 'BUILD YOUR FIRST TOWER', 'Bolt Sentinel selected — place it on the highlighted hex', '#00E5FF', 3.4, false);
    this.uiVersion++;
  }

  resetRun() {
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.particles.clear();
    this.floatingTexts = [];
    this.arcEffects = [];
    this.announcements = [];
    this.scheduled = [];
    this.pendingRails = [];
    this.reactorIntegrity = BALANCE.reactorIntegrity;
    this.energy = BALANCE.startingEnergy;
    this.score = 0;
    this.wave = 0;
    this.waveActive = false;
    this.spawnQueue = [];
    this.waveTimer = 0;
    this.currentWaveDef = null;
    this.waveKilled = 0;
    this.waveLeaked = 0;
    this.waveDamageTaken = false;
    this.waveCompleteBonusGiven = false;
    this.lowIntegrityWarned = false;
    this.cooldowns = {emp:0,orbital:0,overdrive:0};
    this.overdriveActive = 0;
    this.orbitalAiming = false;
    this.combo = 1; this.comboTimer=0; this.lastKillTime=0; this.kills=0; this.totalKills=0;
    this.time = 0;
    this.gameSpeed = 1;
    this.paused = false;
    this.mode = 'campaign';
    this.board.build();
    idCounter = 1;
    this.selectedTowerType = null;
    this.selectedTowerId = null;
    this.hoverHex = null;
    this.unlockedTowers = [TT.BOLT];
    this.unlockToasts = [];
    this.routesUnlocked = 1;
    this.routeReveal = null;
    this.preFinal = false;
    this.lastActAnnounced = 0;
    this.actShown = 1; this.actTarget = 1; this.actBlendT = 1;
    this.tutorial = null;
    this.bossIntro = null;
    this.flashTimer = 0; this.reactorFlash = 0;
    this.stats = { towersBuilt: 0, energyEarned: 0, bestCombo: 1, startTime: 0 };
    this.scoreSubmitted = false;
    this.endlessSeed = (Date.now() ^ 0x5EED) & 0x7fffffff;
    this.upcomingCache = null;
    this.camera.x = 0; this.camera.y = 0;
    this.uiVersion++;
  }

  /** The wave that would start next (used for the build-phase preview). */
  getUpcomingWave(): WaveDef | null {
    const next = this.wave + 1;
    if (this.mode === 'campaign') {
      if (next > 20) return null;
      return WAVES[next - 1];
    }
    const key = `e-${next}-${this.difficulty}-${this.endlessSeed}`;
    if (this.upcomingCache && this.upcomingCache.key === key) return this.upcomingCache.def;
    const def = generateEndlessWave(next, this.difficulty, this.endlessSeed);
    this.upcomingCache = { key, def };
    return def;
  }

  startWaveIfReady() {
    if (this.state !== GS.BUILD_PHASE) return;
    if (this.waveActive) return;
    const def = this.getUpcomingWave();
    if (!def) return;
    this.wave = def.number;
    this.beginWave(def);
  }

  beginWave(def: WaveDef) {
    this.currentWaveDef = def;
    this.waveActive = true;
    this.state = GS.COMBAT_PHASE;
    this.waveTimer = 0;
    this.waveKilled = 0;
    this.waveLeaked = 0;
    this.waveDamageTaken = false;
    this.waveCompleteBonusGiven = false;
    this.spawnQueue = [];
    this.tutorial = null;
    this.orbitalAiming = false;
    if (def.number >= 20) this.preFinal = false;

    // Difficulty scaling (campaign waves scale here; endless waves arrive pre-scaled)
    const dm = difficultyMul(this.difficulty);
    const actHp = this.mode === 'campaign' ? (BALANCE.actHpScale[actForWave(Math.min(def.number, 20))] ?? 1) : 1;
    const groups: SpawnGroup[] = def.endless
      ? def.groups
      : scaleGroups(def.groups, dm.hp * actHp, dm.speed, dm.reward);

    let total = 0;
    for (const gr of groups) {
      for (let i=0;i<gr.count;i++) {
        this.spawnQueue.push({ type: gr.type, portal: gr.portal, time: gr.start + i*gr.interval, hpMul: gr.hpMul||1, speedMul: gr.speedMul||1, rewardMul: gr.rewardMul||1 });
        total++;
      }
    }
    if (def.boss) {
      // Boss entries are appended by the generator for endless; campaign keeps them in `boss`.
      if (!def.endless) {
        this.spawnQueue.push({ type: def.boss.type, portal: def.boss.portal, time: def.boss.start, hpMul: dm.hp * actHp, speedMul: dm.speed, rewardMul: 1 });
        total++;
      }
    }
    this.waveTotalEnemies = total;

    // Route activation cinematic (waves 2 and 6)
    if (def.activateRoute !== undefined && def.activateRoute + 1 > this.routesUnlocked) {
      this.routesUnlocked = def.activateRoute + 1;
      this.routeReveal = { index: def.activateRoute, t: 3.5 };
      const portal = this.board.portals[def.activateRoute];
      const p = axialToPixel(portal.q, portal.r);
      this.particles.burst(p.x, p.y, '#FF536A', 30, 200, 3, 0.9);
      this.particles.spawn({x:p.x,y:p.y,vx:0,vy:0,color:'#FF536A',size:10,life:0.9,shape:'ring',alpha:1});
      this.audio.portalActivate();
      this.announce('NEW ENEMY APPROACH DETECTED', 'New portal online', '#FF536A', 2.8, true);
    }
    this.routesUnlocked = Math.max(this.routesUnlocked, routesForWave(Math.min(def.number, 20)));

    // Act banners
    const act = actForWave(Math.min(def.number, 20));
    if (act !== this.lastActAnnounced) {
      const info = ACTS[act-1];
      this.announce(`ACT ${['I','II','III','IV'][act-1]} — ${info.name}`, info.tagline, info.primary, 3.4, true);
      this.lastActAnnounced = act;
      this.actTarget = act;
    }
    this.announce(`WAVE ${def.number}`, def.title, ACTS[act-1].primary, 2.2, false);

    // Boss intro sequence
    if (def.boss) {
      this.bossIntro = { name: def.boss.name, t: 3.6, portal: def.boss.portal };
      this.scheduleAnnounce(0.4, 'WARNING — MASSIVE HOSTILE SIGNATURE', undefined, '#FF536A', 2.6, true);
      this.scheduleAnnounce(2.4, def.boss.name, def.boss.type === ET.BOSS ? 'FINAL CORE ASSAULT' : 'BOSS ENCOUNTER', '#FF536A', 2.6, true);
      this.audio.bossWarn();
    }

    // Authored first-time callouts
    if (def.callouts) {
      def.callouts.forEach((c, i) => this.scheduleAnnounce(1.4 + i*0.5, c.title, c.sub, '#FFB547', 2.8, false));
    }

    this.audio.waveStart();
    this.uiVersion++;
  }

  spawnEnemy(type: EnemyType, portalIndex: number, hpMul:number, speedMul:number, rewardMul:number, bossName?: string) {
    const portal = this.board.portals[portalIndex];
    const route = this.board.routes[portalIndex];
    if (!portal || !route) return;
    const def = ENEMY_DEFS[type];
    const isBoss = type === ET.TITAN || type === ET.BOSS;
    const e: EnemyInstance = {
      id: nid(), type,
      x: axialToPixel(portal.q, portal.r).x,
      y: axialToPixel(portal.q, portal.r).y,
      hp: def.hp * hpMul, maxHp: def.hp * hpMul,
      shield: (def.shield || 0) * hpMul, maxShield: (def.shield || 0) * hpMul,
      speed: def.speed * speedMul, baseSpeed: def.speed * speedMul,
      route: [...route],
      routeIndex: 0,
      progress: 0,
      slowTimer: 0, slowFactor: 1,
      leakDamage: def.leakDamage,
      reward: Math.round(def.reward * rewardMul),
      scoreReward: def.score,
      radius: def.radius,
      angle: 0,
      alive: true, dying: false, deathTimer: 0, fragments: [],
      disruptTimer: 0,
      disruptPulse: type === ET.DISRUPTOR ? BALANCE.disruptPeriod : 0,
      bossPhase: isBoss ? 1 : 0,
      splitDone: false, escortSpawned: false,
      shieldTimer: 0, shieldChargeTimer: 0, bossStopTimer: 0,
      plateRot: 0, hitFlash: 0,
      armor: def.armor,
      dotTimer: 0, dotDps: 0,
      isBoss, bossName,
    };
    this.enemies.push(e);
  }

  /** Scripted escort/support spawns (boss phases). Counted toward wave totals. */
  spawnEscort(type: EnemyType, portal: number, count: number) {
    for (let i=0;i<count;i++) this.spawnEnemy(type, portal, 1, 1, 1);
    this.waveTotalEnemies += count;
  }

  // -------------------------------------------------------------------------
  // Main update
  // -------------------------------------------------------------------------

  update(dtRaw:number) {
    if (this.paused) return;
    const dt = dtRaw * this.gameSpeed;
    this.time += dt;
    this.frameCount++;
    this.fpsTimer += dtRaw;
    if (this.fpsTimer >= 1) { this.fps = this.frameCount; this.frameCount=0; this.fpsTimer=0; }
    this.updateAnnouncements(dt);

    if (this.state === GS.BOOT) { this.state = GS.MAIN_MENU; return; }

    if (this.state !== GS.BUILD_PHASE && this.state !== GS.COMBAT_PHASE) {
      this.particles.update(dt);
      this.updateFloatingTexts(dt);
      this.camera.update(dt);
      if (this.state === GS.VICTORY) {
        this.victoryRingTimer -= dt;
        if (this.victoryRingTimer <= 0) {
          this.victoryRingTimer = 0.55;
          const cp = axialToPixel(0,0);
          this.particles.spawn({x:cp.x,y:cp.y,vx:0,vy:0,color:'#00E5FF',size:10,life:1.4,shape:'ring',alpha:0.9});
        }
      }
      return;
    }

    for (const k of ['emp','orbital','overdrive'] as const) {
      if (this.cooldowns[k] > 0) this.cooldowns[k] = Math.max(0, this.cooldowns[k]-dt);
    }
    if (this.overdriveActive > 0) this.overdriveActive = Math.max(0, this.overdriveActive-dt);
    if (this.empActive > 0) this.empActive = Math.max(0, this.empActive-dt);
    if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer-dt);
    if (this.reactorFlash > 0) this.reactorFlash = Math.max(0, this.reactorFlash-dt);
    if (this.orbitalTimer > 0) {
      this.orbitalTimer -= dt;
      if (this.orbitalTimer <= 0 && this.orbitalTarget) {
        this.doOrbital(this.orbitalTarget.x, this.orbitalTarget.y);
        this.orbitalTarget = null;
      }
    }
    if (this.routeReveal) { this.routeReveal.t -= dt; if (this.routeReveal.t <= 0) this.routeReveal = null; }
    if (this.bossIntro) { this.bossIntro.t -= dt; if (this.bossIntro.t <= 0) this.bossIntro = null; }

    // Act palette blend
    if (this.actTarget !== this.actShown) {
      this.actBlendT += dt / 4;
      if (this.actBlendT >= 1) { this.actShown = this.actTarget; this.actBlendT = 1; }
    }

    // Onboarding timers
    if (this.tutorial) {
      if (this.tutorial.stage === 'title') {
        this.tutorial.t += dt;
        if (this.tutorial.t > 3.0) this.tutorial.stage = 'build';
      } else if (this.tutorial.stage === 'countdown') {
        this.tutorial.countdown -= dt;
        if (this.tutorial.countdown <= 0) { this.tutorial = null; this.startWaveIfReady(); }
      }
    }

    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer<=0) this.combo = 1; }

    this.spawnAmbient(dt);

    if (this.waveActive) {
      this.waveTimer += dt;
      for (const s of this.spawnQueue) {
        if (!s.spawned && s.time <= this.waveTimer) {
          s.spawned = true;
          const isBossType = s.type === ET.TITAN || s.type === ET.BOSS;
          this.spawnEnemy(s.type, s.portal, s.hpMul, s.speedMul, s.rewardMul, isBossType ? this.currentWaveDef?.boss?.name : undefined);
        }
      }
      const allSpawned = this.spawnQueue.every(s=>s.spawned);
      const noEnemies = this.enemies.length === 0;
      if ((allSpawned && noEnemies) || this.waveTimer > 420) {
        this.finishWave();
      }
    }

    // Rail charge shots (deterministic replacement for setTimeout)
    for (let i = this.pendingRails.length-1; i >= 0; i--) {
      const r = this.pendingRails[i];
      r.timer -= dt;
      const tower = this.towers.find(t=>t.id===r.towerId);
      if (!tower) { this.pendingRails.splice(i,1); continue; }
      if (r.timer <= 0) {
        this.pendingRails.splice(i,1);
        tower.charge = 0;
        const tgt = this.enemies.find(e=>e.id===r.targetId);
        if (!tgt || !tgt.alive || tgt.dying) continue;
        this.audio.railFire();
        const dmg = this.towerDamage(tower) * (tower.specPrecision && tgt.isBoss ? 1.6 : 1) * (tower.specArmorPierce ? 1.4 : 1);
        const p2 = axialToPixel(tower.q, tower.r);
        this.projectiles.push({
          id: nid(), kind:'rail', x:p2.x, y:p2.y, vx:0, vy:0, targetId: tgt.id, sourceTowerId: tower.id,
          damage: dmg, speed:0, life:0.25, maxLife:0.25, color:'#FF4F9D', radius:2,
          beam: { x1:p2.x, y1:p2.y, x2:tgt.x, y2:tgt.y, life:0.25, maxLife:0.25 },
          hitIds:new Set([tgt.id]), trail:[]
        });
        this.applyDamage(tgt, dmg, tower);
        this.particles.burst(p2.x,p2.y,'#FF4F9D',12,160,2,0.3);
      }
    }

    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.particles.update(dt);
    this.updateFloatingTexts(dt);
    this.camera.update(dt);

    if (this.reactorIntegrity <= 0 && this.state === GS.COMBAT_PHASE) {
      this.reactorIntegrity = 0;
      this.gameOver();
    }
  }

  // -------------------------------------------------------------------------
  // Enemies
  // -------------------------------------------------------------------------

  updateEnemies(dt:number) {
    for (const e of this.enemies) {
      if (!e.alive && !e.dying) continue;
      if (e.dying) {
        e.deathTimer -= dt;
        for (const f of e.fragments) {
          f.x += f.vx*dt; f.y += f.vy*dt; f.vy += 120*dt; f.life -= dt;
          if (f.rot !== undefined) f.rot += dt * 3;
        }
        e.fragments = e.fragments.filter(f=>f.life>0);
        if (e.deathTimer <= 0) { e.alive = false; e.dying = false; }
        continue;
      }
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.slowTimer > 0) { e.slowTimer -= dt; } else { e.slowFactor = 1; }

      // Disruptor pulses: telegraphed, temporary tower debuff
      if (e.type === ET.DISRUPTOR) {
        e.disruptPulse -= dt;
        if (e.disruptPulse <= BALANCE.disruptTelegraph && e.disruptTimer === 0) {
          e.disruptTimer = 1;
          this.audio.disruptWarn();
        }
        if (e.disruptPulse <= 0) {
          e.disruptPulse = BALANCE.disruptPeriod;
          e.disruptTimer = 0;
          this.audio.disruptPulse();
          this.particles.spawn({x:e.x,y:e.y,vx:0,vy:0,color:'#FF4F9D',size:8,life:0.5,shape:'ring',alpha:0.9});
          for (const t of this.towers) {
            const tp = axialToPixel(t.q,t.r);
            if (Math.hypot(e.x-tp.x, e.y-tp.y) <= BALANCE.disruptRadius*HEX_STEP) {
              t.disrupted = BALANCE.disruptDuration;
            }
          }
        }
      }

      if (e.dotTimer > 0) { e.dotTimer -= dt; e.hp -= e.dotDps*dt; if (e.hp<=0) { this.killEnemy(e); continue; } }

      if (e.routeIndex >= e.route.length - 1) {
        this.reactorIntegrity = Math.max(0, this.reactorIntegrity - e.leakDamage);
        this.audio.reactorHit();
        this.camera.shake(7);
        this.reactorFlash = 0.6;
        const cp = axialToPixel(0,0);
        this.particles.burst(cp.x,cp.y,'#FF536A',24,150,3,0.6);
        this.particles.spawn({x:cp.x,y:cp.y,vx:0,vy:0,color:'#FF536A',size:10,life:0.5,shape:'ring',alpha:1});
        e.alive = false;
        this.waveLeaked++;
        this.waveDamageTaken = true;
        this.spawnFloatingText(cp.x, cp.y-24, `-${e.leakDamage} CORE`, '#FF536A', 15);
        if (this.reactorIntegrity <= 6 && this.reactorIntegrity > 0 && !this.lowIntegrityWarned) {
          this.lowIntegrityWarned = true;
          this.announce('CORE INTEGRITY CRITICAL', 'Defend the reactor!', '#FF536A', 2.6, true);
        }
        continue;
      }
      if (e.isBoss) this.updateBoss(e, dt);

      let frozen = false;
      if (this.empActive > 0) {
        const dx = e.x - this.empX, dy = e.y - this.empY;
        if (Math.hypot(dx,dy) <= BALANCE.empRadius*HEX_STEP) frozen = true;
      }
      if (frozen) continue;

      const target = e.route[e.routeIndex+1];
      const tp = axialToPixel(target.q, target.r);
      const dx = tp.x - e.x, dy = tp.y - e.y;
      const dist = Math.hypot(dx,dy);
      const stepPx = e.speed * e.slowFactor * HEX_STEP * dt;
      if (stepPx >= dist) {
        e.x = tp.x; e.y = tp.y; e.routeIndex++;
      } else {
        e.x += (dx/dist)*stepPx; e.y += (dy/dist)*stepPx;
      }
      e.angle = Math.atan2(dy,dx);
    }
    this.enemies = this.enemies.filter(e => e.alive || e.dying);
  }

  // -------------------------------------------------------------------------
  // Boss behavior
  // -------------------------------------------------------------------------

  updateBoss(e: EnemyInstance, dt:number) {
    const hpRatio = e.hp / e.maxHp;
    e.plateRot += dt * (e.bossPhase === 3 ? 2.4 : (e.type === ET.BOSS ? 1.1 : 0.55));

    if (e.type === ET.TITAN) {
      // Iron Colossus — Phase 2: energy shield at 65%
      if (e.bossPhase === 1 && hpRatio <= BALANCE.colossusPhase2) {
        e.bossPhase = 2;
        e.shieldChargeTimer = 1.5;
        this.announce('ENERGY SHIELD CHARGING', 'Break through it with concentrated fire', '#FFB547', 2.6, false);
        this.audio.disruptWarn();
      }
      if (e.bossPhase === 2 && e.shieldChargeTimer > 0) {
        e.shieldChargeTimer -= dt;
        if (e.shieldChargeTimer <= 0) {
          e.shield = e.maxHp * BALANCE.colossusShieldFraction;
          e.maxShield = e.shield;
          this.particles.spawn({x:e.x,y:e.y,vx:0,vy:0,color:'#4FA8FF',size:12,life:0.6,shape:'ring',alpha:1});
        }
      }
      // Phase 3: final push at 30%
      if (e.bossPhase < 3 && hpRatio <= BALANCE.colossusPhase3) {
        e.bossPhase = 3;
        e.speed = e.baseSpeed * BALANCE.colossusPhase3Speed;
        this.announce('FINAL PUSH', 'The Colossus accelerates', '#FF536A', 2.4, true);
        this.audio.critical();
        if (!e.escortSpawned) {
          e.escortSpawned = true;
          this.spawnEscort(ET.SWARMER, 1, 2);
          this.spawnEscort(ET.SWARMER, 2, 2);
        }
      }
    }

    if (e.type === ET.BOSS) {
      // Null Archon — Phase 2 at 70%: stop, deploy drones, temporary shield
      if (e.bossPhase === 1 && hpRatio <= BALANCE.archonPhase2) {
        e.bossPhase = 2;
        e.bossStopTimer = BALANCE.archonStopDuration;
        this.announce('REINFORCEMENT PROTOCOL', 'The Archon is deploying drones', '#B36BFF', 2.6, true);
        this.audio.critical();
      }
      // Deployment stop (runs regardless of current phase)
      if (e.bossStopTimer > 0) {
        e.speed = 0;
        e.bossStopTimer -= dt;
        if (this.particles.particles.length < 400) {
          const a = Math.random()*Math.PI*2;
          const r = 90 + Math.random()*40;
          this.particles.spawn({x:e.x+Math.cos(a)*r, y:e.y+Math.sin(a)*r, vx:-Math.cos(a)*90, vy:-Math.sin(a)*90, color:'#B36BFF', size:2.5, life:0.9, shape:'spark'});
        }
        if (e.bossStopTimer <= 0) {
          if (!e.escortSpawned) {
            e.escortSpawned = true;
            this.spawnEscort(ET.SWARMER, 0, 4);
            this.spawnEscort(ET.DASHER, 1, 2);
          }
          e.shield = e.maxHp * BALANCE.archonShieldFraction;
          e.maxShield = e.shield;
          e.speed = e.baseSpeed * (e.bossPhase === 3 ? BALANCE.archonPhase3Speed : 1);
          this.particles.spawn({x:e.x,y:e.y,vx:0,vy:0,color:'#B36BFF',size:14,life:0.7,shape:'ring',alpha:1});
        }
      }
      // Phase 3 at 35%: core annihilation
      if (e.bossPhase < 3 && hpRatio <= BALANCE.archonPhase3) {
        e.bossPhase = 3;
        e.speed = e.bossStopTimer > 0 ? 0 : e.baseSpeed * BALANCE.archonPhase3Speed;
        this.announce('CRITICAL THREAT', 'Core annihilation mode — final approach', '#FF2244', 2.8, true);
        this.audio.critical();
      }
    }
  }

  killEnemy(e: EnemyInstance) {
    if (!e.alive || e.dying) return;
    e.alive = false;
    e.dying = true;
    e.deathTimer = e.isBoss ? 1.2 : 0.6;
    const count = e.isBoss ? 40 : 8;
    for (let i=0;i<count;i++) {
      const a = Math.random()*Math.PI*2;
      const s = 40 + Math.random()*(e.isBoss?260:120);
      e.fragments.push({ x: e.x, y: e.y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: 0.5+Math.random()*(e.isBoss?0.9:0.4), rot: Math.random()*Math.PI });
    }
    this.energy += e.reward;
    this.stats.energyEarned += e.reward;
    const now = this.time;
    if (now - this.lastKillTime <= BALANCE.comboWindow) {
      this.combo = Math.min(BALANCE.comboMax, this.combo + 0.5);
      this.comboTimer = BALANCE.comboWindow;
    } else {
      this.combo = 1;
      this.comboTimer = BALANCE.comboWindow;
    }
    if (this.combo > this.stats.bestCombo) this.stats.bestCombo = this.combo;
    this.lastKillTime = now;
    const pts = Math.round(e.scoreReward * this.combo);
    this.score += pts;
    this.kills++; this.totalKills++;
    if (e.lastHitTowerId) { const tw = this.towers.find(t=>t.id===e.lastHitTowerId); if (tw) tw.kills++; }
    this.waveKilled++;
    this.audio.enemyDeath();
    this.particles.burst(e.x,e.y, ENEMY_DEFS[e.type].color, e.isBoss?50:14, 180, 2.5, 0.6);
    this.particles.burst(e.x,e.y, '#54F7C5', 6, 100, 1.5, 0.4);
    this.spawnFloatingText(e.x, e.y-10, `+${e.reward}E  +${pts}`, '#54F7C5');

    if (e.isBoss) {
      this.flashTimer = 0.55;
      this.camera.shake(18);
      this.audio.bossDeath();
      this.announce(`${e.bossName || 'BOSS'} DESTROYED`, 'Bonus energy recovered', '#00E5FF', 3.0, true);
      this.energy += 100;
      this.stats.energyEarned += 100;
      this.particles.spawn({x:e.x,y:e.y,vx:0,vy:0,color:'#EEF6FF',size:20,life:0.9,shape:'ring',alpha:1});
      this.particles.spawn({x:e.x,y:e.y,vx:0,vy:0,color:'#00E5FF',size:14,life:1.2,shape:'ring',alpha:0.9});
      this.particles.burst(e.x,e.y,'#FFB547',30,300,3,1.0);
    }

    if (e.type === ET.SPLITTER && !e.splitDone) {
      e.splitDone = true;
      this.spawnSplitChildren(e);
    }
  }

  spawnSplitChildren(parent: EnemyInstance) {
    for (let i=0;i<2;i++) {
      const child: EnemyInstance = {
        id: nid(), type: ET.SWARMER,
        x: parent.x + (i===0?-8:8), y: parent.y + (i===0?4:-4),
        hp: SPLIT_CHILD.hp, maxHp: SPLIT_CHILD.hp, shield:0, maxShield:0,
        speed: SPLIT_CHILD.speed, baseSpeed: SPLIT_CHILD.speed,
        route: [...parent.route],
        routeIndex: parent.routeIndex,
        progress: 0,
        slowTimer:0, slowFactor:1,
        leakDamage: SPLIT_CHILD.leakDamage, reward: SPLIT_CHILD.reward, scoreReward: SPLIT_CHILD.score, radius: SPLIT_CHILD.radius,
        angle:0, alive:true, dying:false, deathTimer:0, fragments:[],
        disruptTimer:0, disruptPulse:0, bossPhase:0, splitDone:true, escortSpawned:false,
        shieldTimer:0, shieldChargeTimer:0, bossStopTimer:0, plateRot:0, hitFlash:0,
        armor:0, dotTimer:0, dotDps:0, isBoss:false,
      };
      this.enemies.push(child);
    }
    this.waveTotalEnemies += 2;
    this.particles.spawn({x:parent.x,y:parent.y,vx:0,vy:0,color:'#B36BFF',size:8,life:0.4,shape:'ring',alpha:0.9});
  }

  // -------------------------------------------------------------------------
  // Towers
  // -------------------------------------------------------------------------

  updateTowers(dt:number) {
    this.ampLinks = [];
    for (const t of this.towers) { t.buffed = false; (t as any).buffLevel = 0; }
    for (const amp of this.towers) {
      if (amp.type !== TT.AMP) continue;
      const ap = axialToPixel(amp.q, amp.r);
      const ampDef = TOWER_DEFS[amp.type];
      const rangePx = ampDef.range * HEX_STEP * (amp.specExtendedField?1.35:1);
      const lvl = amp.level >= 3 ? 1.5 : amp.level === 2 ? 1.25 : 1;
      for (const t of this.towers) {
        if (t.id === amp.id || t.type === TT.AMP) continue;
        const tp = axialToPixel(t.q, t.r);
        if (Math.hypot(tp.x-ap.x, tp.y-ap.y) <= rangePx) {
          t.buffed = true;
          (t as any).buffLevel = Math.max((t as any).buffLevel, lvl);
          this.ampLinks.push({ x1:ap.x, y1:ap.y, x2:tp.x, y2:tp.y });
        }
      }
    }
    for (const t of this.towers) {
      if (t.disrupted && t.disrupted > 0) t.disrupted -= dt;
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      if (t.type === TT.AMP) continue;
      const target = this.findTarget(t);
      if (!target) continue;
      const def = TOWER_DEFS[t.type];
      let interval = def.interval;
      if (t.level >= 2) interval *= 0.85;
      if (t.level >= 3) interval *= 0.8;
      if (t.buffed) {
        const base = t.specReactorLink ? 0.30 : BALANCE.ampBoost;
        const boost = base * ((t as any).buffLevel || 1);
        interval /= (1+boost);
      }
      if (this.overdriveActive > 0) interval /= (1+BALANCE.overdriveBoost);
      if (t.disrupted && t.disrupted > 0) interval *= BALANCE.disruptFirePenalty;
      if (t.specRapid) interval *= 0.7;
      t.cooldown = interval;
      this.fireTower(t, target);
    }
  }

  findTarget(t: TowerInstance): EnemyInstance | null {
    const tp = axialToPixel(t.q, t.r);
    const def = TOWER_DEFS[t.type];
    const rangePx = def.range * HEX_STEP;
    const candidates = this.enemies.filter(e => e.alive && !e.dying && Math.hypot(e.x-tp.x, e.y-tp.y) <= rangePx);
    if (candidates.length === 0) return null;
    const progress = (e: EnemyInstance) => {
      if (e.routeIndex >= e.route.length-1) return 999;
      const cur = e.route[e.routeIndex], nxt = e.route[e.routeIndex+1];
      const cp = axialToPixel(cur.q,cur.r), np = axialToPixel(nxt.q,nxt.r);
      const segLen = Math.hypot(np.x-cp.x, np.y-cp.y);
      const done = Math.hypot(e.x-cp.x, e.y-cp.y);
      const frac = segLen>0 ? done/segLen : 0;
      return e.routeIndex + frac;
    };
    let chosen = candidates[0];
    switch (t.targetMode) {
      case TM.FIRST: chosen = candidates.reduce((a,b)=> progress(b)>progress(a)?b:a); break;
      case TM.LAST: chosen = candidates.reduce((a,b)=> progress(b)<progress(a)?b:a); break;
      case TM.STRONG: chosen = candidates.reduce((a,b)=> (b.hp+b.shield)>(a.hp+a.shield)?b:a); break;
      case TM.WEAK: chosen = candidates.reduce((a,b)=> (b.hp+b.shield)<(a.hp+a.shield)?b:a); break;
      case TM.FAST: chosen = candidates.reduce((a,b)=> b.speed>a.speed?b:a); break;
    }
    return chosen;
  }

  fireTower(t: TowerInstance, target: EnemyInstance) {
    const tp = axialToPixel(t.q, t.r);
    const def = TOWER_DEFS[t.type];
    t.angle = Math.atan2(target.y-tp.y, target.x-tp.x);
    t.lastFire = this.time;
    const damage = this.towerDamage(t);
    switch (t.type) {
      case TT.BOLT: {
        this.audio.bolt();
        this.spawnProjectile({
          kind:'bolt', x:tp.x, y:tp.y, vx:0, vy:0, targetId: target.id, sourceTowerId: t.id,
          damage, speed: 520, life:2, maxLife:2, color:'#00E5FF', radius:3,
          pierce: !!t.specPierce, pierceLeft: t.specPierce?1:0, hitIds:new Set(), trail:[]
        });
        break;
      }
      case TT.ARC: {
        this.audio.arc();
        this.spawnProjectile({
          kind:'arc', x:tp.x, y:tp.y, vx:0, vy:0, targetId: target.id, sourceTowerId: t.id,
          damage, speed: 420, life:2, maxLife:2, color:'#9B6CFF', radius:4,
          chain: t.specChain ? 3 : 2, chainFalloff: 0.65, hitIds:new Set(), trail:[]
        });
        break;
      }
      case TT.CRYO: {
        this.audio.cryo();
        this.spawnProjectile({
          kind:'cryo', x:tp.x, y:tp.y, vx:0, vy:0, targetId: target.id, sourceTowerId: t.id,
          damage, speed: 360, life:2, maxLife:2, color:'#7FDFFF', radius:4,
          slow: t.specDeepFreeze ? 0.5 : 0.35, slowDur: t.specDeepFreeze?2.4:1.8,
          hitIds:new Set(), trail:[]
        });
        break;
      }
      case TT.RAIL: {
        this.audio.railCharge();
        t.charge = 1;
        this.pendingRails.push({ towerId: t.id, targetId: target.id, timer: 0.35 });
        break;
      }
      case TT.NOVA: {
        this.audio.plasma();
        this.spawnProjectile({
          kind:'plasma', x:tp.x, y:tp.y, vx:0, vy:0, targetId: target.id, sourceTowerId: t.id,
          damage, speed: 300, life:2.5, maxLife:2.5, color:'#FFB547', radius:5,
          splash: TOWER_DEFS[TT.NOVA].blast! * HEX_STEP * (t.specWideBlast ? 1.3 : 1),
          hitIds:new Set(), trail:[]
        });
        break;
      }
    }
    this.particles.burst(tp.x, tp.y, def.color, 6, 90, 1.8, 0.25);
  }

  towerDamage(t: TowerInstance): number {
    const def = TOWER_DEFS[t.type];
    let d = def.damage;
    if (t.level >= 2) d *= 1.35;
    if (t.level >= 3) d *= 1.6;
    if (t.type === TT.ARC && t.specOvercharge) d *= 1.25;
    return d;
  }

  spawnProjectile(p: Projectile) {
    p.id = nid();
    const tgt = p.targetId ? this.enemies.find(e=>e.id===p.targetId) : null;
    if (tgt) {
      const dx = tgt.x - p.x, dy = tgt.y - p.y;
      const dist = Math.hypot(dx,dy) || 1;
      p.vx = (dx/dist)*p.speed;
      p.vy = (dy/dist)*p.speed;
    }
    this.projectiles.push(p);
  }

  updateProjectiles(dt:number) {
    const arr = this.projectiles;
    let write=0;
    for (let i=0;i<arr.length;i++) {
      const p = arr[i];
      if (p.kind === 'rail') {
        p.life -= dt;
        if (p.beam) p.beam.life -= dt;
        if (p.life <= 0) continue;
        arr[write++]=p;
        continue;
      }
      const tgt = p.targetId ? this.enemies.find(e=>e.id===p.targetId && e.alive) : null;
      if (tgt) {
        const dx = tgt.x - p.x, dy = tgt.y - p.y;
        const dist = Math.hypot(dx,dy) || 1;
        p.vx = (dx/dist)*p.speed;
        p.vy = (dy/dist)*p.speed;
      }
      p.x += p.vx*dt;
      p.y += p.vy*dt;
      p.life -= dt;
      if (p.trail.length === 0 || Math.hypot(p.trail[p.trail.length-1].x-p.x, p.trail[p.trail.length-1].y-p.y) > 4) {
        p.trail.push({x:p.x,y:p.y});
        if (p.trail.length > 8) p.trail.shift();
      }
      let hit = false;
      for (const e of this.enemies) {
        if (!e.alive || e.dying) continue;
        if (p.hitIds.has(e.id)) continue;
        if (Math.hypot(e.x-p.x, e.y-p.y) <= e.radius + p.radius) {
          hit = true;
          p.hitIds.add(e.id);
          this.onProjectileHit(p, e);
          if (p.pierce && (p.pierceLeft||0) > 0) {
            p.pierceLeft!--;
            hit = false;
            break;
          } else {
            break;
          }
        }
      }
      if (hit || p.life <= 0) {
        if (p.kind === 'plasma' && !p.exploded) {
          p.exploded = true;
          this.explodePlasma(p);
        }
        if (!p.pierce || (p.pierceLeft||0) <= 0) {
          continue;
        }
      }
      if (p.life > 0) arr[write++]=p;
    }
    arr.length = write;
  }

  onProjectileHit(p: Projectile, e: EnemyInstance) {
    const srcTower = this.towers.find(t=>t.id===p.sourceTowerId) || null;
    if (p.kind === 'bolt') {
      this.applyDamage(e, p.damage, srcTower);
      this.particles.burst(e.x,e.y,'#00E5FF',6,80,1.5,0.3);
      this.audio.enemyHit();
    } else if (p.kind === 'arc') {
      this.applyDamage(e, p.damage, srcTower);
      this.particles.burst(e.x,e.y,'#9B6CFF',8,100,2,0.3);
      this.audio.enemyHit();
      let prev = e;
      let dmg = p.damage;
      const hitSet = new Set([e.id]);
      const chains = p.chain || 2;
      for (let c=0;c<chains;c++) {
        let next: EnemyInstance | null = null; let best = 1e9;
        for (const en of this.enemies) {
          if (!en.alive||en.dying||hitSet.has(en.id)) continue;
          const d = Math.hypot(en.x-prev.x, en.y-prev.y);
          if (d < best && d <= 3*HEX_STEP) { best=d; next=en; }
        }
        if (!next) break;
        hitSet.add(next.id);
        dmg *= (p.chainFalloff||0.65);
        this.applyDamage(next, dmg, srcTower);
        this.arcEffects.push({ x1: prev.x, y1: prev.y, x2: next.x, y2: next.y, life: 0.2, maxLife: 0.2 });
        this.particles.burst(next.x,next.y,'#9B6CFF',6,90,1.8,0.25);
        prev = next;
      }
    } else if (p.kind === 'cryo') {
      this.applyDamage(e, p.damage, srcTower);
      const factor = 1 - (p.slow||0.35);
      e.slowFactor = Math.min(e.slowFactor, factor);
      e.slowTimer = Math.max(e.slowTimer, p.slowDur||1.8);
      this.particles.burst(e.x,e.y,'#7FDFFF',6,70,1.6,0.3);
      this.audio.enemyHit();
    } else if (p.kind === 'plasma') {
      this.applyDamage(e, p.damage, srcTower);
      this.particles.burst(e.x,e.y,'#FFB547',10,120,2,0.3);
    }
  }

  explodePlasma(p: Projectile) {
    const radius = p.splash || (0.8*HEX_STEP);
    this.audio.plasma();
    let ix = p.x, iy = p.y;
    const tgt = p.targetId ? this.enemies.find(e=>e.id===p.targetId) : null;
    if (tgt) { ix = tgt.x; iy = tgt.y; }
    this.particles.burst(ix,iy,'#FFB547',28,220,3,0.7);
    this.particles.burst(ix,iy,'#FF4F9D',12,160,2.5,0.5);
    this.particles.spawn({x:ix,y:iy,vx:0,vy:0,color:'#FFB547',size:radius*0.3,life:0.4,shape:'ring',alpha:0.9});
    const srcTower = this.towers.find(t=>t.id===p.sourceTowerId) || null;
    for (const e of this.enemies) {
      if (!e.alive||e.dying) continue;
      if (Math.hypot(e.x-ix, e.y-iy) <= radius) {
        this.applyDamage(e, p.damage, srcTower);
      }
    }
  }

  applyDamage(e: EnemyInstance, amount: number, tower: TowerInstance | null) {
    if (!e.alive || e.dying) return;
    let dmg = amount;
    if (e.armor > 0) dmg = Math.max(1, dmg - e.armor);
    if (e.shield > 0) {
      if (dmg <= e.shield) { e.shield -= dmg; dmg = 0; }
      else { dmg -= e.shield; e.shield = 0; }
    }
    e.hp -= dmg;
    e.hitFlash = 0.09;
    if (tower) { tower.damageDealt += amount; e.lastHitTowerId = tower.id; }
    if (e.hp <= 0) {
      this.killEnemy(e);
    } else {
      this.audio.enemyHit();
    }
  }

  // -------------------------------------------------------------------------
  // Wave resolution, unlocks, victory
  // -------------------------------------------------------------------------

  finishWave() {
    if (this.waveCompleteBonusGiven) return;
    this.waveCompleteBonusGiven = true;
    this.waveActive = false;
    this.state = GS.BUILD_PHASE;
    const n = this.wave;

    let energyBonus = waveBonusEnergy(n);
    let scoreBonus = BALANCE.waveScoreBonus + BALANCE.waveScorePerWave * n;
    const perfect = !this.waveDamageTaken && this.reactorIntegrity === this.maxIntegrity;
    if (perfect) {
      energyBonus += BALANCE.perfectEnergyBonus;
      scoreBonus += BALANCE.perfectScoreBonus;
      this.announce('PERFECT WAVE', `Reactor untouched — +${BALANCE.perfectEnergyBonus} energy`, '#54F7C5', 2.6, false);
    }
    this.energy += energyBonus;
    this.score += scoreBonus;
    this.stats.energyEarned += energyBonus;
    this.announce('WAVE CLEARED', `+${energyBonus} energy   +${scoreBonus} score`, '#00E5FF', 2.6, false);
    if (n === 1) this.scheduleAnnounce(2.4, 'BUILD MORE DEFENSES', 'Spend your energy — the next wave is coming', '#00E5FF', 2.6, false);

    // Tower unlocks become available during the next build phase
    for (const type of TOWER_ORDER) {
      if (TOWER_DEFS[type].unlockWave === n + 1 && !this.unlockedTowers.includes(type)) {
        this.unlockedTowers.push(type);
        this.unlockToasts.push(type);
        this.audio.unlock();
        this.announce('NEW TECH UNLOCKED', TOWER_DEFS[type].name, TOWER_DEFS[type].color, 2.8, false);
      }
    }

    // Act completion bonuses
    if (this.mode === 'campaign') {
      const act = actForWave(n);
      const actDone = n === 5 || n === 10 || n === 15;
      if (actDone) {
        const bonus = BALANCE.actBonusEnergy[act] || 60;
        this.energy += bonus;
        this.stats.energyEarned += bonus;
        const subs: Record<number,string> = {
          1: 'FIRST CONTACT SURVIVED',
          2: 'THE SIEGE BROKEN',
          3: 'SYSTEMS STABILIZED',
        };
        this.scheduleAnnounce(2.2, `ACT ${['I','II','III','IV'][act-1]} COMPLETE`, subs[act] + ` — +${bonus} energy`, ACTS[act-1].primary, 3.2, true);
        this.audio.celebrate();
      }
      if (n === 19) {
        this.preFinal = true;
        this.scheduleAnnounce(2.6, 'FINAL WAVE INCOMING', 'Upgrade, reposition, prepare', '#FF2244', 3.4, true);
        this.audio.finalWarning();
      }
    }

    this.uiVersion++;
    if (this.mode === 'campaign' && n >= 20) {
      this.victory();
      return;
    }
    this.saveGame();
  }

  victory() {
    this.state = GS.VICTORY;
    this.waveActive = false;
    this.preFinal = false;
    this.audio.victory();
    this.audio.celebrate();
    this.camera.shake(12);
    const cp = axialToPixel(0,0);
    this.particles.burst(cp.x,cp.y,'#00E5FF',80,280,4,1.4);
    this.victoryRingTimer = 0.2;
    this.announce('THE LAST CORE SURVIVES', undefined, '#00E5FF', 3.2, true);
    this.scheduleAnnounce(3.4, 'CAMPAIGN COMPLETE', 'The reactor endures', '#54F7C5', 3.2, true);
    this.updateBestScore();
    this.uiVersion++;
  }

  gameOver() {
    this.state = GS.GAME_OVER;
    this.waveActive = false;
    this.audio.gameOver();
    this.camera.shake(14);
    this.particles.burst(0,0,'#FF536A',60,300,4,1.2);
    this.updateBestScore();
    if (this.mode === 'endless') this.updateBestEndless();
    this.clearSave();
    this.uiVersion++;
  }

  startEndless() {
    if (this.state !== GS.VICTORY) return;
    this.mode = 'endless';
    this.state = GS.BUILD_PHASE;
    this.wave = 20;
    this.preFinal = false;
    this.upcomingCache = null;
    this.announce('ENDLESS MODE', 'Survive as long as you can — bosses return every 5 waves', '#B36BFF', 3.2, true);
    this.audio.waveStart();
    this.saveGame();
    this.uiVersion++;
  }

  // -------------------------------------------------------------------------
  // Commander abilities
  // -------------------------------------------------------------------------

  activateEmp() {
    if (this.state !== GS.COMBAT_PHASE && this.state !== GS.BUILD_PHASE) return false;
    if (this.cooldowns.emp > 0 || this.energy < BALANCE.abilityCosts.emp) { this.audio.noEnergy(); return false; }
    this.energy -= BALANCE.abilityCosts.emp;
    this.cooldowns.emp = BALANCE.abilityCooldowns.emp;
    this.empActive = BALANCE.empDur;
    this.empX = axialToPixel(0,0).x;
    this.empY = axialToPixel(0,0).y;
    this.audio.ability();
    this.particles.burst(this.empX,this.empY,'#00E5FF',30,200,3,0.7);
    this.particles.spawn({x:this.empX,y:this.empY,vx:0,vy:0,color:'#00E5FF',size:12,life:0.7,shape:'ring',alpha:1});
    return true;
  }

  beginOrbitalAim() {
    if (this.cooldowns.orbital > 0 || this.energy < BALANCE.abilityCosts.orbital) { this.audio.noEnergy(); return false; }
    this.orbitalAiming = !this.orbitalAiming;
    this.uiVersion++;
    return true;
  }

  fireOrbital(x:number, y:number) {
    if (!this.orbitalAiming) return false;
    if (this.cooldowns.orbital > 0 || this.energy < BALANCE.abilityCosts.orbital) { this.orbitalAiming = false; return false; }
    this.energy -= BALANCE.abilityCosts.orbital;
    this.cooldowns.orbital = BALANCE.abilityCooldowns.orbital;
    this.orbitalTarget = {x,y};
    this.orbitalTimer = 0.8;
    this.orbitalAiming = false;
    this.particles.spawn({x,y,vx:0,vy:0,color:'#FF4F9D',size:HEX_STEP*0.8,life:0.8,shape:'ring',alpha:0.9});
    this.audio.ability();
    this.uiVersion++;
    return true;
  }

  /** Legacy button entry point: aim at the current camera center. */
  activateOrbital(x:number,y:number) { return this.fireOrbital(x,y); }

  doOrbital(x:number,y:number) {
    this.audio.plasma();
    this.particles.burst(x,y,'#FF4F9D',40,260,4,0.9);
    this.particles.spawn({x,y,vx:0,vy:0,color:'#EEF6FF',size:10,life:0.5,shape:'ring',alpha:1});
    const r = BALANCE.orbitalRadius*HEX_STEP;
    for (const e of this.enemies) {
      if (!e.alive||e.dying) continue;
      if (Math.hypot(e.x-x, e.y-y) <= r) {
        this.applyDamage(e, BALANCE.orbitalDamage, null);
      }
    }
  }

  activateOverdrive() {
    if (this.state !== GS.COMBAT_PHASE && this.state !== GS.BUILD_PHASE) return false;
    if (this.cooldowns.overdrive > 0 || this.energy < BALANCE.abilityCosts.overdrive) { this.audio.noEnergy(); return false; }
    this.energy -= BALANCE.abilityCosts.overdrive;
    this.cooldowns.overdrive = BALANCE.abilityCooldowns.overdrive;
    this.overdriveActive = BALANCE.overdriveDur;
    this.audio.ability();
    const cp = axialToPixel(0,0);
    this.particles.burst(cp.x,cp.y,'#00E5FF',24,180,3,0.6);
    return true;
  }

  // -------------------------------------------------------------------------
  // Upgrades / economy
  // -------------------------------------------------------------------------

  upgradeCost(t: TowerInstance): number {
    const def = TOWER_DEFS[t.type];
    if (t.level === 1) return Math.round(def.cost * BALANCE.upgradeCost2);
    if (t.level === 2) return Math.round(def.cost * BALANCE.upgradeCost3);
    return 0;
  }
  upgradeTower(t: TowerInstance, specChoice: 0|1|2 = 0) {
    if (t.level >= 3) return false;
    const cost = this.upgradeCost(t);
    if (this.energy < cost) { this.audio.noEnergy(); return false; }
    this.energy -= cost;
    t.level++;
    if (t.level === 3) {
      t.spec = specChoice || 1;
      this.applySpec(t, specChoice);
    }
    this.audio.upgrade();
    const p = axialToPixel(t.q,t.r);
    this.particles.burst(p.x,p.y, TOWER_DEFS[t.type].color, 20, 150, 2.5, 0.6);
    this.spawnFloatingText(p.x, p.y-10, t.level===3 ? 'MAX LEVEL' : 'UPGRADE', '#EEF6FF');
    this.uiVersion++;
    return true;
  }
  applySpec(t: TowerInstance, choice: number) {
    const first = choice !== 2;
    switch (t.type) {
      case TT.BOLT: if (first) t.specRapid=true; else t.specPierce=true; break;
      case TT.ARC: if (first) t.specChain=true; else t.specOvercharge=true; break;
      case TT.CRYO: if (first) t.specDeepFreeze=true; else t.specFrostField=true; break;
      case TT.RAIL: if (first) t.specArmorPierce=true; else t.specPrecision=true; break;
      case TT.NOVA: if (first) t.specWideBlast=true; else t.specPlasmaBurn=true; break;
      case TT.AMP: if (first) t.specExtendedField=true; else t.specReactorLink=true; break;
    }
  }
  sellTower(t: TowerInstance) {
    const def = TOWER_DEFS[t.type];
    let total = def.cost;
    if (t.level >= 2) total += Math.round(def.cost * BALANCE.upgradeCost2);
    if (t.level >= 3) total += Math.round(def.cost * BALANCE.upgradeCost3);
    const refund = Math.floor(total * BALANCE.sellRefund);
    this.energy += refund;
    this.board.tile(t.q,t.r)!.type = TILE.NORMAL;
    this.towers = this.towers.filter(x=>x.id!==t.id);
    this.selectedTowerId = null;
    this.audio.sell();
    const p = axialToPixel(t.q,t.r);
    this.particles.burst(p.x,p.y,'#54F7C5',14,120,2,0.4);
    this.spawnFloatingText(p.x,p.y, `+${refund}`, '#54F7C5');
    this.uiVersion++;
    return refund;
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  saveGame() {
    try {
      const data: SaveData = {
        version: 2,
        wave: this.wave,
        integrity: this.reactorIntegrity,
        energy: this.energy,
        score: this.score,
        difficulty: this.difficulty,
        towers: this.towers.map(t => ({
          type: t.type, q: t.q, r: t.r, level: t.level, spec: t.spec,
          targetMode: t.targetMode, kills: t.kills, damageDealt: t.damageDealt,
          specFlags: {
            specRapid:t.specRapid, specPierce:t.specPierce, specChain:t.specChain,
            specOvercharge:t.specOvercharge, specDeepFreeze:t.specDeepFreeze,
            specFrostField:t.specFrostField, specArmorPierce:t.specArmorPierce,
            specPrecision:t.specPrecision, specWideBlast:t.specWideBlast,
            specPlasmaBurn:t.specPlasmaBurn, specExtendedField:t.specExtendedField,
            specReactorLink:t.specReactorLink,
          }
        })),
        cooldowns: { ...this.cooldowns },
        overdriveActive: this.overdriveActive,
        bestCombo: this.stats.bestCombo,
        mode: this.mode,
        endlessWave: this.mode === 'endless' ? this.wave : 0,
        unlockedTowers: this.unlockedTowers,
        routesUnlocked: this.routesUnlocked,
        stats: { ...this.stats },
        timestamp: Date.now(),
      };
      localStorage.setItem('hexdefender_save', JSON.stringify(data));
    } catch(e) {}
  }
  loadGame(): boolean {
    try {
      const raw = localStorage.getItem('hexdefender_save');
      if (!raw) return false;
      const data: SaveData = JSON.parse(raw);
      if (data.version !== 2 && data.version !== 1) return false;
      this.resetRun();
      this.difficulty = data.difficulty;
      this.mode = data.mode || 'campaign';
      this.wave = data.wave;
      this.reactorIntegrity = data.integrity;
      this.energy = data.energy;
      this.score = data.score;
      this.cooldowns = data.cooldowns || { emp:0, orbital:0, overdrive:0 };
      this.overdriveActive = data.overdriveActive || 0;
      this.board.build();
      for (const td of data.towers) {
        this.board.tile(td.q,td.r)!.type = TILE.OCCUPIED;
        const t: TowerInstance = {
          id: nid(), type: td.type, q: td.q, r: td.r, level: td.level, spec: td.spec as any,
          targetMode: td.targetMode, cooldown: 0, angle: 0, kills: td.kills, damageDealt: td.damageDealt,
          buffed: false, lastFire: 0, charge: 0, builtAt: -10, disrupted: 0, ...td.specFlags
        };
        this.towers.push(t);
      }
      this.stats.towersBuilt = this.towers.length;
      if (data.version >= 2) {
        this.unlockedTowers = data.unlockedTowers && data.unlockedTowers.length ? data.unlockedTowers : [TT.BOLT];
        this.routesUnlocked = data.routesUnlocked || routesForWave(Math.min(this.wave, 20));
        this.stats = { ...this.stats, ...data.stats };
      } else {
        // migrate v1 saves: derive unlocks from progress
        this.unlockedTowers = TOWER_ORDER.filter(t => TOWER_DEFS[t].unlockWave <= this.wave + 1);
        this.routesUnlocked = routesForWave(Math.min(this.wave, 20));
        this.stats = { towersBuilt: this.towers.length, energyEarned: 0, bestCombo: data.bestCombo || 1, startTime: 0 };
      }
      this.lastActAnnounced = actForWave(Math.min(Math.max(this.wave,1), 20));
      this.actShown = this.actTarget = this.lastActAnnounced;
      this.waveActive = false;
      this.tutorial = null;
      this.state = GS.BUILD_PHASE;
      return true;
    } catch(e) { return false; }
  }
  clearSave() { try { localStorage.removeItem('hexdefender_save'); } catch(e){} }
  hasSave(): boolean { try { return !!localStorage.getItem('hexdefender_save'); } catch(e){ return false; } }

  submitScore(name?: string) {
    if (this.scoreSubmitted) return;
    this.scoreSubmitted = true;
    try {
      const entry = { name: (name || 'CMDR').slice(0,12), score: this.score, wave: this.wave, difficulty: this.difficulty, mode: this.mode, date: new Date().toISOString().slice(0,10) };
      const lb = this.loadLeaderboardRaw();
      lb.push(entry);
      lb.sort((a,b)=>b.score-a.score);
      const top = lb.slice(0,10);
      localStorage.setItem('hexdefender_lb', JSON.stringify(top));
      this.leaderboard = top;
    } catch(e){}
  }
  loadLeaderboardRaw(): any[] {
    try { return JSON.parse(localStorage.getItem('hexdefender_lb')||'[]'); } catch(e){ return []; }
  }
  loadLeaderboard() { this.leaderboard = this.loadLeaderboardRaw(); }
  loadSettings() {
    try {
      const raw = localStorage.getItem('hexdefender_settings');
      if (raw) this.settings = { ...this.settings, ...JSON.parse(raw) };
    } catch(e){}
    this.audio.setSfx(this.settings.sfxVolume);
    this.audio.setMusic(this.settings.musicVolume);
    if (this.settings.quality === 'low') this.particles.setBudget(BALANCE.particleBudgetMobile);
    else if (this.settings.quality === 'medium') this.particles.setBudget(900);
    else this.particles.setBudget(BALANCE.particleBudgetDesktop);
  }
  saveSettings() {
    try { localStorage.setItem('hexdefender_settings', JSON.stringify(this.settings)); } catch(e){}
    this.audio.setSfx(this.settings.sfxVolume);
    this.audio.setMusic(this.settings.musicVolume);
  }
  loadBestScore() {
    try {
      this.bestScore = parseInt(localStorage.getItem('hexdefender_best')||'0',10);
      this.bestEndlessWave = parseInt(localStorage.getItem('hexdefender_bestEndless')||'0',10);
    } catch(e){}
  }
  updateBestScore() {
    if (this.score > this.bestScore) { this.bestScore = this.score; try { localStorage.setItem('hexdefender_best', String(this.bestScore)); } catch(e){} }
  }
  updateBestEndless() {
    if (this.wave > this.bestEndlessWave) { this.bestEndlessWave = this.wave; try { localStorage.setItem('hexdefender_bestEndless', String(this.bestEndlessWave)); } catch(e){} }
  }
  get isNewBestScore(): boolean { return this.score > 0 && this.score >= this.bestScore; }

  // -------------------------------------------------------------------------
  // Effects bookkeeping
  // -------------------------------------------------------------------------

  updateFloatingTexts(dt:number) {
    const arr = this.floatingTexts;
    let w=0;
    for (let i=0;i<arr.length;i++) {
      const f = arr[i];
      f.life -= dt;
      f.y += f.vy*dt;
      f.vy *= 0.95;
      if (f.life > 0) arr[w++]=f;
    }
    arr.length = w;
  }

  updateArcEffects(dt:number) {
    const arr = this.arcEffects;
    let w=0;
    for (let i=0;i<arr.length;i++) {
      const a = arr[i];
      a.life -= dt;
      if (a.life > 0) arr[w++]=a;
    }
    arr.length = w;
  }

  /** Act-based ambient atmosphere (all procedural). */
  spawnAmbient(dt:number) {
    if (this.settings.reducedMotion) return;
    const act = this.actTarget;
    this.ambientTimer -= dt;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = 0.5 - act*0.08;
      const a = Math.random()*Math.PI*2;
      const r = Math.random() * HEX_STEP * 6.4;
      this.particles.spawn({
        x: Math.cos(a)*r, y: Math.sin(a)*r,
        vx: (Math.random()-0.5)*8, vy: -14 - Math.random()*10,
        color: ACTS[act-1].primary, size: 1.6, life: 2.4, alpha: 0.5, drag: 1,
      });
    }
    if (act >= 3) {
      this.pulseTimer -= dt;
      if (this.pulseTimer <= 0) {
        this.pulseTimer = 2.6;
        for (let i=0;i<this.routesUnlocked;i++) {
          const p = this.board.portals[i];
          const pp = axialToPixel(p.q, p.r);
          this.particles.spawn({x:pp.x,y:pp.y,vx:0,vy:0,color:'#FF536A',size:5,life:1.1,shape:'ring',alpha:0.5});
        }
      }
    }
    if (act >= 4) {
      this.instabilityTimer -= dt;
      if (this.instabilityTimer <= 0) {
        this.instabilityTimer = 0.8 + Math.random()*0.6;
        const a = Math.random()*Math.PI*2;
        const r = HEX_STEP * 6.2;
        this.particles.burst(Math.cos(a)*r, Math.sin(a)*r, '#FF3355', 4, 40, 1.6, 0.5, 'spark');
      }
    }
  }

  pause() { if (this.state===GS.BUILD_PHASE||this.state===GS.COMBAT_PHASE) { this.paused=true; this.state=GS.PAUSED; this.uiVersion++; } }
  resume() { if (this.state===GS.PAUSED) { this.paused=false; this.state = this.waveActive ? GS.COMBAT_PHASE : GS.BUILD_PHASE; this.uiVersion++; } }

  // -------------------------------------------------------------------------
  // Rendering — world
  // -------------------------------------------------------------------------

  render(alpha:number) {
    const ctx = this.ctx;
    const w = this.canvas.width / (window.devicePixelRatio||1);
    const h = this.canvas.height / (window.devicePixelRatio||1);
    ctx.clearRect(0,0,w,h);
    this.drawBackground(ctx, w, h);
    ctx.save();
    this.camera.apply(ctx);
    this.drawBoard(ctx);
    this.drawTowers(ctx);
    this.drawEnemies(ctx);
    this.drawProjectiles(ctx);
    this.drawParticlesWorld(ctx);
    this.drawFloatingTexts(ctx);
    ctx.restore();
    this.drawOverlays(ctx, w, h);
    this.drawHUD(ctx, w, h);
    this.updateArcEffects(1/60 * this.gameSpeed);
  }

  /** Blended act palette (transitions over ~4s when the act changes). */
  palette() {
    const from = ACTS[this.actShown-1];
    const to = ACTS[this.actTarget-1];
    if (this.actShown === this.actTarget) return to;
    const t = Math.max(0, Math.min(1, this.actBlendT));
    return {
      primary: lerpColor(from.primary, to.primary, t),
      accent: lerpColor(from.accent, to.accent, t),
      bgA: lerpColor(from.bgA, to.bgA, t),
      bgB: lerpColor(from.bgB, to.bgB, t),
      n: to.n, name: to.name, tagline: to.tagline,
    };
  }

  drawBackground(ctx:CanvasRenderingContext2D, w:number, h:number) {
    const pal = this.palette();
    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0, pal.bgA); g.addColorStop(1, pal.bgB);
    ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
    // faint hex grid
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = pal.primary;
    ctx.lineWidth = 1;
    const R = 40;
    for (let y=-R; y<h+R; y+=R*1.5) {
      for (let x=-R; x<w+R; x+=R*Math.sqrt(3)) {
        const off = (Math.floor(y/(R*1.5))%2) * (R*Math.sqrt(3)/2);
        const cx = x+off;
        const pts = [];
        for (let i=0;i<6;i++){ const a=(Math.PI/180)*(60*i-30); pts.push({x:cx+R*Math.cos(a),y:y+R*Math.sin(a)}); }
        ctx.beginPath();
        ctx.moveTo(pts[0].x,pts[0].y);
        for (let i=1;i<6;i++) ctx.lineTo(pts[i].x,pts[i].y);
        ctx.closePath(); ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawBoard(ctx:CanvasRenderingContext2D) {
    const pal = this.palette();
    const act = this.actTarget;
    // Act II+: scanning beam sweep
    if (act >= 2 && !this.settings.reducedMotion) {
      const boardPx = HEX_STEP * 13;
      const frac = (this.time % 8) / 8;
      const x = -boardPx/2 + frac*boardPx;
      const grad = ctx.createLinearGradient(x-60, 0, x+60, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, hexA(pal.accent, 0.06));
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x-60, -boardPx/2, 120, boardPx);
    }
    // tiles
    for (const tile of this.board.allTiles()) {
      const p = axialToPixel(tile.q, tile.r);
      const pts = hexCornersArr(p.x, p.y, HEX_RADIUS-1);
      let fill = '#0C1326';
      if (tile.type === TILE.ROUTE) fill = '#141c33';
      if (tile.type === TILE.CORE) fill = hexA(pal.primary, 0.08);
      if (tile.type === TILE.PORTAL) fill = 'rgba(255,83,106,0.12)';
      if (tile.type === TILE.RESTRICTED) fill = '#0a1020';
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(pts[0].x,pts[0].y);
      for (let i=1;i<6;i++) ctx.lineTo(pts[i].x,pts[i].y);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#1b2a44';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (this.hoverHex && this.hoverHex.q===tile.q && this.hoverHex.r===tile.r && (this.state===GS.BUILD_PHASE||this.state===GS.COMBAT_PHASE)) {
        ctx.strokeStyle = this.placementValid ? pal.primary : '#FF536A';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (this.selectedTowerId) {
        const st = this.towers.find(t=>t.id===this.selectedTowerId);
        if (st && st.q===tile.q && st.r===tile.r) {
          ctx.strokeStyle = '#EEF6FF';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      }
    }
    this.drawRoutes(ctx);
    this.drawPortals(ctx);
    this.drawReactor(ctx);
    // Amplifier links
    if (this.ampLinks.length) {
      ctx.save();
      ctx.lineWidth = 1.5;
      for (const l of this.ampLinks) {
        ctx.strokeStyle = hexA('#54F7C5', 0.25 + 0.2*Math.sin(this.time*5));
        ctx.beginPath(); ctx.moveTo(l.x1,l.y1); ctx.lineTo(l.x2,l.y2); ctx.stroke();
        ctx.fillStyle = hexA('#54F7C5', 0.5);
        ctx.beginPath(); ctx.arc(l.x2, l.y2, 2.5, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }
    // Selected tower range
    if (this.selectedTowerId) {
      const t = this.towers.find(t=>t.id===this.selectedTowerId);
      if (t && t.type !== TT.AMP) {
        const p = axialToPixel(t.q,t.r);
        const def = TOWER_DEFS[t.type];
        ctx.save();
        ctx.strokeStyle = 'rgba(238,246,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6,6]);
        ctx.beginPath();
        ctx.arc(p.x,p.y, def.range*HEX_STEP, 0, Math.PI*2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      } else if (t && t.type === TT.AMP) {
        const p = axialToPixel(t.q,t.r);
        const def = TOWER_DEFS[t.type];
        ctx.save();
        ctx.strokeStyle = 'rgba(84,247,197,0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6,6]);
        ctx.beginPath();
        ctx.arc(p.x,p.y, def.range*HEX_STEP*(t.specExtendedField?1.35:1), 0, Math.PI*2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
    // Placement ghost
    if (this.selectedTowerType && this.hoverHex && this.placementValid && (this.state===GS.BUILD_PHASE||this.state===GS.COMBAT_PHASE)) {
      const p = axialToPixel(this.hoverHex.q, this.hoverHex.r);
      ctx.save();
      ctx.globalAlpha = 0.4;
      this.drawTowerShape(ctx, this.selectedTowerType, p.x, p.y, 1, 0);
      ctx.restore();
      const def = TOWER_DEFS[this.selectedTowerType];
      if (def.range > 0) {
        ctx.save();
        ctx.strokeStyle = hexA(pal.primary, 0.35);
        ctx.setLineDash([4,4]);
        ctx.beginPath();
        ctx.arc(p.x,p.y, def.range*HEX_STEP, 0, Math.PI*2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
    this.drawTutorialHint(ctx);
  }

  /** Animated chevrons along active routes. */
  drawRoutes(ctx:CanvasRenderingContext2D) {
    for (let ri=0; ri<this.board.routes.length; ri++) {
      const active = ri < this.routesUnlocked;
      if (!active) continue;
      const route = this.board.routes[ri];
      const revealing = this.routeReveal && this.routeReveal.index === ri;
      const baseAlpha = revealing ? 0.5 : 0.16;
      ctx.save();
      ctx.strokeStyle = revealing ? '#FF536A' : '#FF536A';
      for (let k=0; k<route.length-1; k++) {
        const a = axialToPixel(route[k].q, route[k].r);
        const b = axialToPixel(route[k+1].q, route[k+1].r);
        const ang = Math.atan2(b.y-a.y, b.x-a.x);
        const flow = (this.time*0.45 + k*0.33) % 1;
        const t = flow;
        const x = a.x + (b.x-a.x)*t;
        const y = a.y + (b.y-a.y)*t;
        const alpha = baseAlpha * (0.5 + 0.5*Math.sin(flow*Math.PI));
        ctx.globalAlpha = alpha;
        ctx.lineWidth = revealing ? 2.5 : 2;
        ctx.beginPath();
        const s = revealing ? 9 : 7;
        ctx.moveTo(x - Math.cos(ang-0.5)*s, y - Math.sin(ang-0.5)*s);
        ctx.lineTo(x, y);
        ctx.lineTo(x - Math.cos(ang+0.5)*s, y - Math.sin(ang+0.5)*s);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawPortals(ctx:CanvasRenderingContext2D) {
    for (let i=0;i<this.board.portals.length;i++) {
      const portal = this.board.portals[i];
      const p = axialToPixel(portal.q, portal.r);
      const active = i < this.routesUnlocked;
      const revealing = this.routeReveal && this.routeReveal.index === i;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (!active) {
        // dormant
        ctx.strokeStyle = 'rgba(120,130,160,0.35)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4,5]);
        ctx.beginPath(); ctx.arc(0,0, HEX_RADIUS*0.62, 0, Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(120,130,160,0.18)';
        ctx.beginPath(); ctx.arc(0,0, HEX_RADIUS*0.4, 0, Math.PI*2); ctx.fill();
      } else {
        const pulse = 0.5 + 0.5*Math.sin(this.time*3 + i);
        const bright = this.preFinal || revealing ? 1 : 0.75;
        ctx.strokeStyle = `rgba(255,83,106,${(0.5+0.4*pulse)*bright})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0,0, HEX_RADIUS*0.62 + pulse*2, 0, Math.PI*2); ctx.stroke();
        ctx.save();
        ctx.rotate(this.time*0.8);
        ctx.strokeStyle = `rgba(255,83,106,${0.5*bright})`;
        ctx.setLineDash([6,8]);
        ctx.beginPath(); ctx.arc(0,0, HEX_RADIUS*0.85, 0, Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        const g = ctx.createRadialGradient(0,0,0,0,0,HEX_RADIUS*0.8);
        g.addColorStop(0, `rgba(255,83,106,${0.35*bright})`);
        g.addColorStop(1, 'rgba(255,83,106,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0,0,HEX_RADIUS*0.8,0,Math.PI*2); ctx.fill();
        if (revealing) {
          const t = 1 - (this.routeReveal!.t / 3.5);
          ctx.strokeStyle = `rgba(255,83,106,${Math.max(0, 0.9-t)})`;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0,0, HEX_RADIUS*0.6 + t*HEX_RADIUS*2.2, 0, Math.PI*2); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  drawReactor(ctx:CanvasRenderingContext2D) {
    const p = axialToPixel(0,0);
    const R = HEX_RADIUS*1.6;
    const t = this.time;
    const pal = this.palette();
    const intensify = this.preFinal ? 1.35 : 1;
    ctx.save();
    ctx.translate(p.x,p.y);
    const auraColor = this.state === GS.VICTORY ? '#00E5FF' : pal.primary;
    const aura = ctx.createRadialGradient(0,0,R*0.5,0,0,R*2.6*intensify);
    aura.addColorStop(0, hexA(auraColor, 0.28*intensify));
    aura.addColorStop(1, hexA(auraColor, 0));
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0,0,R*2.6*intensify,0,Math.PI*2); ctx.fill();
    const pts = hexCornersArr(0,0,R);
    ctx.fillStyle = '#0C1326';
    ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y); for(let i=1;i<6;i++) ctx.lineTo(pts[i].x,pts[i].y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#00E5FF'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.save(); ctx.rotate(t*0.6);
    ctx.strokeStyle = 'rgba(0,229,255,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0,0,R*0.7,0,Math.PI*2); ctx.stroke();
    for (let i=0;i<6;i++){
      const a = (Math.PI/3)*i;
      ctx.fillStyle = '#00E5FF';
      ctx.beginPath(); ctx.arc(Math.cos(a)*R*0.85, Math.sin(a)*R*0.85, 3, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
    const corePulse = this.preFinal ? (0.5+0.5*Math.sin(t*6)) : 0;
    const coreG = ctx.createRadialGradient(0,0,0,0,0,R*(0.45+corePulse*0.1));
    coreG.addColorStop(0,'#EEF6FF'); coreG.addColorStop(0.4,'#00E5FF'); coreG.addColorStop(1,'rgba(0,229,255,0)');
    ctx.fillStyle = coreG;
    ctx.beginPath(); ctx.arc(0,0,R*(0.45+corePulse*0.1),0,Math.PI*2); ctx.fill();
    if (this.reactorFlash > 0) {
      ctx.strokeStyle = `rgba(255,83,106,${this.reactorFlash})`;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0,0,R*1.25,0,Math.PI*2); ctx.stroke();
    }
    if (this.reactorIntegrity <= 6 && this.state !== GS.VICTORY) {
      ctx.strokeStyle = `rgba(255,83,106,${0.4+0.3*Math.sin(t*6)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0,0,R*1.2,0,Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  }

  /** Onboarding: holographic suggested first tower at (-1,-1). */
  drawTutorialHint(ctx:CanvasRenderingContext2D) {
    if (!this.tutorial) return;
    if (this.tutorial.stage !== 'title' && this.tutorial.stage !== 'build') return;
    if (this.towers.length > 0) return;
    const { q, r } = BALANCE.firstTowerHint;
    const p = axialToPixel(q, r);
    const pulse = 0.5 + 0.5*Math.sin(this.time*4);
    ctx.save();
    ctx.strokeStyle = `rgba(0,229,255,${0.4+0.5*pulse})`;
    ctx.lineWidth = 2.5;
    const pts = hexCornersArr(p.x, p.y, HEX_RADIUS-3);
    ctx.beginPath();
    ctx.moveTo(pts[0].x,pts[0].y);
    for (let i=1;i<6;i++) ctx.lineTo(pts[i].x,pts[i].y);
    ctx.closePath(); ctx.stroke();
    // holographic ghost
    ctx.globalAlpha = 0.3 + 0.15*pulse;
    this.drawTowerShape(ctx, TT.BOLT, p.x, p.y, 1, this.time*0.8);
    ctx.globalAlpha = 1;
    // range preview
    ctx.strokeStyle = 'rgba(0,229,255,0.3)';
    ctx.setLineDash([5,5]);
    ctx.beginPath(); ctx.arc(p.x, p.y, TOWER_DEFS[TT.BOLT].range*HEX_STEP, 0, Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,229,255,0.85)';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('BOLT SENTINEL', p.x, p.y - HEX_RADIUS - 8);
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Rendering — entities
  // -------------------------------------------------------------------------

  drawTowers(ctx:CanvasRenderingContext2D) {
    for (const t of this.towers) {
      const p = axialToPixel(t.q, t.r);
      // construction animation
      let scale = 1, extraRot = 0;
      const age = this.time - (t.builtAt ?? -10);
      if (age >= 0 && age < 0.6) {
        const f = age / 0.6;
        scale = easeOutBack(Math.max(0.08, f));
        extraRot = (1-f) * 2.6;
        if (!this.settings.reducedMotion) {
          ctx.save();
          ctx.strokeStyle = hexA(TOWER_DEFS[t.type].color, 0.7*(1-f));
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, 12 + f*26, 0, Math.PI*2); ctx.stroke();
          ctx.beginPath(); ctx.arc(p.x, p.y, 8 + f*44, 0, Math.PI*2); ctx.stroke();
          ctx.restore();
        }
      }
      if (t.buffed) {
        ctx.save();
        ctx.strokeStyle = `rgba(84,247,197,${0.35+0.2*Math.sin(this.time*5)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x,p.y, 20, 0, Math.PI*2); ctx.stroke();
        ctx.restore();
      }
      if (t.disrupted && t.disrupted > 0) {
        ctx.save();
        ctx.strokeStyle = `rgba(255,79,157,${0.4+0.3*Math.sin(this.time*12)})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([3,4]);
        ctx.beginPath(); ctx.arc(p.x,p.y, 22, 0, Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#FF4F9D';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('z', p.x, p.y - 26);
        ctx.restore();
      }
      if (t.type === TT.RAIL && t.charge > 0) {
        ctx.save();
        ctx.strokeStyle = '#FF4F9D';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x,p.y, 18, 0, Math.PI*2*t.charge); ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(scale, scale);
      ctx.translate(-p.x, -p.y);
      this.drawTowerShape(ctx, t.type, p.x, p.y, t.level, t.angle + extraRot);
      ctx.restore();
      ctx.fillStyle = '#8496B5';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(t.kills), p.x, p.y+24);
    }
  }

  drawTowerShape(ctx:CanvasRenderingContext2D, type:TowerType, x:number, y:number, level:number, angle:number) {
    const def = TOWER_DEFS[type];
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(angle);
    const R = 14;
    const pts = hexCornersArr(0,0,R);
    ctx.fillStyle = '#0C1326';
    ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y); for(let i=1;i<6;i++) ctx.lineTo(pts[i].x,pts[i].y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = def.color; ctx.lineWidth = 1.5; ctx.stroke();
    switch (type) {
      case TT.BOLT:
        ctx.fillStyle = def.color;
        ctx.fillRect(4, -6, 10, 3);
        ctx.fillRect(4, 3, 10, 3);
        ctx.fillStyle = '#070B17';
        ctx.fillRect(6,-4,6,1); ctx.fillRect(6,4,6,1);
        break;
      case TT.ARC:
        ctx.strokeStyle = def.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(0,-8); ctx.lineTo(8,0); ctx.lineTo(0,8); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = 'rgba(155,108,255,0.3)'; ctx.fill();
        break;
      case TT.CRYO:
        ctx.fillStyle = def.color;
        for (let i=0;i<6;i++){
          const a = (Math.PI/3)*i;
          ctx.beginPath(); ctx.arc(Math.cos(a)*6, Math.sin(a)*6, 2, 0, Math.PI*2); ctx.fill();
        }
        ctx.strokeStyle = def.color; ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(0,0,4,0,Math.PI*2); ctx.stroke();
        break;
      case TT.RAIL:
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(-10,-4,20,8);
        ctx.strokeStyle = def.color; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(-10,0); ctx.lineTo(10,0); ctx.stroke();
        ctx.fillStyle = def.color;
        ctx.fillRect(-8,-2,16,1); ctx.fillRect(-8,1,16,1);
        break;
      case TT.NOVA:
        ctx.fillStyle = def.color;
        ctx.beginPath(); ctx.arc(0,0,6,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#070B17'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(0,0,6,0,Math.PI*2); ctx.stroke();
        ctx.strokeStyle = def.color; ctx.lineWidth=1;
        for (let i=0;i<4;i++){ const a=(Math.PI/2)*i; ctx.beginPath(); ctx.moveTo(Math.cos(a)*7,Math.sin(a)*7); ctx.lineTo(Math.cos(a)*10,Math.sin(a)*10); ctx.stroke(); }
        break;
      case TT.AMP:
        ctx.strokeStyle = def.color; ctx.lineWidth=1.5;
        for (let i=0;i<3;i++){
          ctx.beginPath(); ctx.arc(0,0, 6+i*3, 0, Math.PI*2); ctx.stroke();
        }
        ctx.fillStyle = def.color;
        ctx.beginPath(); ctx.moveTo(0,-4); ctx.lineTo(4,0); ctx.lineTo(0,4); ctx.lineTo(-4,0); ctx.closePath(); ctx.fill();
        break;
    }
    if (level >= 2) {
      ctx.fillStyle = '#EEF6FF';
      for (let i=0;i<level-1;i++) {
        ctx.beginPath(); ctx.arc(-10+i*4, -10, 1.5, 0, Math.PI*2); ctx.fill();
      }
    }
    ctx.restore();
  }

  drawEnemies(ctx:CanvasRenderingContext2D) {
    for (const e of this.enemies) {
      if (e.dying) {
        for (const f of e.fragments) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, f.life);
          ctx.fillStyle = ENEMY_DEFS[e.type].color;
          ctx.translate(f.x, f.y);
          if (f.rot !== undefined) ctx.rotate(f.rot);
          ctx.fillRect(-3, -3, 6, 6);
          ctx.restore();
        }
        continue;
      }
      if (!e.alive) continue;
      const def = ENEMY_DEFS[e.type];
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      if (e.hitFlash > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, e.hitFlash*8);
        ctx.fillStyle = '#EEF6FF';
        ctx.beginPath(); ctx.arc(0,0,e.radius+2,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }
      // slow tint
      if (e.slowTimer > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(127,223,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0,0,e.radius+3,0,Math.PI*2); ctx.stroke();
        ctx.restore();
      }
      switch (e.type) {
        case ET.SCOUT:
          ctx.fillStyle = def.color;
          ctx.beginPath(); ctx.moveTo(e.radius,0); ctx.lineTo(-e.radius*0.6, -e.radius*0.7); ctx.lineTo(-e.radius*0.6, e.radius*0.7); ctx.closePath(); ctx.fill();
          break;
        case ET.BRUISER: {
          const pts = hexCornersArr(0,0,e.radius);
          ctx.fillStyle = def.color;
          ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y); for(let i=1;i<6;i++) ctx.lineTo(pts[i].x,pts[i].y); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#070B17'; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-e.radius*0.5,-e.radius*0.6); ctx.lineTo(e.radius*0.5,-e.radius*0.6);
          ctx.moveTo(-e.radius*0.5,0); ctx.lineTo(e.radius*0.5,0);
          ctx.moveTo(-e.radius*0.5,e.radius*0.6); ctx.lineTo(e.radius*0.5,e.radius*0.6);
          ctx.stroke();
          break;
        }
        case ET.DASHER: {
          // afterimages communicate speed
          ctx.fillStyle = hexA(def.color, 0.18);
          ctx.beginPath(); ctx.moveTo(e.radius-14,0); ctx.lineTo(-14,-e.radius); ctx.lineTo(-14-e.radius,0); ctx.lineTo(-14,e.radius); ctx.closePath(); ctx.fill();
          ctx.fillStyle = hexA(def.color, 0.4);
          ctx.beginPath(); ctx.moveTo(e.radius-7,0); ctx.lineTo(-7,-e.radius); ctx.lineTo(-7-e.radius,0); ctx.lineTo(-7,e.radius); ctx.closePath(); ctx.fill();
          ctx.fillStyle = def.color;
          ctx.beginPath(); ctx.moveTo(e.radius,0); ctx.lineTo(0,-e.radius); ctx.lineTo(-e.radius,0); ctx.lineTo(0,e.radius); ctx.closePath(); ctx.fill();
          break;
        }
        case ET.SWARMER:
          ctx.fillStyle = def.color;
          ctx.beginPath(); ctx.arc(0,0,e.radius,0,Math.PI*2); ctx.fill();
          ctx.strokeStyle = hexA(def.color, 0.7); ctx.lineWidth = 1;
          for (let i=0;i<3;i++){ const a=(Math.PI*2/3)*i; ctx.beginPath(); ctx.moveTo(Math.cos(a)*e.radius,Math.sin(a)*e.radius); ctx.lineTo(Math.cos(a)*(e.radius+3),Math.sin(a)*(e.radius+3)); ctx.stroke(); }
          break;
        case ET.SHIELD: {
          ctx.fillStyle = def.color;
          ctx.beginPath();
          for(let i=0;i<8;i++){ const a=(Math.PI/4)*i; const r=e.radius; if(i===0) ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r); else ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r); }
          ctx.closePath(); ctx.fill();
          if (e.shield > 0) {
            const flick = e.shield < e.maxShield*0.3 ? (0.4+0.4*Math.sin(this.time*14)) : 1;
            ctx.strokeStyle = `rgba(79,168,255,${0.75*flick})`;
            ctx.lineWidth = 2.5;
            const spts = hexCornersArr(0,0,e.radius+6);
            ctx.beginPath(); ctx.moveTo(spts[0].x,spts[0].y); for(let i=1;i<6;i++) ctx.lineTo(spts[i].x,spts[i].y); ctx.closePath(); ctx.stroke();
          }
          break;
        }
        case ET.SPLITTER: {
          const pulse = 0.5+0.5*Math.sin(this.time*5);
          ctx.fillStyle = def.color;
          ctx.beginPath(); ctx.arc(0,0,e.radius,0,Math.PI*2); ctx.fill();
          ctx.strokeStyle = '#070B17'; ctx.lineWidth=1.5;
          ctx.beginPath(); ctx.moveTo(-e.radius,0); ctx.lineTo(e.radius,0); ctx.moveTo(0,-e.radius); ctx.lineTo(0,e.radius); ctx.stroke();
          ctx.fillStyle = `rgba(238,246,255,${0.4+0.4*pulse})`;
          ctx.beginPath(); ctx.arc(-e.radius*0.35,0,2.4,0,Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(e.radius*0.35,0,2.4,0,Math.PI*2); ctx.fill();
          break;
        }
        case ET.DISRUPTOR: {
          ctx.fillStyle = def.color;
          ctx.beginPath(); ctx.arc(0,0,e.radius,0,Math.PI*2); ctx.fill();
          // interference icon
          ctx.strokeStyle = '#070B17'; ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-4,-2); ctx.lineTo(-1,-2); ctx.lineTo(1,2); ctx.lineTo(4,2);
          ctx.stroke();
          break;
        }
        case ET.TITAN: {
          // Iron Colossus: rotating armor plates
          for (let i=0;i<3;i++){
            ctx.save();
            ctx.rotate(e.plateRot * (i%2===0?1:-1));
            ctx.fillStyle = i===0 ? def.color : (i===1?'#8B1A2B':'#FF4F6A');
            const r = e.radius - i*5;
            const pts2 = hexCornersArr(0,0,r);
            ctx.beginPath(); ctx.moveTo(pts2[0].x,pts2[0].y); for(let j=1;j<6;j++) ctx.lineTo(pts2[j].x,pts2[j].y); ctx.closePath(); ctx.fill();
            ctx.restore();
          }
          if (e.shieldChargeTimer > 0) {
            const t = e.shieldChargeTimer / 1.5;
            ctx.strokeStyle = `rgba(79,168,255,${0.8*(1-t)+0.2})`;
            ctx.lineWidth = 3;
            ctx.setLineDash([8,6]);
            ctx.save(); ctx.rotate(this.time*6);
            ctx.beginPath(); ctx.arc(0,0, e.radius + 14*t, 0, Math.PI*2); ctx.stroke();
            ctx.restore();
            ctx.setLineDash([]);
          }
          if (e.shield > 0) {
            ctx.strokeStyle = 'rgba(79,168,255,0.85)';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0,0, e.radius+12, 0, Math.PI*2); ctx.stroke();
          }
          break;
        }
        case ET.BOSS: {
          // The Null Archon: angular body, rotating rings, orbiting shards, crimson core
          const p3 = e.bossPhase === 3;
          const corePulse = 0.5+0.5*Math.sin(this.time*(p3?10:4));
          // outer armor rings
          for (let ring=0; ring<2; ring++) {
            ctx.save();
            ctx.rotate(e.plateRot * (ring===0?1:-1.4));
            ctx.strokeStyle = ring===0 ? 'rgba(179,107,255,0.8)' : 'rgba(255,34,68,0.7)';
            ctx.lineWidth = 3;
            ctx.setLineDash([14,10]);
            ctx.beginPath(); ctx.arc(0,0, e.radius + 10 + ring*9, 0, Math.PI*2); ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
          }
          // body
          const bodyPts = hexCornersArr(0,0,e.radius);
          ctx.fillStyle = '#2A0E1E';
          ctx.beginPath(); ctx.moveTo(bodyPts[0].x,bodyPts[0].y); for(let i=1;i<6;i++) ctx.lineTo(bodyPts[i].x,bodyPts[i].y); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = p3 ? `rgba(255,34,68,${0.7+0.3*corePulse})` : '#B36BFF';
          ctx.lineWidth = 3;
          ctx.stroke();
          // orbiting triangular shards
          for (let s=0;s<3;s++) {
            const a = this.time*(p3?2.4:1.2) + (Math.PI*2/3)*s;
            const sx = Math.cos(a)*(e.radius+22), sy = Math.sin(a)*(e.radius+22);
            ctx.save();
            ctx.translate(sx,sy); ctx.rotate(a + this.time*3);
            ctx.fillStyle = '#B36BFF';
            ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(5,4); ctx.lineTo(-5,4); ctx.closePath(); ctx.fill();
            ctx.restore();
          }
          // crimson core
          const coreR = e.radius*(p3?0.5:0.35)*(0.85+0.3*corePulse);
          const cg = ctx.createRadialGradient(0,0,0,0,0,coreR);
          cg.addColorStop(0,'#FFFFFF');
          cg.addColorStop(0.35, p3?'#FF2244':'#FF4F6A');
          cg.addColorStop(1,'rgba(255,34,68,0)');
          ctx.fillStyle = cg;
          ctx.beginPath(); ctx.arc(0,0,coreR,0,Math.PI*2); ctx.fill();
          // violet arcs
          ctx.strokeStyle = `rgba(179,107,255,${0.3+0.3*Math.sin(this.time*7)})`;
          ctx.lineWidth = 1.5;
          for (let arc=0; arc<2; arc++) {
            const a0 = this.time*3 + arc*Math.PI;
            ctx.beginPath(); ctx.arc(0,0, e.radius*0.8, a0, a0+1.1); ctx.stroke();
          }
          if (e.shield > 0) {
            ctx.strokeStyle = 'rgba(179,107,255,0.85)';
            ctx.lineWidth = 3.5;
            ctx.beginPath(); ctx.arc(0,0, e.radius+16, 0, Math.PI*2); ctx.stroke();
          }
          break;
        }
      }
      ctx.fillStyle = '#070B17';
      ctx.beginPath(); ctx.arc(e.radius*0.3, 0, Math.max(2, e.radius*0.15), 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#FFB547';
      ctx.beginPath(); ctx.arc(e.radius*0.3, 0, Math.max(1, e.radius*0.08), 0, Math.PI*2); ctx.fill();
      // Disruptor telegraph ring (screen-facing, drawn unrotated)
      if (e.type === ET.DISRUPTOR && e.disruptPulse <= BALANCE.disruptTelegraph) {
        const t = Math.max(0, e.disruptPulse / BALANCE.disruptTelegraph);
        ctx.rotate(-e.angle);
        ctx.strokeStyle = `rgba(255,79,157,${0.5+0.5*(1-t)})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0,0, e.radius + 26*t, 0, Math.PI*2); ctx.stroke();
      }
      ctx.restore();
      // health bars
      const barW = Math.max(20, e.radius*2.2);
      const hpRatio = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - barW/2, e.y - e.radius - 8, barW, 4);
      ctx.fillStyle = e.shield>0 ? '#4FA8FF' : '#54F7C5';
      ctx.fillRect(e.x - barW/2, e.y - e.radius - 8, barW*hpRatio, 4);
      if (e.shield > 0 && e.maxShield > 0) {
        ctx.fillStyle = 'rgba(79,168,255,0.85)';
        ctx.fillRect(e.x - barW/2, e.y - e.radius - 12, barW*(e.shield/e.maxShield), 2.5);
      }
    }
  }

  drawProjectiles(ctx:CanvasRenderingContext2D) {
    for (const p of this.projectiles) {
      if (p.kind === 'rail' && p.beam) {
        const b = p.beam;
        const alpha = Math.max(0, b.life / b.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#FF4F9D';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(b.x1,b.y1); ctx.lineTo(b.x2,b.y2); ctx.stroke();
        ctx.strokeStyle = '#EEF6FF';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(b.x1,b.y1); ctx.lineTo(b.x2,b.y2); ctx.stroke();
        ctx.restore();
        continue;
      }
      if (p.trail.length > 1) {
        ctx.save();
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.trail[0].x,p.trail[0].y);
        for (let i=1;i<p.trail.length;i++) ctx.lineTo(p.trail[i].x,p.trail[i].y);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y, p.radius, 0, Math.PI*2); ctx.fill();
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y, p.radius*2.5, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
    for (const a of this.arcEffects) {
      const alpha = a.life / a.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#9B6CFF';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(a.x1,a.y1); ctx.lineTo(a.x2,a.y2); ctx.stroke();
      ctx.restore();
    }
  }

  drawParticlesWorld(ctx:CanvasRenderingContext2D) {
    for (const p of this.particles.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      if (p.shape === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x,p.y, p.size + (1-p.alpha)*26, 0, Math.PI*2); ctx.stroke();
      } else if (p.shape === 'spark') {
        ctx.fillRect(p.x-1, p.y-1, 2, 2);
      } else if (p.shape === 'rect') {
        ctx.translate(p.x,p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);
      } else {
        ctx.beginPath(); ctx.arc(p.x,p.y, p.size, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }
  }

  drawFloatingTexts(ctx:CanvasRenderingContext2D) {
    for (const f of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle = f.color;
      ctx.font = `bold ${f.size || 13}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  // -------------------------------------------------------------------------
  // Rendering — screen-space overlays & HUD
  // -------------------------------------------------------------------------

  drawOverlays(ctx:CanvasRenderingContext2D, w:number, h:number) {
    // Boss intro: dim + portal spotlight
    if (this.bossIntro) {
      const t = Math.max(0, Math.min(1, this.bossIntro.t / 3.6));
      const dim = 0.42 * Math.min(1, (1-t)*3, t*4+0.2);
      ctx.fillStyle = `rgba(4,6,12,${dim})`;
      ctx.fillRect(0,0,w,h);
      const portal = this.board.portals[this.bossIntro.portal];
      const pp = axialToPixel(portal.q, portal.r);
      const sp = this.camera.worldToScreen(pp);
      const pulse = 0.5+0.5*Math.sin(this.time*8);
      ctx.save();
      ctx.strokeStyle = `rgba(255,83,106,${0.5+0.4*pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 30 + pulse*10 + (1-t)*60, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }
    // Pre-final-wave dread
    if (this.preFinal) {
      ctx.fillStyle = 'rgba(10,2,8,0.20)';
      ctx.fillRect(0,0,w,h);
    }
    // Boss-alive menace tint
    const boss = this.enemies.find(e=>e.isBoss && e.alive);
    if (boss) {
      ctx.fillStyle = 'rgba(20,4,10,0.12)';
      ctx.fillRect(0,0,w,h);
    }
    // Reactor damage vignette
    if (this.reactorFlash > 0 || this.reactorIntegrity <= 6) {
      const a = Math.max(this.reactorFlash*0.5, this.reactorIntegrity <= 6 && this.state !== GS.VICTORY ? 0.10+0.06*Math.sin(this.time*5) : 0);
      if (a > 0) {
        const g = ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*0.3,w/2,h/2,Math.max(w,h)*0.7);
        g.addColorStop(0,'rgba(255,83,106,0)');
        g.addColorStop(1,`rgba(255,83,106,${a})`);
        ctx.fillStyle = g;
        ctx.fillRect(0,0,w,h);
      }
    }
    // White flash (boss death)
    if (this.flashTimer > 0) {
      ctx.fillStyle = `rgba(238,246,255,${Math.min(0.85, this.flashTimer*1.6)})`;
      ctx.fillRect(0,0,w,h);
    }
  }

  drawHUD(ctx:CanvasRenderingContext2D, w:number, h:number) {
    const pal = this.palette();
    ctx.fillStyle = 'rgba(7,11,23,0.72)';
    ctx.fillRect(0,0,w,46);
    ctx.strokeStyle = 'rgba(37,54,84,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0,46); ctx.lineTo(w,46); ctx.stroke();

    // left: wave / act / title
    ctx.textAlign = 'left';
    ctx.fillStyle = pal.primary;
    ctx.font = 'bold 15px monospace';
    const waveLabel = this.mode === 'endless' ? `WAVE ${this.wave}` : `WAVE ${Math.max(this.wave,1)}/20`;
    ctx.fillText(waveLabel, 12, 20);
    ctx.fillStyle = '#8496B5';
    ctx.font = '10px monospace';
    const actN = actForWave(Math.min(Math.max(this.wave,1),20));
    ctx.fillText(`ACT ${['I','II','III','IV'][actN-1]} — ${ACTS[actN-1].name}`, 12, 34);
    if (this.currentWaveDef && this.waveActive) {
      ctx.fillStyle = '#EEF6FF';
      ctx.font = '11px monospace';
      ctx.fillText(this.currentWaveDef.title, 12+170, 20);
      ctx.fillStyle = '#8496B5';
      ctx.font = '10px monospace';
      ctx.fillText(`ENEMIES ${this.waveKilled + this.waveLeaked}/${this.waveTotalEnemies}`, 12+170, 34);
    }

    // center: reactor integrity
    const ix = w/2 - 120;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8496B5';
    ctx.font = '10px monospace';
    ctx.fillText('REACTOR INTEGRITY', w/2, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(ix, 17, 240, 12);
    const ratio = this.reactorIntegrity / this.maxIntegrity;
    ctx.fillStyle = ratio > 0.5 ? '#54F7C5' : ratio > 0.25 ? '#FFB547' : '#FF536A';
    ctx.fillRect(ix, 17, 240*ratio, 12);
    ctx.strokeStyle = '#263954'; ctx.lineWidth=1; ctx.strokeRect(ix,17,240,12);
    ctx.fillStyle = '#EEF6FF';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`${this.reactorIntegrity}/${this.maxIntegrity}`, w/2, 27);
    if (this.waveActive) {
      const processed = this.waveKilled + this.waveLeaked;
      const prog = this.waveTotalEnemies > 0 ? processed / this.waveTotalEnemies : 0;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(ix, 32, 240, 4);
      ctx.fillStyle = pal.primary;
      ctx.fillRect(ix, 32, 240*Math.min(1, prog), 4);
    }

    // right: energy / score / speed
    ctx.textAlign = 'right';
    ctx.fillStyle = '#54F7C5';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(`⚡ ${this.energy}`, w-12, 20);
    ctx.fillStyle = '#EEF6FF';
    ctx.font = '11px monospace';
    ctx.fillText(`SCORE ${this.score}`, w-12, 34);
    ctx.fillStyle = this.gameSpeed > 1 ? '#FFB547' : '#8496B5';
    ctx.fillText(`${this.gameSpeed}x`, w-110, 34);

    // boss bar
    const boss = this.enemies.find(e=>e.isBoss && e.alive);
    if (boss) this.drawBossBar(ctx, w, boss);

    // combo
    if (this.combo > 1 && this.waveActive) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFB547';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(`COMBO x${this.combo.toFixed(1)}`, w/2, h-64);
    }

    // announcements (big center banners)
    this.drawAnnouncements(ctx, w, h);

    // tutorial countdown
    if (this.tutorial && this.tutorial.stage === 'countdown') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#00E5FF';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(`WAVE 1 LAUNCHING IN ${Math.ceil(this.tutorial.countdown)}...`, w/2, h-90);
      ctx.fillStyle = '#8496B5';
      ctx.font = '11px monospace';
      ctx.fillText('Press SPACE or START WAVE to launch now', w/2, h-72);
    } else if (this.state === GS.BUILD_PHASE && !this.tutorial) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(238,246,255,0.65)';
      ctx.font = '12px monospace';
      const nextDef = this.getUpcomingWave();
      const startHint = nextDef ? (nextDef.boss ? 'FACE THE BOSS — press SPACE or START WAVE when ready' : 'Press SPACE or START WAVE when ready') : 'Campaign complete';
      ctx.fillText(startHint, w/2, h-20);
    }

    // orbital aiming crosshair
    if (this.orbitalAiming && this.hoverScreen) {
      ctx.save();
      ctx.strokeStyle = '#FF4F9D';
      ctx.lineWidth = 2;
      const {x,y} = this.hoverScreen;
      ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x-36,y); ctx.lineTo(x-14,y); ctx.moveTo(x+14,y); ctx.lineTo(x+36,y);
      ctx.moveTo(x,y-36); ctx.lineTo(x,y-14); ctx.moveTo(x,y+14); ctx.lineTo(x,y+36); ctx.stroke();
      ctx.fillStyle = '#FF4F9D';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CLICK TO TARGET ORBITAL STRIKE', x, y-46);
      ctx.restore();
    }

    if (this.settings.showFps) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#8496B5';
      ctx.font = '10px monospace';
      ctx.fillText(`FPS ${this.fps} E:${this.enemies.length} P:${this.projectiles.length} Part:${this.particles.particles.length}`, 12, h-8);
    }
  }

  drawBossBar(ctx:CanvasRenderingContext2D, w:number, boss: EnemyInstance) {
    const bw = Math.min(520, w*0.6);
    const bx = w/2 - bw/2;
    const by = 58;
    const hpRatio = Math.max(0, boss.hp / boss.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(bx-8, by-16, bw+16, 38);
    ctx.fillStyle = '#EEF6FF';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(boss.bossName || ENEMY_DEFS[boss.type].name, w/2, by-5);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(bx, by, bw, 10);
    ctx.fillStyle = '#FF3355';
    ctx.fillRect(bx, by, bw*hpRatio, 10);
    if (boss.shield > 0 && boss.maxShield > 0) {
      ctx.fillStyle = 'rgba(79,168,255,0.9)';
      ctx.fillRect(bx, by-4, bw*(boss.shield/boss.maxShield), 3);
    }
    ctx.strokeStyle = '#5A2030';
    ctx.strokeRect(bx, by, bw, 10);
    // phase pips
    const phases = boss.type === ET.TITAN ? ['ARMORED ADVANCE','ENERGY SHIELD','FINAL PUSH'] : ['THE ADVANCE','REINFORCEMENTS','CORE ANNIHILATION'];
    const pipW = 9;
    for (let i=0;i<3;i++) {
      const px = bx + i*(pipW+4);
      ctx.fillStyle = boss.bossPhase > i ? '#FFB547' : 'rgba(255,255,255,0.15)';
      ctx.fillRect(px, by+13, pipW, 5);
    }
    ctx.fillStyle = '#FFB547';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(phases[Math.min(2, boss.bossPhase-1)], bx + 3*13 + 8, by+18);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8496B5';
    ctx.fillText(`${Math.round(boss.hp)}`, bx+bw, by+18);
  }

  drawAnnouncements(ctx:CanvasRenderingContext2D, w:number, h:number) {
    let y = h * 0.30;
    for (const a of this.announcements.slice(0, 2)) {
      const fadeIn = Math.min(1, a.t / 0.25);
      const fadeOut = Math.min(1, (a.dur - a.t) / 0.4);
      const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
      const pop = a.big ? 1 + 0.08 * Math.max(0, 1 - a.t / 0.25) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.translate(w/2, y);
      ctx.scale(pop, pop);
      if (a.big) {
        ctx.font = 'bold 30px monospace';
        ctx.shadowColor = a.color;
        ctx.shadowBlur = 18;
      } else {
        ctx.font = 'bold 17px monospace';
        ctx.shadowColor = a.color;
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = a.color;
      ctx.fillText(a.title, 0, 0);
      ctx.shadowBlur = 0;
      if (a.sub) {
        ctx.font = '13px monospace';
        ctx.fillStyle = 'rgba(238,246,255,0.85)';
        ctx.fillText(a.sub, 0, 22);
      }
      ctx.restore();
      y += a.big ? 70 : 54;
    }
  }

  getSelectedTower() { return this.selectedTowerId ? this.towers.find(t=>t.id===this.selectedTowerId) || null : null; }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexCornersArr(cx:number, cy:number, R:number) {
  const pts: {x:number;y:number}[] = [];
  for (let i=0;i<6;i++){ const a=(Math.PI/180)*(60*i-30); pts.push({x:cx+R*Math.cos(a), y:cy+R*Math.sin(a)}); }
  return pts;
}

function hexToRgb(hex: string): [number,number,number] {
  const h = hex.replace('#','');
  const v = parseInt(h.length===3 ? h.split('').map(c=>c+c).join('') : h, 16);
  return [(v>>16)&255, (v>>8)&255, v&255];
}

function lerpColor(a: string, b: string, t: number): string {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  const r = Math.round(ca[0]+(cb[0]-ca[0])*t);
  const g = Math.round(ca[1]+(cb[1]-ca[1])*t);
  const bl = Math.round(ca[2]+(cb[2]-ca[2])*t);
  return `rgb(${r},${g},${bl})`;
}

function hexA(hex: string, alpha: number): string {
  if (hex.startsWith('rgb')) return hex;
  const [r,g,b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
