/** The Risk world — 42 territories in 6 continents, the classic
 *  adjacency graph, and a stylized layout for the 2D board.
 *
 *  Layout coords are normalized 0..1 (x = left→right, y = top→bottom)
 *  over a 16:9-ish board. They're a board-game abstraction, not a real
 *  projection: each territory is a node, adjacency is an edge.
 *
 *  Continent bonuses + the adjacency graph are the canonical Risk values. */

export type ContinentId =
  | "north_america" | "south_america" | "europe"
  | "africa" | "asia" | "australia";

export interface Continent {
  id: ContinentId;
  name: string;
  /** Extra recruits per turn for holding EVERY territory in the continent. */
  bonus: number;
  /** Accent color (hex) for the continent's territories' tint + legend. */
  color: number;
  territoryIds: string[];
}

export interface Territory {
  id: string;
  name: string;
  continent: ContinentId;
  adjacent: string[];
  /** Node position on the 0..1 board. */
  x: number;
  y: number;
}

export const CONTINENTS: Record<ContinentId, Continent> = {
  north_america: {
    id: "north_america", name: "North America", bonus: 5, color: 0xe8c14a,
    territoryIds: ["alaska", "nw_territory", "greenland", "alberta", "ontario",
      "quebec", "western_us", "eastern_us", "central_america"],
  },
  south_america: {
    id: "south_america", name: "South America", bonus: 2, color: 0x5fb86a,
    territoryIds: ["venezuela", "peru", "brazil", "argentina"],
  },
  europe: {
    id: "europe", name: "Europe", bonus: 5, color: 0x5b8fd6,
    territoryIds: ["iceland", "great_britain", "scandinavia", "northern_europe",
      "western_europe", "southern_europe", "ukraine"],
  },
  africa: {
    id: "africa", name: "Africa", bonus: 3, color: 0xd8893f,
    territoryIds: ["north_africa", "egypt", "east_africa", "congo",
      "south_africa", "madagascar"],
  },
  asia: {
    id: "asia", name: "Asia", bonus: 7, color: 0xc05c6e,
    territoryIds: ["ural", "siberia", "yakutsk", "kamchatka", "irkutsk",
      "mongolia", "japan", "afghanistan", "china", "middle_east", "india", "siam"],
  },
  australia: {
    id: "australia", name: "Australia", bonus: 2, color: 0xa86fc9,
    territoryIds: ["indonesia", "new_guinea", "western_australia", "eastern_australia"],
  },
};

