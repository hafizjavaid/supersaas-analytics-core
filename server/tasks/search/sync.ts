import { listSyncableSearchConnections } from "#layers/core/server/db/queries/search";

export default defineTask({
	meta: {
		name: "search:sync",
		description: "Fetch each search connection's recent days, and carry on its 16-month backfill",
	},
	async run() {
		const connections = await listSyncableSearchConnections();
		for (const connection of connections) {
			await syncSearchConnection(connection);
		}
		return { result: { connections: connections.length } };
	},
});
