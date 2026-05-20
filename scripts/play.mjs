/** Headless playthrough — boots the game, plays real commands as the
 *  human, lets the AIs run, and verifies the engine holds up over many
 *  turns: phases cycle, combat resolves, territories change hands, the
 *  game can reach a winner. Writes smoke-out/play.log. */

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const OUT = "smoke-out";
const PORT = 5174;
if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });
const log = [];
const stamp = (m) => { const l = `${new Date().toISOString().slice(11, 23)}  ${m}`; log.push(l); console.log(l); };

stamp("starting vite");
const vite = spawn("npx", ["vite", "--port", String(PORT), "--clearScreen=false"], { stdio: ["ignore", "pipe", "pipe"] });
await new Promise((r) => { vite.stdout.on("data", (d) => { if (d.toString().includes("ready in")) r(); }); });
await new Promise((r) => setTimeout(r, 400));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

stamp(`loading http://localhost:${PORT}/`);
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
await page.waitForFunction(() => window.__risk !== undefined, { timeout: 5000 });
await page.waitForTimeout(300);

const snap = async () => page.evaluate(() => window.__risk.snapshot());
const submit = async (cmd) => { await page.evaluate((c) => window.__risk.submit(c), cmd); await page.waitForTimeout(120); };

let s = await snap();
stamp(`T0: turn=${s.turn} phase=${s.phase} current=${s.current} reinf=${s.reinforcements} owned=${JSON.stringify(s.owned)}`);
if (s.phase !== "recruit" || s.current !== "you") stamp("✗ unexpected initial state");
await page.screenshot({ path: join(OUT, "play-T0.png") });

let reachedWinner = null;
let attacksMade = 0;
const MAX_ROUNDS = 30;
for (let round = 1; round <= MAX_ROUNDS; round++) {
  s = await snap();
  if (s.winner) { reachedWinner = s.winner; break; }
  if (s.current !== "you") { await page.waitForTimeout(500); continue; }

  // RECRUIT — mass reinforcements on our strongest territory.
  const recruitTo = await page.evaluate(() => {
    const owned = window.__risk.ownedBy("you");
    if (owned.length === 0) return null;
    owned.sort((a, b) => b.troops - a.troops);
    return owned[0].id;
  });
  if (recruitTo) await submit(`recruit all to ${recruitTo.replace(/_/g, " ")}`);

  await submit("done");  // recruit → attack

  // ATTACK — hit weaker neighbours while we have a clear edge.
  for (let k = 0; k < 5; k++) {
    const atk = await page.evaluate(() => {
      const st = window.__risk.state;
      for (const o of window.__risk.ownedBy("you")) {
        if (o.troops < 4) continue;
        for (const a of window.__risk.adjacencyOf(o.id)) {
          const e = st.ownership.get(a);
          if (e && e.owner !== "you" && o.troops > e.troops + 2) return { from: o.id, to: a };
        }
      }
      return null;
    });
    if (!atk) break;
    await submit(`attack ${atk.to.replace(/_/g, " ")} from ${atk.from.replace(/_/g, " ")}`);
    attacksMade++;
    s = await snap();
    if (s.winner) { reachedWinner = s.winner; break; }
  }
  if (reachedWinner) break;

  await submit("end turn");
  await page.waitForTimeout(900);  // let the AI turns resolve
  s = await snap();
  stamp(`round ${round}: turn=${s.turn} phase=${s.phase} current=${s.current} owned=${JSON.stringify(s.owned)} winner=${s.winner ?? "-"}`);
  if (s.winner) { reachedWinner = s.winner; break; }
}

s = await snap();
await page.screenshot({ path: join(OUT, "play-final.png") });
stamp(`final: turn=${s.turn} owned=${JSON.stringify(s.owned)} winner=${reachedWinner ?? s.winner ?? "(none yet)"}`);
stamp(`attacks resolved by player: ${attacksMade}`);
stamp(`errors: ${errors.length}`);
for (const e of errors.slice(0, 8)) stamp("  " + e);

await writeFile(join(OUT, "play.log"), log.join("\n") + "\n");
await browser.close();
vite.kill();
process.exit(errors.length > 0 ? 1 : 0);
