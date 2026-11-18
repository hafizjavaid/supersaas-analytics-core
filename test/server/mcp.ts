import { anonymousFetch } from "./helpers";

export interface McpToolResult {
	content: { type: string; text: string }[];
	structuredContent?: Record<string, unknown>;
	isError?: boolean;
}

export interface McpResponse<T> {
	result?: T;
	error?: { code: number; message: string };
}

export const MCP_INITIALIZE_PARAMS = { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "tests", version: "1.0.0" } };

let nextId = 1;

export function postMcp(body: unknown, apiKey: string | null) {
	const headers: Record<string, string> = { "content-type": "application/json", "accept": "application/json, text/event-stream" };
	if (apiKey) {
		headers.authorization = `Bearer ${apiKey}`;
	}
	return anonymousFetch("/mcp", { method: "POST", headers, body: JSON.stringify(body) });
}

// The answer is either one JSON body or an event stream whose last message is the response.
async function readMcpResponse<T>(response: Response): Promise<McpResponse<T>> {
	const text = await response.text();
	if (!response.headers.get("content-type")?.includes("text/event-stream")) {
		return JSON.parse(text);
	}
	const messages = text.split("\n").filter(line => line.startsWith("data:")).map(line => JSON.parse(line.slice(5)));
	return messages.at(-1);
}

export async function mcpRequest<T>(apiKey: string, method: string, params: unknown = {}) {
	const response = await postMcp({ jsonrpc: "2.0", id: nextId++, method, params }, apiKey);
	if (response.status !== 200) {
		throw new Error(`MCP ${method} answered ${response.status}: ${await response.text()}`);
	}
	return await readMcpResponse<T>(response);
}

export async function callMcpTool(apiKey: string, name: string, args: Record<string, unknown> = {}) {
	const response = await mcpRequest<McpToolResult>(apiKey, "tools/call", { name, arguments: args });
	if (!response.result) {
		throw new Error(`MCP tool ${name} failed: ${JSON.stringify(response.error)}`);
	}
	return response.result;
}

export function toolJson<T>(result: McpToolResult): T {
	return JSON.parse(result.content[0]!.text) as T;
}
