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
  [E.SCOUT]:     { type:E.SCOUT,     name:'Scout',        hp:26,  shield:0,  speed:0.90, radius:9,  leakDamage:1, reward:9,   score:10,  color:'#FF536A', armor:0, heavy:false, desc:'Light skirmisher. Arrives in steady streams.' },
  [E.BRUISER]:   { type:E.BRUISER,   name:'Bruiser',      hp:115, shield:0,  speed:0.50, radius:14, leakDamage:2, reward:20,  score:35,  color:'#FF8C42', armor:2, heavy:true,  desc:'Slow armored hull. Soaks up light fire.' },
  [E.DASHER]:    { type:E.DASHER,    name:'Dasher',       hp:30,  shield:0,  speed:1.30, radius:8,  leakDamage:1, reward:12,  score:20,  color:'#FFD166', armor:0, heavy:false, desc:'Very fast interceptor. Cryo slows it down.' },
  [E.SWARMER]:   { type:E.SWARMER,   name:'Swarmer',      hp:15,  shield:0,  speed:1.10, radius:6,  leakDamage:1, reward:5,   score:5,   color:'#FF6B9D', armor:0, heavy:false, desc:'Dense clusters. Area weapons shred them.' },
  [E.SHIELD]:    { type:E.SHIELD,    name:'Shield Guard', hp:80,  shield:55, speed:0.65, radius:12, leakDamage:2, reward:24,  score:40,  color:'#4FA8FF', armor:1, heavy:true,  desc:'Energy barrier absorbs damage before the hull.' },
  [E.SPLITTER]:  { type:E.SPLITTER,  name:'Splitter',     hp:58,  shield:0,  speed:0.75, radius:11, leakDamage:1, reward:14,  score:18,  color:'#B36BFF', armor:0, heavy:true,  desc:'Breaks into two smaller units when destroyed.' },
  [E.DISRUPTOR]: { type:E.DISRUPTOR, name:'Disruptor',    hp:78,  shield:0,  speed:0.70, radius:12, leakDamage:1, reward:18,  score:25,  color:'#FF4F9D', armor:0, heavy:true,  desc:'Periodically disrupts nearby tower fire rates.' },
  [E.TITAN]:     { type:E.TITAN,     name:'Iron Colossus',hp:1500,shield:0,  speed:0.38, radius:22, leakDamage:5, reward:260, score:1200,color:'#FF3355', armor:4, heavy:true,  desc:'Act II boss. Armored advance, energy shield, final push.' },
  [E.BOSS]:      { type:E.BOSS,      name:'The Null Archon', hp:2800, shield:0, speed:0.34, radius:30, leakDamage:10, reward:650, score:3000, color:'#FF2244', armor:4, heavy:true, desc:'Final boss. Deploys drones and annihilates on approach.' },
};

/** Smaller unit spawned when a Splitter is destroyed. */
export const SPLIT_CHILD = {
  hp: 12, speed: 1.15, radius: 6, leakDamage: 1, reward: 3, score: 5, color: '#C89BFF',
};

export const ENEMY_ORDER: EnemyType[] = [E.SCOUT, E.BRUISER, E.DASHER, E.SWARMER, E.SHIELD, E.SPLITTER, E.DISRUPTOR, E.TITAN, E.BOSS];
