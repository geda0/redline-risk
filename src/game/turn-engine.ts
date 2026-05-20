/** Turn engine — the rules of REDLINE: Risk.
 *
 *  Every action returns an ActionResult so the command layer + Atlas can
 *  narrate what happened (or why it was rejected). The engine mutates the
 *  GameState in place; combat math lives in combat.ts.
 *
 *  Phase order per turn: recruit → attack → fortify → (next player). */

import { resolveAssault, type AssaultResult } from "./combat";
import {
  type GameState, type Player, currentPlayer, reinforcementCount,
  findWinner, isEliminated,
} from "./game-state";
import { TERRITORIES, areAdjacent } from "./territories";

export interface ActionResult {
  ok: boolean;
  message: string;
  /** Present when the action was an attack. */
  assault?: AssaultResult;
  /** Set when the action ended the game. */
  winnerId?: string;
}

/** Listener hooks — wired by main.ts to drive HUD + Atlas narration. */
export interface EngineHooks {
  onPhaseChange?: (state: GameState) => void;
  onTerritoryCaptured?: (territoryId: string, from: string, to: string) => void;
  onPlayerEliminated?: (playerId: string) => void;
  onTurnStart?: (state: GameState) => void;
}

/** Initialize the first player's RECRUIT phase. Call once after createGame. */
export function beginTurn(state: GameState, hooks?: EngineHooks): void {
  const p = currentPlayer(state);
  state.phase = "recruit";
  state.reinforcementsRemaining = reinforcementCount(state, p.id);
  state.conqueredThisTurn = false;
  state.fortifyUsed = false;
  hooks?.onTurnStart?.(state);
  hooks?.onPhaseChange?.(state);
}

/** RECRUIT — place `n` reinforcements on an owned territory. */
export function recruit(
  state: GameState, territoryId: string, n: number, hooks?: EngineHooks,
): ActionResult {
  if (state.phase !== "recruit") return fail("Not the recruit phase.");
  const p = currentPlayer(state);
  const h = state.ownership.get(territoryId);
  if (!h) return fail(`No such territory.`);
  if (h.owner !== p.id) return fail(`${name(territoryId)} isn't ours.`);
  if (n <= 0) return fail("Need a positive troop count.");
  if (n > state.reinforcementsRemaining) {
    return fail(`Only ${state.reinforcementsRemaining} reinforcements left.`);
  }
  h.troops += n;
  state.reinforcementsRemaining -= n;
  const left = state.reinforcementsRemaining;
  return ok(
    `+${n} to ${name(territoryId)} (now ${h.troops}). ${left} reinforcement${left === 1 ? "" : "s"} left.`,
  );
}

/** RECRUIT helper — place ALL remaining reinforcements on one territory. */
export function recruitAll(state: GameState, territoryId: string, hooks?: EngineHooks): ActionResult {
  return recruit(state, territoryId, state.reinforcementsRemaining, hooks);
}

/** ATTACK — assault `to` from `from`. Fights to resolution. */
export function attack(
  state: GameState, from: string, to: string, hooks?: EngineHooks,
): ActionResult {
  if (state.phase !== "attack") return fail("Not the attack phase.");
  const p = currentPlayer(state);
  const hFrom = state.ownership.get(from);
  const hTo = state.ownership.get(to);
  if (!hFrom || !hTo) return fail("No such territory.");
  if (hFrom.owner !== p.id) return fail(`${name(from)} isn't ours to attack from.`);
  if (hTo.owner === p.id) return fail(`${name(to)} is already ours.`);
  if (!areAdjacent(from, to)) return fail(`${name(from)} doesn't border ${name(to)}.`);
  if (hFrom.troops < 2) return fail(`${name(from)} needs 2+ troops to attack.`);

  const defenderId = hTo.owner;
  const result = resolveAssault(hFrom.troops, hTo.troops);

  if (result.conquered) {
    // Move the surviving assault force in; leave 1 behind to hold the origin.
    const moveIn = Math.max(1, result.attackerTroopsAfter - 1);
    hFrom.troops = result.attackerTroopsAfter - moveIn;
    hTo.owner = p.id;
    hTo.troops = moveIn;
    state.conqueredThisTurn = true;
    hooks?.onTerritoryCaptured?.(to, defenderId, p.id);
    // Elimination check for the dispossessed defender.
    if (isEliminated(state, defenderId)) {
      const elim = state.players.find((pl) => pl.id === defenderId);
      if (elim && !elim.eliminated) {
        elim.eliminated = true;
        hooks?.onPlayerEliminated?.(defenderId);
      }
    }
    const winner = findWinner(state);
    if (winner) {
      state.phase = "game_over";
      state.winnerId = winner;
      return { ok: true, message: `${name(to)} taken — and that's the board. Victory.`, assault: result, winnerId: winner };
    }
    return {
      ok: true,
      message: `${name(to)} CAPTURED — lost ${result.attackerLossesTotal}, killed ${result.defenderLossesTotal}. ${moveIn} troops now hold it.`,
      assault: result,
    };
  }

  // Assault stalled — apply losses to both sides.
  hFrom.troops = result.attackerTroopsAfter;
  hTo.troops = result.defenderTroopsAfter;
  return {
    ok: true,
    message: `Attack on ${name(to)} stalled — we lost ${result.attackerLossesTotal}, they lost ${result.defenderLossesTotal}. ${name(to)} holds with ${hTo.troops}.`,
    assault: result,
  };
}

