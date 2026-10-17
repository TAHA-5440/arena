// Smoke-test the REAL production bundle (dist/) inside jsdom.
// The built file is a self-contained ES module, so Node can import it directly.
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf-8');
const jsFile = readdirSync(join(dist, 'assets')).find((f) => f.endsWith('.js'));

const dom = new JSDOM(html, { url: 'http://localhost:5173/', pretendToBeVisual: true });
const { window } = dom;

// --- canvas 2D stub ---------------------------------------------------------
const ctx2d = new Proxy({}, {
  get(_, prop) {
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (prop === 'measureText') return () => ({ width: 10 });
    if (prop === 'canvas') return window.document.getElementById('gameCanvas');
    return () => undefined;
  },
  set() { return true; },
});
window.HTMLCanvasElement.prototype.getContext = () => ctx2d;
window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1024, height: 768 });
window.innerWidth = 1024;
window.innerHeight = 768;

// --- Web Audio stub ---------------------------------------------------------
class Param {
  constructor(v = 0) { this.value = v; }
  setValueAtTime(v) { this.value = v; return this; }
  linearRampToValueAtTime(v) { this.value = v; return this; }
  exponentialRampToValueAtTime(v) { this.value = v; return this; }
  cancelScheduledValues() { return this; }
  setTargetAtTime(v) { this.value = v; return this; }
}
class Node {
  constructor() {
    this.gain = new Param(1); this.frequency = new Param(440); this.detune = new Param(0);
    this.Q = new Param(1); this.pan = new Param(0); this.delayTime = new Param(0);
    this.threshold = new Param(-24); this.knee = new Param(30); this.ratio = new Param(12);
    this.attack = new Param(0.003); this.release = new Param(0.25); this.playbackRate = new Param(1);
    this.type = 'sine'; this.buffer = null;
  }
  connect(d) { return d; }
  disconnect() {}
  start() {}
  stop() {}
}
class Ctx {
  constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; this.destination = new Node(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  createGain() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createOscillator() { return new Node(); }
  createBiquadFilter() { return new Node(); }
  createStereoPanner() { return new Node(); }
  createDelay() { return new Node(); }
  createBufferSource() { return new Node(); }
  createBuffer(c, n, r) { return { length: n, numberOfChannels: c, sampleRate: r, getChannelData: () => new Float32Array(n) }; }
}
window.AudioContext = Ctx;

// --- globals the bundle expects --------------------------------------------
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLCanvasElement', 'requestAnimationFrame',
  'cancelAnimationFrame', 'localStorage', 'matchMedia', 'CustomEvent', 'Event', 'KeyboardEvent', 'PointerEvent',
  'TouchEvent', 'getComputedStyle', 'AudioContext', 'CanvasRenderingContext2D', 'Image', 'DOMParser',
  'MutationObserver', 'fetch', 'URL', 'requestIdleCallback', 'queueMicrotask']) {
  if (window[k] === undefined) continue;
  const value = typeof window[k] === 'function' ? window[k].bind(window) : window[k];
  try {
    Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
  } catch {
    /* some globals are read-only in Node — the bundle only needs a few */
  }
}
globalThis.innerWidth = 1024;
globalThis.innerHeight = 768;

// --- fake SDK (as on CrazyGames) -------------------------------------------
const sdkCalls = [];
let gameplayStart = 0, gameplayStop = 0;
const sdkSettings = { disableChat: false, muteAudio: false };
const sdkListeners = [];
window.CrazyGames = {
  SDK: {
    init: async () => {},
    game: {
      settings: sdkSettings,
      addSettingsChangeListener: (l) => sdkListeners.push(l),
      removeSettingsChangeListener: () => {},
      gameplayStart: () => { gameplayStart++; sdkCalls.push('gameplayStart'); },
      gameplayStop: () => { gameplayStop++; sdkCalls.push('gameplayStop'); },
      loadingStart: () => sdkCalls.push('loadingStart'),
      loadingStop: () => sdkCalls.push('loadingStop'),
      happytime: () => sdkCalls.push('happytime'),
      reportGameCompletedPercentage: (p) => sdkCalls.push('reportGameCompletedPercentage:' + p),
      setGameContext: () => sdkCalls.push('setGameContext'),
      clearGameContext: () => sdkCalls.push('clearGameContext'),
    },
  },
};

const errors = [];
window.addEventListener('error', (e) => errors.push('error: ' + e.message));

// --- run the built bundle ---------------------------------------------------
const url = pathToFileURL(process.cwd() + '/' + join(dist, 'assets', jsFile)).href;
await import(url);

await new Promise((r) => setTimeout(r, 300));

const g = window.game;
const report = {
  bundle: jsFile,
  gameExposed: !!g,
  state: g?.state,
  sdkAvailable: !!(window.CrazyGames?.SDK),
  gameplayStart, gameplayStop,
};

// The bundle must land directly in gameplay — no menu click required.
report.landedInGameplay = g?.state === 'BUILD_PHASE';
report.callsAfterBoot = sdkCalls.slice();

// Drive it: check the SDK events + audio state.
if (g) {
  for (let i = 0; i < 120; i++) g.update(1 / 60);
  report.stateAfterStart = g.state;
  report.gameplayStartAfterRun = gameplayStart;

  g.pause();
  report.gameplayStopAfterPause = gameplayStop;
  g.resume();
  report.gameplayStartAfterResume = gameplayStart;

  // Platform mute mid-session.
  sdkSettings.muteAudio = true;
  sdkListeners.forEach((l) => l({ ...sdkSettings }));
  report.sdkMutedApplied = g.audio.isSdkMuted;
  report.masterGain = g.audio.master.gain.value;

  report.allCalls = sdkCalls.slice();
}

report.errors = errors;
console.log(JSON.stringify(report, null, 2));
// The rAF loop keeps the event loop alive — stop it and exit cleanly.
try { g?.loop?.stop(); } catch { /* noop */ }
process.exit(0);
