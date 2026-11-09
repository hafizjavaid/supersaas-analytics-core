// pnpm db:seed [siteId] [days]
import { spawnSync } from "node:child_process";

const [siteId, days] = process.argv.slice(2);
const payload = JSON.stringify({ ...(siteId && { siteId }), ...(days && { days: Number(days) }) });
const { status } = spawnSync(process.execPath, ["scripts/run-dev-task.mjs", "seed:demo", payload], { stdio: "inherit" });
process.exit(status ?? 1);
