# CrazyGames Submission — HEX DEFENDER: LAST CORE

Everything needed to submit this game to CrazyGames, and the exact answers for
each field of the submission form.

---

## 1. Form answers

| Field | Answer | Why |
|---|---|---|
| **Game name** | `HEX DEFENDER: LAST CORE` | 23 chars (limit 35). Byte-identical to the `<title>` in `index.html`, which is what appears in the game. |
| **Game engine** | *Upload as an HTML5 game* | Vite + TypeScript + Canvas 2D isn't a listed engine, so the HTML5 route is the correct one. |
| **Upload files** | `release/hex-defender-last-core.zip` | ZIP with `index.html` at the **root** (no wrapping folder) plus `assets/`. |
| **Does your game save progress?** | **Yes, using LocalStorage (Automatic Progress Save)** | The game persists to `window.localStorage`. CrazyGames' APS system backs up and syncs localStorage across the player's devices automatically — no extra code needed. The game has no in-app purchases, so APS is allowed. |
| **The game supports mobile devices** | ✅ **Yes** | Responsive layout (`@media (max-width: 768px)`), bottom tower bar, touch build, pinch-zoom, tap-vs-drag detection, mobile audio quality + particle budgets. |
| **The game is an online multiplayer game** | ❌ **No** | Single-player. (Leave unticked.) |
| **The game supports CrazyGames muting audio through SDK** | ✅ **Yes** | SDK v3 integrated — see below. |

### If you later want account-linked progress instead

The SDK `Data` module is already wired up behind a thin wrapper
(`src/sdk/CrazyGamesSDK.ts` → `setData` / `getData`). To switch the answer to
*"Yes, using the Data Module from the CrazyGames SDK"*, mirror the save/load
calls in `src/Game.ts` (`saveGame` / `loadGame`) to the data module. APS
(localStorage) is the lower-risk option and needs no changes.

---

## 2. Generate the upload package

```bash
npm install
npm run package:crazygames
```

This type-checks, builds, verifies the bundle, and writes:

```
release/hex-defender-last-core.zip
```

The script fails the build if `index.html` is missing, if any asset path is
absolute, or if a referenced file doesn't exist.

### Verified bundle facts

| Check | Limit | Actual |
|---|---|---|
| Total file size | 250 MB | **199 KB** |
| Initial download size | 50 MB (20 MB for the mobile homepage) | **199 KB** |
| File count | 1500 | **3** |
| `index.html` at archive root | required | ✅ |
| Relative paths only | required | ✅ (`./assets/…`) |
| External network requests at runtime | none allowed | none — the only external request is the CrazyGames SDK script |

---

## 3. SDK integration (already implemented)

`index.html` loads the official SDK before the game code:

```html
<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
```

`src/sdk/CrazyGamesSDK.ts` wraps it defensively — the game stays fully
playable if the SDK never loads.

| Platform requirement | Implementation |
|---|---|
| `settings.muteAudio` must silence **all** audio | `AudioEngine.setSdkMuted()` — a separate flag that is OR-ed with the in-game mute, so the platform always wins and the player cannot re-enable sound from the settings menu. |
| Settings can change mid-session | `addSettingsChangeListener` re-applies the mute live. |
| `gameplayStart` / `gameplayStop` | `Game.setState()` is now the single state switch; it fires `gameplayStart` for `BUILD_PHASE`/`COMBAT_PHASE` and `gameplayStop` for menus, pause, victory and game over. This is also what CrazyGames uses to measure the initial download size. |
| `loadingStart` / `loadingStop` | `loadingStart()` is called as the first statement of `main.ts`; `loadingStop()` is emitted automatically just before the first `gameplayStart`, so the platform always sees `loadingStart → loadingStop → gameplayStart` in that order. |
| `happytime` | Fires on a boss defeat and on a new personal best — sparingly, as the platform docs ask. |
| `reportGameCompletedPercentage` | Reports campaign progress after every wave (`wave / 20 × 100`), `100` on victory, and the saved progress when a run is resumed. |
| `setGameContext` / `clearGameContext` | Attaches wave, act, mode, difficulty, score and reactor integrity so support tickets can be reproduced; cleared when the run ends. |
| Local testing | `?muteAudio=true` and `?disableChat=true` force the corresponding platform setting, exactly like the real SDK does. |

### Landing directly in gameplay

CrazyGames asks games to land new players in gameplay immediately — a title
screen costs a click and delays the platform's load-time measurement. The game
therefore **starts itself**: `main.ts` calls `game.autoStart()`, which resumes
a saved run if there is one and otherwise begins a fresh wave-1 run with the
onboarding coach cards. The title screen is still one tap away via
**PAUSE → MENU**, and it is where the difficulty select, high scores and the
privacy notice live.

### Verify it locally

```bash
npm test                      # 71 tests, incl. 15 SDK integration tests
npm run smoke:dist            # boots the real production bundle in jsdom
```

`tests/crazygames.test.ts` covers: SDK absent, SDK present, platform mute
applied, platform mute surviving an in-game unmute, mid-session mute changes,
`?muteAudio=true`, gameplay start/stop transitions, loading-event ordering,
direct-to-gameplay landing, progression reporting, queued calls replayed in
order when the SDK initialises late, a rejecting SDK, and the privacy notice.

---

## 4. Cover images (mandatory)

Three covers are required, all with consistent visuals:

