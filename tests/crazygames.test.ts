import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// CrazyGames SDK integration.
//
// The platform expects three things from the game:
//   1. `game.settings.muteAudio` must silence ALL audio (priority over the
//      in-game audio toggle).
//   2. `gameplayStart` / `gameplayStop` must bracket the playable states.
//   3. The game must keep working when the SDK is not present at all.
// ---------------------------------------------------------------------------

// --- Web Audio mock ---------------------------------------------------------

class MockParam {
  value: number;
  constructor(v = 0) { this.value = v; }
  setValueAtTime(v: number) { this.value = v; return this; }
  linearRampToValueAtTime(v: number) { this.value = v; return this; }
  exponentialRampToValueAtTime(v: number) { this.value = v; return this; }
  cancelScheduledValues() { return this; }
  setTargetAtTime(v: number) { this.value = v; return this; }
}

class MockNode {
  gain = new MockParam(1);
  frequency = new MockParam(440);
  detune = new MockParam(0);
  Q = new MockParam(1);
  type = 'sine';
  pan = new MockParam(0);
  delayTime = new MockParam(0);
  threshold = new MockParam(-24);
  knee = new MockParam(30);
  ratio = new MockParam(12);
  attack = new MockParam(0.003);
  release = new MockParam(0.25);
  playbackRate = new MockParam(1);
  buffer: any = null;
  connect(dest: any) { return dest; }
  disconnect() { /* noop */ }
  start() { /* noop */ }
  stop() { /* noop */ }
}

class MockAudioContext {
  currentTime = 0;
  state = 'running';
  sampleRate = 44100;
  destination = new MockNode();
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  createGain() { return new MockNode(); }
  createDynamicsCompressor() { return new MockNode(); }
  createOscillator() { return new MockNode(); }
  createBiquadFilter() { return new MockNode(); }
  createStereoPanner() { return new MockNode(); }
  createDelay() { return new MockNode(); }
  createBufferSource() { return new MockNode(); }
  createBuffer(_ch: number, length: number, rate: number) {
    return { length, numberOfChannels: _ch, sampleRate: rate, getChannelData: () => new Float32Array(length) };
  }
}

// --- helpers ----------------------------------------------------------------

function makeCanvas() {
  const canvas = document.createElement('canvas') as any;
  canvas.getContext = () => ({
    setTransform() {}, clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {},
    lineTo() {}, closePath() {}, fill() {}, stroke() {}, arc() {}, fillText() {}, save() {}, restore() {},
    translate() {}, rotate() {}, scale() {}, createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; }, drawImage() {},
  });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1024, height: 768 });
  (window as any).innerWidth = 1024;
  (window as any).innerHeight = 768;
  return canvas;
}

/** Master bus gain — the single value that decides whether anything is audible. */
function masterGain(game: any): number {
  return (game.audio.master as any).gain.value;
}

interface SdkMock {
  settings: { disableChat: boolean; muteAudio: boolean };
  listeners: Array<(s: any) => void>;
  gameplayStart: ReturnType<typeof vi.fn>;
  gameplayStop: ReturnType<typeof vi.fn>;
  init: ReturnType<typeof vi.fn>;
  emit: (next: { disableChat?: boolean; muteAudio?: boolean }) => void;
}

function installSdk(settings: Partial<{ disableChat: boolean; muteAudio: boolean }> = {}): SdkMock {
  const mock: SdkMock = {
    settings: { disableChat: false, muteAudio: false, ...settings },
    listeners: [],
    gameplayStart: vi.fn(),
    gameplayStop: vi.fn(),
    init: vi.fn(() => Promise.resolve()),
    emit: (next) => {
      if (next.disableChat !== undefined) mock.settings.disableChat = next.disableChat;
      if (next.muteAudio !== undefined) mock.settings.muteAudio = next.muteAudio;
      mock.listeners.forEach((l) => l({ ...mock.settings }));
    },
  };
  (window as any).CrazyGames = {
    SDK: {
      init: mock.init,
      game: {
        settings: mock.settings,
        addSettingsChangeListener: (l: any) => { mock.listeners.push(l); },
        removeSettingsChangeListener: (l: any) => { mock.listeners = mock.listeners.filter((x) => x !== l); },
        gameplayStart: mock.gameplayStart,
        gameplayStop: mock.gameplayStop,
      },
    },
  };
  return mock;
}

async function createGame() {
  vi.resetModules();
  const { Game } = await import('../src/Game');
  const g = new Game(makeCanvas(), document.createElement('div'));
  return g as any;
}

// --- tests ------------------------------------------------------------------

