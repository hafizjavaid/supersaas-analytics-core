import { parseArgs } from "node:util";

// The public API v1 contract; core's `test/unit/cli-contract.test.ts` keeps these equal to the server's lists.
export const RANGES = ["today", "yesterday", "24h", "7d", "30d", "90d", "6m", "12m", "custom"] as const;
export const DIMENSIONS = [
	"page",
	"entry_page",
	"exit_page",
	"outbound_link",
	"channel",
	"referrer",
	"ai_assistant",
	"utm_campaign",
	"utm_medium",
	"utm_term",
	"utm_content",
	"browser",
	"os",
	"device",
	"country",
	"region",
	"city",
	"event",
] as const;

export type Range = typeof RANGES[number];
export type Dimension = typeof DIMENSIONS[number];

export interface ReportOptions {
	range: Range;
	from?: string;
	to?: string;
	filters: string[];
}

export type Command
	= | { name: "help"; topic?: string }
		| { name: "version" }
		| { name: "login" }
		| { name: "logout" }
		| { name: "sites" }
		| { name: "stats"; site: string; report: ReportOptions }
		| { name: "top"; site: string; dimension: Dimension; report: ReportOptions }
		| { name: "live"; site?: string }
		| { name: "goals"; site: string; report: ReportOptions }
		| { name: "funnels"; site: string; funnel?: string; report: ReportOptions }
		| { name: "snippet"; site: string };

export interface GlobalOptions {
	json: boolean;
	url?: string;
}

export type ParsedCommand
	= | { ok: true; command: Command; options: GlobalOptions }
		| { ok: false; error: string };

export const COMMAND_NAMES = ["login", "logout", "sites", "stats", "top", "live", "goals", "funnels", "snippet"] as const;

const OPTIONS = {
	json: { type: "boolean" },
	url: { type: "string" },
	range: { type: "string", short: "r" },
	from: { type: "string" },
	to: { type: "string" },
	filter: { type: "string", short: "f", multiple: true },
	help: { type: "boolean", short: "h" },
	version: { type: "boolean", short: "v" },
} as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

class UsageError extends Error {}

function isOneOf<T extends string>(list: readonly T[], value: string): value is T {
	return list.includes(value as T);
}

function readReport(values: { range?: string; from?: string; to?: string; filter?: string[] }): ReportOptions {
	const range = values.range ?? (values.from || values.to ? "custom" : "30d");
	if (!isOneOf(RANGES, range)) {
		throw new UsageError(`Unknown range "${range}". Use one of: ${RANGES.join(", ")}.`);
	}
	for (const date of [values.from, values.to]) {
		if (date !== undefined && !DATE.test(date)) {
			throw new UsageError(`Dates are YYYY-MM-DD, not "${date}".`);
		}
	}
	if (range === "custom" && !(values.from && values.to)) {
		throw new UsageError("A custom range needs --from and --to.");
	}
	const filters = values.filter ?? [];
	const unreadable = filters.find(filter => !/^[a-z_]+:./.test(filter));
	if (unreadable) {
		throw new UsageError(`Filters are dimension:value, such as country:US, not "${unreadable}".`);
	}
	const report: ReportOptions = { range, filters };
	if (range === "custom") {
		report.from = values.from;
		report.to = values.to;
	}
	return report;
}

function requireSite(site: string | undefined, command: string) {
	if (!site) {
		throw new UsageError(`Which Site? Run \`supersaas ${command} <site>\` with its domain or id.`);
	}
	return site;
}

function readCommand(name: string, positionals: string[], values: Parameters<typeof readReport>[0]): Command {
	const [first, second] = positionals;
	switch (name) {
		case "login":
		case "logout":
		case "sites":
			return { name };
		case "stats":
		case "goals":
			return { name, site: requireSite(first, name), report: readReport(values) };
		case "top": {
			const site = requireSite(first, name);
			if (!second) {
				throw new UsageError(`Which dimension? Use one of: ${DIMENSIONS.join(", ")}.`);
			}
			if (!isOneOf(DIMENSIONS, second)) {
				throw new UsageError(`Unknown dimension "${second}". Use one of: ${DIMENSIONS.join(", ")}.`);
			}
			return { name, site, dimension: second, report: readReport(values) };
		}
		case "live":
			return first ? { name, site: first } : { name };
		case "funnels": {
			const site = requireSite(first, name);
			return second ? { name, site, funnel: second, report: readReport(values) } : { name, site, report: readReport(values) };
		}
		case "snippet":
			return { name, site: requireSite(first, name) };
		default:
			throw new UsageError(`Unknown command "${name}". Run \`supersaas help\` for the list.`);
	}
}

export function parseCommand(argv: string[]): ParsedCommand {
	try {
		const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
		const options: GlobalOptions = { json: values.json ?? false };
		if (values.url !== undefined) {
			options.url = values.url;
		}
		const [name, ...rest] = positionals;
		if (values.version) {
			return { ok: true, command: { name: "version" }, options };
		}
		if (!name || name === "help") {
			return { ok: true, command: rest[0] ? { name: "help", topic: rest[0] } : { name: "help" }, options };
		}
		if (values.help) {
			return { ok: true, command: { name: "help", topic: name }, options };
		}
		return { ok: true, command: readCommand(name, rest, values), options };
	}
	catch (error) {
		if (error instanceof UsageError || (error instanceof TypeError && "code" in error && String(error.code).startsWith("ERR_PARSE_ARGS"))) {
			return { ok: false, error: error.message };
		}
		throw error;
	}
}
