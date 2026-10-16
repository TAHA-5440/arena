import { describe, it, expect } from 'vitest';
import type { Game } from '../src/Game';
import { EnemyType as E, TowerType as T, Difficulty as D, GameState as GS } from '../src/types/game';
import { getWaveDef } from '../src/data/waves';
import { BALANCE } from '../src/data/balance';

// ---------------------------------------------------------------------------
// Headless harness: a Game instance with a stubbed 2D context (update only,
// never render) running on the fixed 1/60s step.
// ---------------------------------------------------------------------------

async function createGame(): Promise<Game> {
  const canvas = document.createElement('canvas') as any;
  canvas.getContext = () => ({
    setTransform(){}, clearRect(){}, fillRect(){}, strokeRect(){}, beginPath(){}, moveTo(){},
    lineTo(){}, closePath(){}, fill(){}, stroke(){}, arc(){}, fillText(){}, save(){}, restore(){},
    translate(){}, rotate(){}, scale(){}, createLinearGradient(){return{addColorStop(){}};},
    createRadialGradient(){return{addColorStop(){}};}, drawImage(){},
  });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1024, height: 768 });
  (window as any).innerWidth = 1024;
  (window as any).innerHeight = 768;
  const { Game: G } = await import('../src/Game');
  const uiRoot = document.createElement('div');
  return new G(canvas, uiRoot);
}

function step(g: Game, seconds: number) {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) g.update(1 / 60);
}

function stepUntil(g: Game, cond: () => boolean, maxSeconds: number): boolean {
  const frames = Math.round(maxSeconds * 60);
  for (let i = 0; i < frames; i++) {
    g.update(1 / 60);
    if (cond()) return true;
  }
  return cond();
}

// ---------------------------------------------------------------------------
// A "reasonable player" auto-builder. Purchases a sensible tower layout near
// the routes, upgrades when rich, and uses commander abilities on bosses.
// ---------------------------------------------------------------------------

interface PlanItem { w: number; t: TowerType; q: number; r: number; }

const PLAN: PlanItem[] = [
  { w: 1,  t: T.BOLT, q: -1, r: -1 },  // recommended first tower (tutorial hex)
  { w: 2,  t: T.BOLT, q: 1,  r: 0 },   // covers route B end (+ future C)
  { w: 3,  t: T.CRYO, q: 0,  r: -1 },  // slow for bruisers (A+B)
  { w: 3,  t: T.BOLT, q: 1,  r: 1 },   // dasher defense, future C
  { w: 5,  t: T.ARC,  q: 1,  r: -2 },  // swarm control on B
  { w: 6,  t: T.CRYO, q: 1,  r: 2 },   // route C comes online
  { w: 7,  t: T.RAIL, q: 3,  r: -1 },  // shields on B
  { w: 8,  t: T.RAIL, q: -4, r: 0 },   // A corridor + boss prep
  { w: 9,  t: T.NOVA, q: -2, r: 2 },   // splitters (C) + A/C overlap
  { w: 10, t: T.CRYO, q: -2, r: -1 },  // slow the Colossus on A
  { w: 11, t: T.AMP,  q: -1, r: -2 },  // buff the A/B cluster
  { w: 13, t: T.BOLT, q: 2,  r: -3 },  // B outer
  { w: 14, t: T.NOVA, q: 2,  r: 3 },   // C outer
  { w: 16, t: T.BOLT, q: -3, r: -2 },  // A outer
  { w: 17, t: T.AMP,  q: 2,  r: 1 },   // buff the C cluster
  { w: 18, t: T.RAIL, q: 0,  r: 4 },   // final boss prep (C corridor)
  { w: 19, t: T.BOLT, q: 2,  r: 4 },   // C outer
  { w: 19, t: T.AMP,  q: 1,  r: 5 },   // buff the C outer cluster
];

const UPGRADE_PRIORITY: TowerType[] = [T.RAIL, T.NOVA, T.ARC, T.BOLT, T.CRYO];

function autoTarget(g: Game) {
  // A reasonable player uses targeting priorities: focus rails on heavies/bosses
  if (g.wave < 10) return;
  for (const t of g.towers) {
    if (t.type === T.RAIL) t.targetMode = 'STRONG' as any;
  }
}

