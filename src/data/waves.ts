import type { EnemyType, Difficulty } from '../types/game';
import { EnemyType as E } from '../types/game';
import { BALANCE } from './balance';

// ---------------------------------------------------------------------------
// Wave definition schema — data-driven, editable without touching the engine.
// Portals/routes: 0 = Route A (Western), 1 = Route B (Northeast), 2 = Route C (Southeast)
// ---------------------------------------------------------------------------

export interface SpawnGroup {
  type: EnemyType;
  count: number;
  portal: number;
  interval: number; // seconds between spawns inside the group
  start: number;    // seconds after wave start
  hpMul?: number;
  speedMul?: number;
  rewardMul?: number;
}

export interface BossPlan {
  type: EnemyType;
  name: string;
  portal: number;
  start: number; // seconds after wave start (after the intro sequence)
}

export interface WaveCallout { title: string; sub?: string; }

export interface WaveDef {
  number: number;
  act: 1 | 2 | 3 | 4;
  title: string;
  groups: SpawnGroup[];
  boss?: BossPlan;
  activateRoute?: number;      // route index that comes online when this wave begins
  callouts?: WaveCallout[];    // first-time mechanic messages (non-blocking banners)
  endless?: boolean;
}

// ---------------------------------------------------------------------------
// Acts & routes
// ---------------------------------------------------------------------------

export interface ActInfo { n: 1|2|3|4; name: string; tagline: string; primary: string; accent: string; bgA: string; bgB: string; }

export const ACTS: ActInfo[] = [
  { n:1, name:'FIRST CONTACT', tagline:'Learn basic defense',            primary:'#00E5FF', accent:'#37F0FF', bgA:'#060B18', bgB:'#0B1530' },
  { n:2, name:'THE SIEGE',     tagline:'Multi-lane warfare',             primary:'#FFB547', accent:'#FFD07A', bgA:'#0B0C10', bgB:'#1C1608' },
  { n:3, name:'SYSTEM BREACH', tagline:'Complex enemy abilities',        primary:'#B36BFF', accent:'#FF4F9D', bgA:'#0A0714', bgB:'#1A0E2A' },
  { n:4, name:'LAST STAND',    tagline:'Full strategic challenge',       primary:'#FF3355', accent:'#8A2BE2', bgA:'#100608', bgB:'#220A18' },
];

export function actForWave(n: number): 1|2|3|4 {
  if (n <= 5) return 1;
  if (n <= 10) return 2;
  if (n <= 15) return 3;
  return 4;
}

/** How many routes are active for a given campaign wave number. */
export function routesForWave(n: number): 1|2|3 {
  if (n >= 6) return 3;
  if (n >= 2) return 2;
  return 1;
}

export const ROUTE_NAMES = ['WESTERN APPROACH', 'NORTHEAST APPROACH', 'SOUTHEAST APPROACH'];

/** Wave completion energy: 40 + 8 x wave number. */
export function waveBonusEnergy(n: number): number { return 40 + 8 * n; }

// ---------------------------------------------------------------------------
// The authored 20-wave campaign
// ---------------------------------------------------------------------------

const W = (number: number, act: 1|2|3|4, title: string, groups: SpawnGroup[], extra: Partial<WaveDef> = {}): WaveDef =>
  ({ number, act, title, groups, ...extra });

const g = (type: EnemyType, count: number, portal: number, interval: number, start: number): SpawnGroup =>
  ({ type, count, portal, interval, start });

