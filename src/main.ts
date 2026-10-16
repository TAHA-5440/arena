import { Game } from './Game';
import { UIManager } from './ui/UIManager';
import './styles/main.css';

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('uiRoot') as HTMLElement;
const game = new Game(canvas, uiRoot);
const ui = new UIManager(game, uiRoot);

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

// expose for debugging
(window as any).game = game;
