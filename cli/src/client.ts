import type { ReportOptions } from "./arguments.js";
import { CliError, describeHttpError } from "./errors.js";

export interface ApiClient {
	get: <T>(path: string, report?: ReportOptions) => Promise<T>;
}

export function reportQuery(report: ReportOptions) {
	const query = new URLSearchParams({ range: report.range });
	if (report.from && report.to) {
		query.set("from", report.from);
		query.set("to", report.to);
	}
	for (const filter of report.filters) {
		query.append("f", filter);
	}
	return query;
}

async function readBody(response: Response) {
	const text = await response.text();
	try {
		return JSON.parse(text) as unknown;
	}
	catch {
		return null;
	}
}

export function createApiClient({ url, apiKey, version, fetch }: { url: string; apiKey: string; version: string; fetch: typeof globalThis.fetch }): ApiClient {
	return {
		async get<T>(path: string, report?: ReportOptions) {
			const target = `${url}/api/v1${path}${report ? `?${reportQuery(report)}` : ""}`;
			let response: Response;
			try {
				response = await fetch(target, {
					headers: { "authorization": `Bearer ${apiKey}`, "accept": "application/json", "user-agent": `supersaas-analytics-cli/${version}` },
				});
			}
			catch (error) {
				throw new CliError(`Could not reach ${url}: ${error instanceof Error ? error.message : String(error)}`);
			}
			const body = await readBody(response);
			if (!response.ok) {
				throw new CliError(describeHttpError({ status: response.status, retryAfter: response.headers.get("retry-after"), body, url }));
			}
			if (body === null) {
				throw new CliError(`${url} did not answer with JSON. Is it a Supersaas Analytics server?`);
			}
			return body as T;
		},
	};
}