export const WAVES: WaveDef[] = [
  // ----- ACT I — FIRST CONTACT -----
  W(1, 1, 'THE FIRST SIGNAL', [
    g(E.SCOUT, 5, 0, 1.8, 0),
  ]),
  W(2, 1, 'SECOND BREACH', [
    g(E.SCOUT, 7, 0, 1.45, 0),
    g(E.SCOUT, 4, 1, 1.45, 4),
  ], { activateRoute: 1, callouts: [{ title: 'NEW ENEMY APPROACH DETECTED', sub: 'Northeast portal online' }] }),
  W(3, 1, 'HEAVY CONTACT', [
    g(E.SCOUT, 7, 0, 1.35, 0),
    g(E.BRUISER, 3, 1, 2.2, 2),
  ], { callouts: [{ title: 'ARMORED UNITS DETECTED', sub: 'Bruisers are slow but durable — stack your fire' }] }),
  W(4, 1, 'SPEED BREAKERS', [
    g(E.SCOUT, 5, 0, 1.35, 0),
    g(E.DASHER, 6, 1, 1.25, 1),
  ], { callouts: [{ title: 'FAST UNIT INBOUND', sub: 'Cryo towers can slow it down' }] }),
  W(5, 1, 'SWARM ATTACK', [
    g(E.SWARMER, 4, 0, 0.65, 0),
    g(E.SWARMER, 4, 1, 0.65, 2),
    g(E.BRUISER, 2, 1, 2.2, 4),
    g(E.SWARMER, 4, 0, 0.52, 10),
    g(E.SWARMER, 4, 1, 0.52, 11),
  ], { callouts: [{ title: 'SWARM FORMATION', sub: 'Grouped targets — chain and blast weapons shine' }] }),

  // ----- ACT II — THE SIEGE -----
  W(6, 2, 'THIRD FRONT', [
    g(E.SCOUT, 9, 2, 1.35, 0),
    g(E.SWARMER, 8, 0, 0.65, 1),
  ], { activateRoute: 2, callouts: [{ title: 'THIRD PORTAL ONLINE', sub: 'Southeast approach active — all routes exposed' }] }),
  W(7, 2, 'SHIELD PROTOCOL', [
    g(E.SHIELD, 4, 1, 2.2, 0),
    g(E.DASHER, 7, 2, 1.25, 2),
  ], { callouts: [{ title: 'SHIELDED ENEMY', sub: 'Break its energy barrier first — rail guns excel' }] }),
  W(8, 2, 'THREE-FRONT ATTACK', [
    g(E.BRUISER, 5, 0, 2.2, 0),
    g(E.SCOUT, 8, 1, 1.35, 0),
    g(E.SWARMER, 7, 2, 0.62, 1),
  ]),
  W(9, 2, 'CHAIN REACTION', [
    g(E.SPLITTER, 4, 2, 2.2, 0),
    g(E.SCOUT, 6, 0, 1.35, 0),
    g(E.SHIELD, 3, 1, 2.2, 2),
  ], { callouts: [{ title: 'SPLITTER DETECTED', sub: 'Destroys into two smaller units' }] }),
  W(10, 2, 'IRON COLOSSUS', [
    g(E.SWARMER, 10, 1, 0.58, 2),
    g(E.BRUISER, 4, 2, 2.2, 3),
  ], {
    boss: { type: E.TITAN, name: 'IRON COLOSSUS', portal: 0, start: 4 },
    callouts: [{ title: 'WARNING — MASSIVE HOSTILE SIGNATURE', sub: 'Armored advance on the western route' }],
  }),

  // ----- ACT III — SYSTEM BREACH -----
  W(11, 3, 'REINFORCEMENT PROTOCOL', [
    g(E.DASHER, 7, 0, 1.22, 0),
    g(E.SCOUT, 8, 1, 1.35, 1),
    g(E.SHIELD, 4, 2, 2.2, 2),
  ]),
  W(12, 3, 'SIGNAL JAMMERS', [
    g(E.DISRUPTOR, 3, 1, 2.7, 0),
    g(E.SCOUT, 9, 0, 1.3, 1),
    g(E.BRUISER, 4, 2, 2.2, 2),
  ], { callouts: [{ title: 'DISRUPTOR DETECTED', sub: 'Temporarily weakens nearby towers — watch the warning ring' }] }),
  W(13, 3, 'REPLICATION SWARM', [
    g(E.SPLITTER, 5, 0, 2.1, 0),
    g(E.DASHER, 9, 1, 1.22, 5),
    g(E.SWARMER, 8, 2, 0.62, 8),
  ]),
  W(14, 3, 'ARMORED FORMATION', [
    g(E.SHIELD, 5, 0, 2.4, 0),
    g(E.BRUISER, 6, 1, 2.2, 1),
    g(E.SWARMER, 12, 2, 0.58, 2),
  ]),
  W(15, 3, 'FORTRESS BREAKER', [
    // Three distinct pulses: disruption -> splitting -> fast attack
    g(E.DISRUPTOR, 4, 0, 2.7, 0),
    g(E.SPLITTER, 4, 1, 2.2, 7),
    g(E.DASHER, 10, 2, 1.22, 14),
  ]),

  // ----- ACT IV — LAST STAND -----
  W(16, 4, 'TOTAL ENGAGEMENT', [
    g(E.SHIELD, 7, 2, 2.2, 0),
    g(E.SWARMER, 13, 0, 0.58, 0),
    g(E.BRUISER, 6, 1, 2.05, 1),
  ]),
  W(17, 4, 'CASCADE FAILURE', [
    g(E.SPLITTER, 6, 0, 2.1, 0),
    g(E.DISRUPTOR, 4, 1, 2.7, 1),
    g(E.SCOUT, 12, 2, 1.3, 2),
  ]),
  W(18, 4, 'HIGH-SPEED ASSAULT', [
    g(E.BRUISER, 7, 1, 2.1, 0),
    g(E.DASHER, 10, 2, 1.22, 1),
    g(E.SHIELD, 6, 0, 2.3, 0),
  ]),
  W(19, 4, 'FINAL WARNING', [
    g(E.DISRUPTOR, 5, 0, 2.7, 0),
    g(E.SWARMER, 5, 2, 0.7, 3),
    g(E.SPLITTER, 7, 1, 2.2, 6),
    g(E.SWARMER, 6, 2, 0.58, 10),
    g(E.SWARMER, 6, 2, 0.5, 16),
  ]),
  W(20, 4, 'THE NULL ARCHON', [
    g(E.SHIELD, 8, 1, 2.2, 2),
    g(E.DASHER, 9, 0, 1.22, 3),
  ], {
    boss: { type: E.BOSS, name: 'THE NULL ARCHON', portal: 2, start: 5 },
    callouts: [{ title: 'FINAL CORE ASSAULT', sub: 'All portals pulsing — hold the line' }],
  }),
];

