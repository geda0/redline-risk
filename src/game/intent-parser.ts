/** Local intent parser — natural language → a Risk action.
 *
 *  Handles the common command shapes typed (or spoken) by the player:
 *
 *    RECRUIT   "recruit 3 to brazil"  ·  "reinforce ukraine with 5"
 *              "place all on china"   ·  "all reinforcements to india"
 *    ATTACK    "attack peru from brazil"  ·  "brazil attacks peru"
 *              "take egypt from north africa"  ·  "storm india"
 *    FORTIFY   "fortify 2 from alaska to alberta"  ·  "move 3 alaska alberta"
 *    PHASE     "done" · "next phase" · "advance"
 *    END TURN  "end turn" · "pass"
 *
 *  Multi-word territory names ("western united states", "north africa")
 *  are matched longest-first against names + aliases. Anything it can't
 *  resolve comes back as { kind: "unknown" } so the caller can defer to
 *  the LLM (when wired) or ask the player to rephrase. */

import { TERRITORIES, resolveTerritoryName } from "./territories";

export type ParsedCommand =
  | { kind: "recruit"; territory: string; count: number | "all" }
  | { kind: "attack"; from: string; to: string }
  | { kind: "attack_to_only"; to: string }   // target named, source omitted
  | { kind: "fortify"; from: string; to: string; count: number | "all" }
  | { kind: "advance" }
  | { kind: "end_turn" }
  | { kind: "help" }
  | { kind: "unknown"; raw: string };

const RECRUIT_VERBS = ["recruit", "reinforce", "place", "deploy", "add", "put", "drop", "garrison"];
const ATTACK_VERBS = ["attack", "take", "assault", "invade", "hit", "storm", "strike", "capture", "conquer"];
const FORTIFY_VERBS = ["fortify", "move", "send", "shift", "transfer", "relocate", "march"];
const ADVANCE_WORDS = ["done", "next", "advance", "proceed", "continue", "finish", "ready"];
const ENDTURN_PHRASES = ["end turn", "end my turn", "pass", "end the turn"];

/** Ordered list of (lowercased phrase → territory id), longest phrase
 *  first so multi-word names win over their substrings. */
const TERRITORY_PHRASES: Array<{ phrase: string; id: string }> = (() => {
  const out: Array<{ phrase: string; id: string }> = [];
  for (const t of Object.values(TERRITORIES)) {
    out.push({ phrase: t.name.toLowerCase(), id: t.id });
  }
  // Hand aliases — abbreviations + common voice mishearings.
  const aliases: Record<string, string> = {
    "northwest territory": "nw_territory", "nw territory": "nw_territory",
    "western united states": "western_us", "eastern united states": "eastern_us",
    "western us": "western_us", "eastern us": "eastern_us",
    "great britain": "great_britain", "britain": "great_britain", "england": "great_britain",
    "northern europe": "northern_europe", "western europe": "western_europe",
    "southern europe": "southern_europe", "north europe": "northern_europe",
    "west europe": "western_europe", "south europe": "southern_europe",
    "russia": "ukraine", "north africa": "north_africa", "east africa": "east_africa",
    "south africa": "south_africa", "middle east": "middle_east",
    "new guinea": "new_guinea", "western australia": "western_australia",
    "eastern australia": "eastern_australia", "central america": "central_america",
    "thailand": "siam",
  };
  for (const [phrase, id] of Object.entries(aliases)) out.push({ phrase, id });
  out.sort((a, b) => b.phrase.length - a.phrase.length);
  return out;
})();

