/** REDLINE: Risk — bootstrap + game loop.
 *
 *  Wires the board, HUD, command bar, and Atlas voice to the turn engine.
 *  You play one commander; the rest are AI. You issue orders in natural
 *  language ("recruit 5 to brazil", "attack peru from brazil", "done");
 *  Atlas executes them, narrates the dice, and runs the opponents' turns. */

import {
  createGame, currentPlayer, type GameState, type Player,
  reinforcementCount, territoriesOf, isGameOver,
} from "./game/game-state";
import {
  beginTurn, recruit, recruitAll, attack, fortify, advancePhase,
  makePlayer, type EngineHooks,
} from "./game/turn-engine";
import { aiTakeTurn } from "./game/ai-player";
import { parseCommand, territoryName } from "./game/intent-parser";
import { TERRITORIES, areAdjacent } from "./game/territories";
import { Hud } from "./hud/hud";
import { MapRenderer } from "./hud/map-renderer";
import { CommandBar } from "./hud/command-bar";
import { AtlasBank } from "./voice/atlas-bank";

// ── Players — one human commander, the rest AI ──
const players: Player[] = [
  makePlayer("you", "You", 0x4ea7ff, true),
  makePlayer("ai_scarlet", "Scarlet", 0xe0564e, false),
  makePlayer("ai_jade", "Jade", 0x3fb96e, false),
];

const state: GameState = createGame(players);

// ── Subsystems ──
const atlas = new AtlasBank();
const hud = new Hud();
const commandBar = new CommandBar({ onSubmit: (raw) => handleCommand(raw) });
const map = new MapRenderer({ onTerritoryClick: (id) => inspectTerritory(id) });
map.setPlayerColors(new Map(players.map((p) => [p.id, p.color])));

let lastSpokenId = 0;
/** Atlas speaks AND logs — the chat log is Atlas's transcript. */
function atlasSay(text: string) {
  atlas.speak(`atlas.${++lastSpokenId}`, text);
  commandBar.print(`[atlas] ${text}`);
}

// ── Engine hooks — narration + repaint ──
const hooks: EngineHooks = {
  onPhaseChange: () => render(),
  onTerritoryCaptured: (tid) => map.highlight([tid], "good"),
  onPlayerEliminated: (pid) => {
    const p = players.find((pl) => pl.id === pid);
    if (p) atlasSay(`${p.name} is eliminated — wiped off the board.`);
  },
  onTurnStart: () => {},
};

function render() {
  hud.render(state);
  map.render(state);
}

// ── Turn flow ──
let running = false;

/** Run AI turns until it's the human's turn (or the game ends). */
async function runAiTurns() {
  if (running) return;
  running = true;
  while (state.phase !== "game_over" && !currentPlayer(state).isHuman) {
    commandBar.setAccepting(false);
    const p = currentPlayer(state);
    await delay(650);
    const log = aiTakeTurn(state, hooks);
    commandBar.print(`[enemy] ${p.name}: ${log.join(" · ")}`);
    render();
    if (isGameOver(state)) { running = false; onGameOver(); return; }
    await delay(450);
  }
  running = false;
  if (state.phase !== "game_over") announceHumanTurn();
}

function announceHumanTurn() {
  commandBar.setAccepting(true);
  const n = reinforcementCount(state, "you");
  // beginTurn already set reinforcementsRemaining; restate it for clarity.
  atlasSay(`Your move, Commander. Recruit phase — ${state.reinforcementsRemaining} reinforcements to place. Where do they go?`);
  commandBar.focusInput();
  render();
}

function onGameOver() {
  commandBar.setAccepting(false);
  const w = players.find((p) => p.id === state.winnerId);
  if (w?.isHuman) atlasSay("Total domination. The world is yours, Commander. We won.");
  else atlasSay(`${w?.name ?? "The enemy"} has conquered the world. We lost this one.`);
  render();
}

// ── Command handling ──
function handleCommand(raw: string) {
  if (state.phase === "game_over") {
    commandBar.print("[atlas] The war is over. Reload to play again.");
    return;
  }
  if (!currentPlayer(state).isHuman) {
    commandBar.print("[atlas] Stand by — the opponents are moving.");
    return;
  }
  const cmd = parseCommand(raw);

  switch (cmd.kind) {
    case "help":
      printHelp();
      return;

    case "recruit": {
      if (state.phase !== "recruit") {
        commandBar.print(`[error] Not the recruit phase — we're in ${state.phase}.`);
        return;
      }
      const r = cmd.count === "all"
        ? recruitAll(state, cmd.territory, hooks)
        : recruit(state, cmd.territory, cmd.count, hooks);
      commandBar.print((r.ok ? "[atlas] " : "[error] ") + r.message);
      if (r.ok) map.highlight([cmd.territory], "select");
      // Auto-advance once all reinforcements are placed.
      if (r.ok && state.reinforcementsRemaining === 0) {
        const adv = advancePhase(state, hooks);
        atlasSay(adv.message);
      }
      render();
      return;
    }

    case "attack": {
      if (state.phase !== "attack") {
        commandBar.print(`[error] Not the attack phase — we're in ${state.phase}.`);
        return;
      }
      const r = attack(state, cmd.from, cmd.to, hooks);
      if (!r.ok) { commandBar.print(`[error] ${r.message}`); return; }
      map.highlight([cmd.from, cmd.to], "attack");
      // Narrate the dice.
      if (r.assault) {
        const a = r.assault;
        commandBar.print(`[battle] ${territoryName(cmd.from)} → ${territoryName(cmd.to)}: ${a.rolls.length} round${a.rolls.length === 1 ? "" : "s"}, you lost ${a.attackerLossesTotal}, they lost ${a.defenderLossesTotal}.`);
      }
      atlasSay(r.message);
      if (r.winnerId) { onGameOver(); return; }
      render();
      return;
    }

    case "attack_to_only":
      commandBar.print(`[error] Attack from where? Say "attack ${territoryName(cmd.to)} from <your territory>".`);
      // Suggest valid sources.
      suggestAttackSources(cmd.to);
      return;

    case "fortify": {
      if (state.phase !== "fortify") {
        commandBar.print(`[error] Not the fortify phase — we're in ${state.phase}.`);
        return;
      }
      const n = cmd.count === "all"
        ? Math.max(1, (state.ownership.get(cmd.from)?.troops ?? 1) - 1)
        : cmd.count;
      const r = fortify(state, cmd.from, cmd.to, n, hooks);
      commandBar.print((r.ok ? "[atlas] " : "[error] ") + r.message);
      if (r.ok) map.highlight([cmd.from, cmd.to], "select");
      render();
      return;
    }

    case "advance": {
      const r = advancePhase(state, hooks);
      commandBar.print((r.ok ? "[atlas] " : "[error] ") + r.message);
      render();
      if (r.ok && !currentPlayer(state).isHuman) void runAiTurns();
      return;
    }

    case "end_turn": {
      endHumanTurn();
      return;
    }

    case "unknown":
      // This is the seam where the LLM translator slots in (Gemini/Claude).
      // For now: a helpful nudge with the command shapes.
      commandBar.print(`[atlas] Didn't catch that. Try: "recruit 4 to <territory>", "attack <enemy> from <yours>", "fortify 2 from <a> to <b>", or "done".`);
      return;
  }
}