export const TERRITORIES: Record<string, Territory> = {
  // ── North America ──
  alaska: { id: "alaska", name: "Alaska", continent: "north_america",
    adjacent: ["nw_territory", "alberta", "kamchatka"], x: 0.05, y: 0.13 },
  nw_territory: { id: "nw_territory", name: "NW Territory", continent: "north_america",
    adjacent: ["alaska", "alberta", "ontario", "greenland"], x: 0.13, y: 0.12 },
  greenland: { id: "greenland", name: "Greenland", continent: "north_america",
    adjacent: ["nw_territory", "ontario", "quebec", "iceland"], x: 0.275, y: 0.06 },
  alberta: { id: "alberta", name: "Alberta", continent: "north_america",
    adjacent: ["alaska", "nw_territory", "ontario", "western_us"], x: 0.11, y: 0.24 },
  ontario: { id: "ontario", name: "Ontario", continent: "north_america",
    adjacent: ["alberta", "nw_territory", "greenland", "quebec", "western_us", "eastern_us"], x: 0.18, y: 0.24 },
  quebec: { id: "quebec", name: "Quebec", continent: "north_america",
    adjacent: ["ontario", "greenland", "eastern_us"], x: 0.25, y: 0.23 },
  western_us: { id: "western_us", name: "Western US", continent: "north_america",
    adjacent: ["alberta", "ontario", "eastern_us", "central_america"], x: 0.12, y: 0.35 },
  eastern_us: { id: "eastern_us", name: "Eastern US", continent: "north_america",
    adjacent: ["western_us", "ontario", "quebec", "central_america"], x: 0.2, y: 0.36 },
  central_america: { id: "central_america", name: "Central America", continent: "north_america",
    adjacent: ["western_us", "eastern_us", "venezuela"], x: 0.14, y: 0.47 },

  // ── South America ──
  venezuela: { id: "venezuela", name: "Venezuela", continent: "south_america",
    adjacent: ["central_america", "peru", "brazil"], x: 0.19, y: 0.57 },
  peru: { id: "peru", name: "Peru", continent: "south_america",
    adjacent: ["venezuela", "brazil", "argentina"], x: 0.18, y: 0.71 },
  brazil: { id: "brazil", name: "Brazil", continent: "south_america",
    adjacent: ["venezuela", "peru", "argentina", "north_africa"], x: 0.27, y: 0.71 },
  argentina: { id: "argentina", name: "Argentina", continent: "south_america",
    adjacent: ["peru", "brazil"], x: 0.2, y: 0.88 },

  // ── Europe ──
  iceland: { id: "iceland", name: "Iceland", continent: "europe",
    adjacent: ["greenland", "great_britain", "scandinavia"], x: 0.375, y: 0.16 },
  great_britain: { id: "great_britain", name: "Great Britain", continent: "europe",
    adjacent: ["iceland", "scandinavia", "northern_europe", "western_europe"], x: 0.38, y: 0.27 },
  scandinavia: { id: "scandinavia", name: "Scandinavia", continent: "europe",
    adjacent: ["iceland", "great_britain", "northern_europe", "ukraine"], x: 0.47, y: 0.14 },
  northern_europe: { id: "northern_europe", name: "Northern Europe", continent: "europe",
    adjacent: ["great_britain", "scandinavia", "ukraine", "southern_europe", "western_europe"], x: 0.47, y: 0.27 },
  western_europe: { id: "western_europe", name: "Western Europe", continent: "europe",
    adjacent: ["great_britain", "northern_europe", "southern_europe", "north_africa"], x: 0.41, y: 0.37 },
  southern_europe: { id: "southern_europe", name: "Southern Europe", continent: "europe",
    adjacent: ["western_europe", "northern_europe", "ukraine", "middle_east", "egypt", "north_africa"], x: 0.49, y: 0.37 },
  ukraine: { id: "ukraine", name: "Ukraine", continent: "europe",
    adjacent: ["scandinavia", "northern_europe", "southern_europe", "ural", "afghanistan", "middle_east"], x: 0.57, y: 0.23 },

  // ── Africa ──
  north_africa: { id: "north_africa", name: "North Africa", continent: "africa",
    adjacent: ["brazil", "western_europe", "southern_europe", "egypt", "east_africa", "congo"], x: 0.43, y: 0.53 },
  egypt: { id: "egypt", name: "Egypt", continent: "africa",
    adjacent: ["north_africa", "southern_europe", "middle_east", "east_africa"], x: 0.51, y: 0.5 },
  east_africa: { id: "east_africa", name: "East Africa", continent: "africa",
    adjacent: ["egypt", "north_africa", "congo", "south_africa", "madagascar", "middle_east"], x: 0.55, y: 0.62 },
  congo: { id: "congo", name: "Congo", continent: "africa",
    adjacent: ["north_africa", "east_africa", "south_africa"], x: 0.48, y: 0.67 },
  south_africa: { id: "south_africa", name: "South Africa", continent: "africa",
    adjacent: ["congo", "east_africa", "madagascar"], x: 0.5, y: 0.81 },
  madagascar: { id: "madagascar", name: "Madagascar", continent: "africa",
    adjacent: ["south_africa", "east_africa"], x: 0.6, y: 0.77 },

  // ── Asia ──
  ural: { id: "ural", name: "Ural", continent: "asia",
    adjacent: ["ukraine", "siberia", "china", "afghanistan"], x: 0.64, y: 0.18 },
  siberia: { id: "siberia", name: "Siberia", continent: "asia",
    adjacent: ["ural", "yakutsk", "irkutsk", "mongolia", "china"], x: 0.71, y: 0.12 },
  yakutsk: { id: "yakutsk", name: "Yakutsk", continent: "asia",
    adjacent: ["siberia", "irkutsk", "kamchatka"], x: 0.8, y: 0.09 },
  kamchatka: { id: "kamchatka", name: "Kamchatka", continent: "asia",
    adjacent: ["yakutsk", "irkutsk", "mongolia", "japan", "alaska"], x: 0.91, y: 0.12 },
  irkutsk: { id: "irkutsk", name: "Irkutsk", continent: "asia",
    adjacent: ["siberia", "yakutsk", "kamchatka", "mongolia"], x: 0.78, y: 0.2 },
  mongolia: { id: "mongolia", name: "Mongolia", continent: "asia",
    adjacent: ["siberia", "irkutsk", "kamchatka", "japan", "china"], x: 0.79, y: 0.29 },
  japan: { id: "japan", name: "Japan", continent: "asia",
    adjacent: ["kamchatka", "mongolia"], x: 0.91, y: 0.3 },
  afghanistan: { id: "afghanistan", name: "Afghanistan", continent: "asia",
    adjacent: ["ukraine", "ural", "china", "india", "middle_east"], x: 0.64, y: 0.31 },
  china: { id: "china", name: "China", continent: "asia",
    adjacent: ["ural", "siberia", "mongolia", "afghanistan", "india", "siam"], x: 0.745, y: 0.37 },
  middle_east: { id: "middle_east", name: "Middle East", continent: "asia",
    adjacent: ["ukraine", "southern_europe", "egypt", "east_africa", "afghanistan", "india"], x: 0.585, y: 0.44 },
  india: { id: "india", name: "India", continent: "asia",
    adjacent: ["afghanistan", "china", "middle_east", "siam"], x: 0.68, y: 0.47 },
  siam: { id: "siam", name: "Siam", continent: "asia",
    adjacent: ["china", "india", "indonesia"], x: 0.77, y: 0.47 },

  // ── Australia ──
  indonesia: { id: "indonesia", name: "Indonesia", continent: "australia",
    adjacent: ["siam", "new_guinea", "western_australia"], x: 0.78, y: 0.62 },
  new_guinea: { id: "new_guinea", name: "New Guinea", continent: "australia",
    adjacent: ["indonesia", "western_australia", "eastern_australia"], x: 0.89, y: 0.61 },
  western_australia: { id: "western_australia", name: "Western Australia", continent: "australia",
    adjacent: ["indonesia", "new_guinea", "eastern_australia"], x: 0.81, y: 0.83 },
  eastern_australia: { id: "eastern_australia", name: "Eastern Australia", continent: "australia",
    adjacent: ["new_guinea", "western_australia"], x: 0.91, y: 0.81 },
};

