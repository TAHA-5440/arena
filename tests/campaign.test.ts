import { describe, it, expect } from 'vitest';
import { WAVES, getWaveDef, actForWave, routesForWave, waveBonusEnergy, generateEndlessWave, wavePortalCounts } from '../src/data/waves';
import { TOWER_DEFS, TOWER_ORDER } from '../src/data/towers';
import { EnemyType as E, TowerType as T, Difficulty as D } from '../src/types/game';

// The authored campaign spec: per wave, enemy counts by type and route.
// Route keys: 0 = A (west), 1 = B (northeast), 2 = C (southeast)
type Spec = Record<number, Partial<Record<EnemyType, Partial<Record<0|1|2, number>>>>>;

const SPEC: Spec = {
  1:  { [E.SCOUT]: { 0: 5 } },
  2:  { [E.SCOUT]: { 0: 7, 1: 4 } },
  3:  { [E.SCOUT]: { 0: 7 }, [E.BRUISER]: { 1: 3 } },
  4:  { [E.DASHER]: { 1: 6 }, [E.SCOUT]: { 0: 5 } },
  5:  { [E.SWARMER]: { 0: 8, 1: 8 }, [E.BRUISER]: { 1: 2 } },
  6:  { [E.SCOUT]: { 2: 9 }, [E.SWARMER]: { 0: 8 } },
  7:  { [E.SHIELD]: { 1: 4 }, [E.DASHER]: { 2: 7 } },
  8:  { [E.BRUISER]: { 0: 5 }, [E.SCOUT]: { 1: 8 }, [E.SWARMER]: { 2: 7 } },
  9:  { [E.SPLITTER]: { 2: 4 }, [E.SCOUT]: { 0: 6 }, [E.SHIELD]: { 1: 3 } },
  10: { [E.SWARMER]: { 1: 10 }, [E.BRUISER]: { 2: 4 } },
  11: { [E.DASHER]: { 0: 7 }, [E.SCOUT]: { 1: 8 }, [E.SHIELD]: { 2: 4 } },
  12: { [E.DISRUPTOR]: { 1: 3 }, [E.SCOUT]: { 0: 9 }, [E.BRUISER]: { 2: 4 } },
  13: { [E.SPLITTER]: { 0: 5 }, [E.DASHER]: { 1: 9 }, [E.SWARMER]: { 2: 8 } },
  14: { [E.SHIELD]: { 0: 5 }, [E.BRUISER]: { 1: 6 }, [E.SWARMER]: { 2: 12 } },
  15: { [E.DISRUPTOR]: { 0: 4 }, [E.SPLITTER]: { 1: 4 }, [E.DASHER]: { 2: 10 } },
  16: { [E.SHIELD]: { 2: 7 }, [E.SWARMER]: { 0: 13 }, [E.BRUISER]: { 1: 6 } },
  17: { [E.SPLITTER]: { 0: 6 }, [E.DISRUPTOR]: { 1: 4 }, [E.SCOUT]: { 2: 12 } },
  18: { [E.BRUISER]: { 1: 7 }, [E.DASHER]: { 2: 10 }, [E.SHIELD]: { 0: 6 } },
  19: { [E.DISRUPTOR]: { 0: 5 }, [E.SPLITTER]: { 1: 7 }, [E.SWARMER]: { 2: 17 } },
  20: { [E.SHIELD]: { 1: 8 }, [E.DASHER]: { 0: 9 } },
};

const INTERVAL_RANGES: Partial<Record<EnemyType, [number, number]>> = {
  [E.SCOUT]: [1.3, 1.8],
  [E.BRUISER]: [2.0, 3.0],
  [E.DASHER]: [1.2, 1.8],
  [E.SWARMER]: [0.5, 0.9],
  [E.SHIELD]: [2.0, 3.0],
  [E.SPLITTER]: [2.0, 2.8],
  [E.DISRUPTOR]: [2.5, 3.5],
};

