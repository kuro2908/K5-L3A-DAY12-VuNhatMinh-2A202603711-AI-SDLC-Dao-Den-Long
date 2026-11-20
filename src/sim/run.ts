// Shared headless runner used by the CLI and by tests: returns the JSONL lines for a run.
import { Scenario, Sim } from "./sim";
import { endLine, makeInputSource, parseInputs, parseScenario, snapshotLine } from "./io";

export interface RunOptions { seed: number; ticks: number; snapshotEvery?: number; scenario?: unknown; inputs?: unknown }

export function runHeadless(opts: RunOptions): { lines: string[]; sim: Sim } {
  const every = opts.snapshotEvery ?? 10;
  const scenario: Scenario = opts.scenario === undefined ? {} : parseScenario(opts.scenario);
  const frames = opts.inputs === undefined ? [] : parseInputs(opts.inputs);
  const sim = new Sim(opts.seed, scenario);
  const inputAt = makeInputSource(frames);
  const lines: string[] = [snapshotLine(sim)];
  for (let k = 0; k < opts.ticks && sim.state === "playing"; k++) {
    const events = sim.step(inputAt(k));
    for (const e of events) lines.push(JSON.stringify(e));
    if (sim.tick % every === 0) lines.push(snapshotLine(sim));
  }
  lines.push(endLine(sim));
  return { lines, sim };
}
