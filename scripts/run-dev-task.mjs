// Runs a Nitro task on the running dev server: node scripts/run-dev-task.mjs <task> [payload as JSON]
const [task, payload = "{}"] = process.argv.slice(2);
const origin = process.env.DEV_SERVER_URL ?? "http://localhost:3001";

if (!task) {
	console.error("Usage: node scripts/run-dev-task.mjs <task> [payload JSON]");
	process.exit(1);
}

try {
	const response = await fetch(`${origin}/_nitro/tasks/${task}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ payload: JSON.parse(payload) }),
	});
	const body = await response.text();
	console.log(body);
	process.exit(response.ok ? 0 : 1);
}
catch (error) {
	console.error(`Could not reach the dev server at ${origin}. Start it with \`pnpm dev\` first.`);
	console.error(error.message);
	process.exit(1);
}