export function getWaveDef(n: number): WaveDef | undefined {
  return WAVES.find(w => w.number === n);
}

/** Which portals a wave attacks from, with enemy counts (next-wave intel). */
export function wavePortalCounts(def: WaveDef): { portal: number; count: number }[] {
  const m = new Map<number, number>();
  for (const g of def.groups) m.set(g.portal, (m.get(g.portal) || 0) + g.count);
  if (def.boss && !def.endless) m.set(def.boss.portal, (m.get(def.boss.portal) || 0) + 1);
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([portal, count]) => ({ portal, count }));
}

// ---------------------------------------------------------------------------
// Difficulty scaling
// ---------------------------------------------------------------------------

export interface DiffMul { hp: number; speed: number; reward: number; }

export function difficultyMul(diff: Difficulty): DiffMul {
  return BALANCE.difficulty[diff] ?? BALANCE.difficulty.COMMANDER;
}

export function scaleGroups(groups: SpawnGroup[], hp: number, speed: number, reward: number): SpawnGroup[] {
  return groups.map(gr => ({
    ...gr,
    hpMul: (gr.hpMul || 1) * hp,
    speedMul: (gr.speedMul || 1) * speed,
    rewardMul: (gr.rewardMul || 1) * reward,
  }));
}

// ---------------------------------------------------------------------------
// Endless mode — controlled procedural compositions (wave 21+)
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HEAVY = new Set<EnemyType>([E.BRUISER, E.SHIELD, E.SPLITTER, E.DISRUPTOR]);

interface LaneTemplate { type: EnemyType; count: number; interval: number; start: number; }

const LANE_TEMPLATES: LaneTemplate[][] = [
  [{ type: E.SCOUT, count: 8, interval: 1.4, start: 0 }],
  [{ type: E.SWARMER, count: 10, interval: 0.65, start: 0 }],
  [{ type: E.DASHER, count: 7, interval: 1.3, start: 0 }],
  [{ type: E.BRUISER, count: 4, interval: 2.4, start: 0 }],
  [{ type: E.SHIELD, count: 3, interval: 2.6, start: 0 }],
  [{ type: E.SPLITTER, count: 3, interval: 2.3, start: 0 }],
  [{ type: E.DISRUPTOR, count: 2, interval: 3.0, start: 0 }],
  [{ type: E.SCOUT, count: 5, interval: 1.4, start: 0 }, { type: E.SWARMER, count: 6, interval: 0.7, start: 4 }],
  [{ type: E.BRUISER, count: 2, interval: 2.4, start: 0 }, { type: E.DASHER, count: 4, interval: 1.3, start: 3 }],
  [{ type: E.SHIELD, count: 2, interval: 2.6, start: 0 }, { type: E.SWARMER, count: 6, interval: 0.7, start: 2 }],
  [{ type: E.SPLITTER, count: 2, interval: 2.3, start: 0 }, { type: E.SCOUT, count: 6, interval: 1.3, start: 4 }],
  [{ type: E.DISRUPTOR, count: 2, interval: 3.0, start: 0 }, { type: E.DASHER, count: 5, interval: 1.3, start: 3 }],
];

