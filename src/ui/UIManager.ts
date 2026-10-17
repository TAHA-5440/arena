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

  private lastHoverBtn: Element | null = null;

  constructor(game: Game, root: HTMLElement) {
    this.game = game;
    this.root = root;
    this.container = document.createElement('div');
    this.container.id = 'uiContainer';
    root.appendChild(this.container);
    this.toastRoot = document.createElement('div');
    this.toastRoot.id = 'toastRoot';
    root.appendChild(this.toastRoot);
    this.container.addEventListener('mouseover', (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest) return;
      const btn = t.closest('button');
      if (!btn || btn === this.lastHoverBtn || btn.disabled) return;
      this.lastHoverBtn = btn;
      this.game.audio.hover();
    });
    this.container.addEventListener('mouseout', (e) => {
      const t = e.target as HTMLElement | null;
      const btn = t?.closest?.('button');
      if (btn && btn === this.lastHoverBtn) this.lastHoverBtn = null;
    });
    this.render();
  }

  clear() { this.container.innerHTML = ''; }

  render() {
    const g = this.game;
    this.lastHoverBtn = null;
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
    const coach = g.getCoach();
    const card = this.container.querySelector('#coachCard');
    if (card && coach) {
      const title = card.querySelector('#coachTitle');
      const body = card.querySelector('#coachBody');
      const hint = card.querySelector('#coachHint');
      if (title) title.textContent = coach.title;
      if (body) body.textContent = coach.body;
      if (hint) hint.textContent = coach.hint;
    } else if (card && !coach) {
      card.remove();
    }
    this.container.querySelector('.tower-shop')?.classList.toggle('coach-spot', !!coach && (coach.spotlight === 'shop' || coach.spotlight === 'hex'));
    this.container.querySelector('.incoming')?.classList.toggle('coach-spot', !!coach && (coach.spotlight === 'start' || coach.spotlight === 'combat'));
    this.container.querySelector('#btnStartWave')?.classList.toggle('coach-spot-btn', !!coach && (coach.spotlight === 'start' || coach.spotlight === 'shop'));
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
          const intel = g.getUpcomingIntel();
          const letters = ['A', 'B', 'C'];
          const lanes = intel ? [...intel.portals.keys()].sort().map(i => letters[i]).join('/') : '';
          btn.textContent = def.boss
            ? `START WAVE ${def.number} — BOSS${lanes ? ' VIA ' + lanes : ''}`
            : `START WAVE ${def.number}${lanes ? ' · VIA ' + lanes : ''}`;
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

  private peekSave(): { wave: number; mode: string; difficulty: string } | null {
    try {
      const raw = localStorage.getItem('hexdefender_save');
      if (!raw) return null;
      const d = JSON.parse(raw);
      return { wave: d.wave ?? 0, mode: d.mode || 'campaign', difficulty: d.difficulty || 'COMMANDER' };
    } catch { return null; }
  }

  private mountTitleScreen(bodyHtml: string, mode: 'home' | 'diff' = 'home'): HTMLElement {
    this.clear();
    const g = this.game;
    const save = this.peekSave();
    const el = document.createElement('div');
    el.className = 'overlay title-screen'
      + (mode === 'diff' ? ' diff' : '')
      + (g.settings.reducedMotion ? ' reduced' : '');
    el.innerHTML = `
      <div class="ts-fx" aria-hidden="true">
        <div class="ts-vignette"></div>
        <div class="ts-grain"></div>
        <div class="ts-scan"></div>
        <div class="ts-sweep"></div>
        <span class="ts-corner tl"></span>
        <span class="ts-corner tr"></span>
        <span class="ts-corner bl"></span>
        <span class="ts-corner br"></span>
      </div>
      <header class="ts-top">
        <span class="ts-chip">FORTRESS // CENTRAL REACTOR</span>
        <span class="ts-chip live"><i></i> CORE STABLE</span>
        <span class="ts-chip">20-WAVE CAMPAIGN</span>
      </header>
      <aside class="ts-telemetry" aria-hidden="true">
        <div>GRID HEX-00</div>
        <div>CORE 100%</div>
        <div>ROUTES 03</div>
        <div>TOWERS 06</div>
        <div>BOSSES 02</div>
        <div>STARDATE 26.10.17</div>
      </aside>
      <div class="ts-main">
        <div class="ts-brand">
          <div class="ts-sigil" aria-hidden="true">
            <svg viewBox="0 0 80 80">
              <polygon points="40,4 72,22 72,58 40,76 8,58 8,22" fill="none" stroke="#00E5FF" stroke-width="1.7"/>
              <polygon points="40,16 62,28 62,52 40,64 18,52 18,28" fill="none" stroke="#00E5FF" stroke-width="1" opacity="0.42"/>
              <circle cx="40" cy="40" r="6.5" fill="#00E5FF"/>
              <circle cx="40" cy="40" r="13" fill="none" stroke="#00E5FF" stroke-width="1" opacity="0.7"/>
              <line x1="40" y1="8" x2="40" y2="22" stroke="#00E5FF" stroke-width="1" opacity="0.7"/>
            </svg>
          </div>
          <div class="ts-kicker">OPERATION LAST LIGHT</div>
          <h1 class="ts-title">HEX DEFENDER</h1>
          <h2 class="ts-sub">LAST CORE</h2>
          <p class="ts-log">Humanity’s last reactor. Three invasion routes. Twenty waves. A briefing walks you through the first.</p>
        </div>
        ${bodyHtml}
      </div>
      <footer class="ts-foot">
        <span>BEST // ${g.bestScore}</span>
        <span>ENDLESS // ${g.bestEndlessWave > 0 ? 'W' + g.bestEndlessWave : '—'}</span>
        <span>${save ? `SAVE // W${save.wave} ${save.difficulty}` : 'NO SAVE FILE'}</span>
        <span class="ts-foot-right"><button class="ts-foot-btn" id="btnPrivacy">PRIVACY</button> &nbsp;·&nbsp; CLASSIFIED // CMDR ACCESS</span>
      </footer>`;
    this.container.appendChild(el);
    el.querySelector('#btnPrivacy')?.addEventListener('click', () => { g.audio.click(); this.renderPrivacy(); });
    return el;
  }

  /**
   * Privacy & terms notice. The game collects no personal data, so this is a
   * simple non-blocking notice rather than a consent pop-up.
   */
  renderPrivacy() {
    const el = document.createElement('div');
    el.className = 'overlay cinematic';
    el.innerHTML = `
      <div class="card" style="max-width:640px">
        <div class="title" style="font-size:20px">PRIVACY &amp; TERMS</div>
        <div class="privacy-body">
          <p><b>No personal data is collected.</b> Everything the game stores — your save file,
             high scores and audio settings — lives in this browser's local storage on your own
             device. Nothing is uploaded to us or to any other server.</p>
          <p>When you play on CrazyGames, the platform's SDK records anonymous gameplay events
             (when a run starts and stops, and when a boss is defeated) so the site can report
             game statistics and run its own features. The platform also keeps your progress in
             your CrazyGames account when you are signed in, under CrazyGames' own privacy policy.</p>
          <p>This game makes no network requests of its own, embeds no third-party content, shows
             no advertising, and never asks for an account, name or email address.</p>
          <p>You can erase everything the game has stored at any time by clearing this site's
             data in your browser settings.</p>
          <p>By continuing to play you accept these terms.</p>
        </div>
        <button class="menu-btn" id="btnBack" style="margin-top:14px">CLOSE</button>
      </div>`;
    this.container.appendChild(el);
    el.querySelector('#btnBack')!.addEventListener('click', () => {
      this.game.audio.click();
      el.remove();
    });
  }

  renderMainMenu() {
    const g = this.game;
    const save = this.peekSave();
    const el = this.mountTitleScreen(`
      <nav class="ts-nav">
        <button class="ts-btn primary" id="btnPlay">
          <span class="ts-idx">01</span>
          <span class="ts-copy"><span class="ts-label">NEW CAMPAIGN</span><span class="ts-hint">Authorize a 20-wave defense</span></span>
          <span class="ts-chev">▸</span>
        </button>
        <button class="ts-btn" id="btnContinue" ${save ? '' : 'disabled'}>
          <span class="ts-idx">02</span>
          <span class="ts-copy"><span class="ts-label">CONTINUE</span><span class="ts-hint">${save ? `Resume wave ${save.wave} · ${save.difficulty}${save.mode === 'endless' ? ' · endless' : ''}` : 'No save file detected'}</span></span>
          <span class="ts-chev">▸</span>
        </button>
        <button class="ts-btn" id="btnHow">
          <span class="ts-idx">03</span>
          <span class="ts-copy"><span class="ts-label">HOW TO PLAY</span><span class="ts-hint">Core, hexes, waves, abilities</span></span>
          <span class="ts-chev">▸</span>
        </button>
        <button class="ts-btn" id="btnScores">
          <span class="ts-idx">04</span>
          <span class="ts-copy"><span class="ts-label">HIGH SCORES</span><span class="ts-hint">Campaign and endless records</span></span>
          <span class="ts-chev">▸</span>
        </button>
        <button class="ts-btn" id="btnSettings">
          <span class="ts-idx">05</span>
          <span class="ts-copy"><span class="ts-label">SETTINGS</span><span class="ts-hint">Audio, quality, motion</span></span>
          <span class="ts-chev">▸</span>
        </button>
      </nav>`);
    el.querySelector('#btnPlay')!.addEventListener('click', () => {
      g.audio.click(); this.renderDifficultySelect();
    });
    el.querySelector('#btnContinue')!.addEventListener('click', () => {
      if (g.loadGame()) { g.audio.click(); this.render(); g.loop.start(); }
    });
    el.querySelector('#btnHow')!.addEventListener('click', () => { g.setState(GS.HOW_TO); g.audio.click(); g.audio.menuOpen(); this.render(); });
    el.querySelector('#btnScores')!.addEventListener('click', () => { g.setState(GS.LEADERBOARD); g.audio.click(); g.audio.menuOpen(); this.render(); });
    el.querySelector('#btnSettings')!.addEventListener('click', () => { this.settingsReturn = GS.MAIN_MENU; g.setState(GS.SETTINGS); g.audio.click(); g.audio.menuOpen(); this.render(); });
  }

  renderDifficultySelect() {
    const g = this.game;
    const el = this.mountTitleScreen(`
      <nav class="ts-nav ts-diff">
        <div class="ts-section">THREAT AUTHORIZATION</div>
        <button class="ts-btn ts-diff-btn rook" data-d="ROOKIE">
          <span class="ts-idx">01</span>
          <span class="ts-copy"><span class="ts-label">ROOKIE</span><span class="ts-hint">−25% hull · slower hosts · extra salvage</span></span>
          <span class="ts-tag">FORGIVING</span>
        </button>
        <button class="ts-btn ts-diff-btn primary" data-d="COMMANDER">
          <span class="ts-idx">02</span>
          <span class="ts-copy"><span class="ts-label">COMMANDER</span><span class="ts-hint">The intended siege — leaks will cost you</span></span>
          <span class="ts-tag">RECOMMENDED</span>
        </button>
        <button class="ts-btn ts-diff-btn night" data-d="NIGHTMARE">
          <span class="ts-idx">03</span>
          <span class="ts-copy"><span class="ts-label">NIGHTMARE</span><span class="ts-hint">+30% hull · faster hosts · less salvage</span></span>
          <span class="ts-tag">BRUTAL</span>
        </button>
        <button class="ts-btn ghost" id="btnBack">
          <span class="ts-idx">←</span>
          <span class="ts-copy"><span class="ts-label">BACK</span><span class="ts-hint">Return to command</span></span>
        </button>
      </nav>`, 'diff');
    el.querySelectorAll('[data-d]').forEach(b => {
      b.addEventListener('click', () => {
        const d = (b as HTMLElement).dataset.d as Difficulty;
        g.audio.click();
        g.startRun(d);
        this.render();
        g.loop.start();
      });
    });
    el.querySelector('#btnBack')!.addEventListener('click', () => { g.audio.click(); this.render(); });
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
    this.renderCoach();
  }

  renderCoach() {
    const g = this.game;
    const card = g.getCoach();
    if (!card) return;
    const el = document.createElement('div');
    el.className = 'coach panel';
    el.id = 'coachCard';
    el.innerHTML = `
      <div class="coach-kicker">${card.kicker} · ${card.index}/${card.total}</div>
      <div class="coach-title" id="coachTitle">${card.title}</div>
      <div class="coach-body" id="coachBody">${card.body}</div>
      <div class="coach-hint" id="coachHint">${card.hint}</div>
      <div class="coach-actions">
        <button type="button" id="btnCoachSkip" class="coach-skip">Skip briefing</button>
      </div>`;
    this.container.appendChild(el);
    el.querySelector('#btnCoachSkip')!.addEventListener('click', (e) => {
      e.stopPropagation();
      g.audio.click();
      g.skipCoach();
      this.render();
    });
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
        g.audio.select();
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
    const recap = g.lastWaveRecap;
    let html = recap
      ? `<div class="wave-recap${recap.perfect ? ' perfect' : ''}">WAVE ${recap.wave} CLEARED · ${recap.killed} down · ${recap.leaked} leaked${recap.perfect ? ' · PERFECT' : ''} · +${recap.energy}⚡</div>`
      : '';
    html += `<div class="panel-title">${def.endless ? 'ENDLESS INTEL' : `INCOMING — WAVE ${def.number}`}</div>`;
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
    el.querySelector('#btnSettings')!.addEventListener('click', () => { this.settingsReturn = GS.PAUSED; g.setState(GS.SETTINGS); g.audio.menuOpen(); this.render(); });
    el.querySelector('#btnSaveExit')!.addEventListener('click', () => { g.saveGame(); g.paused = false; g.audio.onResume(); g.setState(GS.MAIN_MENU); g.audio.startMusic(); g.loop.stop(); this.render(); });
    el.querySelector('#btnMenu')!.addEventListener('click', () => { g.saveGame(); g.paused = false; g.audio.onResume(); g.setState(GS.MAIN_MENU); g.audio.startMusic(); g.loop.stop(); this.render(); });
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
    el.querySelector('#btnMenu')!.addEventListener('click', () => { submit(); g.audio.click(); g.clearSave(); g.paused = false; g.audio.onResume(); g.setState(GS.MAIN_MENU); g.audio.startMusic(); g.loop.stop(); this.render(); });
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
    el.querySelector('#btnMenu')!.addEventListener('click', () => { submit(); g.audio.click(); g.paused = false; g.audio.onResume(); g.setState(GS.MAIN_MENU); g.audio.startMusic(); g.loop.stop(); this.render(); });
  }

  // -------------------------------------------------------------------------
  // Settings / leaderboard / how-to
  // -------------------------------------------------------------------------

  renderSettings() {
    const g = this.game;
    const el = document.createElement('div');
    el.className = 'overlay cinematic';
    el.innerHTML = `
      <div class="card">
        <div class="title" style="font-size:20px">SETTINGS</div>
        <div class="row"><span>Master Volume</span><input type="range" min="0" max="1" step="0.05" value="${g.settings.masterVolume}" id="master"></div>
        <div class="row"><span>Music Volume</span><input type="range" min="0" max="1" step="0.05" value="${g.settings.musicVolume}" id="mus"></div>
        <div class="row"><span>Sound Effects</span><input type="range" min="0" max="1" step="0.05" value="${g.settings.sfxVolume}" id="sfx"></div>
        <div class="row"><span>UI Volume</span><input type="range" min="0" max="1" step="0.05" value="${g.settings.uiVolume}" id="ui"></div>
        <div class="row"><span>Mute All</span><input type="checkbox" id="mute" ${g.settings.muted?'checked':''}></div>
        <div class="row"><span>Audio Quality</span>
          <select id="aq">
            <option value="low" ${g.settings.audioQuality==='low'?'selected':''}>Low</option>
            <option value="standard" ${g.settings.audioQuality==='standard'?'selected':''}>Standard</option>
            <option value="high" ${g.settings.audioQuality==='high'?'selected':''}>High</option>
          </select>
        </div>
        <div class="row"><span>Graphics Quality</span>
          <select id="qual">
            <option value="low" ${g.settings.quality==='low'?'selected':''}>Low</option>
            <option value="medium" ${g.settings.quality==='medium'?'selected':''}>Medium</option>
            <option value="high" ${g.settings.quality==='high'?'selected':''}>High</option>
          </select>
        </div>
        <div class="row"><span>Reduced Motion</span><input type="checkbox" id="rm" ${g.settings.reducedMotion?'checked':''}></div>
        <div class="row"><span>Show FPS</span><input type="checkbox" id="fps" ${g.settings.showFps?'checked':''}></div>
        <div class="row"><span>Privacy &amp; Terms</span><button class="menu-btn" id="btnPrivacy" style="width:auto;margin:0;padding:5px 12px;font-size:11px">VIEW NOTICE</button></div>
        <button class="menu-btn" id="btnBack" style="margin-top:12px">BACK</button>
      </div>`;
    this.container.appendChild(el);
    const upd = () => { g.saveSettings(); };
    el.querySelector('#master')!.addEventListener('input', (e:any) => { g.settings.masterVolume = parseFloat(e.target.value); upd(); });
    el.querySelector('#sfx')!.addEventListener('input', (e:any) => { g.settings.sfxVolume = parseFloat(e.target.value); upd(); });
    el.querySelector('#mus')!.addEventListener('input', (e:any) => { g.settings.musicVolume = parseFloat(e.target.value); upd(); });
    el.querySelector('#ui')!.addEventListener('input', (e:any) => { g.settings.uiVolume = parseFloat(e.target.value); upd(); });
    el.querySelector('#mute')!.addEventListener('change', (e:any) => { g.settings.muted = e.target.checked; upd(); });
    el.querySelector('#aq')!.addEventListener('change', (e:any) => { g.settings.audioQuality = e.target.value; upd(); });
    el.querySelector('#qual')!.addEventListener('change', (e:any) => { g.settings.quality = e.target.value; upd(); g.loadSettings(); });
    el.querySelector('#rm')!.addEventListener('change', (e:any) => { g.settings.reducedMotion = e.target.checked; upd(); });
    el.querySelector('#fps')!.addEventListener('change', (e:any) => { g.settings.showFps = e.target.checked; upd(); });
    el.querySelector('#btnPrivacy')!.addEventListener('click', () => { g.audio.click(); this.renderPrivacy(); });
    el.querySelector('#btnBack')!.addEventListener('click', () => {
      g.audio.click();
      g.audio.menuClose();
      g.setState(this.settingsReturn === GS.PAUSED ? GS.PAUSED : GS.MAIN_MENU);
      this.render();
    });
  }

  renderLeaderboard() {
    const g = this.game;
    const rows = g.leaderboard.map((e,i) => `<tr><td>${i+1}</td><td>${e.name}</td><td>${e.score}</td><td>${e.wave}</td><td>${e.mode}</td><td>${e.difficulty}</td><td>${e.date}</td></tr>`).join('');
    const el = document.createElement('div');
    el.className = 'overlay cinematic';
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
    el.querySelector('#btnBack')!.addEventListener('click', () => { g.audio.click(); g.audio.menuClose(); g.setState(GS.MAIN_MENU); this.render(); });
  }

  renderHowTo() {
    const g = this.game;
    const el = document.createElement('div');
    el.className = 'overlay cinematic';
    el.innerHTML = `
      <div class="card" style="max-width:680px">
        <div class="title" style="font-size:20px">HOW TO PLAY</div>
        <div class="howto-grid">
          <div class="howto-step"><div class="howto-n">1</div><div><b>Protect the core</b><div class="small">The glowing reactor in the center is your life. Integrity is the top bar. If it hits 0, the run ends.</div></div></div>
          <div class="howto-step"><div class="howto-n">2</div><div><b>Build on hexes</b><div class="small">Pick a tower in the right shop, then click a valid hex. You cannot build on routes or portals. Towers fire automatically.</div></div></div>
          <div class="howto-step"><div class="howto-n">3</div><div><b>Start waves, earn energy</b><div class="small">SPACE or START WAVE. Destroyed enemies and wave bonuses grant ⚡. Spend it between waves — you choose when to continue.</div></div></div>
          <div class="howto-step"><div class="howto-n">4</div><div><b>Upgrade and use abilities</b><div class="small">Click a tower to upgrade, sell, or retarget. Z EMP freeze · X Orbital Strike · V Overdrive. Speed 1–3× with +/−.</div></div></div>
        </div>
        <p class="small" style="line-height:1.65;text-align:left;margin-top:12px">
          <b>Unlocks:</b> Bolt (W1) → Cryo (W3) → Arc (W5) → Rail (W7) → Nova (W9) → Amplifier (W11).<br>
          <b>Towers:</b> Bolt = cheap DPS · Cryo = slow · Arc = chain vs groups · Rail = armor &amp; bosses · Nova = blasts · Amp = fire-rate buff.<br>
          <b>Threats:</b> Bruisers soak fire, Dashers sprint, Shield Guards block, Splitters divide, Disruptors jam towers. Bosses at waves 10 and 20 have telegraphed phases.
        </p>
        <button class="menu-btn" id="btnBack" style="margin-top:12px">BACK</button>
      </div>`;
    this.container.appendChild(el);
    el.querySelector('#btnBack')!.addEventListener('click', () => { g.audio.click(); g.audio.menuClose(); g.setState(GS.MAIN_MENU); this.render(); });
  }
}
