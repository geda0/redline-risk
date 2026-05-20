/** Risk dice combat.
 *
 *  One BATTLE ROLL: the attacker rolls up to 3 dice, the defender up to 2.
 *  Both sets are sorted high→low, the top pairs are compared one-to-one;
 *  the lower die in each pair loses a troop (ties go to the defender).
 *
 *  An ASSAULT chains battle rolls until the defending territory falls or
 *  the attacker can't continue (down to 1 troop in the origin). This is
 *  the unit a command resolves to — "attack Peru from Brazil" fights it
 *  out. The whole sequence is returned so the UI can narrate it. */

export interface BattleRoll {
  attackerDice: number[];   // sorted desc
  defenderDice: number[];   // sorted desc
  attackerLosses: number;
  defenderLosses: number;
}

export interface AssaultResult {
  rolls: BattleRoll[];
  attackerLossesTotal: number;
  defenderLossesTotal: number;
  /** True if the defending territory was reduced to 0 and captured. */
  conquered: boolean;
  /** Troops remaining in the attacking territory after the assault. */
  attackerTroopsAfter: number;
  /** Troops remaining in the defending territory (0 if conquered). */
  defenderTroopsAfter: number;
}

function rollDie(): number {
  return 1 + Math.floor(Math.random() * 6);
}

function rollSorted(n: number): number[] {
  const dice: number[] = [];
  for (let i = 0; i < n; i++) dice.push(rollDie());
  return dice.sort((a, b) => b - a);
}

/** One battle roll. `attackerTroops` is the troop count in the attacking
 *  territory (it can commit troops-1 dice, max 3). `defenderTroops` is the
 *  defending count (max 2 dice). */
export function battleRoll(attackerTroops: number, defenderTroops: number): BattleRoll {
  const aDiceN = Math.min(3, Math.max(0, attackerTroops - 1));
  const dDiceN = Math.min(2, Math.max(0, defenderTroops));
  const attackerDice = rollSorted(aDiceN);
  const defenderDice = rollSorted(dDiceN);
  let attackerLosses = 0;
  let defenderLosses = 0;
  const pairs = Math.min(aDiceN, dDiceN);
  for (let i = 0; i < pairs; i++) {
    // Tie goes to the defender — attacker must strictly beat to win.
    if (attackerDice[i]! > defenderDice[i]!) defenderLosses++;
    else attackerLosses++;
  }
  return { attackerDice, defenderDice, attackerLosses, defenderLosses };
}

/** Resolve a full assault. The attacker keeps rolling until the defending
 *  territory is captured or the attacking territory is down to 1 troop.
 *  Does NOT mutate game state — the caller applies the result. */
export function resolveAssault(attackerTroops: number, defenderTroops: number): AssaultResult {
  let aT = attackerTroops;
  let dT = defenderTroops;
  const rolls: BattleRoll[] = [];
  let aLoss = 0;
  let dLoss = 0;
  // Safety bound — battles always terminate, but cap iterations anyway.
  let guard = 1000;
  while (aT > 1 && dT > 0 && guard-- > 0) {
    const r = battleRoll(aT, dT);
    rolls.push(r);
    aT -= r.attackerLosses;
    dT -= r.defenderLosses;
    aLoss += r.attackerLosses;
    dLoss += r.defenderLosses;
  }
  return {
    rolls,
    attackerLossesTotal: aLoss,
    defenderLossesTotal: dLoss,
    conquered: dT <= 0,
    attackerTroopsAfter: aT,
    defenderTroopsAfter: Math.max(0, dT),
  };
}