/** FORTIFY — move `n` troops between two connected friendly territories.
 *  One fortify move per turn. Connection = a path through owned land. */
export function fortify(
  state: GameState, from: string, to: string, n: number, _hooks?: EngineHooks,
): ActionResult {
  if (state.phase !== "fortify") return fail("Not the fortify phase.");
  if (state.fortifyUsed) return fail("Already fortified this turn.");
  const p = currentPlayer(state);
  const hFrom = state.ownership.get(from);
  const hTo = state.ownership.get(to);
  if (!hFrom || !hTo) return fail("No such territory.");
  if (hFrom.owner !== p.id) return fail(`${name(from)} isn't ours.`);
  if (hTo.owner !== p.id) return fail(`${name(to)} isn't ours.`);
  if (from === to) return fail("Pick two different territories.");
  if (n <= 0) return fail("Need a positive troop count.");
  if (n > hFrom.troops - 1) return fail(`${name(from)} must leave 1 troop — can move at most ${hFrom.troops - 1}.`);
  if (!connectedThroughOwn(state, from, to, p.id)) {
    return fail(`${name(from)} and ${name(to)} aren't connected through our land.`);
  }
  hFrom.troops -= n;
  hTo.troops += n;
  state.fortifyUsed = true;
  return ok(`Moved ${n} from ${name(from)} to ${name(to)}. ${name(to)} now holds ${hTo.troops}.`);
}

/** Advance to the next phase. recruit→attack→fortify→next player's recruit.
 *  Returns the (possibly new) phase. */
export function advancePhase(state: GameState, hooks?: EngineHooks): ActionResult {
  if (state.phase === "game_over") return fail("The game is over.");
  if (state.phase === "recruit") {
    if (state.reinforcementsRemaining > 0) {
      return fail(`Place all ${state.reinforcementsRemaining} reinforcements first (or "recruit all to <territory>").`);
    }
    state.phase = "attack";
    hooks?.onPhaseChange?.(state);
    return ok("Recruit done. Attack phase — declare your assaults.");
  }
  if (state.phase === "attack") {
    state.phase = "fortify";
    hooks?.onPhaseChange?.(state);
    return ok("Attack done. Fortify phase — one troop move, then end turn.");
  }
  // fortify → end the turn.
  endTurn(state, hooks);
  return ok(`Turn passes. ${currentPlayer(state).name} is up.`);
}

/** End the current turn and hand off to the next non-eliminated player. */
export function endTurn(state: GameState, hooks?: EngineHooks): void {
  if (state.phase === "game_over") return;
  // Advance to the next living player.
  let guard = state.players.length + 1;
  do {
    state.currentPlayerIdx = (state.currentPlayerIdx + 1) % state.players.length;
    guard--;
  } while (state.players[state.currentPlayerIdx]!.eliminated && guard > 0);
  if (state.currentPlayerIdx === 0) state.turnNumber++;
  beginTurn(state, hooks);
}

/** BFS — is `to` reachable from `from` through territories owned by `playerId`? */
export function connectedThroughOwn(
  state: GameState, from: string, to: string, playerId: string,
): boolean {
  if (from === to) return true;
  const seen = new Set<string>([from]);
  const queue = [from];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const adj of TERRITORIES[cur]!.adjacent) {
      if (seen.has(adj)) continue;
      if (state.ownership.get(adj)?.owner !== playerId) continue;
      if (adj === to) return true;
      seen.add(adj);
      queue.push(adj);
    }
  }
  return false;
}

function name(id: string): string {
  return TERRITORIES[id]?.name ?? id;
}
function ok(message: string): ActionResult { return { ok: true, message }; }
function fail(message: string): ActionResult { return { ok: false, message }; }

/** Convenience — make a Player record. */
export function makePlayer(
  id: string, name: string, color: number, isHuman: boolean,
): Player {
  return { id, name, color, isHuman, eliminated: false };
}
