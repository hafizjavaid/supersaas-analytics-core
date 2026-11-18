import type { Command, GlobalOptions } from "./arguments.js";
import { parseCommand } from "./arguments.js";
import type { Funnel, FunnelReport, Funnels, Goals, Live, Site, Sites, Summary, TopList } from "./api-types.js";
import { createApiClient } from "./client.js";
import type { ApiClient } from "./client.js";
import { forgetLogin, readSavedLogin, saveLogin } from "./config.js";
import { resolveConnection, resolveUrl } from "./connection.js";
import type { Env } from "./connection.js";
import { CliError } from "./errors.js";
import { formatFunnelReport, formatFunnels, formatGoals, formatLive, formatSites, formatSnippet, formatSummary, formatTopList } from "./format.js";
import { helpText } from "./help.js";

export interface Io {
	env: Env;
	configDir: string;
	version: string;
	fetch: typeof globalThis.fetch;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	readSecret: (prompt: string) => Promise<string>;
}

interface Output {
	json: unknown;
	text: string;
}

function normalizeDomain(input: string) {
	return input.trim().toLowerCase()
		.replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
		.replace(/[/?#].*$/, "")
		.replace(/:\d*$/, "")
		.replace(/\.+$/, "")
		.replace(/^www\./, "");
}

async function findSite(api: ApiClient, ref: string) {
	const { sites } = await api.get<Sites>("/sites");
	const site = sites.find(candidate => candidate.id === ref) ?? sites.find(candidate => normalizeDomain(candidate.domain) === normalizeDomain(ref));
	if (!site) {
		throw new CliError(`No Site "${ref}" for this API key. Run \`supersaas sites\` to list them.`);
	}
	return site;
}

function findFunnel(funnels: Funnel[], ref: string) {
	const funnel = funnels.find(candidate => candidate.id === ref) ?? funnels.find(candidate => candidate.name.toLowerCase() === ref.toLowerCase());
	if (!funnel) {
		const names = funnels.map(candidate => candidate.name).join(", ") || "none yet";
		throw new CliError(`No Funnel "${ref}" on this Site. Funnels: ${names}.`);
	}
	return funnel;
}

function sitePath(site: Site, path: string) {
	return `/sites/${encodeURIComponent(site.id)}${path}`;
}

async function readLive(api: ApiClient, ref: string | undefined): Promise<Output> {
	const sites = ref ? [await findSite(api, ref)] : (await api.get<Sites>("/sites")).sites;
	const live = await Promise.all(sites.map(site => api.get<Live>(sitePath(site, "/live"))));
	if (ref) {
		return { json: live[0], text: formatLive(live) };
	}
	const visitors = live.reduce((sum, entry) => sum + entry.visitors, 0);
	return { json: { visitors, sites: live }, text: sites.length === 0 ? formatSites({ sites }) : formatLive(live) };
}

async function readReport(api: ApiClient, command: Exclude<Command, { name: "help" | "version" | "login" | "logout" | "live" }>, url: string): Promise<Output> {
	if (command.name === "sites") {
		const sites = await api.get<Sites>("/sites");
		return { json: sites, text: formatSites(sites) };
	}
	const site = await findSite(api, command.site);
	switch (command.name) {
		case "stats": {
			const summary = await api.get<Summary>(sitePath(site, "/summary"), command.report);
			return { json: summary, text: formatSummary(summary) };
		}
		case "top": {
			const topList = await api.get<TopList>(sitePath(site, `/top/${command.dimension}`), command.report);
			return { json: topList, text: formatTopList(topList) };
		}
		case "goals": {
			const goals = await api.get<Goals>(sitePath(site, "/goals"), command.report);
			return { json: goals, text: formatGoals(goals) };
		}
		case "funnels": {
			const funnels = await api.get<Funnels>(sitePath(site, "/funnels"));
			if (!command.funnel) {
				return { json: funnels, text: formatFunnels(funnels) };
			}
			const funnel = findFunnel(funnels.funnels, command.funnel);
			const report = await api.get<FunnelReport>(sitePath(site, `/funnels/${encodeURIComponent(funnel.id)}`), command.report);
			return { json: report, text: formatFunnelReport(report) };
		}
		case "snippet": {
			const snippet = formatSnippet(url, site.id);
			return { json: { site: { id: site.id, name: site.name, domain: site.domain }, snippet }, text: snippet };
		}
	}
}

async function login(options: GlobalOptions, io: Io): Promise<Output> {
	const resolved = resolveUrl(options.url, { SUPERSAAS_URL: io.env.SUPERSAAS_URL });
	if (!resolved.ok) {
		throw new CliError(resolved.error);
	}
	const apiKey = (await io.readSecret(`API key for ${resolved.url}: `)).trim();
	if (!apiKey) {
		throw new CliError("No API key given. Create one in Organization Settings → API keys.");
	}
	const api = createApiClient({ url: resolved.url, apiKey, version: io.version, fetch: io.fetch });
	const { sites } = await api.get<Sites>("/sites");
	await saveLogin(io.configDir, { url: resolved.url, apiKey });
	const count = `${sites.length} ${sites.length === 1 ? "Site" : "Sites"}`;
	return { json: { url: resolved.url, sites: sites.length }, text: `Logged in to ${resolved.url}. The key reads ${count}.` };
}

async function execute(command: Command, options: GlobalOptions, io: Io): Promise<Output> {
	switch (command.name) {
		case "help":
			return { json: helpText(command.topic), text: helpText(command.topic) };
		case "version":
			return { json: io.version, text: io.version };
		case "login":
			return login(options, io);
		case "logout":
			await forgetLogin(io.configDir);
			return { json: { loggedOut: true }, text: "Forgot the saved API key." };
	}
	const connection = resolveConnection({ flagUrl: options.url, env: io.env, config: await readSavedLogin(io.configDir) });
	if (!connection.ok) {
		throw new CliError(connection.error);
	}
	const api = createApiClient({ ...connection, version: io.version, fetch: io.fetch });
	return command.name === "live" ? readLive(api, command.site) : readReport(api, command, connection.url);
}

export async function run(argv: string[], io: Io) {
	const parsed = parseCommand(argv);
	if (!parsed.ok) {
		io.stderr(`${parsed.error}\n`);
		return 2;
	}
	try {
		const output = await execute(parsed.command, parsed.options, io);
		const asJson = parsed.options.json && typeof output.json !== "string";
		io.stdout(`${asJson ? JSON.stringify(output.json, null, 2) : output.text}\n`);
		return 0;
	}
	catch (error) {
		if (error instanceof CliError) {
			io.stderr(`${error.message}\n`);
			return 1;
		}
		throw error;
	}
}
