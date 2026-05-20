# REDLINE: Risk

> *World conquest, commanded by voice. 42 territories, 6 continents,
> three commanders — and only one can hold them all. You don't push
> pieces; you tell Atlas, your AI general, and it executes.*

A Risk-style strategy game. TypeScript + Vite, 2D DOM board, no build
toolchain beyond `npm`. The "AI is the interface" idea carried over from
REDLINE's tactical builds: you issue orders in plain language and Atlas
runs the recruit / attack / fortify for you.

**Status:** v0.1 — playable core. Full 42-territory classic map, the
three-phase turn, dice combat, continent bonuses, AI opponents,
world-domination win. Local command parser. (LLM intent translator is
the next step — the seam is marked in `main.ts`.)

## How it plays

Classic Risk. Each turn is three phases:

| Phase | What you do | Command examples |
|---|---|---|
| **Recruit** | Place reinforcements (territories ÷ 3, min 3, + continent bonuses) | `recruit 4 to brazil` · `recruit all to china` |
| **Attack** | Assault adjacent enemy territories — dice decide, fights to a result | `attack peru from brazil` · `brazil attacks peru` |
| **Fortify** | One troop move between two connected friendly territories | `fortify 3 from alaska to alberta` |

`done` advances the phase · `end turn` passes (leftover reinforcements
auto-placed) · `help` lists commands · click any territory to inspect it.

**Combat** is the classic Risk dice: the attacker rolls up to 3, the
defender up to 2, highest dice paired, lower loses a troop, ties to the
defender. An attack command fights the whole engagement at once.

**Continent bonuses:** hold every territory in a continent for extra
recruits each turn — North America +5, Asia +7, Europe +5, Africa +3,
South America +2, Australia +2.

**Win:** conquer every territory — eliminate all rival commanders.

## Running

```bash
cd ~/workspace/redline-risk
npm install
npm run dev          # → http://localhost:5173
```

```bash
node scripts/play.mjs   # headless playthrough — drives a game, checks the engine
```

## Architecture

```
redline-risk/
├── index.html
├── src/
│   ├── main.ts                — bootstrap, turn flow, command handling
│   ├── game/
│   │   ├── territories.ts     — 42 territories, 6 continents, adjacency graph, layout
│   │   ├── game-state.ts      — players, ownership, troop counts, reinforcement math
│   │   ├── turn-engine.ts     — recruit / attack / fortify + phase machine
│   │   ├── combat.ts          — Risk dice resolution
│   │   ├── ai-player.ts       — heuristic AI: recruit, attack, fortify
│   │   └── intent-parser.ts   — natural-language → Risk action
│   ├── hud/
│   │   ├── map-renderer.ts    — 2D DOM world board + adjacency SVG
│   │   ├── hud.ts             — top bar + sidebar (commanders, continents)
│   │   └── command-bar.ts     — text input + Atlas chat log
│   └── voice/
│       └── atlas-bank.ts      — Atlas voice (speechSynthesis)
└── scripts/play.mjs           — headless playthrough test
```

## What's carried over from REDLINE

The tactical-RTS builds proved out the "command an AI, don't micromanage"
loop. Risk inherits it: the command bar, the Atlas voice + transcript,
the phase HUD, the dark-CIC aesthetic. What changed is the game *under*
the interface — continuous squad tactics became discrete territory
conquest with dice.

## Next

- **LLM intent translator.** The local parser handles direct commands.
  An LLM unlocks strategy talk — *"reinforce my Asian border and push
  into China", "take all of South America this turn"*. The seam is in
  `main.ts` (`case "unknown"`); the free Gemini path from the prior
  build ports directly.
- **Always-on voice** during your turn (browser SpeechRecognition).
- **Secret-mission win variant**, card sets, more opponents, a map of
  real continent shapes.
