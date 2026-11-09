import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { FAKE_ANTHROPIC_PORT, TEST_ANTHROPIC_KEY } from "./anthropic";

interface ContentBlock {
	type: string;
	text?: string;
	content?: string | ContentBlock[];
}

interface MessagesRequest {
	model: string;
	stream?: boolean;
	tools?: { name: string }[];
	messages: { role: string; content: string | ContentBlock[] }[];
}

let lastRequest: MessagesRequest | null = null;

async function readJson(request: IncomingMessage) {
	const chunks: Buffer[] = [];
	for await (const chunk of request) {
		chunks.push(chunk as Buffer);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8")) as MessagesRequest;
}

function textOf(content: string | ContentBlock[] | undefined): string {
	if (typeof content === "string") {
		return content;
	}
	return (content ?? []).map(block => block.text ?? textOf(block.content)).join("");
}

type AnswerBlock = { type: "text"; text: string } | { type: "tool_use"; name: string; input: unknown };

// The Messages API's streaming events, one content block per answer.
function stream(response: ServerResponse, model: string, block: AnswerBlock) {
	response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
	const send = (type: string, data: Record<string, unknown>) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
	const usage = { input_tokens: 10, output_tokens: 0 };
	send("message_start", { message: { id: `msg_${Date.now()}`, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage } });
	if (block.type === "text") {
		send("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
		send("content_block_delta", { index: 0, delta: { type: "text_delta", text: block.text } });
	}
	else {
		send("content_block_start", { index: 0, content_block: { type: "tool_use", id: `toolu_${Date.now()}`, name: block.name, input: {} } });
		send("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
	}
	send("content_block_stop", { index: 0 });
	send("message_delta", { delta: { stop_reason: block.type === "text" ? "end_turn" : "tool_use", stop_sequence: null }, usage: { output_tokens: 5 } });
	send("message_stop", {});
	response.end();
}

// Digests ask without streaming.
function reply(response: ServerResponse, model: string, block: AnswerBlock) {
	const content = block.type === "text" ? [block] : [{ ...block, id: `toolu_${Date.now()}` }];
	response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
		id: `msg_${Date.now()}`,
		type: "message",
		role: "assistant",
		model,
		content,
		stop_reason: block.type === "text" ? "end_turn" : "tool_use",
		stop_sequence: null,
		usage: { input_tokens: 10, output_tokens: 5 },
	}));
}

// Scripted by the question: "call <tool> <json input>" calls that tool, and the turn after a tool result repeats it, so
// tests can read what a tool answered. Anything else is echoed back.
function answer(body: MessagesRequest): AnswerBlock {
	const last = body.messages.at(-1);
	const blocks = typeof last?.content === "string" ? [] : last?.content ?? [];
	const toolResult = blocks.find(block => block.type === "tool_result");
	if (toolResult) {
		return { type: "text" as const, text: `Tool said: ${textOf(toolResult.content)}` };
	}
	const question = textOf(last?.content).trim();
	const call = /^call (\w+)(?: (.*))?$/s.exec(question);
	if (call) {
		return { type: "tool_use" as const, name: call[1]!, input: call[2] ? JSON.parse(call[2]) : {} };
	}
	return { type: "text" as const, text: `You asked: ${question}` };
}

export async function startFakeAnthropic() {
	const server = createServer((request, response) => {
		const url = new URL(request.url ?? "/", "http://fake-anthropic");
		if (request.method === "GET" && url.pathname === "/last-request") {
			response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(lastRequest));
			return;
		}
		if (request.method !== "POST" || url.pathname !== "/v1/messages") {
			response.writeHead(404).end();
			return;
		}
		if (request.headers["x-api-key"] !== TEST_ANTHROPIC_KEY) {
			response.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }));
			return;
		}
		readJson(request).then((body) => {
			lastRequest = body;
			(body.stream ? stream : reply)(response, body.model, answer(body));
		});
	});
	await new Promise<void>(resolve => server.listen(FAKE_ANTHROPIC_PORT, "127.0.0.1", resolve));
	return () => new Promise<void>(resolve => server.close(() => resolve()));
}
