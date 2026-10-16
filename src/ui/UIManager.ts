import { Game } from '../Game';
import { TOWER_DEFS, TOWER_ORDER, TOWER_SPECS } from '../data/towers';
import { ENEMY_DEFS } from '../data/enemies';
import { BALANCE } from '../data/balance';
import { WAVES } from '../data/waves';
import type { TowerType, Difficulty, EnemyType } from '../types/game';
import { TowerType as TT, GameState as GS, Difficulty as D } from '../types/game';

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export class UIManager {
  game: Game;
  root: HTMLElement;
  container: HTMLElement;
  toastRoot: HTMLElement;
  settingsReturn: GS = GS.MAIN_MENU;

  constructor(game: Game, root: HTMLElement) {
    this.game = game;
    this.root = root;
    this.container = document.createElement('div');
    this.container.id = 'uiContainer';
    root.appendChild(this.container);
    this.toastRoot = document.createElement('div');
    this.toastRoot.id = 'toastRoot';
    root.appendChild(this.toastRoot);
    this.render();
  }

  clear() { this.container.innerHTML = ''; }

  render() {
    const g = this.game;
    this.clear();
    switch (g.state) {
      case GS.BOOT: break;
      case GS.MAIN_MENU: this.renderMainMenu(); break;
      case GS.BUILD_PHASE:
      case GS.COMBAT_PHASE: this.renderGameplay(); break;
      case GS.PAUSED: this.renderGameplay(); this.renderPause(); break;
      case GS.VICTORY: this.renderVictory(); break;
      case GS.GAME_OVER: this.renderGameOver(); break;
      case GS.SETTINGS: this.renderSettings(); break;
      case GS.LEADERBOARD: this.renderLeaderboard(); break;
      case GS.HOW_TO: this.renderHowTo(); break;
    }
  }

  // -------------------------------------------------------------------------
  // Toasts (non-blocking notifications)
  // -------------------------------------------------------------------------

  toast(html: string, cls = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + cls;
    el.innerHTML = html;
    this.toastRoot.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, 4600);
  }

  /** Called every frame — cheap dynamic updates without a DOM re-render. */
  updateDynamic() {
    const g = this.game;
    // unlock toasts
    while (g.unlockToasts.length) {
      const t = g.unlockToasts.shift()!;
      const def = TOWER_DEFS[t];
      this.toast(`
        <div class="t-sil" style="background:${def.color}22;border:1px solid ${def.color};color:${def.color}">${def.name[0]}</div>
        <div><div class="t-title" style="color:${def.color}">UNLOCKED — ${def.name}</div>
        <div class="t-sub">${def.lesson}</div>
        <div class="t-cost">${def.cost} ⚡</div></div>`, 'unlock');
    }
    if (!this.container.isConnected) return;
    // shop affordability
    this.container.querySelectorAll<HTMLButtonElement>('.tower-btn[data-type]').forEach(b => {
      const t = b.dataset.type as TowerType;
      const def = TOWER_DEFS[t];
      const locked = !g.isTowerUnlocked(t);
      b.classList.toggle('afford', !locked && g.energy >= def.cost);
    });
    // ability buttons
    const abils: [string, number, number][] = [
      ['emp', g.cooldowns.emp, BALANCE.abilityCosts.emp],
      ['orbital', g.cooldowns.orbital, BALANCE.abilityCosts.orbital],
      ['overdrive', g.cooldowns.overdrive, BALANCE.abilityCosts.overdrive],
    ];
    for (const [k, cd, cost] of abils) {
      const el = this.container.querySelector(`#ab-${k}`);
      if (!el) continue;
      const sub = el.querySelector('.ab-sub');
      if (sub) sub.textContent = cd > 0 ? `${Math.ceil(cd)}s` : `${cost}⚡`;
      el.classList.toggle('ready', cd <= 0 && g.energy >= cost);
      el.classList.toggle('aiming', k === 'orbital' && g.orbitalAiming);
    }
    // start button label
    const btn = this.container.querySelector<HTMLButtonElement>('#btnStartWave');
    if (btn) {
      if (g.tutorial && g.tutorial.stage === 'countdown') {
        btn.textContent = `LAUNCH WAVE 1 (${Math.ceil(g.tutorial.countdown)})`;
      } else {
        const def = g.getUpcomingWave();
        if (!def) { btn.disabled = true; btn.textContent = 'CAMPAIGN COMPLETE'; }
        else {
          btn.disabled = false;
          btn.textContent = def.boss ? `START WAVE ${def.number} — BOSS` : `START WAVE ${def.number}`;
        }
      }
    }
    // upgrade button affordance
    const sel = g.getSelectedTower();
    const upBtn = this.container.querySelector<HTMLButtonElement>('#btnUpg');
    if (upBtn && sel) upBtn.disabled = sel.level >= 3 || g.energy < g.upgradeCost(sel);
  }

  // -------------------------------------------------------------------------
  // Menus
  // -------------------------------------------------------------------------

  renderMainMenu() {
    const g = this.game;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card" style="text-align:center;min-width:320px">
        <div class="title">HEX DEFENDER</div>
        <div class="subtitle">LAST CORE</div>
        <p class="small" style="margin-bottom:16px">20-wave campaign · 3 routes · 6 towers · 2 bosses</p>
        <button class="menu-btn" id="btnPlay">NEW CAMPAIGN</button>
        <button class="menu-btn" id="btnContinue" ${g.hasSave()?'':'disabled'}>CONTINUE</button>
        <button class="menu-btn" id="btnHow">HOW TO PLAY</button>
        <button class="menu-btn" id="btnScores">HIGH SCORES</button>
        <button class="menu-btn" id="btnSettings">SETTINGS</button>
        <div class="small" style="margin-top:12px">Best score: ${g.bestScore}${g.bestEndlessWave > 0 ? ` · Best endless wave: ${g.bestEndlessWave}` : ''}</div>
      </div>`;
    this.container.appendChild(el);
    el.querySelector('#btnPlay')!.addEventListener('click', () => {
      g.audio.click(); this.renderDifficultySelect();
    });
    el.querySelector('#btnContinue')!.addEventListener('click', () => {
      if (g.loadGame()) { g.audio.click(); this.render(); g.loop.start(); }
    });
    el.querySelector('#btnHow')!.addEventListener('click', () => { g.state = GS.HOW_TO; g.audio.click(); this.render(); });
    el.querySelector('#btnScores')!.addEventListener('click', () => { g.state = GS.LEADERBOARD; g.audio.click(); this.render(); });
    el.querySelector('#btnSettings')!.addEventListener('click', () => { this.settingsReturn = GS.MAIN_MENU; g.state = GS.SETTINGS; g.audio.click(); this.render(); });
  }

  renderDifficultySelect() {
    const g = this.game;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card" style="text-align:center">
        <div class="title" style="font-size:20px">SELECT DIFFICULTY</div>
        <button class="menu-btn" data-d="ROOKIE">ROOKIE<span class="small"> — forgiving</span></button>
        <button class="menu-btn" data-d="COMMANDER">COMMANDER<span class="small"> — standard</span></button>
        <button class="menu-btn" data-d="NIGHTMARE">NIGHTMARE<span class="small"> — brutal</span></button>
        <button class="menu-btn" style="background:transparent" id="btnBack">BACK</button>
      </div>`;
    this.container.appendChild(el);
    el.querySelectorAll('[data-d]').forEach(b => {
      b.addEventListener('click', () => {
        const d = (b as HTMLElement).dataset.d as Difficulty;
        g.audio.click();
        g.startRun(d);
        this.render();
        g.loop.start();
      });
    });
    el.querySelector('#btnBack')!.addEventListener('click', () => { this.render(); });
  }

  // -------------------------------------------------------------------------
  // Gameplay chrome
  // -------------------------------------------------------------------------

  renderGameplay() {
    const g = this.game;
    this.renderShop();
    this.renderIncoming();
    this.renderTowerDetails();
    this.renderAbilities();
    this.renderBottomBar();
  }

  renderShop() {
    const g = this.game;
    const shop = document.createElement('div');
    shop.className = 'tower-shop panel';
    shop.innerHTML = `<div class="panel-title">TOWERS</div>` +
      TOWER_ORDER.map(t => {
        const def = TOWER_DEFS[t];
        const unlocked = g.isTowerUnlocked(t);
        const sel = g.selectedTowerType === t ? 'selected' : '';
        if (!unlocked) {
          return `<button class="tower-btn locked" data-type="${t}" disabled>
            <div class="tower-icon lock">?</div>
            <div><div style="font-weight:600;font-size:12px">LOCKED</div><div class="small">Wave ${def.unlockWave}</div></div>
          </button>`;
        }
        return `<button class="tower-btn ${sel}" data-type="${t}">
          <div class="tower-icon" style="background:${def.color}22;border:1px solid ${def.color};color:${def.color}">${def.name[0]}</div>
          <div><div style="font-weight:600;font-size:12px">${def.name}</div><div class="small">${def.cost}⚡ · ${def.damage > 0 ? def.damage + ' dmg' : 'support'}</div></div>
        </button>`;
      }).join('');
    this.container.appendChild(shop);
    shop.querySelectorAll('.tower-btn[data-type]').forEach(b => {
      b.addEventListener('click', () => {
        const t = (b as HTMLElement).dataset.type as TowerType;
        g.selectedTowerType = (g.selectedTowerType === t) ? null : t;
        g.selectedTowerId = null;
        g.audio.click();
        this.render();
      });
    });
    const startWrap = document.createElement('div');
    startWrap.style.marginTop = '8px';
    const btn = document.createElement('button');
    btn.id = 'btnStartWave';
    btn.style.width = '100%';
    btn.textContent = 'START WAVE';
    btn.addEventListener('click', () => { g.audio.click(); g.startWaveIfReady(); this.render(); });
    startWrap.appendChild(btn);
    shop.appendChild(startWrap);
  }

  /** Build-phase intel: what the next wave sends, per route. */
  renderIncoming() {
    const g = this.game;
    if (g.state !== GS.BUILD_PHASE) return;
    const def = g.getUpcomingWave();
    if (!def) return;
    const seen = new Set<EnemyType>();
    for (let i = 0; i < WAVES.length && WAVES[i].number < def.number; i++) {
      const w = WAVES[i];
      if (!w.endless) {
        for (const gr of w.groups) seen.add(gr.type);
        if (w.boss) seen.add(w.boss.type);
      }
    }
    const lanes = new Map<number, Map<string, number>>();
    for (const gr of def.groups) {
      const m = lanes.get(gr.portal) || new Map<string, number>();
      const key = String(gr.type);
      m.set(key, (m.get(key) || 0) + gr.count);
      lanes.set(gr.portal, m);
    }
    const routeNames = ['ROUTE A · WEST', 'ROUTE B · NE', 'ROUTE C · SE'];
    const newRoute = def.activateRoute !== undefined && def.activateRoute + 1 > g.routesUnlocked;
    let html = `<div class="panel-title">${def.endless ? 'ENDLESS INTEL' : `INCOMING — WAVE ${def.number}`}</div>`;
    html += `<div class="small" style="margin-bottom:6px;color:${def.boss ? '#FF536A' : '#8496B5'}">${def.title}</div>`;
    for (let l = 0; l < 3; l++) {
      if (!lanes.has(l)) continue;
      const entries = [...lanes.get(l)!.entries()]
        .map(([k, c]) => {
          const et = k as unknown as EnemyType;
          const isNew = def.number <= 20 && !seen.has(et);
          const d = ENEMY_DEFS[et];
          const tip = `${d.name} — HP ${d.hp}${d.shield ? ` + ${d.shield} shield` : ''} · Speed ${d.speed.toFixed(2)} hex/s\n${d.desc}`;
          return `<span class="enemy-chip${isNew ? ' new' : ''}" title="${tip.replace(/"/g,'&quot;')}">${d.name} ×${c}${isNew ? ' ★' : ''}</span>`;
        }).join(' ');
      html += `<div class="lane-row"><span class="lane-name">${routeNames[l]}${l >= g.routesUnlocked ? ' · NEW' : ''}</span><span>${entries}</span></div>`;
    }
    if (def.boss) html += `<div class="boss-row">BOSS: ${def.boss.name} — Route ${String.fromCharCode(65 + def.boss.portal)}</div>`;
    if (newRoute) html += `<div class="boss-row" style="color:#FFB547">NEW ROUTE ACTIVATING — build for ${routeNames[def.activateRoute!]}</div>`;
    const el = document.createElement('div');
    el.className = 'incoming panel';
    el.innerHTML = html;
    this.container.appendChild(el);
  }

  renderTowerDetails() {
    const g = this.game;
    const sel = g.getSelectedTower();
    if (!sel) return;
    const def = TOWER_DEFS[sel.type];
    const upCost = g.upgradeCost(sel);
    let totalInv = def.cost;
    if (sel.level >= 2) totalInv += Math.round(def.cost * BALANCE.upgradeCost2);
    if (sel.level >= 3) totalInv += Math.round(def.cost * BALANCE.upgradeCost3);
    const refund = Math.floor(totalInv * BALANCE.sellRefund);
    const det = document.createElement('div');
    det.className = 'details panel';
    det.innerHTML = `
      <div style="font-weight:bold;color:${def.color};margin-bottom:6px">${def.name} · Lv${sel.level}</div>
      ${def.damage > 0 ? `
      <div class="row"><span>Damage</span><span>${Math.round(g.towerDamage(sel))}</span></div>
      <div class="row"><span>Interval</span><span>${def.interval.toFixed(2)}s</span></div>` : `
      <div class="row"><span>Boost</span><span>+${Math.round((sel.specReactorLink ? 0.30 : BALANCE.ampBoost) * 100)}% fire rate</span></div>`}
      <div class="row"><span>Range</span><span>${def.range} hex</span></div>
      <div class="row"><span>Kills</span><span>${sel.kills}</span></div>
      <div class="row"><span>Damage dealt</span><span>${Math.round(sel.damageDealt)}</span></div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button id="btnUpg" ${sel.level>=3?'disabled':''}>${sel.level>=3?'MAX':'Upgrade '+upCost+'⚡'}</button>
        <button id="btnSell">Sell ${refund}⚡</button>
      </div>
      ${sel.level === 2 ? `<div style="margin-top:8px"><div class="small">Choose a specialization:</div>
        <button id="spec1" style="margin:2px">${TOWER_SPECS[sel.type][0]}</button>
        <button id="spec2" style="margin:2px">${TOWER_SPECS[sel.type][1]}</button></div>` : ''}
      ${sel.level === 3 ? `<div class="small" style="margin-top:6px">Spec: ${TOWER_SPECS[sel.type][sel.spec - 1]}</div>` : ''}
      <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
        ${(['FIRST','LAST','STRONG','WEAK','FAST'] as const).map(m =>
          `<button class="mode-btn ${sel.targetMode===m?'on':''}" data-mode="${m}">${m}</button>`).join('')}
      </div>`;
    this.container.appendChild(det);
    det.querySelector('#btnUpg')!.addEventListener('click', () => { g.upgradeTower(sel, 1); this.render(); });
    det.querySelector('#btnSell')!.addEventListener('click', () => { g.sellTower(sel); g.audio.click(); this.render(); });
    det.querySelectorAll('[data-mode]').forEach(b => {
      b.addEventListener('click', () => {
        sel.targetMode = (b as HTMLElement).dataset.mode as any;
        g.audio.click(); this.render();
      });
    });
    if (sel.level === 2) {
      det.querySelector('#spec1')?.addEventListener('click', () => { g.audio.click(); g.upgradeTower(sel, 1); this.render(); });
      det.querySelector('#spec2')?.addEventListener('click', () => { g.audio.click(); g.upgradeTower(sel, 2); this.render(); });
    }
  }

  renderAbilities() {
    const g = this.game;
    const ab = document.createElement('div');
    ab.className = 'abilities panel';
    ab.innerHTML = `
      <button class="ab-btn" id="ab-emp" title="Freeze enemies near the core (Z)"><b>EMP</b><span class="ab-sub">${BALANCE.abilityCosts.emp}⚡</span></button>
      <button class="ab-btn" id="ab-orbital" title="Targeted area damage — click to aim (X)"><b>STRIKE</b><span class="ab-sub">${BALANCE.abilityCosts.orbital}⚡</span></button>
      <button class="ab-btn" id="ab-overdrive" title="Boost all tower fire rates (V)"><b>OVERDRIVE</b><span class="ab-sub">${BALANCE.abilityCosts.overdrive}⚡</span></button>`;
    this.container.appendChild(ab);
    ab.querySelector('#ab-emp')!.addEventListener('click', () => { g.activateEmp(); this.updateDynamic(); });
    ab.querySelector('#ab-orbital')!.addEventListener('click', () => { g.beginOrbitalAim(); this.updateDynamic(); });
    ab.querySelector('#ab-overdrive')!.addEventListener('click', () => { g.activateOverdrive(); this.updateDynamic(); });
  }

  renderBottomBar() {
    const g = this.game;
    const bottom = document.createElement('div');
    bottom.className = 'bottom-bar panel';
    bottom.innerHTML = `
      <button id="btnPause">PAUSE</button>
      <button id="btnSpeed">SPEED ${g.gameSpeed}x</button>`;
    this.container.appendChild(bottom);
    bottom.querySelector('#btnPause')!.addEventListener('click', () => { g.audio.click(); g.pause(); this.render(); });
    bottom.querySelector('#btnSpeed')!.addEventListener('click', () => {
      g.audio.click(); g.gameSpeed = g.gameSpeed >= 3 ? 1 : g.gameSpeed + 1; this.render();
    });
  }

  renderPause() {
    const g = this.game;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card" style="text-align:center">
        <div class="title" style="font-size:22px">PAUSED</div>
        <button class="menu-btn" id="btnResume">RESUME</button>
        <button class="menu-btn" id="btnRestart">RESTART RUN</button>
        <button class="menu-btn" id="btnSettings">SETTINGS</button>
        <button class="menu-btn" id="btnSaveExit">SAVE AND EXIT</button>
        <button class="menu-btn" id="btnMenu">MAIN MENU</button>
      </div>`;
    this.container.appendChild(el);
    el.querySelector('#btnResume')!.addEventListener('click', () => { g.audio.click(); g.resume(); this.render(); });
    el.querySelector('#btnRestart')!.addEventListener('click', () => { g.audio.click(); g.resetRun(); g.startRun(g.difficulty); this.render(); });
    el.querySelector('#btnSettings')!.addEventListener('click', () => { this.settingsReturn = GS.PAUSED; g.state = GS.SETTINGS; this.render(); });
    el.querySelector('#btnSaveExit')!.addEventListener('click', () => { g.saveGame(); g.state = GS.MAIN_MENU; g.loop.stop(); this.render(); });
    el.querySelector('#btnMenu')!.addEventListener('click', () => { g.saveGame(); g.state = GS.MAIN_MENU; g.loop.stop(); this.render(); });
  }

  // -------------------------------------------------------------------------
  // End screens
  // -------------------------------------------------------------------------

  renderVictory() {
    const g = this.game;
    const newBest = g.isNewBestScore;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card victory-card" style="text-align:center">
        ${newBest ? '<div class="newbest">★ NEW HIGH SCORE ★</div>' : ''}
        <div class="title" style="color:#54F7C5">THE LAST CORE SURVIVES</div>
        <div class="subtitle" style="margin-bottom:10px">CAMPAIGN COMPLETE</div>
        <div class="stats-grid">
          <div class="stat"><span>Final Score</span><b>${g.score}</b></div>
          <div class="stat"><span>Reactor Integrity</span><b>${g.reactorIntegrity}/${g.maxIntegrity}</b></div>
          <div class="stat"><span>Towers Constructed</span><b>${g.stats.towersBuilt}</b></div>
          <div class="stat"><span>Enemies Destroyed</span><b>${g.totalKills}</b></div>
          <div class="stat"><span>Energy Earned</span><b>${g.stats.energyEarned}</b></div>
          <div class="stat"><span>Highest Combo</span><b>x${g.stats.bestCombo.toFixed(1)}</b></div>
          <div class="stat"><span>Survival Time</span><b>${fmtTime(g.time - g.stats.startTime)}</b></div>
          <div class="stat"><span>Difficulty</span><b>${g.difficulty}</b></div>
        </div>
        <div class="row" style="margin-top:12px"><span>Leaderboard name</span><input id="lbName" maxlength="12" value="CMDR" style="width:120px"></div>
        <button class="menu-btn" id="btnEndless">CONTINUE — ENDLESS MODE</button>
        <button class="menu-btn" id="btnAgain">PLAY AGAIN</button>
        <button class="menu-btn" id="btnMenu">MAIN MENU</button>
      </div>`;
    this.container.appendChild(el);
    if (newBest) this.game.audio.celebrate();
    const submit = () => {
      const input = el.querySelector('#lbName') as HTMLInputElement | null;
      g.submitScore(input ? input.value : 'CMDR');
    };
    el.querySelector('#btnEndless')!.addEventListener('click', () => { submit(); g.audio.click(); g.startEndless(); this.render(); g.loop.start(); });
    el.querySelector('#btnAgain')!.addEventListener('click', () => { submit(); g.audio.click(); g.resetRun(); g.startRun(g.difficulty); this.render(); });
    el.querySelector('#btnMenu')!.addEventListener('click', () => { submit(); g.audio.click(); g.clearSave(); g.state = GS.MAIN_MENU; g.loop.stop(); this.render(); });
  }

  renderGameOver() {
    const g = this.game;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card" style="text-align:center">
        <div class="title" style="color:#FF536A">CORE DESTROYED</div>
        <div class="subtitle" style="margin-bottom:10px">${g.mode === 'endless' ? `Endless run — wave ${g.wave}` : `Fell on wave ${g.wave}`}</div>
        <div class="stats-grid">
          <div class="stat"><span>Score</span><b>${g.score}</b></div>
          <div class="stat"><span>Enemies Destroyed</span><b>${g.totalKills}</b></div>
          <div class="stat"><span>Towers Built</span><b>${g.stats.towersBuilt}</b></div>
          <div class="stat"><span>Best Combo</span><b>x${g.stats.bestCombo.toFixed(1)}</b></div>
        </div>
        <div class="row" style="margin-top:12px"><span>Leaderboard name</span><input id="lbName" maxlength="12" value="CMDR" style="width:120px"></div>
        <button class="menu-btn" id="btnRetry">RETRY</button>
        <button class="menu-btn" id="btnMenu">MAIN MENU</button>
      </div>`;
    this.container.appendChild(el);
    const submit = () => {
      const input = el.querySelector('#lbName') as HTMLInputElement | null;
      g.submitScore(input ? input.value : 'CMDR');
    };
    el.querySelector('#btnRetry')!.addEventListener('click', () => { submit(); g.audio.click(); g.resetRun(); g.startRun(g.difficulty); this.render(); g.loop.start(); });
    el.querySelector('#btnMenu')!.addEventListener('click', () => { submit(); g.audio.click(); g.state = GS.MAIN_MENU; g.loop.stop(); this.render(); });
  }

  // -------------------------------------------------------------------------
  // Settings / leaderboard / how-to
  // -------------------------------------------------------------------------

  renderSettings() {
    const g = this.game;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card">
        <div class="title" style="font-size:20px">SETTINGS</div>
        <div class="row"><span>SFX Volume</span><input type="range" min="0" max="1" step="0.05" value="${g.settings.sfxVolume}" id="sfx"></div>
        <div class="row"><span>Music Volume</span><input type="range" min="0" max="1" step="0.05" value="${g.settings.musicVolume}" id="mus"></div>
        <div class="row"><span>Quality</span>
          <select id="qual">
            <option value="low" ${g.settings.quality==='low'?'selected':''}>Low</option>
            <option value="medium" ${g.settings.quality==='medium'?'selected':''}>Medium</option>
            <option value="high" ${g.settings.quality==='high'?'selected':''}>High</option>
          </select>
        </div>
        <div class="row"><span>Reduced Motion</span><input type="checkbox" id="rm" ${g.settings.reducedMotion?'checked':''}></div>
        <div class="row"><span>Show FPS</span><input type="checkbox" id="fps" ${g.settings.showFps?'checked':''}></div>
        <button class="menu-btn" id="btnBack" style="margin-top:12px">BACK</button>
      </div>`;
    this.container.appendChild(el);
    const upd = () => { g.saveSettings(); };
    el.querySelector('#sfx')!.addEventListener('input', (e:any) => { g.settings.sfxVolume = parseFloat(e.target.value); upd(); });
    el.querySelector('#mus')!.addEventListener('input', (e:any) => { g.settings.musicVolume = parseFloat(e.target.value); upd(); });
    el.querySelector('#qual')!.addEventListener('change', (e:any) => { g.settings.quality = e.target.value; upd(); g.loadSettings(); });
    el.querySelector('#rm')!.addEventListener('change', (e:any) => { g.settings.reducedMotion = e.target.checked; upd(); });
    el.querySelector('#fps')!.addEventListener('change', (e:any) => { g.settings.showFps = e.target.checked; upd(); });
    el.querySelector('#btnBack')!.addEventListener('click', () => {
      g.audio.click();
      g.state = this.settingsReturn === GS.PAUSED ? GS.PAUSED : GS.MAIN_MENU;
      this.render();
    });
  }

  renderLeaderboard() {
    const g = this.game;
    const rows = g.leaderboard.map((e,i) => `<tr><td>${i+1}</td><td>${e.name}</td><td>${e.score}</td><td>${e.wave}</td><td>${e.mode}</td><td>${e.difficulty}</td><td>${e.date}</td></tr>`).join('');
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card">
        <div class="title" style="font-size:20px">HIGH SCORES</div>
        <table style="width:100%;font-size:12px;border-collapse:collapse">
          <tr style="color:#00E5FF"><th>#</th><th>Name</th><th>Score</th><th>Wave</th><th>Mode</th><th>Diff</th><th>Date</th></tr>
          ${rows || '<tr><td colspan="7" style="text-align:center;color:#8496B5">No scores yet</td></tr>'}
        </table>
        <button class="menu-btn" id="btnBack" style="margin-top:12px">BACK</button>
      </div>`;
    this.container.appendChild(el);
    el.querySelector('#btnBack')!.addEventListener('click', () => { g.audio.click(); g.state = GS.MAIN_MENU; this.render(); });
  }

  renderHowTo() {
    const g = this.game;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card" style="max-width:640px">
        <div class="title" style="font-size:20px">HOW TO PLAY</div>
        <p class="small" style="line-height:1.65;text-align:left">
          Defend the central reactor through a <b>20-wave campaign</b> across four acts. Enemies march from
          portals along three fixed routes. New towers unlock as the campaign progresses:
          Bolt (W1) → Cryo (W3) → Arc (W5) → Rail (W7) → Nova (W9) → Amplifier (W11).<br><br>
          <b>Build:</b> pick a tower, click a hex. Drag to pan, wheel/pinch to zoom, C to recenter.
          <b>Inspect:</b> click a placed tower to upgrade, sell or change targeting.
          <b>Waves:</b> SPACE or START WAVE. Speed 1–3× with the button or +/-.
          <b>Abilities:</b> Z = EMP freeze, X = Orbital Strike (click to aim), V = Overdrive.
          <b>Leak:</b> every enemy that reaches the core damages reactor integrity — at zero, the run ends.<br><br>
          <b>Towers:</b> Bolt = cheap DPS · Cryo = slow · Arc = chain vs swarms · Rail = armor &amp; bosses ·
          Nova = area blast vs splits · Amplifier = fire-rate buff.<br><br>
          <b>Enemies:</b> Bruisers armor up, Dashers sprint, Shield Guards carry barriers, Splitters break in two,
          Disruptors jam your towers. Bosses at waves 10 (Iron Colossus) and 20 (The Null Archon) have phases —
          watch for telegraphs.
        </p>
        <button class="menu-btn" id="btnBack" style="margin-top:12px">BACK</button>
      </div>`;
    this.container.appendChild(el);
    el.querySelector('#btnBack')!.addEventListener('click', () => { g.audio.click(); g.state = GS.MAIN_MENU; this.render(); });
  }
}