/** Find every territory mentioned, in order of appearance. */
function extractTerritories(lc: string): Array<{ id: string; at: number }> {
  const consumed = new Array(lc.length).fill(false);
  const found: Array<{ id: string; at: number }> = [];
  for (const cand of TERRITORY_PHRASES) {
    let idx = lc.indexOf(cand.phrase);
    while (idx >= 0) {
      const end = idx + cand.phrase.length;
      // Word boundaries — don't match inside a longer word.
      const beforeOk = idx === 0 || !/[a-z]/.test(lc[idx - 1]!);
      const afterOk = end >= lc.length || !/[a-z]/.test(lc[end]!);
      let free = beforeOk && afterOk;
      if (free) for (let i = idx; i < end; i++) if (consumed[i]) { free = false; break; }
      if (free) {
        for (let i = idx; i < end; i++) consumed[i] = true;
        found.push({ id: cand.id, at: idx });
      }
      idx = lc.indexOf(cand.phrase, idx + 1);
    }
  }
  found.sort((a, b) => a.at - b.at);
  return found;
}

/** First integer in the text, or null. */
function firstNumber(text: string): number | null {
  const m = text.match(/\b(\d+)\b/);
  if (m) return parseInt(m[1]!, 10);
  // Spelled-out small numbers — common in speech.
  const words: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, a: 1,
  };
  for (const [w, n] of Object.entries(words)) {
    if (new RegExp(`\\b${w}\\b`).test(text)) return n;
  }
  return null;
}

export function parseCommand(raw: string): ParsedCommand {
  const text = raw.trim().toLowerCase().replace(/[.,!?;:]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return { kind: "unknown", raw };

  if (text === "help" || text === "?" || text === "commands") return { kind: "help" };

  // End-turn — check before generic "advance" so "end turn" wins.
  for (const phrase of ENDTURN_PHRASES) {
    if (text.includes(phrase)) return { kind: "end_turn" };
  }

  const words = text.split(" ");
  const territories = extractTerritories(text);
  const hasAll = /\b(all|everything|the rest|remaining)\b/.test(text);
  const num = firstNumber(text);

  const has = (list: string[]) => list.some((v) => words.includes(v));

  // ── ATTACK ──
  if (has(ATTACK_VERBS)) {
    if (territories.length >= 2) {
      // "attack TO from FROM" — the territory after the word "from" is the source.
      const fromIdx = text.indexOf(" from ");
      let fromId: string | null = null;
      let toId: string | null = null;
      if (fromIdx >= 0) {
        // Source = first territory positioned after "from".
        const after = territories.filter((t) => t.at > fromIdx);
        const before = territories.filter((t) => t.at <= fromIdx);
        fromId = after[0]?.id ?? null;
        toId = before[before.length - 1]?.id ?? before[0]?.id ?? null;
      } else {
        // "FROM attacks TO" — verb sits between them; first = from.
        fromId = territories[0]!.id;
        toId = territories[1]!.id;
      }
      if (fromId && toId && fromId !== toId) return { kind: "attack", from: fromId, to: toId };
    }
    if (territories.length === 1) {
      return { kind: "attack_to_only", to: territories[0]!.id };
    }
  }

  // ── FORTIFY ──
  if (has(FORTIFY_VERBS) && territories.length >= 2) {
    // "from X to Y" — or just two territories in order.
    return {
      kind: "fortify",
      from: territories[0]!.id,
      to: territories[1]!.id,
      count: hasAll ? "all" : (num ?? 1),
    };
  }

  // ── RECRUIT ──
  if (has(RECRUIT_VERBS) && territories.length >= 1) {
    return {
      kind: "recruit",
      territory: territories[territories.length - 1]!.id,  // last named = destination
      count: hasAll ? "all" : (num ?? (firstNumber(text) ?? 1)),
    };
  }

  // ── ADVANCE ──
  if (has(ADVANCE_WORDS)) return { kind: "advance" };

  // Bare territory + number with no verb, during recruit, reads as recruit.
  if (territories.length === 1 && (num !== null || hasAll)) {
    return { kind: "recruit", territory: territories[0]!.id, count: hasAll ? "all" : num! };
  }

  return { kind: "unknown", raw };
}

/** Pretty name for messages. */
export function territoryName(id: string): string {
  return TERRITORIES[id]?.name ?? id;
}

export { resolveTerritoryName };
