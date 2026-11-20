// Serve the built game: `npm start` (http://localhost:4173), or export the saved leaderboard:
//   npm start -- --export-leaderboard out.json     writes {"entries":[...]} and exits
// The leaderboard lives in data/leaderboard.json (override with LEADERBOARD_FILE), so it survives closing and reopening the game.
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createGameServer, leaderboardFile, readLeaderboard } from "./server-lib";

const args = process.argv.slice(2);
const ex = args.indexOf("--export-leaderboard");
if (ex >= 0) {
  const out = args[ex + 1];
  if (!out) { process.stderr.write("error: --export-leaderboard needs an output file\n"); process.exit(1); }
  writeFileSync(out, JSON.stringify({ entries: readLeaderboard() }, null, 2) + "\n");
  process.exit(0);
}
const pi = args.indexOf("--port");
const port = pi >= 0 ? Number(args[pi + 1]) : Number(process.env.PORT ?? 4173);
if (!existsSync(resolve("dist/index.html"))) { process.stderr.write("error: dist/ not found - run: npm run build\n"); process.exit(1); }
createGameServer().listen(port, () => console.log(`Dao Den Long: http://localhost:${port}  (leaderboard: ${leaderboardFile()})`));
