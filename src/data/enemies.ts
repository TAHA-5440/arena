import type { EnemyType } from '../types/game';
import { EnemyType as E } from '../types/game';

export interface EnemyDef {
  type: EnemyType;
  name: string;
  hp: number;
  shield: number;
  speed: number;   // hex-path segments per second
  radius: number;  // pixels
  leakDamage: number;
  reward: number;
  score: number;
  color: string;
  armor: number;
  heavy: boolean;
  desc: string;
}

/** Enemy roster. Speeds are hex-path segments per second (see level design spec). */
export const ENEMY_DEFS: Record<EnemyType, EnemyDef> = {
  [E.SCOUT]:     { type:E.SCOUT,     name:'Scout',        hp:26,  shield:0,  speed:0.90, radius:9,  leakDamage:1, reward:8,   score:10,  color:'#FF536A', armor:0, heavy:false, desc:'Light skirmisher. Arrives in steady streams.' },
  [E.BRUISER]:   { type:E.BRUISER,   name:'Bruiser',      hp:130, shield:0,  speed:0.52, radius:14, leakDamage:2, reward:18,  score:35,  color:'#FF8C42', armor:3, heavy:true,  desc:'Slow armored hull. Soaks up light fire.' },
  [E.DASHER]:    { type:E.DASHER,    name:'Dasher',       hp:34,  shield:0,  speed:1.32, radius:8,  leakDamage:1, reward:11,  score:20,  color:'#FFD166', armor:0, heavy:false, desc:'Very fast interceptor. Cryo slows it down.' },
  [E.SWARMER]:   { type:E.SWARMER,   name:'Swarmer',      hp:17,  shield:0,  speed:1.16, radius:6,  leakDamage:1, reward:4,   score:5,   color:'#FF6B9D', armor:0, heavy:false, desc:'Dense clusters. Area weapons shred them.' },
  [E.SHIELD]:    { type:E.SHIELD,    name:'Shield Guard', hp:92,  shield:65, speed:0.68, radius:12, leakDamage:2, reward:22,  score:40,  color:'#4FA8FF', armor:2, heavy:true,  desc:'Energy barrier absorbs damage before the hull.' },
  [E.SPLITTER]:  { type:E.SPLITTER,  name:'Splitter',     hp:68,  shield:0,  speed:0.82, radius:11, leakDamage:1, reward:13,  score:18,  color:'#B36BFF', armor:0, heavy:true,  desc:'Breaks into two smaller units when destroyed.' },
  [E.DISRUPTOR]: { type:E.DISRUPTOR, name:'Disruptor',    hp:90,  shield:0,  speed:0.74, radius:12, leakDamage:1, reward:16,  score:25,  color:'#FF4F9D', armor:1, heavy:true,  desc:'Periodically disrupts nearby tower fire rates.' },
  [E.TITAN]:     { type:E.TITAN,     name:'Iron Colossus',hp:1750,shield:0,  speed:0.40, radius:22, leakDamage:6, reward:240, score:1200,color:'#FF3355', armor:5, heavy:true,  desc:'Act II boss. Armored advance, energy shield, final push.' },
  [E.BOSS]:      { type:E.BOSS,      name:'The Null Archon', hp:3000, shield:0, speed:0.35, radius:30, leakDamage:10, reward:600, score:3000, color:'#FF2244', armor:5, heavy:true, desc:'Final boss. Deploys drones and annihilates on approach.' },
};

/** Smaller unit spawned when a Splitter is destroyed. */
export const SPLIT_CHILD = {
  hp: 14, speed: 1.22, radius: 6, leakDamage: 1, reward: 3, score: 5, color: '#C89BFF',
};

export const ENEMY_ORDER: EnemyType[] = [E.SCOUT, E.BRUISER, E.DASHER, E.SWARMER, E.SHIELD, E.SPLITTER, E.DISRUPTOR, E.TITAN, E.BOSS];
