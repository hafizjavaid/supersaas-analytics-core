import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/arguments.js";

function commandOf(argv: string[]) {
	const parsed = parseCommand(argv);
	if (!parsed.ok) {
		throw new Error(parsed.error);
	}
	return parsed.command;
}

function errorOf(argv: string[]) {
	const parsed = parseCommand(argv);
	return parsed.ok ? undefined : parsed.error;
}

describe("parseCommand", () => {
	it("reads a Site and a Range for stats", () => {
		expect(parseCommand(["stats", "example.com", "--range", "7d"])).toEqual({
			ok: true,
			command: { name: "stats", site: "example.com", report: { range: "7d", filters: [] } },
			options: { json: false },
		});
	});

	it("defaults the Range to 30 days", () => {
		expect(commandOf(["goals", "example.com"])).toEqual({ name: "goals", site: "example.com", report: { range: "30d", filters: [] } });
	});

	it("reads --json and --url wherever they are", () => {
		expect(parseCommand(["--json", "sites", "--url", "http://localhost:3002"])).toEqual({
			ok: true,
			command: { name: "sites" },
			options: { json: true, url: "http://localhost:3002" },
		});
	});

	it("collects repeated Filters", () => {
		expect(commandOf(["stats", "example.com", "-f", "country:US", "--filter", "channel:search"]))
			.toMatchObject({ report: { filters: ["country:US", "channel:search"] } });
	});

	it("turns --from and --to into a custom Range", () => {
		expect(commandOf(["stats", "example.com", "--from", "2026-10-01", "--to", "2026-10-31"]))
			.toMatchObject({ report: { range: "custom", from: "2026-10-01", to: "2026-10-31" } });
	});

	it("reads a Dimension for top", () => {
		expect(commandOf(["top", "example.com", "referrer"])).toMatchObject({ name: "top", site: "example.com", dimension: "referrer" });
	});

	it("takes live with or without a Site", () => {
		expect(commandOf(["live"])).toEqual({ name: "live" });
		expect(commandOf(["live", "example.com"])).toEqual({ name: "live", site: "example.com" });
	});

	it("takes funnels with or without a Funnel", () => {
		expect(commandOf(["funnels", "example.com"])).toMatchObject({ name: "funnels", site: "example.com" });
		expect(commandOf(["funnels", "example.com", "Signup"])).toMatchObject({ name: "funnels", site: "example.com", funnel: "Signup" });
	});

	it("shows help without a command and for --help", () => {
		expect(commandOf([])).toEqual({ name: "help" });
		expect(commandOf(["top", "--help"])).toEqual({ name: "help", topic: "top" });
	});

	it("refuses an unknown Range and lists the known ones", () => {
		expect(errorOf(["stats", "example.com", "--range", "week"])).toContain("7d, 30d");
	});

	it("refuses an unknown Dimension and lists the known ones", () => {
		expect(errorOf(["top", "example.com", "pages"])).toContain("page, entry_page");
	});

	it("asks for a Site when a report has none", () => {
		expect(errorOf(["stats"])).toContain("Which Site?");
	});

	it("refuses a custom Range without both dates", () => {
		expect(errorOf(["stats", "example.com", "--range", "custom", "--from", "2026-10-01"])).toContain("--from and --to");
	});

	it("refuses a Filter without a value", () => {
		expect(errorOf(["stats", "example.com", "-f", "country"])).toContain("dimension:value");
	});

	it("refuses an unknown option and an unknown command", () => {
		expect(errorOf(["sites", "--colour"])).toContain("--colour");
		expect(errorOf(["visitors"])).toContain("Unknown command");
	});
});