const BOSS_SUPPORT: LaneTemplate[][] = [
  [{ type: E.SWARMER, count: 8, interval: 0.7, start: 2 }],
  [{ type: E.BRUISER, count: 3, interval: 2.5, start: 3 }],
  [{ type: E.DASHER, count: 6, interval: 1.3, start: 4 }],
  [{ type: E.SHIELD, count: 3, interval: 2.5, start: 2 }],
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Build the wave definition for an endless wave (21+).
 * - Compositions are procedural but constrained (spawn gaps, heavy caps).
 * - A boss recurs every 5th endless wave, alternating Colossus / Archon.
 * - Deterministic for a given (seed, waveNum).
 */
export function generateEndlessWave(waveNum: number, difficulty: Difficulty, seed: number): WaveDef {
  const level = Math.max(1, waveNum - 20);
  const rng = mulberry32((seed ^ (waveNum * 0x9E3779B1)) >>> 0);
  const dm = difficultyMul(difficulty);
  const hpMul = (1 + 0.09 * level) * dm.hp * (1 + Math.min(0.55, level * 0.012));
  const speedMul = Math.min(1.35, (1 + 0.02 * level)) * dm.speed;
  const rewardMul = (1 + 0.05 * level) * dm.reward;
  const isBoss = waveNum % 5 === 0;

  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

  let groups: SpawnGroup[] = [];
  let boss: BossPlan | undefined;

  if (isBoss) {
    const bossType = (Math.floor(waveNum / 5) % 2 === 1) ? E.TITAN : E.BOSS;
    const bossPlan: BossPlan = {
      type: bossType,
      name: bossType === E.TITAN ? 'IRON COLOSSUS MK.' + Math.floor(waveNum / 10) : 'NULL ARCHON ECHO',
      portal: Math.floor(rng() * 3),
      start: 4,
    };
    boss = bossPlan;
    const lanes = [0, 1, 2].filter(l => l !== bossPlan.portal);
    for (const lane of lanes) {
      const row = pick(BOSS_SUPPORT);          // LaneTemplate[]
      const t = pick(row);                     // LaneTemplate
      const scale = clamp(1 + level * 0.04, 1, 1.8);
      groups.push({ type: t.type, interval: t.interval, start: t.start, portal: lane, count: Math.max(2, Math.round(t.count * scale)) });
    }
  } else {
    const countScale = clamp(1 + level * 0.05, 1, 2.0);
    const heavyCap = Math.min(12, 4 + Math.floor(level / 2));
    const totalCap = Math.min(32, 16 + level); // deliberate limit on simultaneous enemies
    let heavyTotal = 0;
    let totalLeft = totalCap;
    const laneOrder = [0, 1, 2].sort(() => rng() - 0.5);
    const startStagger = [0, 1 + Math.floor(rng() * 3), 3 + Math.floor(rng() * 4)];
    for (let i = 0; i < 3; i++) {
      const lane = laneOrder[i];
      const tmpl = pick(LANE_TEMPLATES);
      for (const part of tmpl) {
        let count = Math.max(1, Math.round(part.count * countScale * (0.8 + rng() * 0.4)));
        count = Math.min(count, Math.max(0, totalLeft));
        totalLeft -= count;
        if (HEAVY.has(part.type)) {
          const room = heavyCap - heavyTotal;
          count = Math.min(count, Math.max(0, room));
          heavyTotal += count;
        }
        if (count > 0) {
          groups.push({
            type: part.type, count, portal: lane,
            interval: clamp(part.interval * (0.95 + rng() * 0.1), 0.45, 3.5),
            start: part.start + startStagger[i],
          });
        }
      }
    }
  }

  groups = scaleGroups(groups, hpMul, speedMul, rewardMul);
  if (boss) {
    // Boss HP scales with the endless level on top of group scaling.
    groups.push({
      type: boss.type, count: 1, portal: boss.portal, interval: 1, start: boss.start,
      hpMul: (1 + 0.06 * level) * dm.hp, speedMul: dm.speed, rewardMul: 1 + 0.05 * level,
    });
  }

  return {
    number: waveNum,
    act: 4,
    title: isBoss ? `ENDLESS boss — ${boss!.name}` : `ENDLESS ASSAULT ${waveNum}`,
    groups,
    boss,
    endless: true,
  };
}
