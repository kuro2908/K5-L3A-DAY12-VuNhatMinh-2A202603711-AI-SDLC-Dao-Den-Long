import { defineConfig } from "vite";
import { handleLeaderboard } from "./scripts/server-lib";

// `npm run dev` also persists the leaderboard to data/leaderboard.json (same API as `npm start`)
export default defineConfig({
  plugins: [{
    name: "leaderboard-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => { if (!(await handleLeaderboard(req, res))) next(); });
    },
  }],
});