| Cover | Size | File |
|---|---|---|
| Landscape 16:9 | 1920×1080 | `release/covers/cover-landscape.png` |
| Portrait 2:3 | 800×1200 | `release/covers/cover-portrait.png` |
| Square 1:1 | 800×800 | `release/covers/cover-square.png` |

Regenerate them with:

```bash
bash scripts/make-covers.sh
```

The script crops the source artwork in `assets/covers/` to each aspect ratio,
adds a legibility scrim, and renders the title with ImageMagick (auto-fitted
to the canvas) so the typography is crisp and spelled exactly right —
CrazyGames only permits the game's title on the cover, no borders, no icons,
no promotional text.

---

## 5. QA checklist answers (Basic Launch)

Tick the following on the portal's checklist. Each row says what to select and
why it is true of this build.

| Checklist item | Select | Evidence in this build |
|---|---|---|
| Initial download size < 50 MB | **Yes** (automatic) | 199 KB — 0.2 MB total. |
| First gameplay start | **Yes** (automatic) | `gameplayStart` fires on boot. |
| First gameplay start implemented correctly | **Yes** | The game lands **directly in gameplay** — no title-screen click. The first `gameplayStart` is therefore ~1 s after load instead of after a menu interaction, which is what fixes the earlier "load time 12.6 s / load size 0 MB" reading. |
| Complies to Gameplay requirements | **Yes** | English only, 16:9-first responsive layout, no cross-promotion, no custom fullscreen button, PEGI 12 appropriate. |
| Runs on all CrazyGames domains | **Yes** | The game contains **no sitelock and no domain check at all**, so it runs on every `crazygames.com` origin, on `games.crazygames.com` (ad frames) and inside the iOS (`capacitor://app.crazygames.com`) and Android (`https://app.crazygames.com`) app WebViews. No `frame-ancestors` is needed from us — the platform sets that header. |
| Browser checks | **Yes** | Chrome/Edge verified. Web Audio, Canvas 2D and `localStorage` are the only platform APIs used. |
| Device checks: Mobile | **Yes** | Responsive layout, touch build, pinch-zoom, tap-vs-drag detection, `user-select: none` body (no long-press magnifier), iOS `touchend` AudioContext resume. |
| No external ads | **Yes** | The game contains no ad code and no third-party scripts other than the CrazyGames SDK. |
| Does not offer external login options | **Yes** | No login, no account, no email, no name collection. The only profile UI is a locally stored leaderboard entry. |
| In-game mention of Terms & Conditions and/or Privacy Policy | **Yes** | A **Privacy & Terms** notice is in the game: a link in the title-screen footer, a *VIEW NOTICE* row in Settings, and a one-time non-blocking toast on first launch. It states that no personal data is collected, that local storage is used, and that the platform SDK records anonymous gameplay events. |
| Mute audio support | **Yes** (detected) | `settings.muteAudio` silences everything; the platform setting always beats the in-game toggle. |
| Gameplay Start | **Yes** (detected) | Fires on entering the build/combat phase; stops on menu, pause, victory and defeat. |

> If you prefer to answer the privacy row with **N/A** instead: that is
> defensible, because the game collects no personal data beyond the SDK's own
> events. The notice is implemented anyway, so **Yes** is the safe answer.

---

## 6. Still to do before publishing

- **Preview video** — required: 15–20 s, ≤ 50 MB, 1080p landscape *and* 1080p
  portrait. Capture the best moments (a boss wave, a big combo, the orbital
  strike) with no black bars, no mouse cursor and no promotional text.
- **Game description + controls** — the portal asks for these as free text.
  Suggested copy is in `docs/CRAZYGAMES-SUBMISSION.md` §6.
- **Orientation setting** in the portal — set it to *any* (or landscape +
  portrait): the game is fully playable in both.
- **Ad integration** — only needed for Full Launch. Nothing to do for a Basic
  Launch; ads are disabled by the platform in that case.
- **Re-upload and send the build to QA** — the portal shows *"This build has
  not been sent to QA"* until you explicitly submit it, and every measurement
  above comes from the uploaded build, not the local one.

---

## 7. Suggested portal copy

**Short description**

> The last reactor in the sector still hums. Build a defence of hexagonal
> turrets on a hex grid, hold three converging invasion routes, and survive
> 20 hand-authored waves across four escalating acts — ending with the Null
> Archon.

**Longer description**

> HEX DEFENDER: LAST CORE is a focused hex-grid tower defence campaign. One
> battlefield, one reactor, three lanes that converge only at the core.
> Place and upgrade six tower types, unlock new technology as the acts
> escalate, and fight two multi-phase bosses. Every wave is hand-authored, so
> each encounter is a designed puzzle rather than random spawns. Survive wave
> 20, then push your luck in Endless Mode. Progress saves automatically.

**Controls**

> **Build:** pick a tower in the shop, then click/tap a hex.
> **Inspect:** click a placed tower to upgrade, sell, or pick its level-3
> specialisation and targeting priority.
> **Wave:** `SPACE` or the START WAVE button. Speed `1–3×` with `+` / `-`.
> **Abilities:** `Z` EMP freeze · `X` Orbital Strike (click to aim) ·
> `V` Overdrive.
> **Camera:** drag to pan, wheel or pinch to zoom, `C` to recentre.
> **Pause:** `P` or `Esc`.
> **Touch:** tap to build, drag to pan, pinch to zoom.