function autoBuild(g: Game) {
  autoTarget(g);
  const nextWave = g.wave + 1;
  const placed = (p: PlanItem) => g.towers.some(t => t.q === p.q && t.r === p.r);
  // 1) gated placements, in order
  for (const p of PLAN) {
    if (nextWave >= p.w && !placed(p)) {
      const cost = (g as any).constructor === undefined ? 0 : towerCost(p.t);
      if (g.isTowerUnlocked(p.t) && g.energy >= cost) {
        g.tryPlaceTower(p.t, p.q, p.r);
      }
      return; // one purchase decision per frame keeps spending ordered
    }
  }
  // 2) upgrades once all gated placements are owned (keep a reserve)
  if (g.energy < 260) return;
  for (const type of UPGRADE_PRIORITY) {
    const t = g.towers.filter(t => t.type === type && t.level < 3)
      .sort((a, b) => a.level - b.level)[0];
    if (t && g.energy >= g.upgradeCost(t) + 100) {
      g.upgradeTower(t, 1);
      return;
    }
  }
}

function towerCost(t: TowerType): number {
  // avoid importing TOWER_DEFS statically (module loads fine, but keep harness light)
  const costs: Record<TowerType, number> = {
    [T.BOLT]: 50, [T.CRYO]: 85, [T.ARC]: 90, [T.RAIL]: 120, [T.NOVA]: 140, [T.AMP]: 115,
  };
  return costs[t];
}

function autoAbilities(g: Game) {
  if (g.state !== GS.COMBAT_PHASE) return;
  const boss = g.enemies.find(e => e.isBoss && e.alive);
  if (boss) {
    if (g.cooldowns.emp === 0 && g.energy >= BALANCE.abilityCosts.emp) g.activateEmp();
    if (g.cooldowns.overdrive === 0 && g.energy >= BALANCE.abilityCosts.overdrive) g.activateOverdrive();
    if (g.cooldowns.orbital === 0 && g.energy >= BALANCE.abilityCosts.orbital) g.fireOrbital(boss.x, boss.y);
    return;
  }
  // emergency: crowd near the core
  const close = g.enemies.filter(e => e.alive && e.routeIndex >= 7).length;
  if (close >= 4 && g.cooldowns.emp === 0 && g.energy >= BALANCE.abilityCosts.emp) g.activateEmp();
}

// ---------------------------------------------------------------------------

describe('onboarding (first 10 seconds)', () => {
  it('runs the tutorial script: title -> build -> first tower -> countdown -> wave 1', async () => {
    const g = await createGame();
    g.startRun(D.COMMANDER);
    expect(g.state).toBe(GS.BUILD_PHASE);
    expect(g.tutorial?.stage).toBe('title');
    expect(g.selectedTowerType).toBe(T.BOLT);
    step(g, 3.2);
    expect(g.tutorial?.stage).toBe('build');
    // suggested cell is highlighted and buildable
    expect(g.board.isBuildable(BALANCE.firstTowerHint.q, BALANCE.firstTowerHint.r)).toBe(true);
    g.tryPlaceTower(T.BOLT, -1, -1);
    expect(g.towers.length).toBe(1);
    expect(g.tutorial?.stage).toBe('countdown');
    // countdown auto-launches wave 1
    step(g, 6);
    expect(g.tutorial).toBeNull();
    expect(g.wave).toBe(1);
    expect(g.state).toBe(GS.COMBAT_PHASE);
    expect(g.waveActive).toBe(true);
  });

  it('highlights the recommended cell, but allows any valid cell', async () => {
    const g = await createGame();
    g.startRun(D.COMMANDER);
    step(g, 3.2);
    g.tryPlaceTower(T.BOLT, 2, 2); // deliberately elsewhere
    expect(g.towers.length).toBe(1);
    expect(g.towers[0].q).toBe(2);
    expect(g.tutorial?.stage).toBe('countdown');
  });
});