/** Skip remaining phases and pass the turn. Auto-places leftover
 *  reinforcements so the player can't get stuck. */
function endHumanTurn() {
  let guard = 8;
  while (state.phase !== "game_over" && currentPlayer(state).isHuman && guard-- > 0) {
    if (state.phase === "recruit" && state.reinforcementsRemaining > 0) {
      // Dump leftovers on a border territory (or any owned one).
      const owned = territoriesOf(state, "you");
      const dest = owned.find((t) =>
        TERRITORIES[t]!.adjacent.some((a) => state.ownership.get(a)?.owner !== "you"),
      ) ?? owned[0];
      if (dest) {
        recruitAll(state, dest, hooks);
        commandBar.print(`[atlas] Leftover reinforcements sent to ${territoryName(dest)}.`);
      }
    }
    const r = advancePhase(state, hooks);
    if (!r.ok) break;
  }
  render();
  if (!currentPlayer(state).isHuman) void runAiTurns();
}

// ── Territory inspection (map click) ──
function inspectTerritory(id: string) {
  const h = state.ownership.get(id);
  if (!h) return;
  const owner = players.find((p) => p.id === h.owner);
  const t = TERRITORIES[id]!;
  const enemyNeighbors = t.adjacent
    .filter((a) => state.ownership.get(a)?.owner !== h.owner)
    .map((a) => territoryName(a));
  let line = `${t.name} — ${owner?.name ?? "?"}, ${h.troops} ${h.troops === 1 ? "army" : "armies"}.`;
  if (enemyNeighbors.length > 0) line += ` Borders enemy: ${enemyNeighbors.join(", ")}.`;
  commandBar.print(`[atlas] ${line}`);
  map.highlight([id], "select");
}

function suggestAttackSources(to: string) {
  const sources = TERRITORIES[to]!.adjacent.filter((a) => {
    const h = state.ownership.get(a);
    return h?.owner === "you" && h.troops >= 2 && areAdjacent(a, to);
  });
  if (sources.length > 0) {
    commandBar.print(`[atlas] You can hit it from: ${sources.map(territoryName).join(", ")}.`);
  } else {
    commandBar.print(`[atlas] You have no territory positioned to attack ${territoryName(to)} yet.`);
  }
}

function printHelp() {
  commandBar.print(`[atlas] Recruit phase: "recruit 4 to brazil" / "recruit all to china".`);
  commandBar.print(`[atlas] Attack phase: "attack peru from brazil" — fights to a result.`);
  commandBar.print(`[atlas] Fortify phase: "fortify 3 from alaska to alberta" — one move.`);
  commandBar.print(`[atlas] "done" advances the phase · "end turn" passes · click any territory to inspect it.`);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Boot ──
beginTurn(state, hooks);
render();
atlasSay("Commander. Six continents, forty-two territories — and only one can hold them all. The board is dealt. Bring the world under our flag.");
commandBar.print(`[atlas] You command the blue. Type "help" any time. Recruit phase — ${state.reinforcementsRemaining} reinforcements ready.`);
commandBar.setAccepting(true);
commandBar.focusInput();

// Debug surface for headless tests.
(window as any).__risk = {
  state,
  submit: (raw: string) => handleCommand(raw),
  adjacencyOf: (id: string) => TERRITORIES[id]?.adjacent ?? [],
  /** Owned territories for a player as [{ id, troops }]. */
  ownedBy: (playerId: string) =>
    territoriesOf(state, playerId).map((id) => ({
      id, troops: state.ownership.get(id)?.troops ?? 0,
    })),
  snapshot: () => ({
    phase: state.phase,
    turn: state.turnNumber,
    current: currentPlayer(state).id,
    reinforcements: state.reinforcementsRemaining,
    winner: state.winnerId,
    owned: Object.fromEntries(
      players.map((p) => [p.id, territoriesOf(state, p.id).length]),
    ),
  }),
};
