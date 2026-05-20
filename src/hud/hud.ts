/** HUD — top status bar + right sidebar.
 *
 *  Top bar:  turn number · whose turn · phase · reinforcements left.
 *  Sidebar:  player standings (territories / troops), continent control,
 *            and a quick command reference.
 *
 *  Pure DOM. render(state) repaints everything from the GameState. */

import {
  type GameState, currentPlayer, territoriesOf, totalTroops,
  continentsControlledBy,
} from "../game/game-state";
import { CONTINENTS } from "../game/territories";

const PHASE_LABEL: Record<string, string> = {
  recruit: "RECRUIT", attack: "ATTACK", fortify: "FORTIFY", game_over: "GAME OVER",
};
const PHASE_COLOR: Record<string, string> = {
  recruit: "#6cd1ff", attack: "#ff8c6c", fortify: "#b9ff8c", game_over: "#ff8c8c",
};

export class Hud {
  private topBar: HTMLDivElement;
  private sidebar: HTMLDivElement;

  constructor() {
    this.injectStyles();
    this.topBar = document.createElement("div");
    this.topBar.id = "top-bar";
    document.body.appendChild(this.topBar);

    this.sidebar = document.createElement("div");
    this.sidebar.id = "sidebar";
    document.body.appendChild(this.sidebar);
  }

  render(state: GameState) {
    this.renderTopBar(state);
    this.renderSidebar(state);
  }

  private renderTopBar(state: GameState) {
    const p = currentPlayer(state);
    const phase = PHASE_LABEL[state.phase] ?? state.phase;
    const phaseColor = PHASE_COLOR[state.phase] ?? "#fff";
    let detail = "";
    if (state.phase === "recruit") {
      detail = `· <strong>${state.reinforcementsRemaining}</strong> reinforcements to place`;
    } else if (state.phase === "attack") {
      detail = `· declare your assaults`;
    } else if (state.phase === "fortify") {
      detail = state.fortifyUsed ? `· fortify spent` : `· one troop move available`;
    } else if (state.phase === "game_over") {
      const w = state.players.find((pl) => pl.id === state.winnerId);
      detail = `· <strong>${w?.name ?? "?"}</strong> conquers the world`;
    }
    this.topBar.innerHTML = `
      <span class="tb-turn">Turn ${state.turnNumber}</span>
      <span class="tb-player" style="color:${hex(p.color)}">${escapeHtml(p.name)}</span>
      <span class="tb-phase" style="background:${phaseBg(state.phase)};color:${phaseColor}">${phase}</span>
      <span class="tb-detail">${detail}</span>
      <span class="tb-title">REDLINE · RISK</span>
    `;
  }

  private renderSidebar(state: GameState) {
    // Players.
    let players = `<h4>COMMANDERS</h4>`;
    for (const p of state.players) {
      const terrs = territoriesOf(state, p.id).length;
      const troops = totalTroops(state, p.id);
      const dim = p.eliminated ? "opacity:0.35;text-decoration:line-through;" : "";
      const isCur = p.id === currentPlayer(state).id && !p.eliminated;
      players += `
        <div class="sb-player" style="${dim}">
          <span class="sb-dot" style="background:${hex(p.color)}"></span>
          <span class="sb-name">${escapeHtml(p.name)}${isCur ? " ◂" : ""}</span>
          <span class="sb-stat">${terrs}t · ${troops}a</span>
        </div>`;
    }
    // Continents.
    let conts = `<h4>CONTINENTS</h4>`;
    for (const c of Object.values(CONTINENTS)) {
      let holderId: string | null = null;
      for (const p of state.players) {
        if (continentsControlledBy(state, p.id).includes(c.id)) { holderId = p.id; break; }
      }
      const holder = holderId ? state.players.find((p) => p.id === holderId) : null;
      const holderTxt = holder
        ? `<span style="color:${hex(holder.color)}">${escapeHtml(holder.name)} +${c.bonus}</span>`
        : `<span class="sb-contested">contested</span>`;
      conts += `
        <div class="sb-cont">
          <span class="sb-dot" style="background:${hex(c.color)}"></span>
          <span class="sb-cname">${c.name}</span>
          <span class="sb-cstat">${holderTxt}</span>
        </div>`;
    }
    const help = `
      <h4>COMMANDS</h4>
      <div class="sb-help">
        <div><code>recruit 3 to brazil</code></div>
        <div><code>attack peru from brazil</code></div>
        <div><code>fortify 2 from x to y</code></div>
        <div><code>done</code> — next phase</div>
        <div><code>end turn</code></div>
      </div>`;
    this.sidebar.innerHTML = players + conts + help;
  }

  private injectStyles() {
    if (document.getElementById("hud-styles")) return;
    const s = document.createElement("style");
    s.id = "hud-styles";
    s.textContent = `
      :root { --panel: rgba(10,13,18,0.94); --border: rgba(90,104,120,0.4); }
      html,body {
        margin:0; height:100vh; overflow:hidden; background:#0c1016;
        color:#e7eef5; font-family: system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
      }
      #top-bar {
        position:absolute; top:0; left:0; right:0; height:32px;
        display:flex; align-items:center; gap:14px; padding:0 14px;
        background:var(--panel); border-bottom:1px solid var(--border);
        font-size:12px; z-index:30;
      }
      .tb-turn { color:#92aac3; }
      .tb-player { font-weight:700; letter-spacing:0.03em; }
      .tb-phase { padding:2px 8px; border-radius:3px; font-weight:700; font-size:11px; letter-spacing:0.06em; }
      .tb-detail { color:#cdd8e6; }
      .tb-title { margin-left:auto; color:#5a6a7c; font-size:11px; letter-spacing:0.18em; }
      #sidebar {
        position:absolute; top:32px; right:0; bottom:0; width:240px;
        background:var(--panel); border-left:1px solid var(--border);
        padding:12px; font-size:12px; overflow-y:auto; z-index:30;
      }
      #sidebar h4 {
        margin:14px 0 6px; font-size:10px; font-weight:600; letter-spacing:0.08em;
        text-transform:uppercase; color:#92aac3;
      }
      #sidebar h4:first-child { margin-top:0; }
      .sb-player,.sb-cont {
        display:flex; align-items:center; gap:7px; padding:3px 0;
      }
      .sb-dot { width:9px; height:9px; border-radius:50%; flex:0 0 auto; }
      .sb-name,.sb-cname { flex:1; color:#cdd8e6; }
      .sb-stat,.sb-cstat { color:#7a8a9c; font-size:11px; font-variant-numeric:tabular-nums; }
      .sb-contested { color:#6a7a8c; }
      .sb-help { font-size:11px; color:#9aabbd; line-height:1.7; }
      .sb-help code {
        background:rgba(50,62,78,0.7); padding:1px 4px; border-radius:2px;
        font-size:10px; color:#cfe0f0;
      }
    `;
    document.head.appendChild(s);
  }
}

function hex(n: number): string { return "#" + n.toString(16).padStart(6, "0"); }
function phaseBg(phase: string): string {
  return phase === "recruit" ? "#16283a" : phase === "attack" ? "#3a2016"
    : phase === "fortify" ? "#1c3a16" : "#3a1616";
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
