/**
 * Defensive wrapper around the CrazyGames HTML5 SDK (v3).
 *
 * The game must stay fully playable when the SDK is absent (local dev,
 * offline, other portals), so every access is guarded and nothing throws.
 * When the SDK is unavailable the game silently degrades to its own
 * settings — the only behaviour that changes is the platform-level mute.
 */

export interface CrazyGameSettings {
  /** Platform asks the game to disable chat. This game has no chat. */
  disableChat: boolean;
  /** Platform asks the game to disable ALL audio. Takes priority over in-game audio settings. */
  muteAudio: boolean;
}

export type CrazySettingsListener = (settings: CrazyGameSettings) => void;

interface CrazyGameModule {
  settings?: Partial<CrazyGameSettings>;
  addSettingsChangeListener?: (listener: CrazySettingsListener) => void;
  removeSettingsChangeListener?: (listener: CrazySettingsListener) => void;
  gameplayStart?: () => void;
  gameplayStop?: () => void;
  loadingStart?: () => void;
  loadingStop?: () => void;
  happytime?: () => void;
  reportGameCompletedPercentage?: (percent: number) => void;
  setGameContext?: (context: Record<string, string>) => void;
  clearGameContext?: () => void;
}

interface CrazyDataModule {
  setItem?: (key: string, value: string) => Promise<unknown>;
  getItem?: (key: string) => Promise<string | null>;
}

interface CrazySDK {
  init?: () => Promise<unknown>;
  game?: CrazyGameModule;
  data?: CrazyDataModule;
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazySDK };
  }
}

const FALLBACK_SETTINGS: CrazyGameSettings = { disableChat: false, muteAudio: false };

/**
 * `?muteAudio=true` / `?disableChat=true` force a platform setting locally,
 * exactly like the official SDK does when the URL carries those flags.
 */
function queryFlag(name: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.location) return false;
    const raw = new URLSearchParams(window.location.search).get(name);
    return raw === 'true' || raw === '1';
  } catch {
    return false;
  }
}

export class CrazyGamesSDK {
  private sdk: CrazySDK | null = null;
  private ready = false;
  private settings: CrazyGameSettings = { ...FALLBACK_SETTINGS };
  private listener: CrazySettingsListener | null = null;
  private gameplayDesired = false;
  private gameplayRunning = false;
  private loadingStopped = false;
  /** SDK calls made before the SDK finished initialising, replayed in order. */
  private pending: Array<() => void> = [];

  /** True once the SDK finished initialising (i.e. we are on CrazyGames). */
  get isAvailable(): boolean { return this.ready; }
  get currentSettings(): CrazyGameSettings { return { ...this.settings }; }

