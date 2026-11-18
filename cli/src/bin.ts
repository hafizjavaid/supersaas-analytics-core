#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { defaultConfigDir } from "./config.js";
import { readSecret } from "./prompt.js";
import { run } from "./run.js";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

process.exitCode = await run(process.argv.slice(2), {
	env: process.env,
	configDir: defaultConfigDir(process.env),
	version,
	fetch: globalThis.fetch,
	stdout: text => process.stdout.write(text),
	stderr: text => process.stderr.write(text),
	readSecret,
});