describe('campaign wave data', () => {
  it('contains exactly 20 authored waves numbered 1..20', () => {
    expect(WAVES.length).toBe(20);
    WAVES.forEach((w, i) => expect(w.number).toBe(i + 1));
  });

  it('every wave has a title', () => {
    for (const w of WAVES) expect(w.title.length).toBeGreaterThan(3);
  });

  it('matches the designed enemy composition per wave and route', () => {
    for (const [nStr, spec] of Object.entries(SPEC)) {
      const n = Number(nStr);
      const w = getWaveDef(n)!;
      const actual: Spec[number] = {};
      for (const g of w.groups) {
        actual[g.type] = actual[g.type] || {};
        actual[g.type]![g.portal as 0|1|2] = (actual[g.type]![g.portal as 0|1|2] || 0) + g.count;
      }
      expect(actual, `wave ${n}`).toEqual(spec);
    }
  });

  it('keeps spawn intervals inside the design ranges', () => {
    for (const w of WAVES) {
      for (const g of w.groups) {
        const range = INTERVAL_RANGES[g.type];
        if (!range) continue;
        expect(g.interval, `wave ${w.wave || w.number} ${g.type}`).toBeGreaterThanOrEqual(range[0]);
        expect(g.interval, `wave ${w.number} ${g.type}`).toBeLessThanOrEqual(range[1]);
      }
    }
  });

  it('never spawns on a locked route', () => {
    for (const w of WAVES) {
      const active = routesForWave(w.number);
      for (const g of w.groups) {
        expect(g.portal, `wave ${w.number}`).toBeLessThan(active);
      }
    }
  });

  it('activates route B at wave 2 and route C at wave 6', () => {
    expect(routesForWave(1)).toBe(1);
    expect(routesForWave(2)).toBe(2);
    expect(routesForWave(5)).toBe(2);
    expect(routesForWave(6)).toBe(3);
    expect(routesForWave(20)).toBe(3);
    expect(getWaveDef(2)!.activateRoute).toBe(1);
    expect(getWaveDef(6)!.activateRoute).toBe(2);
  });

  it('maps waves to the four acts', () => {
    for (let n = 1; n <= 5; n++) expect(actForWave(n)).toBe(1);
    for (let n = 6; n <= 10; n++) expect(actForWave(n)).toBe(2);
    for (let n = 11; n <= 15; n++) expect(actForWave(n)).toBe(3);
    for (let n = 16; n <= 20; n++) expect(actForWave(n)).toBe(4);
    for (const w of WAVES) expect(w.act).toBe(actForWave(w.number));
  });

  it('stages the two boss encounters as designed', () => {
    const w10 = getWaveDef(10)!;
    expect(w10.boss).toMatchObject({ type: E.TITAN, name: 'IRON COLOSSUS', portal: 0 });
    const w20 = getWaveDef(20)!;
    expect(w20.boss).toMatchObject({ type: E.BOSS, name: 'THE NULL ARCHON', portal: 2 });
    // boss spawn is delayed past the intro sequence
    expect(w10.boss!.start).toBeGreaterThanOrEqual(4);
    expect(w20.boss!.start).toBeGreaterThanOrEqual(4);
  });

  it('unlocks towers on the designed waves (1,3,5,7,9,11)', () => {
    expect(TOWER_DEFS[T.BOLT].unlockWave).toBe(1);
    expect(TOWER_DEFS[T.CRYO].unlockWave).toBe(3);
    expect(TOWER_DEFS[T.ARC].unlockWave).toBe(5);
    expect(TOWER_DEFS[T.RAIL].unlockWave).toBe(7);
    expect(TOWER_DEFS[T.NOVA].unlockWave).toBe(9);
    expect(TOWER_DEFS[T.AMP].unlockWave).toBe(11);
    // shop order follows the unlock sequence
    const unlockWaves = TOWER_ORDER.map(t => TOWER_DEFS[t].unlockWave);
    expect(unlockWaves).toEqual([...unlockWaves].sort((a, b) => a - b));
  });

  it('uses the wave completion energy formula 40 + 8n', () => {
    expect(waveBonusEnergy(1)).toBe(48);
    expect(waveBonusEnergy(10)).toBe(120);
    expect(waveBonusEnergy(20)).toBe(200);
  });

  it('introduces each enemy type with a callout on first appearance', () => {
    const first: Partial<Record<EnemyType, number>> = {};
    for (const w of WAVES) {
      for (const g of w.groups) if (first[g.type] === undefined) first[g.type] = w.number;
      if (w.boss && first[w.boss.type] === undefined) first[w.boss.type] = w.number;
    }
    expect(first[E.BRUISER]).toBe(3);
    expect(first[E.DASHER]).toBe(4);
    expect(first[E.SWARMER]).toBe(5);
    expect(first[E.SHIELD]).toBe(7);
    expect(first[E.SPLITTER]).toBe(9);
    expect(first[E.DISRUPTOR]).toBe(12);
    expect(first[E.TITAN]).toBe(10);
    expect(first[E.BOSS]).toBe(20);
    // callouts exist on first-appearance waves for regular enemies
    for (const t of [E.BRUISER, E.DASHER, E.SWARMER, E.SHIELD, E.SPLITTER, E.DISRUPTOR] as EnemyType[]) {
      const w = getWaveDef(first[t]!)!;
      expect(w.callouts?.length, `${t} @ wave ${first[t]}`).toBeGreaterThan(0);
    }
  });
});

