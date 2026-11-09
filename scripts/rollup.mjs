// pnpm rollup [YYYY-MM-DD]
import { spawnSync } from "node:child_process";

const [date] = process.argv.slice(2);
const payload = JSON.stringify(date ? { date } : {});
const { status } = spawnSync(process.execPath, ["scripts/run-dev-task.mjs", "rollup:daily", payload], { stdio: "inherit" });
process.exit(status ?? 1);
