export type Vec2 = { x: number; y: number };
export type Axial = { q: number; r: number };

export enum GameState {
  BOOT = 'BOOT',
  MAIN_MENU = 'MAIN_MENU',
  BUILD_PHASE = 'BUILD_PHASE',
  COMBAT_PHASE = 'COMBAT_PHASE',
  PAUSED = 'PAUSED',
  VICTORY = 'VICTORY',
  GAME_OVER = 'GAME_OVER',
  SETTINGS = 'SETTINGS',
  LEADERBOARD = 'LEADERBOARD',
  HOW_TO = 'HOW_TO'
}

export enum Difficulty { ROOKIE = 'ROOKIE', COMMANDER = 'COMMANDER', NIGHTMARE = 'NIGHTMARE' }
export enum TileType { NORMAL = 'NORMAL', OCCUPIED = 'OCCUPIED', ROUTE = 'ROUTE', CORE = 'CORE', PORTAL = 'PORTAL', RESTRICTED = 'RESTRICTED' }
export enum TowerType { BOLT = 'BOLT', CRYO = 'CRYO', ARC = 'ARC', RAIL = 'RAIL', NOVA = 'NOVA', AMP = 'AMP' }
export enum TargetMode { FIRST = 'FIRST', LAST = 'LAST', STRONG = 'STRONG', WEAK = 'WEAK', FAST = 'FAST' }
export enum EnemyType { SCOUT = 'SCOUT', BRUISER = 'BRUISER', DASHER = 'DASHER', SWARMER = 'SWARMER', SHIELD = 'SHIELD', SPLITTER = 'SPLITTER', DISRUPTOR = 'DISRUPTOR', TITAN = 'TITAN', BOSS = 'BOSS' }

export interface TowerStats {
  type: TowerType;
  name: string;
  color: string;
  cost: number;
  damage: number;
  interval: number;
  range: number;          // in hex cells
  blast?: number;         // hex cells
  chain?: number;
  chainFalloff?: number;
  slow?: number;          // 0..1 fraction removed
  slowDur?: number;
  unlockWave: number;     // campaign wave at which the tower becomes purchasable
  lesson: string;         // one-sentence explanation shown on unlock
}

export interface TowerInstance {
  id: number;
  type: TowerType;
  q: number; r: number;
  level: number; // 1..3
  spec: 0 | 1 | 2; // 0 none, 1/2 specialization choice at level3
  targetMode: TargetMode;
  cooldown: number;
  angle: number;
  kills: number;
  damageDealt: number;
  buffed: boolean;
  lastFire: number;
  charge: number; // for rail
  builtAt?: number;    // construction animation timestamp
  disrupted?: number;  // disruptor debuff timer (seconds)
  // specialization flags
  specRapid?: boolean;
  specPierce?: boolean;
  specChain?: boolean;
  specOvercharge?: boolean;
  specDeepFreeze?: boolean;
  specFrostField?: boolean;
  specArmorPierce?: boolean;
  specPrecision?: boolean;
  specWideBlast?: boolean;
  specPlasmaBurn?: boolean;
  specExtendedField?: boolean;
  specReactorLink?: boolean;
}

export interface EnemyInstance {
  id: number;
  type: EnemyType;
  x: number; y: number;
  hp: number; maxHp: number;
  shield: number; maxShield: number;
  speed: number; baseSpeed: number;
  route: Axial[];
  routeIndex: number;
  progress: number; // 0..1 along current segment
  slowTimer: number;
  slowFactor: number;
  leakDamage: number;
  reward: number;
  scoreReward: number;
  radius: number;
  angle: number;
  alive: boolean;
  dying: boolean;
  deathTimer: number;
  fragments: { x:number;y:number;vx:number;vy:number;life:number;rot?:number }[];
  disruptTimer: number;
  disruptPulse: number;     // countdown to next disruption pulse
  bossPhase: number;        // 0 = none, 1..3
  splitDone: boolean;
  escortSpawned: boolean;
  shieldTimer: number;
  shieldChargeTimer: number; // boss shield charge telegraph
  bossStopTimer: number;     // Null Archon phase-2 deployment stop
  plateRot: number;          // boss armor ring rotation
  hitFlash: number;          // white flash on damage
  armor: number;
  dotTimer: number;
  dotDps: number;
  isBoss: boolean;
  bossName?: string;
  lastHitTowerId?: number;
}

export interface Projectile {
  id?: number;
  kind: 'bolt'|'arc'|'cryo'|'rail'|'plasma';
  x: number; y: number;
  vx: number; vy: number;
  targetId: number | null;
  sourceTowerId?: number;
  damage: number;
  speed: number;
  life: number;
  maxLife: number;
  color: string;
  radius: number;
  splash?: number;
  chain?: number;
  chainFalloff?: number;
  slow?: number;
  slowDur?: number;
  dot?: number;
  dotDur?: number;
  pierce?: boolean;
  pierceLeft?: number;
  hitIds: Set<number>;
  trail: { x:number;y:number }[];
  // rail beam
  beam?: { x1:number;y1:number;x2:number;y2:number; life:number; maxLife:number };
  // plasma
  exploded?: boolean;
}

export interface Particle {
  x:number; y:number; vx:number; vy:number;
  life:number; maxLife:number;
  size:number; color:string; alpha:number;
  drag:number; gravity:number;
  rot:number; rotSpeed:number;
  shape:'circle'|'rect'|'spark'|'ring';
}

export interface AbilityState { cooldown:number; active:number; }

export interface RunStats {
  towersBuilt: number;
  energyEarned: number;
  bestCombo: number;
  startTime: number;    // game time at run start (seconds)
}

export interface SaveData {
  version: number;
  wave: number;
  integrity: number;
  energy: number;
  score: number;
  difficulty: Difficulty;
  towers: { type:TowerType; q:number; r:number; level:number; spec:number; targetMode:TargetMode; kills:number; damageDealt:number; specFlags: any }[];
  cooldowns: { emp:number; orbital:number; overdrive:number };
  overdriveActive: number;
  bestCombo: number;
  mode: 'campaign'|'endless';
  endlessWave: number;
  unlockedTowers: TowerType[];
  routesUnlocked: number;
  stats: RunStats;
  timestamp: number;
}

export interface LeaderboardEntry {
  rank?: number;
  name: string;
  score: number;
  wave: number;
  difficulty: string;
  mode: string;
  date: string;
}

export interface Settings {
  sfxVolume: number;
  musicVolume: number;
  masterVolume: number;
  uiVolume: number;
  muted: boolean;
  audioQuality: 'low'|'standard'|'high';
  quality: 'low'|'medium'|'high';
  reducedMotion: boolean;
  showFps: boolean;
  difficulty: Difficulty;
}
