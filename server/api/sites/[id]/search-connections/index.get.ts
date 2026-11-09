import { getSearchConnections } from "#layers/core/server/db/queries/search";
import type { SearchConnections } from "#layers/core/shared/types/search";

export default defineEventHandler(async (event): Promise<SearchConnections> => {
	const site = await requireSite(event, { integration: ["create"] });
	const connections = await getSearchConnections(site.id);
	const of = (engine: string) => {
		const connection = connections.find(row => row.engine === engine);
		return connection ? searchConnectionOf(connection) : null;
	};
	return { google: of("google"), bing: of("bing"), googleAvailable: hasGoogleSearchConsole() };
});