describe('next-wave intel (where the attack comes from)', () => {
  it('reports the attacking portals and enemy counts per wave', () => {
    expect(wavePortalCounts(getWaveDef(1)!)).toEqual([{ portal: 0, count: 5 }]);
    expect(wavePortalCounts(getWaveDef(2)!)).toEqual([{ portal: 0, count: 7 }, { portal: 1, count: 4 }]);
    expect(wavePortalCounts(getWaveDef(6)!)).toEqual([{ portal: 0, count: 8 }, { portal: 2, count: 9 }]);
    expect(wavePortalCounts(getWaveDef(10)!)).toEqual([{ portal: 0, count: 1 }, { portal: 1, count: 10 }, { portal: 2, count: 4 }]);
    expect(wavePortalCounts(getWaveDef(20)!)).toEqual([{ portal: 0, count: 9 }, { portal: 1, count: 8 }, { portal: 2, count: 1 }]);
  });

  it('includes endless bosses exactly once (they live in groups)', () => {
    const def = generateEndlessWave(25, D.COMMANDER, 42);
    const bossGroup = def.groups.filter(g => g.type === E.TITAN || g.type === E.BOSS);
    expect(bossGroup.length).toBe(1);
    expect(bossGroup[0].count).toBe(1);
    const intel = wavePortalCounts(def);
    const total = intel.reduce((m, e) => m + e.count, 0);
    const groupsTotal = def.groups.reduce((m, g) => m + g.count, 0);
    expect(total).toBe(groupsTotal);
  });
});

describe('endless mode generation', () => {
  it('is deterministic for a given seed and wave', () => {
    for (let n = 21; n <= 45; n++) {
      const a = generateEndlessWave(n, D.COMMANDER, 12345);
      const b = generateEndlessWave(n, D.COMMANDER, 12345);
      expect(a).toEqual(b);
    }
  });

  it('produces a boss every 5th endless wave, alternating types', () => {
    expect(generateEndlessWave(25, D.COMMANDER, 7).boss?.type).toBe(E.TITAN);
    expect(generateEndlessWave(30, D.COMMANDER, 7).boss?.type).toBe(E.BOSS);
    expect(generateEndlessWave(35, D.COMMANDER, 7).boss?.type).toBe(E.TITAN);
    for (const n of [21, 22, 23, 24, 26, 27, 33, 41]) {
      expect(generateEndlessWave(n, D.COMMANDER, 7).boss, `wave ${n}`).toBeUndefined();
    }
  });

  it('respects enemy count and heavy-unit limits', () => {
    const HEAVY = new Set([E.BRUISER, E.SHIELD, E.SPLITTER, E.DISRUPTOR]);
    for (let n = 21; n <= 60; n++) {
      const w = generateEndlessWave(n, D.COMMANDER, 99);
      let total = 0, heavy = 0;
      for (const g of w.groups) {
        total += g.count;
        if (HEAVY.has(g.type)) heavy += g.count;
        expect(g.interval, `wave ${n}`).toBeGreaterThanOrEqual(0.45);
        expect(g.interval).toBeLessThanOrEqual(3.5);
        expect(g.count).toBeGreaterThan(0);
        expect(g.portal).toBeLessThan(3);
      }
      expect(total, `wave ${n} total`).toBeLessThanOrEqual(40);
      expect(heavy, `wave ${n} heavy`).toBeLessThanOrEqual(12);
    }
  });

  it('scales difficulty settings', () => {
    const rookie = generateEndlessWave(22, D.ROOKIE, 5);
    const nightmare = generateEndlessWave(22, D.NIGHTMARE, 5);
    const rHp = rookie.groups.reduce((m, g) => Math.max(m, g.hpMul || 1), 0);
    const nHp = nightmare.groups.reduce((m, g) => Math.max(m, g.hpMul || 1), 0);
    expect(nHp).toBeGreaterThan(rHp);
  });
});