  /**
   * Initialises the SDK. Never blocks the caller for longer than `timeoutMs`;
   * a slow or unreachable SDK must not delay the game.
   *
   * The underlying init keeps running in the background, so if it resolves
   * late the settings are still applied (the listener fires when ready).
   */
  async init(timeoutMs = 4000, onSettings?: CrazySettingsListener): Promise<boolean> {
    if (onSettings) this.listener = onSettings;

    const attempt = (async () => {
      // The SDK script is loaded from a CDN — give it a moment to appear.
      const sdk = await this.waitForSdk(timeoutMs);
      if (!sdk) return false;
      this.sdk = sdk;
      try {
        if (typeof sdk.init === 'function') await sdk.init();
      } catch {
        return false;
      }
      this.ready = true;
      this.readSettings();
      this.bindSettingsListener();
      this.flushPending();
      this.emit();
      return true;
    })();

    // Race the init against a timeout so the game is never held hostage.
    return await Promise.race<boolean>([
      attempt,
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);
  }

  /** Polls for the SDK script to finish loading. */
  private async waitForSdk(timeoutMs: number): Promise<CrazySDK | null> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const sdk = this.resolveSdk();
      if (sdk) return sdk;
      // No SDK object and no script tag that could load it => it never arrives.
      if (!this.hasSdkScriptTag()) return null;
      if (Date.now() >= deadline) return null;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  /** True when the page includes the CrazyGames SDK script tag. */
  private hasSdkScriptTag(): boolean {
    try {
      if (typeof document === 'undefined') return false;
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      return scripts.some((s) => /crazygames-sdk/i.test(s.getAttribute('src') || ''));
    } catch {
      return false;
    }
  }

  private resolveSdk(): CrazySDK | null {
    try {
      if (typeof window === 'undefined') return null;
      const sdk = window.CrazyGames?.SDK;
      return sdk && typeof sdk === 'object' ? sdk : null;
    } catch {
      return null;
    }
  }

  private readSettings() {
    const raw = this.sdk?.game?.settings;
    this.settings = {
      disableChat: typeof raw?.disableChat === 'boolean' ? raw.disableChat : false,
      muteAudio: typeof raw?.muteAudio === 'boolean' ? raw.muteAudio : false,
    };
    if (queryFlag('disableChat')) this.settings.disableChat = true;
    if (queryFlag('muteAudio')) this.settings.muteAudio = true;
  }

  private bindSettingsListener() {
    const game = this.sdk?.game;
    if (!game || typeof game.addSettingsChangeListener !== 'function') return;
    try {
      game.addSettingsChangeListener((next: Partial<CrazyGameSettings>) => {
        this.settings = {
          disableChat: typeof next?.disableChat === 'boolean' ? next.disableChat : this.settings.disableChat,
          muteAudio: typeof next?.muteAudio === 'boolean' ? next.muteAudio : this.settings.muteAudio,
        };
        if (queryFlag('disableChat')) this.settings.disableChat = true;
        if (queryFlag('muteAudio')) this.settings.muteAudio = true;
        this.emit();
      });
    } catch {
      /* listener registration is best-effort */
    }
  }

  private emit() {
    try {
      this.listener?.(this.currentSettings);
    } catch {
      /* a faulty listener must never break the game */
    }
  }

  /**
   * Runs an SDK call now, or queues it until the SDK is ready. The queue
   * preserves call order, so `loadingStart` -> `loadingStop` -> `gameplayStart`
   * always reaches the platform in that order.
   */
  private queue(fn: () => void) {
    if (this.ready) {
      try { fn(); } catch { /* SDK call failed — ignore */ }
    } else {
      this.pending.push(fn);
    }
  }

  private flushPending() {
    const queued = this.pending;
    this.pending = [];
    for (const fn of queued) {
      try { fn(); } catch { /* SDK call failed — ignore */ }
    }
  }

  // ---------------------------------------------------------------------------
  // Gameplay tracking
  // ---------------------------------------------------------------------------

  /** Player entered / resumed a playable state. */
  gameplayStart() {
    this.gameplayDesired = true;
    this.syncGameplay();
  }

  /** Player left a playable state (menu, pause, level end). */
  gameplayStop() {
    this.gameplayDesired = false;
    this.syncGameplay();
  }

  private syncGameplay() {
    if (this.gameplayRunning === this.gameplayDesired) return;
    this.gameplayRunning = this.gameplayDesired;
    if (this.gameplayDesired) {
      // Loading is over once the player reaches a playable state.
      if (!this.loadingStopped) {
        this.loadingStopped = true;
        this.queue(() => this.sdk?.game?.loadingStop?.());
      }
      this.queue(() => this.sdk?.game?.gameplayStart?.());
    } else {
      this.queue(() => this.sdk?.game?.gameplayStop?.());
    }
  }

  // ---------------------------------------------------------------------------
  // Loading events
  // ---------------------------------------------------------------------------

  /** The game began loading. */
  loadingStart() {
    this.queue(() => this.sdk?.game?.loadingStart?.());
  }

  /** Loading finished — implied by the first gameplay start, but callable. */
  loadingStop() {
    if (this.loadingStopped) return;
    this.loadingStopped = true;
    this.queue(() => this.sdk?.game?.loadingStop?.());
  }

  // ---------------------------------------------------------------------------
  // Progression & context
  // ---------------------------------------------------------------------------

  /**
   * A celebratory moment (boss defeated, new record). Use sparingly — the
   * platform shows confetti, so it should stay special.
   */
  happytime() {
    this.queue(() => this.sdk?.game?.happytime?.());
  }

  /** Progress towards completion, 0-100. */
  reportCompletion(percent: number) {
    const p = Math.max(0, Math.min(100, Math.round(percent)));
    this.queue(() => this.sdk?.game?.reportGameCompletedPercentage?.(p));
  }

  /** Attaches in-game data so support tickets can be reproduced. */
  setGameContext(context: Record<string, string>) {
    this.queue(() => this.sdk?.game?.setGameContext?.(context));
  }

  clearGameContext() {
    this.queue(() => this.sdk?.game?.clearGameContext?.());
  }

  // ---------------------------------------------------------------------------
  // Data module (optional — the game currently persists via localStorage/APS)
  // ---------------------------------------------------------------------------

  async setData(key: string, value: string): Promise<boolean> {
    try {
      if (!this.ready || typeof this.sdk?.data?.setItem !== 'function') return false;
      await this.sdk.data.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  async getData(key: string): Promise<string | null> {
    try {
      if (!this.ready || typeof this.sdk?.data?.getItem !== 'function') return null;
      return (await this.sdk.data.getItem(key)) ?? null;
    } catch {
      return null;
    }
  }
}

/** Shared instance — the SDK is a singleton on the page. */
export const crazyGamesSDK = new CrazyGamesSDK();
