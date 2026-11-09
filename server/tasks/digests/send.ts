import { listDigestSites } from "#layers/core/server/db/queries/digests";
import { previousDateInTz } from "#layers/core/server/db/queries/rollup";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type DigestsRun = { digests: number; emails: number } | { skipped: string };

export default defineTask({
	meta: {
		name: "digests:send",
		description: "Build and email the Digests whose period ends on each Site's previous local day, or the given `date` (YYYY-MM-DD)",
	},
	async run({ payload }): Promise<{ result: DigestsRun }> {
		const date = typeof payload.date === "string" && payload.date ? payload.date : undefined;
		if (date && !DATE_PATTERN.test(date)) {
			throw new Error(`Expected date as YYYY-MM-DD, got "${date}"`);
		}
		if (!hasEmail()) {
			return { result: { skipped: "email is not configured" } };
		}
		const origin = appOrigin();
		const total = { digests: 0, emails: 0 };
		for (const site of await listDigestSites()) {
			if (!serverEdition().sendsDigests(site)) {
				continue;
			}
			// One Site's failure must not hold back the other Sites' Digests.
			try {
				const run = await sendSiteDigests(site, date ?? previousDateInTz(site.timezone), origin);
				total.digests += run.digests;
				total.emails += run.emails;
			}
			catch (error) {
				console.error(`[digests] ${site.id} failed`, error);
			}
		}
		return { result: total };
	},
});
