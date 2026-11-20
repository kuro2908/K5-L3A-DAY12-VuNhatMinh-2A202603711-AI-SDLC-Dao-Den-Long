// Headless entry point (Test Contract v1.0).
// Usage: cli.ts --seed <int> --night 1 [--scenario f] [--inputs f] --ticks <int> --out <f.jsonl> [--snapshot-every <int>]
import { readFileSync, writeFileSync } from "node:fs";
import { runHeadless } from "../sim/run";
import { FormatError } from "../sim/io";

function usage(msg: string): never {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!k.startsWith("--") || i + 1 >= argv.length) usage(`bad argument near "${k}"`);
    out[k.slice(2)] = argv[i + 1];
  }
  return out;
}

function readJson(path: string): unknown {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { process.stderr.write(`error: cannot read JSON "${path}": ${(e as Error).message}\n`); process.exit(2); }
}

const intArg = (a: Record<string, string>, k: string, def?: number): number => {
  const v = a[k];
  if (v === undefined) { if (def === undefined) usage(`missing --${k}`); return def as number; }
  if (!/^-?\d+$/.test(v)) usage(`--${k} must be an integer`);
  return Number(v);
};

const args = parseArgs(process.argv.slice(2));
const seed = intArg(args, "seed");
const night = intArg(args, "night", 1);
const ticks = intArg(args, "ticks");
const every = intArg(args, "snapshot-every", 10);
if (night !== 1) usage("only --night 1 exists in this build");
if (ticks < 0 || every < 1) usage("--ticks must be >= 0 and --snapshot-every >= 1");
if (!args.out) usage("missing --out");

try {
  const { lines } = runHeadless({
    seed, ticks, snapshotEvery: every,
    scenario: args.scenario ? readJson(args.scenario) : undefined,
    inputs: args.inputs ? readJson(args.inputs) : undefined,
  });
  writeFileSync(args.out, lines.join("\n") + "\n");
} catch (e) {
  if (e instanceof FormatError) { process.stderr.write(`error: ${e.message}\n`); process.exit(2); }
  process.stderr.write(`error: ${(e as Error).stack}\n`);
  process.exit(1);
}
