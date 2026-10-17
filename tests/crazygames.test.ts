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
  loadingStart: ReturnType<typeof vi.fn>;
  loadingStop: ReturnType<typeof vi.fn>;
  happytime: ReturnType<typeof vi.fn>;
  reportGameCompletedPercentage: ReturnType<typeof vi.fn>;
  setGameContext: ReturnType<typeof vi.fn>;
  clearGameContext: ReturnType<typeof vi.fn>;
  init: ReturnType<typeof vi.fn>;
  /** Ordered log of every SDK call, for order assertions. */
  calls: string[];
  emit: (next: { disableChat?: boolean; muteAudio?: boolean }) => void;
}

function installSdk(settings: Partial<{ disableChat: boolean; muteAudio: boolean }> = {}): SdkMock {
  const calls: string[] = [];
  const track = (name: string) => vi.fn(() => { calls.push(name); });
  const mock: SdkMock = {
    settings: { disableChat: false, muteAudio: false, ...settings },
    listeners: [],
    calls,
    gameplayStart: track('gameplayStart'),
    gameplayStop: track('gameplayStop'),
    loadingStart: track('loadingStart'),
    loadingStop: track('loadingStop'),
    happytime: track('happytime'),
    reportGameCompletedPercentage: track('reportGameCompletedPercentage'),
    setGameContext: track('setGameContext'),
    clearGameContext: track('clearGameContext'),
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
        loadingStart: mock.loadingStart,
        loadingStop: mock.loadingStop,
        happytime: mock.happytime,
        reportGameCompletedPercentage: mock.reportGameCompletedPercentage,
        setGameContext: mock.setGameContext,
        clearGameContext: mock.clearGameContext,
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

  // ---------------------------------------------------------------------------
  // Loading events, direct-to-gameplay landing and progression reporting
  // ---------------------------------------------------------------------------

  it('reports loading start and stops loading when gameplay begins', async () => {
    const sdk = installSdk();
    const g = await createGame();
    const { crazyGamesSDK } = await import('../src/sdk/CrazyGamesSDK');
    await g.sdkReady;

    // main.ts reports the start of the load before anything else.
    crazyGamesSDK.loadingStart();
    g.startRun('COMMANDER' as any);
    await g.sdkReady;

    expect(sdk.loadingStart).toHaveBeenCalled();
    expect(sdk.loadingStop).toHaveBeenCalled();
    // loadingStart -> loadingStop -> gameplayStart, in that order.
    expect(sdk.calls).toEqual(['loadingStart', 'loadingStop', 'gameplayStart']);
  });

  it('lands directly in gameplay without a menu click', async () => {
    const sdk = installSdk();
    const g = await createGame();
    await g.sdkReady;

    // autoStart is what main.ts calls on boot.
    g.autoStart();
    await g.sdkReady;

    expect(g.state).toBe('BUILD_PHASE');
    expect(sdk.gameplayStart).toHaveBeenCalled();
    expect(sdk.gameplayStop).not.toHaveBeenCalled();
  });

  it('resumes a saved run instead of starting a fresh one', async () => {
    const sdk = installSdk();
    const g = await createGame();
    await g.sdkReady;

    g.startRun('COMMANDER' as any);
    for (let i = 0; i < 10; i++) g.update(1 / 60);
    g.saveGame();

    const g2 = await createGame();
    await g2.sdkReady;
    g2.autoStart();
    await g2.sdkReady;

    expect(g2.state).toBe('BUILD_PHASE');
    expect(g2.wave).toBe(g.wave);
  });

  it('reports campaign progression as waves are cleared', async () => {
    const sdk = installSdk();
    const g = await createGame();
    await g.sdkReady;

    g.startRun('COMMANDER' as any);
    g.wave = 1;
    g.finishWave();
    await g.sdkReady;

    expect(sdk.reportGameCompletedPercentage).toHaveBeenCalled();
    const pct = sdk.reportGameCompletedPercentage.mock.calls.at(-1)![0];
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThanOrEqual(100);
  });

  it('reports 100% and celebrates on victory', async () => {
    const sdk = installSdk();
    const g = await createGame();
    await g.sdkReady;

    g.startRun('COMMANDER' as any);
    g.victory();
    await g.sdkReady;

    expect(sdk.reportGameCompletedPercentage).toHaveBeenCalledWith(100);
    expect(sdk.happytime).toHaveBeenCalled();
  });

  it('replays queued calls in order when the SDK initialises late', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((res) => { release = res; });
    const sdk = installSdk();
    (sdk.init as any).mockImplementation(() => gate.then(() => undefined));

    const g = await createGame();

    // Calls made before the SDK is ready must be queued, not lost.
    g.startRun('COMMANDER' as any);
    expect(sdk.gameplayStart).not.toHaveBeenCalled();

    release();
    await g.sdkReady;
    await new Promise((r) => setTimeout(r, 0));

    expect(sdk.loadingStop).toHaveBeenCalled();
    expect(sdk.gameplayStart).toHaveBeenCalled();
    expect(sdk.calls.indexOf('loadingStop')).toBeLessThan(sdk.calls.indexOf('gameplayStart'));
  });
});

// ---------------------------------------------------------------------------
// Privacy & terms notice (a Basic Launch checklist requirement).
// ---------------------------------------------------------------------------

describe('privacy notice', () => {
  it('is reachable from the title screen and from settings', async () => {
    installSdk();
    const g = await createGame();
    await g.sdkReady;

    const { UIManager } = await import('../src/ui/UIManager');
    const uiRoot = document.createElement('div');
    document.body.appendChild(uiRoot);
    const ui = new UIManager(g, uiRoot);

    // Title screen (reached via PAUSE -> MENU).
    g.setState('MAIN_MENU' as any);
    ui.render();

    const titleBtn = uiRoot.querySelector('#btnPrivacy') as HTMLElement | null;
    expect(titleBtn).toBeTruthy();
    titleBtn!.click();
    expect(uiRoot.textContent).toContain('No personal data is collected');

    // Close it and check the settings panel exposes it too.
    (uiRoot.querySelector('#btnBack') as HTMLElement).click();
    expect(uiRoot.textContent).not.toContain('No personal data is collected');

    g.setState('SETTINGS' as any);
    ui.render();
    const settingsBtn = uiRoot.querySelector('#btnPrivacy') as HTMLElement | null;
    expect(settingsBtn).toBeTruthy();
    settingsBtn!.click();
    expect(uiRoot.textContent).toContain('No personal data is collected');

    uiRoot.remove();
  });
});
