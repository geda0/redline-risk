/** Map renderer — the 2D world board.
 *
 *  42 territory nodes positioned on the normalized 0..1 layout, with an
 *  SVG layer beneath drawing the adjacency graph. Each node shows its
 *  troop count + name, filled with the owning player's color. Pure DOM —
 *  no canvas, no WebGL — so it styles with CSS and handles clicks
 *  natively.
 *
 *  render(state) repaints ownership + troops each time the game changes.
 *  highlight(ids) briefly pulses territories so the player can see what
 *  a command referred to. */

import { TERRITORIES, CONTINENTS, type Territory } from "../game/territories";
import type { GameState } from "../game/game-state";

export interface MapHandlers {
  onTerritoryClick?: (territoryId: string) => void;
}

export class MapRenderer {
  private board: HTMLDivElement;
  private svg: SVGSVGElement;
  private nodes = new Map<string, HTMLDivElement>();
  private playerColors = new Map<string, number>();

  constructor(private handlers: MapHandlers) {
    this.injectStyles();
    this.board = document.createElement("div");
    this.board.id = "board";
    document.body.appendChild(this.board);

    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.id = "board-lines";
    this.board.appendChild(this.svg);

    this.buildLines();
    this.buildNodes();
    window.addEventListener("resize", () => this.layout());
    // Defer the first layout until the board has a measured size.
    requestAnimationFrame(() => this.layout());
  }

  /** Register player colors so render() can paint ownership. */
  setPlayerColors(colors: Map<string, number>) {
    this.playerColors = colors;
  }

  private buildLines() {
    const drawn = new Set<string>();
    for (const t of Object.values(TERRITORIES)) {
      for (const adj of t.adjacent) {
        const key = [t.id, adj].sort().join("|");
        if (drawn.has(key)) continue;
        drawn.add(key);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("class", "adj-line");
        line.dataset.a = t.id;
        line.dataset.b = adj;
        this.svg.appendChild(line);
      }
    }
  }

  private buildNodes() {
    for (const t of Object.values(TERRITORIES)) {
      const node = document.createElement("div");
      node.className = "terr";
      node.dataset.id = t.id;
      const cont = CONTINENTS[t.continent];
      node.style.borderColor = hex(cont.color);
      node.innerHTML = `
        <div class="terr-troops">1</div>
        <div class="terr-name">${t.name}</div>
      `;
      node.addEventListener("click", () => this.handlers.onTerritoryClick?.(t.id));
      this.board.appendChild(node);
      this.nodes.set(t.id, node);
    }
  }

  /** Position nodes + lines for the current board size. */
  private layout() {
    const w = this.board.clientWidth;
    const h = this.board.clientHeight;
    if (w === 0 || h === 0) return;
    this.svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    this.svg.setAttribute("width", `${w}`);
    this.svg.setAttribute("height", `${h}`);
    const px = (t: Territory) => ({ x: t.x * w, y: t.y * h });
    for (const node of this.nodes.values()) {
      const t = TERRITORIES[node.dataset.id!]!;
      const p = px(t);
      node.style.left = `${p.x}px`;
      node.style.top = `${p.y}px`;
    }
    for (const line of Array.from(this.svg.querySelectorAll("line"))) {
      const a = TERRITORIES[(line as SVGLineElement).dataset.a!]!;
      const b = TERRITORIES[(line as SVGLineElement).dataset.b!]!;
      const pa = px(a), pb = px(b);
      // Skip the few map-wrapping links (very long straight lines look wrong).
      const long = Math.hypot(pa.x - pb.x, pa.y - pb.y) > w * 0.55;
      line.setAttribute("x1", `${pa.x}`);
      line.setAttribute("y1", `${pa.y}`);
      line.setAttribute("x2", `${pb.x}`);
      line.setAttribute("y2", `${pb.y}`);
      (line as SVGLineElement).style.opacity = long ? "0.12" : "0.34";
    }
  }

  /** Repaint ownership + troop counts from game state. */
  render(state: GameState) {
    for (const [tid, node] of this.nodes) {
      const h = state.ownership.get(tid);
      if (!h) continue;
      const color = this.playerColors.get(h.owner) ?? 0x888888;
      node.style.background = hexA(color, 0.82);
      const troopsEl = node.querySelector<HTMLDivElement>(".terr-troops");
      if (troopsEl) troopsEl.textContent = String(h.troops);
      // Bright ring on the player whose turn it is would be noisy; skip.
    }
  }

  /** Briefly pulse a set of territories — command feedback. */
  highlight(ids: string[], kind: "select" | "attack" | "good" = "select") {
    for (const id of ids) {
      const node = this.nodes.get(id);
      if (!node) continue;
      node.classList.remove("pulse-select", "pulse-attack", "pulse-good");
      // Force reflow so the animation restarts even on repeat.
      void node.offsetWidth;
      node.classList.add(
        kind === "attack" ? "pulse-attack" : kind === "good" ? "pulse-good" : "pulse-select",
      );
    }
  }

  private injectStyles() {
    if (document.getElementById("map-renderer-styles")) return;
    const s = document.createElement("style");
    s.id = "map-renderer-styles";
    s.textContent = `
      #board {
        position: absolute;
        left: 0; top: 32px;
        right: 240px; bottom: 150px;
        overflow: hidden;
      }
      #board-lines { position: absolute; left: 0; top: 0; pointer-events: none; }
      .adj-line { stroke: #6f8499; stroke-width: 1.5; }
      .terr {
        position: absolute;
        transform: translate(-50%, -50%);
        width: 58px; height: 40px;
        margin: 0;
        border: 2px solid #888;
        border-radius: 7px;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0,0,0,0.5);
        transition: transform 0.1s ease, box-shadow 0.1s ease;
        user-select: none;
      }
      .terr:hover {
        transform: translate(-50%, -50%) scale(1.12);
        box-shadow: 0 4px 14px rgba(0,0,0,0.7);
        z-index: 20;
      }
      .terr-troops {
        font-size: 16px; font-weight: 800; line-height: 1;
        color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.9);
      }
      .terr-name {
        font-size: 8px; line-height: 1.05; margin-top: 2px;
        color: rgba(255,255,255,0.92); text-align: center;
        text-shadow: 0 1px 2px rgba(0,0,0,0.95);
        max-width: 56px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
      }
      @keyframes pulse-sel  { 0%,100%{box-shadow:0 0 0 0 rgba(108,209,255,0);} 50%{box-shadow:0 0 0 6px rgba(108,209,255,0.6);} }
      @keyframes pulse-atk  { 0%,100%{box-shadow:0 0 0 0 rgba(255,90,90,0);}   50%{box-shadow:0 0 0 6px rgba(255,90,90,0.7);} }
      @keyframes pulse-good { 0%,100%{box-shadow:0 0 0 0 rgba(120,255,140,0);} 50%{box-shadow:0 0 0 6px rgba(120,255,140,0.7);} }
      .terr.pulse-select { animation: pulse-sel 0.6s ease-in-out 2; }
      .terr.pulse-attack { animation: pulse-atk 0.6s ease-in-out 2; }
      .terr.pulse-good   { animation: pulse-good 0.6s ease-in-out 2; }
    `;
    document.head.appendChild(s);
  }
}

function hex(n: number): string {
  return "#" + n.toString(16).padStart(6, "0");
}
function hexA(n: number, a: number): string {
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  return `rgba(${r},${g},${b},${a})`;
}
