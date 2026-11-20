// Soak test (Ticket-04 section 2): N Nights back to back in ONE process with random inputs.
//   npx tsx scripts/soak.ts --seed 7 --nights 10 --out soak.json
// Night i uses seed (seed + i) and map ((i-1) % 3) + 1. Inputs come from a PRNG seeded per Night:
// a new random direction every 30 ticks; per tick 5% jump, 3% dash, 2% pulse, 10% interact.
import { writeFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { setFlagsFromString } from "node:v8";
import { Input, Sim, mulberry32 } from "../src/sim/sim";

const args = process.argv.slice(2);
const arg = (k: string, d?: string): string => {
  const i = args.indexOf(`--${k}`);
  if (i < 0 || i + 1 >= args.length) { if (d === undefined) { process.stderr.write(`error: missing --${k}\n`); process.exit(1); } return d as string; }
  return args[i + 1];
};
const seed = Number(arg("seed", "7")), nights = Number(arg("nights", "10")), out = arg("out");
if (!Number.isInteger(seed) || !Number.isInteger(nights) || nights < 1) { process.stderr.write("error: --seed and --nights must be integers (nights >= 1)\n"); process.exit(1); }

// make a forced garbage collection available so the RSS readings are not just GC timing noise
setFlagsFromString("--expose-gc");
const gc: () => void = runInNewContext("gc");
const rssMb = (): number => { gc(); return process.memoryUsage().rss / 1048576; };

const t0 = Date.now();
const results: string[] = [];
let crashes = 0, memStart = 0, memEnd = 0;

function playNight(i: number): string {
  const night = (((i - 1) % 3) + 1) as 1 | 2 | 3;
  const nightSeed = seed + i;
  const sim = new Sim(nightSeed, {}, night);
  if (i === 1) memStart = rssMb(); // "after the first Night has loaded"
  const rng = mulberry32(nightSeed * 2654435761);
  const input: Input = { move: [0, 0], camYawDeg: 0, jump: false, dash: false, interact: false, pulse: false, pause: false };
  const maxTicks = Math.ceil((sim.endTick) + 1);
  for (let k = 0; k < maxTicks && sim.state === "playing"; k++) {
    if (k % 30 === 0) { const a = rng() * Math.PI * 2; input.move = [Math.cos(a), Math.sin(a)]; }
    input.jump = rng() < 0.05; input.dash = rng() < 0.03; input.pulse = rng() < 0.02; input.interact = rng() < 0.1;
    sim.step(input);
  }
  return sim.state === "playing" ? "lost" : sim.state; // a Night that was cut short at its standard length counts as not won
}

for (let i = 1; i <= nights; i++) {
  try { results.push(playNight(i)); }
  catch (e) { crashes++; results.push("crashed"); process.stderr.write(`night ${i} crashed: ${(e as Error).stack}\n`); }
}
memEnd = rssMb(); // after the last Night has been reset (its Sim is out of scope here)

const result = {
  contract_version: "1.3", nights, crashes, results,
  mem_start_mb: Math.round(memStart * 10) / 10, mem_end_mb: Math.round(memEnd * 10) / 10,
  duration_s: Math.round(((Date.now() - t0) / 1000) * 10) / 10,
};
writeFileSync(out, JSON.stringify(result) + "\n");
console.log(JSON.stringify(result));
process.exit(crashes === 0 && memEnd <= 1.2 * memStart ? 0 : 1);
