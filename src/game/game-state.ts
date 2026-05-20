/** Game state for REDLINE: Risk — players, territory ownership, troop
 *  counts, and the turn/phase machine.
 *
 *  A turn is three phases, in order:
 *    RECRUIT  — place reinforcements (territories/3 + continent bonuses)
 *    ATTACK   — declare attacks on adjacent enemy territories (dice)
 *    FORTIFY  — one troop move between two connected friendly territories
 *  Then the next player. Win = own every territory (all rivals eliminated). */

import { CONTINENTS, TERRITORY_IDS, TERRITORIES, type ContinentId } from "./territories";

export type Phase = "recruit" | "attack" | "fortify" | "game_over";

export interface Player {
  id: string;
  name: string;
  color: number;
  isHuman: boolean;
  eliminated: boolean;
}

/** Per-territory ownership record. */
export interface Holding {
  owner: string;   // player id
  troops: number;  // always >= 1 while owned
}

export interface GameState {
  players: Player[];
  currentPlayerIdx: number;
  phase: Phase;
  turnNumber: number;
  /** territory id → holding. Every territory is always owned by someone. */
  ownership: Map<string, Holding>;
  /** RECRUIT: troops still to place this turn. */
  reinforcementsRemaining: number;
  /** ATTACK: did the player conquer at least one territory this turn?
   *  (Classic Risk awards a card — kept as a flag for future card rules.) */
  conqueredThisTurn: boolean;
  /** FORTIFY: the single fortify move is spent. */
  fortifyUsed: boolean;
  winnerId: string | null;
}

/** Build the initial state — territories dealt round-robin, 1 troop each,
 *  then remaining starting troops scattered onto owned territories. */
export function createGame(players: Player[]): GameState {
  const ownership = new Map<string, Holding>();
  // Deal the 42 territories round-robin in a shuffled order.
  const shuffled = [...TERRITORY_IDS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  shuffled.forEach((tid, i) => {
    ownership.set(tid, { owner: players[i % players.length]!.id, troops: 1 });
  });
  // Starting army size scales down with player count (classic-ish).
  const startingArmies = players.length <= 2 ? 40 : players.length === 3 ? 35 : 30;
  for (const p of players) {
    const owned = [...ownership.entries()].filter(([, h]) => h.owner === p.id);
    let toPlace = startingArmies - owned.length;  // 1 already on each
    let i = 0;
    while (toPlace > 0 && owned.length > 0) {
      owned[i % owned.length]![1].troops++;
      i++;
      toPlace--;
    }
  }
  const state: GameState = {
    players,
    currentPlayerIdx: 0,
    phase: "recruit",
    turnNumber: 1,
    ownership,
    reinforcementsRemaining: 0,
    conqueredThisTurn: false,
    fortifyUsed: false,
    winnerId: null,
  };
  return state;
}

export function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIdx]!;
}

export function holdingOf(state: GameState, territoryId: string): Holding | undefined {
  return state.ownership.get(territoryId);
}

/** All territory ids owned by a player. */
export function territoriesOf(state: GameState, playerId: string): string[] {
  const out: string[] = [];
  for (const [tid, h] of state.ownership) if (h.owner === playerId) out.push(tid);
  return out;
}

/** Total troops a player has on the board. */
export function totalTroops(state: GameState, playerId: string): number {
  let n = 0;
  for (const h of state.ownership.values()) if (h.owner === playerId) n += h.troops;
  return n;
}

/** Continents fully controlled by a player. */
export function continentsControlledBy(state: GameState, playerId: string): ContinentId[] {
  const out: ContinentId[] = [];
  for (const c of Object.values(CONTINENTS)) {
    if (c.territoryIds.every((tid) => state.ownership.get(tid)?.owner === playerId)) {
      out.push(c.id);
    }
  }
  return out;
}

/** Reinforcement count for a player's RECRUIT phase:
 *  floor(territoryCount / 3), minimum 3, plus continent bonuses. */
export function reinforcementCount(state: GameState, playerId: string): number {
  const terrs = territoriesOf(state, playerId).length;
  let n = Math.max(3, Math.floor(terrs / 3));
  for (const cid of continentsControlledBy(state, playerId)) {
    n += CONTINENTS[cid].bonus;
  }
  return n;
}

/** A player is eliminated when they own zero territories. */
export function isEliminated(state: GameState, playerId: string): boolean {
  return territoriesOf(state, playerId).length === 0;
}

/** True once the match is decided. A function (not an inline `===`) so
 *  callers can re-check phase after the engine mutates it mid-loop —
 *  an inline comparison gets wrongly narrowed away by the compiler. */
export function isGameOver(state: GameState): boolean {
  return state.phase === "game_over";
}

/** Returns the winner id if exactly one non-eliminated player remains. */
export function findWinner(state: GameState): string | null {
  const alive = state.players.filter((p) => !p.eliminated);
  return alive.length === 1 ? alive[0]!.id : null;
}

/** Enemy territories adjacent to a player's holdings — the "front line". */
export function frontLine(state: GameState, playerId: string): string[] {
  const front = new Set<string>();
  for (const tid of territoriesOf(state, playerId)) {
    for (const adj of TERRITORIES[tid]!.adjacent) {
      if (state.ownership.get(adj)?.owner !== playerId) front.add(adj);
    }
  }
  return [...front];
}

/** A player's own territories that border an enemy — where reinforcement
 *  and attacks matter. */
export function borderTerritories(state: GameState, playerId: string): string[] {
  const out: string[] = [];
  for (const tid of territoriesOf(state, playerId)) {
    const touchesEnemy = TERRITORIES[tid]!.adjacent.some(
      (adj) => state.ownership.get(adj)?.owner !== playerId,
    );
    if (touchesEnemy) out.push(tid);
  }
  return out;
}
