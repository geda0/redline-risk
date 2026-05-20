/** AI player — runs a complete Risk turn: recruit, attack, fortify.
 *
 *  Heuristic, not search-based, but competent:
 *   - RECRUIT massed onto the border territory with the best attack
 *     opportunity (an adjacent enemy it outnumbers).
 *   - ATTACK greedily takes every favorable engagement (clear troop
 *     advantage) and never suicides into a stronger stack.
 *   - FORTIFY pulls troops off a safe interior territory toward the front.
 *
 *  Returns a log of what it did so Atlas can narrate the opponent's turn. */

import {
  type GameState, currentPlayer, territoriesOf, borderTerritories, isGameOver,
} from "./game-state";
import { recruit, attack, fortify, advancePhase, connectedThroughOwn, type EngineHooks } from "./turn-engine";
import { TERRITORIES } from "./territories";

/** Run the whole turn for the current (AI) player. Mutates state via the
 *  engine; returns human-readable log lines. */
export function aiTakeTurn(state: GameState, hooks?: EngineHooks): string[] {
  const log: string[] = [];
  const me = currentPlayer(state).id;

  // ── RECRUIT ──
  // Score each border territory by its best capture opportunity.
  let guard = 60;
  while (state.phase === "recruit" && state.reinforcementsRemaining > 0 && guard-- > 0) {
    const target = bestRecruitTarget(state, me);
    if (!target) {
      // No border — dump on any owned territory.
      const any = territoriesOf(state, me)[0];
      if (!any) break;
      recruit(state, any, state.reinforcementsRemaining, hooks);
      break;
    }
    const n = state.reinforcementsRemaining;
    recruit(state, target, n, hooks);
    log.push(`reinforced ${nm(target)} (+${n})`);
  }
  advancePhase(state, hooks);

  // ── ATTACK ──
  guard = 80;
  let conquests = 0;
  while (state.phase === "attack" && guard-- > 0) {
    const move = bestAttack(state, me);
    if (!move) break;
    const before = state.ownership.get(move.to)!.owner;
    const r = attack(state, move.from, move.to, hooks);
    if (r.assault?.conquered && state.ownership.get(move.to)?.owner === me && before !== me) {
      conquests++;
    }
    if (isGameOver(state)) {
      log.push(`stormed ${nm(move.to)} — and won the war`);
      return log;
    }
  }
  if (conquests > 0) log.push(`captured ${conquests} territor${conquests === 1 ? "y" : "ies"}`);
  else log.push(`held position, no good attacks`);
  advancePhase(state, hooks);

  // ── FORTIFY ──
  if (state.phase === "fortify") {
    const f = bestFortify(state, me);
    if (f) {
      fortify(state, f.from, f.to, f.n, hooks);
      log.push(`shifted ${f.n} from ${nm(f.from)} to the front at ${nm(f.to)}`);
    }
    advancePhase(state, hooks);  // ends the turn
  }
  return log;
}

/** Pick the owned border territory whose strongest adjacent enemy it can
 *  most profitably out-stack after reinforcing. */
function bestRecruitTarget(state: GameState, me: string): string | null {
  const borders = borderTerritories(state, me);
  if (borders.length === 0) return null;
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const tid of borders) {
    const mine = state.ownership.get(tid)!.troops;
    // Weakest adjacent enemy = the easiest capture target from here.
    let weakestEnemy = Infinity;
    for (const adj of TERRITORIES[tid]!.adjacent) {
      const h = state.ownership.get(adj);
      if (h && h.owner !== me) weakestEnemy = Math.min(weakestEnemy, h.troops);
    }
    if (weakestEnemy === Infinity) continue;
    // Score: prefer borders where a little more force flips a fight.
    const score = mine - weakestEnemy + (mine < weakestEnemy + 3 ? 4 : 0);
    if (score > bestScore) { bestScore = score; best = tid; }
  }
  return best ?? borders[0]!;
}

interface AttackMove { from: string; to: string; }

/** Find the most favorable attack — biggest troop advantage, never a
 *  losing fight. Returns null when nothing worthwhile remains. */
function bestAttack(state: GameState, me: string): AttackMove | null {
  let best: AttackMove | null = null;
  let bestAdv = 0;
  for (const from of territoriesOf(state, me)) {
    const hFrom = state.ownership.get(from)!;
    if (hFrom.troops < 3) continue;  // need real punching power
    for (const to of TERRITORIES[from]!.adjacent) {
      const hTo = state.ownership.get(to);
      if (!hTo || hTo.owner === me) continue;
      const advantage = hFrom.troops - hTo.troops;
      // Only attack with a clear edge (attacker dice favor the bigger stack).
      if (advantage >= 2 && advantage > bestAdv) {
        bestAdv = advantage;
        best = { from, to };
      }
    }
  }
  return best;
}

interface FortifyMove { from: string; to: string; n: number; }

/** Pull troops off the safest interior territory toward a border that
 *  needs them. */
function bestFortify(state: GameState, me: string): FortifyMove | null {
  const borders = new Set(borderTerritories(state, me));
  // Donor: an interior (non-border) territory with spare troops.
  let donor: string | null = null;
  let donorTroops = 1;
  for (const tid of territoriesOf(state, me)) {
    if (borders.has(tid)) continue;
    const t = state.ownership.get(tid)!.troops;
    if (t > donorTroops) { donorTroops = t; donor = tid; }
  }
  if (!donor || donorTroops < 2) return null;
  // Recipient: the weakest border territory connected to the donor.
  let recipient: string | null = null;
  let recipientTroops = Infinity;
  for (const tid of borders) {
    if (!connectedThroughOwn(state, donor, tid, me)) continue;
    const t = state.ownership.get(tid)!.troops;
    if (t < recipientTroops) { recipientTroops = t; recipient = tid; }
  }
  if (!recipient) return null;
  return { from: donor, to: recipient, n: donorTroops - 1 };
}

function nm(id: string): string {
  return TERRITORIES[id]?.name ?? id;
}
