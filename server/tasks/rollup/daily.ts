import { deleteEndedDailySalts } from "#layers/core/server/db/queries/salts";
import { listAllSites } from "#layers/core/server/db/queries/sites";
import { aggregateSiteDay, previousDateInTz } from "#layers/core/server/db/queries/rollup";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default defineTask({
	meta: {
		name: "rollup:daily",
		description: "Roll up each Site's previous local day, or the given `date` (YYYY-MM-DD), into the daily_* tables",
	},
	async run({ payload }) {
		const date = typeof payload.date === "string" && payload.date ? payload.date : undefined;
		if (date && !DATE_PATTERN.test(date)) {
			throw new Error(`Expected date as YYYY-MM-DD, got "${date}"`);
		}

		// `/collect` also deletes them on a day's first hit; this covers days without any traffic.
		await deleteEndedDailySalts();

		const rolledUp: { siteId: string; date: string }[] = [];
		for (const site of await listAllSites()) {
			const siteDate = date ?? previousDateInTz(site.timezone);
			await aggregateSiteDay(site.id, site.timezone, siteDate);
			rolledUp.push({ siteId: site.id, date: siteDate });
		}
		return { result: rolledUp };
	},
});
