import type { TowerStats, TowerType } from '../types/game';
import { TowerType as T } from '../types/game';

/** Tower stats. `range` is measured in hex cells. */
export const TOWER_DEFS: Record<TowerType, TowerStats> = {
  [T.BOLT]: { type:T.BOLT, name:'Bolt Sentinel', color:'#00E5FF', cost:50, damage:9, interval:0.42, range:2.6, unlockWave:1, lesson:'Fast, reliable single-target bolts — your first line of defense.' },
  [T.CRYO]: { type:T.CRYO, name:'Cryo Node', color:'#7FDFFF', cost:85, damage:4, interval:0.75, range:2.4, slow:0.35, slowDur:1.8, unlockWave:3, lesson:'Chills enemies so they crawl — every other tower gets more time to fire.' },
  [T.ARC]:  { type:T.ARC,  name:'Arc Conductor', color:'#9B6CFF', cost:90, damage:13, interval:1.05, range:2.4, chain:2, chainFalloff:0.65, unlockWave:5, lesson:'Electricity jumps between grouped enemies — punishes tight formations.' },
  [T.RAIL]: { type:T.RAIL, name:'Rail Lancer', color:'#FF4F9D', cost:120, damage:42, interval:1.8, range:4.4, unlockWave:7, lesson:'Long-range precision rail beam — made for Bruisers, Shields and bosses.' },
  [T.NOVA]: { type:T.NOVA, name:'Nova Mortar', color:'#FFB547', cost:140, damage:20, interval:1.5, range:2.3, blast:0.8, unlockWave:9, lesson:'Explosive area damage — ideal against swarms and splitting enemies.' },
  [T.AMP]:  { type:T.AMP,  name:'Amplifier Pylon', color:'#54F7C5', cost:115, damage:0, interval:0, range:2.3, unlockWave:11, lesson:'Boosts the fire rate of every tower in range — multiply your defense.' },
};

/** Shop order matches the campaign unlock sequence. */
export const TOWER_ORDER: TowerType[] = [T.BOLT, T.CRYO, T.ARC, T.RAIL, T.NOVA, T.AMP];

export const TOWER_DESC: Record<TowerType,string> = {
  [T.BOLT]: 'Fast single-target bolts.',
  [T.CRYO]: 'Slows enemies with cold energy.',
  [T.ARC]: 'Chain lightning to nearby targets.',
  [T.RAIL]: 'Long-range precision rail beam.',
  [T.NOVA]: 'Explosive area damage.',
  [T.AMP]: 'Boosts nearby tower fire rate.',
};

export const TOWER_SPECS: Record<TowerType, [string, string]> = {
  [T.BOLT]: ['Rapid Chamber', 'Piercing Bolts'],
  [T.CRYO]: ['Deep Freeze', 'Frost Field'],
  [T.ARC]: ['Storm Chain', 'Overcharge'],
  [T.RAIL]: ['Armor Pierce', 'Precision Core'],
  [T.NOVA]: ['Wide Blast', 'Plasma Burn'],
  [T.AMP]: ['Extended Field', 'Reactor Link'],
};

export function towerUnlockWaves(): Record<TowerType, number> {
  const out = {} as Record<TowerType, number>;
  for (const t of TOWER_ORDER) out[t] = TOWER_DEFS[t].unlockWave;
  return out;
}
