# HEX DEFENDER: LAST CORE

A complete 2D hex-grid tower defense campaign — TypeScript + Vite + Canvas 2D, zero external art assets, fully offline.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # type-check + production bundle in dist/
npm test         # vitest: routes, campaign data, full playthrough simulation
```

## The Campaign

One persistent battlefield — **Central Reactor Fortress** (pointy-top hex grid, radius 6, 127 cells) — with the reactor at `(0,0)` and three fixed enemy routes that converge only at the core:

- **Route A — Western Approach** (portal `-6,0`) — active from wave 1
- **Route B — Northeast Approach** (portal `6,-6`) — activates at wave 2
- **Route C — Southeast Approach** (portal `0,6`) — activates at wave 6

Routes are permanently non-buildable. Every wave is an authored encounter (see `src/data/waves.ts`) — no random spawning in the campaign.

| Act | Waves | Theme | Challenge |
|-----|-------|-------|-----------|
| I — First Contact | 1–5 | Cyan | Basic defense, second lane, speed & swarms |
| II — The Siege | 6–10 | Amber | Three lanes, shields, splitters, **Iron Colossus** |
| III — System Breach | 11–15 | Violet | Amplifier support, Disruptor jamming, mixed threats |
| IV — Last Stand | 16–20 | Crimson | Full combined-arms pressure, **The Null Archon** |

**Tower unlocks:** Bolt Sentinel (W1) → Cryo Node (W3) → Arc Conductor (W5) → Rail Lancer (W7) → Nova Mortar (W9) → Amplifier Pylon (W11). Each unlock arrives as a non-blocking toast and becomes purchasable in the next build phase.

**Bosses:** the Iron Colossus (wave 10) cycles armored advance → charging energy shield → final push with escorts. The Null Archon (wave 20) advances, stops to deploy drones behind a breakable shield, then enters core-annihilation mode. Both have phase pips on the boss bar and telegraphed transitions.

**Economy:** 165 starting energy, reactor integrity 20, wave completion bonus `40 + 8 × wave`, small perfect-wave bonus, act-completion bonuses. After wave 20: victory screen with full run stats, then optional **Endless Mode** (wave 21+, deterministic seeds, boss every 5th wave, separate best-wave record).

## Controls

- **Build:** pick a tower in the shop, click a hex. Ghost + range preview shown.
- **Inspect:** click a placed tower → upgrade, sell, choose Lv3 specialization, set targeting (FIRST/LAST/STRONG/WEAK/FAST).
- **Wave:** `SPACE` or START WAVE. Speed `1–3×` (`+`/`-` or button).
- **Abilities:** `Z` EMP freeze · `X` Orbital Strike (click to aim) · `V` Overdrive.
- **Camera:** drag to pan, wheel/pinch to zoom, `C` recenter. Panning never places towers.
- **Pause:** `P`/`Esc`.

Mobile: bottom tower bar, touch build, pinch zoom, tap-vs-drag detection.

## Architecture

```
src/
  types/game.ts        shared types & enums
  grid/                axial hex math + board (routes/portals validated by tests)
  data/                towers, enemies, waves (authored campaign + endless generator), balance
  engine/              fixed-step loop, camera, input (pan/pinch), particles, procedural audio
  Game.ts              simulation, boss phases, acts, onboarding, rendering
  ui/UIManager.ts      shop, intel panel, toasts, menus, victory screen
tests/                 routes, campaign data spec, boss phases, full-campaign simulation
```

The combat engine is fully data-driven: waves, spawns, unlocks, boss phases and balance are editable in `src/data/` without touching the engine. All visuals are procedural Canvas 2D; all audio is synthesized with the Web Audio API.
