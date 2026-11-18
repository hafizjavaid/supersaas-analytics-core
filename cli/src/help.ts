import { DIMENSIONS, RANGES } from "./arguments.js";

const REPORT_OPTIONS = `Report options:
  -r, --range <range>     ${RANGES.join(", ")} (default 30d)
      --from, --to <day>  A custom Range, YYYY-MM-DD in the Site's timezone
  -f, --filter <filter>   dimension:value, such as country:US or channel:search; repeat to combine`;

const GLOBAL_OPTIONS = `Options:
      --json              Print the API's JSON instead of a table
      --url <url>         Your server, for a Self-hosted copy (or SUPERSAAS_URL)
  -h, --help              Show help
  -v, --version           Show the version`;

const COMMANDS: Record<string, string> = {
	login: "supersaas login [--url <url>]\n  Asks for an API key (Organization Settings → API keys), checks it and saves it with the URL.",
	logout: "supersaas logout\n  Forgets the saved API key.",
	sites: "supersaas sites\n  Lists the Organization's Sites.",
	stats: `supersaas stats <site> [report options]\n  Visitors, Visits, Pageviews, bounce rate and visit duration against the period before.\n\n${REPORT_OPTIONS}`,
	top: `supersaas top <site> <dimension> [report options]\n  The ten largest values of a Dimension.\n  Dimensions: ${DIMENSIONS.join(", ")}\n\n${REPORT_OPTIONS}`,
	live: "supersaas live [site]\n  Visitors in the last 5 minutes, on one Site or every Site.",
	goals: `supersaas goals <site> [report options]\n  Conversions per Goal.\n\n${REPORT_OPTIONS}`,
	funnels: `supersaas funnels <site> [funnel] [report options]\n  Lists the Site's Funnels, or reports one by its id or name.\n\n${REPORT_OPTIONS}`,
	snippet: "supersaas snippet <site>\n  Prints the Tracking snippet to paste into the Site's <head>.",
};

export function helpText(topic?: string) {
	if (topic && COMMANDS[topic]) {
		return `Usage: ${COMMANDS[topic]}\n\n${GLOBAL_OPTIONS}`;
	}
	const lines = Object.values(COMMANDS).map(text => `  ${text.split("\n")[0]}`);
	return `Read your Supersaas Analytics reports from the terminal.

Usage:
${lines.join("\n")}

A <site> is its domain or id. Run \`supersaas <command> --help\` for a command's options.

${GLOBAL_OPTIONS}

Environment:
  SUPERSAAS_API_KEY       Use this API key instead of the saved one
  SUPERSAAS_URL           Use this server instead of the saved one`;
}