describe('next-wave intel', () => {
  it('flags which portals the upcoming wave will attack from', async () => {
    const g = await createGame();
    g.startRun(D.COMMANDER);
    g.tutorial = null;
    expect([...g.getUpcomingIntel()!.portals.keys()]).toEqual([0]);          // wave 1: west only
    g.wave = 1;
    expect([...g.getUpcomingIntel()!.portals.keys()]).toEqual([0, 1]);       // wave 2: + northeast
    g.wave = 5;
    expect([...g.getUpcomingIntel()!.portals.keys()]).toEqual([0, 2]);       // wave 6: west + southeast
    g.wave = 9;
    expect([...g.getUpcomingIntel()!.portals.keys()]).toEqual([0, 1, 2]);    // wave 10 boss: all three
    expect(g.getUpcomingIntel()!.portals.get(0)).toBe(1);                    // the Colossus itself
    g.wave = 20;
    expect(g.getUpcomingIntel()).toBeNull();                                  // campaign complete
  });

  it('hides intel during combat', async () => {
    const g = await createGame();
    g.startRun(D.COMMANDER);
    g.tryPlaceTower(T.BOLT, -1, -1);
    step(g, 6);
    expect(g.state).toBe(GS.COMBAT_PHASE);
    expect(g.getUpcomingIntel()).toBeNull();
  });
});

describe('boss encounters', () => {
  it('Iron Colossus: shield phase at 65%, final push at 30% with escorts', async () => {
    const g = await createGame();
    g.startRun(D.COMMANDER);
    g.tutorial = null;
    g.wave = 9;
    g.beginWave(getWaveDef(10)!);
    expect(stepUntil(g, () => g.enemies.some(e => e.type === E.TITAN), 12)).toBe(true);
    const boss = g.enemies.find(e => e.type === E.TITAN)!;
    expect(boss.bossPhase).toBe(1);
    expect(boss.bossName).toBe('IRON COLOSSUS');
    // phase 2 at 65%: telegraphed shield charge, then a breakable shield
    boss.hp = boss.maxHp * 0.64;
    g.update(1 / 60);
    expect(boss.bossPhase).toBe(2);
    expect(stepUntil(g, () => boss.shield > 0, 3)).toBe(true);
    expect(boss.shield).toBeGreaterThan(0);
    // phase 3 at 30%: speed up + escort swarmers
    const totalBefore = g.waveTotalEnemies;
    boss.hp = boss.maxHp * 0.29;
    g.update(1 / 60);
    expect(boss.bossPhase).toBe(3);
    expect(boss.speed).toBeCloseTo(boss.baseSpeed * BALANCE.colossusPhase3Speed, 5);
    expect(g.waveTotalEnemies).toBe(totalBefore + 4);
  });

  it('Null Archon: stops and deploys drones at 70%, critical at 35%', async () => {
    const g = await createGame();
    g.startRun(D.COMMANDER);
    g.tutorial = null;
    g.wave = 19;
    g.beginWave(getWaveDef(20)!);
    expect(stepUntil(g, () => g.enemies.some(e => e.type === E.BOSS), 12)).toBe(true);
    const boss = g.enemies.find(e => e.type === E.BOSS)!;
    expect(boss.bossPhase).toBe(1);
    boss.hp = boss.maxHp * 0.69;
    g.update(1 / 60);
    expect(boss.bossPhase).toBe(2);
    expect(boss.speed).toBe(0); // stopped for deployment
    const totalBefore = g.waveTotalEnemies;
    expect(stepUntil(g, () => boss.bossStopTimer <= 0, 8)).toBe(true);
    expect(boss.speed).toBeGreaterThan(0);
    expect(boss.shield).toBeGreaterThan(0);       // temporary, breakable
    expect(g.waveTotalEnemies).toBe(totalBefore + 6); // 4 swarmers + 2 dashers deployed
    boss.hp = boss.maxHp * 0.34;
    g.update(1 / 60);
    expect(boss.bossPhase).toBe(3);
    expect(boss.speed).toBeCloseTo(boss.baseSpeed * BALANCE.archonPhase3Speed, 5);
  });

  it('Splitters break into two counted children', async () => {
    const g = await createGame();
    g.startRun(D.COMMANDER);
    g.tutorial = null;
    g.wave = 8;
    g.beginWave(getWaveDef(9)!);
    expect(stepUntil(g, () => g.enemies.some(e => e.type === E.SPLITTER), 12)).toBe(true);
    const sp = g.enemies.find(e => e.type === E.SPLITTER)!;
    const totalBefore = g.waveTotalEnemies;
    g.killEnemy(sp);
    const children = g.enemies.filter(e => e.alive && e.splitDone && e.type === E.SWARMER);
    expect(children.length).toBe(2);
    expect(g.waveTotalEnemies).toBe(totalBefore + 2);
  });
});

