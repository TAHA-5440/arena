import { Game } from './Game';
import { UIManager } from './ui/UIManager';
import { crazyGamesSDK } from './sdk/CrazyGamesSDK';
import './styles/main.css';

// The platform measures the load window from here until the first gameplay
// start, so report the beginning of the load as early as possible.
crazyGamesSDK.loadingStart();

// --- Common browser fixes for embedded (iframe) play ------------------------
// Stop the page from scrolling under the canvas, and stop the browser context
// menu from appearing when the player right-clicks outside the canvas.
window.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', (e) => e.preventDefault());

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('uiRoot') as HTMLElement;
const game = new Game(canvas, uiRoot);
const ui = new UIManager(game, uiRoot);

// CrazyGames requires players to land directly in gameplay. The title screen
// stays reachable via PAUSE → MENU.
game.autoStart();

let lastState = game.state;
let lastVersion = game.uiVersion;
function frame() {
  // cheap per-frame DOM updates (cooldowns, affordability, countdown label)
  ui.updateDynamic();
  // full re-render on state or UI-version change
  if (game.state !== lastState || game.uiVersion !== lastVersion) {
    lastState = game.state;
    lastVersion = game.uiVersion;
    ui.render();
  }
  requestAnimationFrame(frame);
}
ui.render();
lastState = game.state;
lastVersion = game.uiVersion;
game.loop.start();
requestAnimationFrame(frame);

// One-time, non-blocking privacy notice for new players.
try {
  if (!localStorage.getItem('hexdefender_seen_notice')) {
    localStorage.setItem('hexdefender_seen_notice', '1');
    setTimeout(() => {
      ui.toast('This game collects no personal data — it all stays on your device. <span class="t-sub">Privacy notice in the menu.</span>');
    }, 2500);
  }
} catch { /* storage unavailable — skip the notice */ }

// expose for debugging
(window as any).game = game;
