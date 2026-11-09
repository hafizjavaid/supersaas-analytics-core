import { describe, expect, it } from "vitest";
import { BACKFILL_DAYS, bucketKeywords, expectedCtr, planSearchSync, searchPath, searchRefreshDue, searchWindow } from "#layers/core/shared/utils/search";
import { parseBingDate } from "#layers/core/server/utils/search-bing";
import type { KeywordTotals } from "#layers/core/shared/utils/search";
import { countryOfAlpha3 } from "#layers/core/shared/utils/countries";
import { shiftDate } from "#layers/core/shared/utils/dates";
import { decryptSecret, encryptSecret } from "#layers/core/server/utils/secret-box";
import { signOAuthState, verifyOAuthState } from "#layers/core/server/utils/oauth-state";

const TODAY = "2026-10-10";
const NOW_SEC = Date.parse("2026-10-10T12:00:00Z") / 1000;
const HOUR_SEC = 3600;

describe("planSearchSync", () => {
	it("starts with the last 30 days, then backfills month by month to 16 months", () => {
		const chunks = planSearchSync({ syncedThrough: null, backfilledFrom: null, syncedAt: null }, TODAY, NOW_SEC);
		expect(chunks[0]).toEqual({ from: "2026-09-10", to: "2026-10-09" });
		expect(chunks[1]).toEqual({ from: "2026-08-11", to: "2026-09-09" });
		expect(chunks.at(-1)!.from).toBe(shiftDate(TODAY, -BACKFILL_DAYS));
		for (let index = 1; index < chunks.length; index += 1) {
			expect(shiftDate(chunks[index]!.to, 1)).toBe(chunks[index - 1]!.from);
		}
	});

	it("fetches the last days again, since search engines revise them", () => {
		const cursor = { syncedThrough: "2026-10-08", backfilledFrom: shiftDate(TODAY, -BACKFILL_DAYS), syncedAt: NOW_SEC - 13 * HOUR_SEC };
		expect(planSearchSync(cursor, TODAY, NOW_SEC)).toEqual([{ from: "2026-10-05", to: "2026-10-09" }]);
	});

	it("skips the refresh within 12 hours of the last sync but keeps backfilling", () => {
		const cursor = { syncedThrough: "2026-10-09", backfilledFrom: "2026-06-01", syncedAt: NOW_SEC - HOUR_SEC };
		expect(planSearchSync(cursor, TODAY, NOW_SEC)[0]).toEqual({ from: "2026-05-02", to: "2026-05-31" });
	});

	it("catches up a long gap oldest first, so an interrupted run resumes where it stopped", () => {
		const cursor = { syncedThrough: "2026-07-01", backfilledFrom: shiftDate(TODAY, -BACKFILL_DAYS), syncedAt: NOW_SEC - 100 * 24 * HOUR_SEC };
		const chunks = planSearchSync(cursor, TODAY, NOW_SEC);
		expect(chunks[0]).toEqual({ from: "2026-06-28", to: "2026-07-27" });
		expect(chunks[1]!.from).toBe("2026-07-28");
		expect(chunks.at(-1)!.to).toBe("2026-10-09");
	});

	it("has nothing to do once synced and backfilled", () => {
		const cursor = { syncedThrough: "2026-10-09", backfilledFrom: shiftDate(TODAY, -BACKFILL_DAYS), syncedAt: NOW_SEC - HOUR_SEC };
		expect(planSearchSync(cursor, TODAY, NOW_SEC)).toEqual([]);
	});
});

describe("searchRefreshDue", () => {
	it("is due 12 hours after the last sync, or before the first", () => {
		expect(searchRefreshDue({ syncedThrough: null, backfilledFrom: null, syncedAt: null }, NOW_SEC)).toBe(true);
		expect(searchRefreshDue({ syncedThrough: "2026-10-09", backfilledFrom: "2026-01-01", syncedAt: NOW_SEC - 11 * HOUR_SEC }, NOW_SEC)).toBe(false);
		expect(searchRefreshDue({ syncedThrough: "2026-10-09", backfilledFrom: "2026-01-01", syncedAt: NOW_SEC - 12 * HOUR_SEC }, NOW_SEC)).toBe(true);
	});
});

describe("parseBingDate", () => {
	it("reads the day out of Bing's WCF dates", () => {
		expect(parseBingDate("/Date(1316156400000-0700)/")).toBe("2011-09-16");
		expect(parseBingDate("/Date(1760054400000)/")).toBe("2025-10-10");
	});

	it("gives null for anything else", () => {
		expect(parseBingDate("2025-10-10")).toBeNull();
	});
});

describe("searchWindow", () => {
	it("ends at the latest day with data and compares with the days just before", () => {
		expect(searchWindow("7d", "2026-10-08")).toEqual({ from: "2026-10-02", to: "2026-10-08", previousFrom: "2026-09-25", previousTo: "2026-10-01" });
	});

	it("spans 365 days for 12 months", () => {
		const window = searchWindow("12m", "2026-10-08");
		expect(window.from).toBe(shiftDate("2026-10-08", -364));
		expect(window.previousTo).toBe(shiftDate(window.from, -1));
	});
});

