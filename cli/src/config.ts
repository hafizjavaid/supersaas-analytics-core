import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Env, SavedLogin } from "./connection.js";

export function defaultConfigDir(env: Env, platform = process.platform) {
	if (env.SUPERSAAS_CONFIG_DIR) {
		return env.SUPERSAAS_CONFIG_DIR;
	}
	if (platform === "win32") {
		return join(env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "supersaas");
	}
	return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "supersaas");
}

function configFile(configDir: string) {
	return join(configDir, "config.json");
}

export async function readSavedLogin(configDir: string): Promise<SavedLogin | undefined> {
	try {
		const saved = JSON.parse(await readFile(configFile(configDir), "utf8")) as Partial<SavedLogin>;
		return typeof saved.url === "string" && typeof saved.apiKey === "string" ? { url: saved.url, apiKey: saved.apiKey } : undefined;
	}
	catch {
		return undefined;
	}
}

export async function saveLogin(configDir: string, login: SavedLogin) {
	await mkdir(configDir, { recursive: true });
	await writeFile(configFile(configDir), `${JSON.stringify(login, null, "\t")}\n`, { mode: 0o600 });
}

export async function forgetLogin(configDir: string) {
	await rm(configFile(configDir), { force: true });
}
