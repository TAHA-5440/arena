/**
 * Gameplay video recorder.
 *
 * Runs the real game simulation head-less against a native Canvas 2D
 * implementation, drives it into the final boss wave, and writes PNG frames
 * that `scripts/record-gameplay.mjs` encodes to MP4.
 *
 * The frames are the genuine game render — the same `Game.render()` the
 * browser runs — so the video shows real gameplay, not a mock-up.
 */
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export interface RecordOptions {
  width: number;
  height: number;
  frames: number;
  fps: number;
  outDir: string;
  /** Campaign wave to stage the fight on. */
  wave: number;
}

const PLAN: Array<{ t: string; q: number; r: number }> = [
  { t: 'BOLT', q: -1, r: -1 }, { t: 'BOLT', q: 1, r: 0 }, { t: 'CRYO', q: 0, r: -1 },
  { t: 'BOLT', q: 1, r: 1 }, { t: 'ARC', q: 1, r: -2 }, { t: 'CRYO', q: 1, r: 2 },
  { t: 'RAIL', q: 3, r: -1 }, { t: 'RAIL', q: -4, r: 0 }, { t: 'NOVA', q: -2, r: 2 },
  { t: 'CRYO', q: -2, r: -1 }, { t: 'AMP', q: -1, r: -2 }, { t: 'BOLT', q: 2, r: -3 },
  { t: 'NOVA', q: 2, r: 3 }, { t: 'BOLT', q: -3, r: -2 }, { t: 'AMP', q: 2, r: 1 },
  { t: 'RAIL', q: 0, r: 4 }, { t: 'BOLT', q: 2, r: 4 }, { t: 'AMP', q: 1, r: 5 },
];

/** Installs the minimal browser surface the game expects. */
function installEnvironment(width: number, height: number) {
  const canvas = createCanvas(width, height) as any;
  canvas.style = {};
  canvas.addEventListener = () => {};
  canvas.removeEventListener = () => {};
  canvas.getBoundingClientRect = () => ({
    left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0,
  });

  const store = new Map<string, string>();
  const localStorageStub = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };

  const windowStub: any = {
    innerWidth: width,
    innerHeight: height,
    devicePixelRatio: 1,
    location: { href: 'http://localhost/', search: '', hostname: 'localhost' },
    navigator: { userAgent: 'node' },
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => ({}),
    requestAnimationFrame: (f: FrameRequestCallback) => setTimeout(() => f(performance.now()), 16) as unknown as number,
    cancelAnimationFrame: () => {},
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: localStorageStub,
    AudioContext: undefined,
  };

  const documentStub: any = {
    hidden: false,
    visibilityState: 'visible',
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: () => null,
    createElement: () => ({ style: {}, appendChild() {}, addEventListener() {}, setAttribute() {}, remove() {} }),
    body: { appendChild() {} },
  };

  const define = (key: string, value: unknown) => {
    try {
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    } catch {
      /* some globals are read-only in Node — the game only needs a few */
    }
  };

  define('window', windowStub);
  define('document', documentStub);
  define('localStorage', localStorageStub);
  define('navigator', windowStub.navigator);
  define('requestAnimationFrame', windowStub.requestAnimationFrame);
  define('cancelAnimationFrame', () => {});
  define('matchMedia', windowStub.matchMedia);
  define('getComputedStyle', windowStub.getComputedStyle);
  define('HTMLCanvasElement', canvas.constructor);

  return canvas;
}

export async function record(opts: RecordOptions) {
  const canvas = installEnvironment(opts.width, opts.height);

  // Imported after the environment exists — the game reads `window` on init.
  const { Game } = await import('../../src/Game');
  const { getWaveDef } = await import('../../src/data/waves');
  const { TowerType } = await import('../../src/types/game');

  const game: any = new Game(canvas, { appendChild() {} } as any);

  // --- stage the scene: a fully built defence, all tech unlocked ------------
  game.startRun('COMMANDER');
  game.unlockedTowers = Object.values(TowerType);
  game.energy = 100000;
  game.routesUnlocked = 3;
  game.tutorial = null;
  game.coach = null;

  for (const item of PLAN) {
    game.tryPlaceTower(item.t as any, item.q, item.r);
  }
  // Take a few towers to level 3 so the board looks seasoned.
  for (const t of game.towers) {
    if (t.type === 'RAIL' || t.type === 'NOVA' || t.type === 'ARC' || t.type === 'CRYO') {
      game.upgradeTower(t, 1);
      game.upgradeTower(t, 1);
    }
  }
  game.energy = 900;

  // Drop the onboarding announcements scheduled by startRun() — this recording
  // is a mid-campaign wave, so "build your first tower" would be wrong.
  game.announcements = [];
  game.scheduled = [];

  // --- start the target wave (the final boss) -------------------------------
  const def = getWaveDef(opts.wave);
  if (!def) throw new Error(`No wave definition for ${opts.wave}`);
  game.wave = def.number;
  game.act = def.act;
  game.beginWave(def);
  game.waveActive = true;

  // --- capture --------------------------------------------------------------
  rmSync(opts.outDir, { recursive: true, force: true });
  mkdirSync(opts.outDir, { recursive: true });

  const dt = 1 / 60;
  const stepsPerFrame = Math.max(1, Math.round(60 / opts.fps));

  for (let f = 0; f < opts.frames; f++) {
    for (let s = 0; s < stepsPerFrame; s++) game.update(dt);
    game.render(0);
    const name = `f${String(f).padStart(5, '0')}.png`;
    writeFileSync(join(opts.outDir, name), canvas.toBuffer('image/png'));
    if (f % 60 === 0) process.stdout.write(`  frame ${f}/${opts.frames}\n`);
  }

  return { frames: opts.frames, width: opts.width, height: opts.height };
}
