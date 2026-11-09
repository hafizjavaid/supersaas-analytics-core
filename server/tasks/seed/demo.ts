import { findOldestOrganization } from "#layers/core/server/db/queries/organizations";
import { createSite, getSiteById, listAllSites } from "#layers/core/server/db/queries/sites";
import { addDemoFunnels, addDemoGoals, addDemoRevenue, addDemoSearch, replaceWithDemoTraffic } from "#layers/core/server/db/queries/demo-data";
import type { Site } from "#layers/core/shared/types/analytics";
import { dateRangeList, shiftDate, todayInTz } from "#layers/core/shared/utils/dates";
import { digestPeriodEnding } from "#layers/core/shared/utils/digests";

const DEMO_SITE = { name: "Demo site", domain: "demo.example.com", timezone: "UTC" };

async function resolveTargetSite(siteId: unknown) {
	if (typeof siteId === "string" && siteId) {
		const site = await getSiteById(siteId);
		if (!site) {
			throw new Error(`No Site with id "${siteId}"`);
		}
		return site;
	}
	const [first] = await listAllSites();
	if (first) {
		return first;
	}
	const organization = await findOldestOrganization();
	if (!organization) {
		throw new Error("Sign up and create an Organization before seeding demo data");
	}
	return createSite(organization.id, DEMO_SITE);
}

// The weekly and monthly Digests the scheduled task would have written over the seeded days, without emailing them.
async function addDemoDigests(site: Site, days: number) {
	const today = todayInTz(site.timezone);
	const firstDay = shiftDate(today, -days);
	let written = 0;
	for (const lastDay of dateRangeList(firstDay, shiftDate(today, -1))) {
		for (const frequency of ["weekly", "monthly"] as const) {
			const period = digestPeriodEnding(frequency, lastDay);
			if (period && period.fromDate >= firstDay && await buildDigest(site, frequency, period)) {
				written += 1;
			}
		}
	}
	return written;
}

export default defineTask({
	meta: {
		name: "seed:demo",
		description: "Dev only: replace a Site's analytics with realistic demo traffic. Payload: { siteId?, days = 30 }",
	},
	async run({ payload }) {
		if (!import.meta.dev) {
			throw new Error("seed:demo only runs in development: it deletes a Site's analytics data");
		}
		const days = payload.days === undefined || payload.days === "" ? 30 : Number(payload.days);
		if (!Number.isInteger(days) || days < 1) {
			throw new Error("days must be a positive integer");
		}

		const site = await resolveTargetSite(payload.siteId);
		const traffic = generateDemoTraffic(todayInTz(site.timezone), site.timezone, days);
		await replaceWithDemoTraffic(site.id, site.timezone, traffic);
		await addDemoGoals(site.id);
		await addDemoFunnels(site.id);
		await addDemoRevenue(site.id, generateDemoPayments(traffic));
		// At least two months, so 28 days compare with the 28 before.
		const search = generateDemoSearch(site.domain, todayInTz("UTC"), Math.max(days, 60));
		await addDemoSearch(site.id, site.domain, search, demoBingSearch(search));
		await serverEdition().afterDemoSeed(site, traffic);
		const digests = await addDemoDigests(site, days);

		return {
			result: {
				siteId: site.id,
				siteName: site.name,
				rollupDays: traffic.rollupDays.length + traffic.rawPastDates.length,
				todayVisits: traffic.todayVisitCount,
				digests,
			},
		};
	},
});