function keyword(query: string, current: [number, number, number | null], previous: [number, number, number | null] = [0, 0, null]): KeywordTotals {
	const [clicks, impressions, position] = current;
	const [previousClicks, previousImpressions, previousPosition] = previous;
	return { query, clicks, impressions, position, previous: { clicks: previousClicks, impressions: previousImpressions, position: previousPosition } };
}

describe("bucketKeywords", () => {
	it("ranks Winners and Losers by the change in clicks", () => {
		const buckets = bucketKeywords([
			keyword("small win", [12, 100, 3], [10, 100, 3]),
			keyword("big win", [40, 300, 2], [10, 200, 4]),
			keyword("loss", [2, 100, 8], [9, 100, 5]),
			keyword("steady", [5, 50, 4], [5, 50, 4]),
		]);
		expect(buckets.winners.map(row => row.query)).toEqual(["big win", "small win"]);
		expect(buckets.losers.map(row => row.query)).toEqual(["loss"]);
	});

	it("finds Opportunities on page 2 by impressions", () => {
		const buckets = bucketKeywords([
			keyword("page two", [1, 400, 14], [1, 300, 15]),
			keyword("page two, more seen", [0, 900, 18]),
			keyword("page three", [0, 900, 25]),
			keyword("barely seen", [0, 3, 12]),
		]);
		expect(buckets.opportunities.map(row => row.query)).toEqual(["page two, more seen", "page two"]);
	});

	it("calls page 1 rankings with far fewer clicks than their position earns Quick wins", () => {
		const buckets = bucketKeywords([
			keyword("under-clicked", [2, 1000, 2]),
			keyword("clicked as expected", [150, 1000, 2]),
			keyword("page two", [0, 1000, 12]),
		]);
		expect(buckets.quickWins.map(row => row.query)).toEqual(["under-clicked"]);
	});

	it("lists keywords seen only now as New and only before as Lost", () => {
		const buckets = bucketKeywords([
			keyword("fresh", [3, 30, 5]),
			keyword("gone", [0, 0, null], [4, 60, 6]),
			keyword("both", [1, 10, 5], [1, 10, 5]),
		]);
		expect(buckets.new.map(row => row.query)).toEqual(["fresh"]);
		expect(buckets.lost.map(row => row.query)).toEqual(["gone"]);
	});

	it("keeps ten per bucket", () => {
		const rows = Array.from({ length: 15 }, (_, index) => keyword(`fresh ${index}`, [index, 10, 5]));
		expect(bucketKeywords(rows).new).toHaveLength(10);
	});
});

describe("expectedCtr", () => {
	it("falls with the position and treats page 2 like position 10", () => {
		expect(expectedCtr(1)).toBeGreaterThan(expectedCtr(3));
		expect(expectedCtr(15)).toBe(expectedCtr(10));
	});
});

describe("searchPath", () => {
	it("keeps the path of a page URL so it matches the Pages tab", () => {
		expect(searchPath("https://example.com/pricing?ref=x#plans")).toBe("/pricing");
		expect(searchPath("https://example.com")).toBe("/");
	});

	it("leaves something that is no URL as is", () => {
		expect(searchPath("not a url")).toBe("not a url");
	});
});

describe("countryOfAlpha3", () => {
	it("turns Search Console's three-letter codes into the two letters the dashboard uses", () => {
		expect(countryOfAlpha3("usa")).toBe("US");
		expect(countryOfAlpha3("GBR")).toBe("GB");
		expect(countryOfAlpha3("zzz")).toBe("Unknown");
	});
});

describe("encryptSecret", () => {
	it("round-trips with the same key and hides the plaintext", async () => {
		const sealed = await encryptSecret("1//refresh-token", "key-material");
		expect(sealed).not.toContain("refresh-token");
		expect(await decryptSecret(sealed, "key-material")).toBe("1//refresh-token");
	});

	it("uses a fresh IV each time", async () => {
		expect(await encryptSecret("same", "key")).not.toBe(await encryptSecret("same", "key"));
	});

	it("refuses another key", async () => {
		await expect(decryptSecret(await encryptSecret("secret", "one key"), "another key")).rejects.toThrow();
	});
});

describe("OAuth state", () => {
	const payload = { siteId: "site-1", userId: "user-1" };

	it("verifies what it signed", async () => {
		const state = await signOAuthState(payload, "secret", NOW_SEC * 1000);
		expect(await verifyOAuthState(state, "secret", NOW_SEC * 1000)).toEqual(payload);
	});

	it("refuses a tampered, foreign or expired state", async () => {
		const state = await signOAuthState(payload, "secret", NOW_SEC * 1000);
		const [body, signature] = state.split(".");
		const forged = `${Buffer.from(JSON.stringify({ ...payload, siteId: "site-2", exp: NOW_SEC + 600 })).toString("base64url")}.${signature}`;
		expect(await verifyOAuthState(forged, "secret", NOW_SEC * 1000)).toBeNull();
		expect(await verifyOAuthState(`${body}.${signature}`, "other secret", NOW_SEC * 1000)).toBeNull();
		expect(await verifyOAuthState(state, "secret", (NOW_SEC + 3600) * 1000)).toBeNull();
		expect(await verifyOAuthState("garbage", "secret", NOW_SEC * 1000)).toBeNull();
	});
});