describe('CrazyGames SDK integration', () => {
  beforeEach(() => {
    delete (window as any).CrazyGames;
    (window as any).AudioContext = MockAudioContext;
    // The game persists audio settings in localStorage — isolate the tests.
    try { localStorage.clear(); } catch { /* noop */ }
    vi.resetModules();
  });

  it('boots and plays normally when the SDK is absent', async () => {
    const g = await createGame();
    await g.sdkReady;

    // No SDK => no forced mute, audio still at the player's volume.
    expect(g.audio.isSdkMuted).toBe(false);
    expect(masterGain(g)).toBeGreaterThan(0.1);

    // The game is fully playable.
    g.startRun('COMMANDER' as any);
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    expect(g.state).toBe('BUILD_PHASE');
  });

  it('mutes all audio when the platform asks for it', async () => {
    installSdk({ muteAudio: true });
    const g = await createGame();
    await g.sdkReady;

    expect(g.audio.isSdkMuted).toBe(true);
    expect(masterGain(g)).toBeLessThan(0.01);
  });

  it('keeps the platform mute when the player toggles in-game audio', async () => {
    installSdk({ muteAudio: true });
    const g = await createGame();
    await g.sdkReady;

    // The player switches their own toggle on and off — the platform wins.
    g.settings.muted = false;
    g.saveSettings();
    expect(g.audio.isEffectivelyMuted).toBe(true);
    expect(masterGain(g)).toBeLessThan(0.01);

    g.settings.muted = true;
    g.saveSettings();
    expect(g.audio.isEffectivelyMuted).toBe(true);
    expect(masterGain(g)).toBeLessThan(0.01);
  });

  it('applies a platform mute that changes mid-session', async () => {
    const sdk = installSdk({ muteAudio: false });
    const g = await createGame();
    await g.sdkReady;

    expect(masterGain(g)).toBeGreaterThan(0.1);

    sdk.emit({ muteAudio: true });
    expect(g.audio.isSdkMuted).toBe(true);
    expect(masterGain(g)).toBeLessThan(0.01);

    sdk.emit({ muteAudio: false });
    expect(g.audio.isSdkMuted).toBe(false);
    expect(masterGain(g)).toBeGreaterThan(0.1);
  });

  it('honours ?muteAudio=true for local testing', async () => {
    installSdk({ muteAudio: false });
    const url = new URL(window.location.href);
    url.searchParams.set('muteAudio', 'true');
    window.history.replaceState({}, '', url.toString());

    const g = await createGame();
    await g.sdkReady;

    expect(g.audio.isSdkMuted).toBe(true);
    expect(masterGain(g)).toBeLessThan(0.01);

    window.history.replaceState({}, '', window.location.pathname);
  });

  it('reports gameplay start/stop around the playable states', async () => {
    const sdk = installSdk();
    const g = await createGame();
    await g.sdkReady;

    // Still in the menu — no gameplay reported yet.
    expect(sdk.gameplayStart).not.toHaveBeenCalled();

    g.startRun('COMMANDER' as any);
    expect(sdk.gameplayStart).toHaveBeenCalledTimes(1);
    expect(sdk.gameplayStop).not.toHaveBeenCalled();

    // Pausing is a break => stop.
    g.pause();
    expect(sdk.gameplayStop).toHaveBeenCalledTimes(1);

    // Resuming => start again.
    g.resume();
    expect(sdk.gameplayStart).toHaveBeenCalledTimes(2);

    // Ending the run => stop.
    g.gameOver();
    expect(sdk.gameplayStop).toHaveBeenCalledTimes(2);
  });

  it('reports gameplay start when a saved run is restored', async () => {
    const sdk = installSdk();
    const g = await createGame();
    await g.sdkReady;

    g.startRun('COMMANDER' as any);
    for (let i = 0; i < 10; i++) g.update(1 / 60);
    g.saveGame();

    const g2 = await createGame();
    await g2.sdkReady;
    const loaded = g2.loadGame();

    expect(loaded).toBe(true);
    expect(sdk.gameplayStart).toHaveBeenCalled();
  });

  it('does not throw when the SDK init rejects', async () => {
    (window as any).CrazyGames = {
      SDK: { init: vi.fn(() => Promise.reject(new Error('boom'))), game: {} },
    };
    const g = await createGame();
    const ok = await g.sdkReady;

    expect(ok).toBe(false);
    expect(g.audio.isSdkMuted).toBe(false);
    g.startRun('COMMANDER' as any);
    for (let i = 0; i < 10; i++) g.update(1 / 60);
    expect(g.state).toBe('BUILD_PHASE');
  });
});
