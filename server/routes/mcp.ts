import { createMcpHandler } from "@modelcontextprotocol/server";
import { analyticsMcpServer } from "#layers/core/server/utils/mcp";

export default defineEventHandler(async (event) => {
	const apiKey = await requireApiKey(event, { countRequest: false });
	const handler = createMcpHandler(() => analyticsMcpServer(event, apiKey));
	return await handler.fetch(toWebRequest(event));
});