/** Stable ordered list of all territory ids. */
export const TERRITORY_IDS: string[] = Object.keys(TERRITORIES);

/** Total count — should be 42. */
export const TERRITORY_COUNT = TERRITORY_IDS.length;

export function getTerritory(id: string): Territory | undefined {
  return TERRITORIES[id];
}

export function continentOf(territoryId: string): Continent | undefined {
  const t = TERRITORIES[territoryId];
  return t ? CONTINENTS[t.continent] : undefined;
}

/** True if two territories share a border. */
export function areAdjacent(a: string, b: string): boolean {
  return TERRITORIES[a]?.adjacent.includes(b) ?? false;
}

/** Resolve a free-text name to a territory id — handles the canonical
 *  names, common abbreviations, and loose phrasing. Returns null on miss. */
export function resolveTerritoryName(raw: string): string | null {
  const q = raw.trim().toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  if (!q) return null;
  // Direct id match (with underscores ↔ spaces).
  const asId = q.replace(/ /g, "_");
  if (TERRITORIES[asId]) return asId;
  // Exact name match.
  for (const t of Object.values(TERRITORIES)) {
    if (t.name.toLowerCase() === q) return t.id;
  }
  // Alias table — common shorthands + mishearings.
  const alias: Record<string, string> = {
    "alaska": "alaska", "northwest territory": "nw_territory", "nwt": "nw_territory",
    "greenland": "greenland", "alberta": "alberta", "ontario": "ontario",
    "quebec": "quebec", "western united states": "western_us", "west us": "western_us",
    "eastern united states": "eastern_us", "east us": "eastern_us", "usa": "eastern_us",
    "central america": "central_america", "venezuela": "venezuela", "peru": "peru",
    "brazil": "brazil", "argentina": "argentina", "iceland": "iceland",
    "britain": "great_britain", "uk": "great_britain", "england": "great_britain",
    "scandinavia": "scandinavia", "north europe": "northern_europe",
    "west europe": "western_europe", "south europe": "southern_europe",
    "ukraine": "ukraine", "russia": "ukraine", "north africa": "north_africa",
    "egypt": "egypt", "east africa": "east_africa", "congo": "congo",
    "south africa": "south_africa", "madagascar": "madagascar", "ural": "ural",
    "urals": "ural", "siberia": "siberia", "yakutsk": "yakutsk",
    "kamchatka": "kamchatka", "irkutsk": "irkutsk", "mongolia": "mongolia",
    "japan": "japan", "afghanistan": "afghanistan", "china": "china",
    "middle east": "middle_east", "india": "india", "siam": "siam", "thailand": "siam",
    "indonesia": "indonesia", "new guinea": "new_guinea",
    "west australia": "western_australia", "east australia": "eastern_australia",
    "australia": "eastern_australia",
  };
  if (alias[q]) return alias[q]!;
  // Substring fallback — "the western u s" → western_us etc.
  for (const t of Object.values(TERRITORIES)) {
    const n = t.name.toLowerCase();
    if (q.includes(n) || n.includes(q)) return t.id;
  }
  return null;
}