describe('campaign playthrough (fixed-step simulation)', () => {
  it('a reasonable defense completes all 20 waves with the core intact', async () => {
    const g = await createGame();
    g.startRun(D.COMMANDER);
    // tutorial first tower
    g.tryPlaceTower(T.BOLT, -1, -1);
    step(g, 6); // countdown -> wave 1

    const unlockChecks: Record<number, TowerType> = {
      3: T.CRYO, 5: T.ARC, 7: T.RAIL, 9: T.NOVA, 11: T.AMP,
    };
    let seenWave = 1;
    let frames = 0;
    const maxFrames = 60 * 2400; // 40 minutes of game time, generous

    while (g.state !== GS.VICTORY && g.state !== GS.GAME_OVER && frames < maxFrames) {
      if (g.state === GS.BUILD_PHASE && !g.waveActive) {
        autoBuild(g);
        g.startWaveIfReady();
      }
      autoAbilities(g);
      g.update(1 / 60);
      frames++;
      if (g.wave !== seenWave) {
        seenWave = g.wave;
        const expected = unlockChecks[seenWave];
        if (expected) {
          expect(g.unlockedTowers, `before wave ${seenWave}`).toContain(expected);
        }
      }
    }

    // --- assertions ---
    expect(g.state).toBe('VICTORY');
    expect(g.wave).toBe(20);
    expect(frames).toBeLessThan(maxFrames);
    expect(g.reactorIntegrity).toBeGreaterThan(0);
    // the run actually fought through the content
    expect(g.totalKills).toBeGreaterThan(120);
    expect(g.stats.towersBuilt).toBeGreaterThanOrEqual(15);
    expect(g.stats.energyEarned).toBeGreaterThan(2000);
    expect(g.score).toBeGreaterThan(3000);
    // boss waves were survived
    expect(g.enemies.length).toBe(0);
  }, 120000);

  it('wave 1 is survivable with just the recommended first tower', async () => {
    const g = await createGame();
    g.startRun(D.ROOKIE);
    g.tryPlaceTower(T.BOLT, -1, -1);
    step(g, 6);
    expect(g.wave).toBe(1);
    stepUntil(g, () => g.state === GS.BUILD_PHASE, 120);
    expect(g.wave).toBe(1);
    // the single recommended tower must be able to destroy most or all enemies
    expect(g.waveKilled).toBeGreaterThanOrEqual(4);
    expect(g.reactorIntegrity).toBeGreaterThanOrEqual(18);
  });
});

describe('endless mode', () => {
  it('continues from victory with scaling waves', async () => {
    const g = await createGame();
    g.startRun(D.COMMANDER);
    g.tryPlaceTower(T.BOLT, -1, -1);
    step(g, 6);
    let frames = 0;
    while (g.state !== GS.VICTORY && g.state !== GS.GAME_OVER && frames < 60 * 2400) {
      if (g.state === GS.BUILD_PHASE && !g.waveActive) { autoBuild(g); g.startWaveIfReady(); }
      autoAbilities(g);
      g.update(1 / 60);
      frames++;
    }
    expect(g.state).toBe('VICTORY');

    g.startEndless();
    expect(g.mode).toBe('endless');
    expect(g.state).toBe(GS.BUILD_PHASE);
    expect(g.getUpcomingWave()?.number).toBe(21);

    frames = 0;
    while (g.wave < 23 && g.state !== GS.GAME_OVER && frames < 60 * 900) {
      if (g.state === GS.BUILD_PHASE && !g.waveActive) { autoBuild(g); g.startWaveIfReady(); }
      autoAbilities(g);
      g.update(1 / 60);
      frames++;
    }
    expect(g.wave).toBeGreaterThanOrEqual(23);
    expect(g.reactorIntegrity).toBeGreaterThan(0);
    expect(g.state === GS.BUILD_PHASE || g.state === GS.COMBAT_PHASE).toBe(true);
  }, 180000);
});
