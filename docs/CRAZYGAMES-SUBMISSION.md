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
| Local testing | `?muteAudio=true` and `?disableChat=true` force the corresponding platform setting, exactly like the real SDK does. |

### Verify it locally

```bash
npm test                      # 64 tests, incl. 8 SDK integration tests
npm run smoke:dist            # boots the real production bundle in jsdom
```

`tests/crazygames.test.ts` covers: SDK absent, SDK present, platform mute
applied, platform mute surviving an in-game unmute, mid-session mute changes,
`?muteAudio=true`, gameplay start/stop transitions, and a rejecting SDK.

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

## 5. Still to do before publishing

- **Preview video** — required: 15–20 s, ≤ 50 MB, 1080p landscape *and* 1080p
  portrait. Capture the best moments (a boss wave, a big combo, the orbital
  strike) with no black bars, no mouse cursor and no promotional text.
- **Game description + controls** — the portal asks for these as free text.
  Suggested copy is in `docs/CRAZYGAMES-SUBMISSION.md` §6.
- **Orientation setting** in the portal — set it to *any* (or landscape +
  portrait): the game is fully playable in both.
- **Ad integration** — only needed for Full Launch. Nothing to do for a Basic
  Launch; ads are disabled by the platform in that case.

---

## 6. Suggested portal copy

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
