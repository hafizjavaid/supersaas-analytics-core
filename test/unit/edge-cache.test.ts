import { describe, expect, it, vi } from "vitest";
import type { EdgeCache, EdgeCachedAnswer } from "#layers/core/server/utils/edge-cache";
import { withEdgeCache } from "#layers/core/server/utils/edge-cache";

const KEY = "https://example.com/badge/abc.svg?theme=auto&size=small";

function fakeCache() {
	const entries = new Map<string, Response>();
	const cache: EdgeCache = {
		match: async key => entries.get(key)?.clone(),
		put: async (key, response) => {
			entries.set(key, response);
		},
	};
	return { cache, entries };
}

function cached(cache: EdgeCache | undefined, produce: () => Promise<EdgeCachedAnswer>, deferred: Promise<unknown>[] = []) {
	return withEdgeCache({ cache, key: KEY, contentType: "image/svg+xml", produce, defer: promise => deferred.push(promise) });
}

function answer(body: string, maxAgeSeconds = 3600) {
	return async () => ({ body, maxAgeSeconds });
}

describe("withEdgeCache", () => {
	it("answers a miss by producing the body and stores it for the given max age", async () => {
		const { cache, entries } = fakeCache();
		const deferred: Promise<unknown>[] = [];
		expect(await cached(cache, answer("<svg/>"), deferred)).toEqual({ body: "<svg/>", maxAgeSeconds: 3600 });
		await Promise.all(deferred);
		expect(entries.get(KEY)?.headers.get("cache-control")).toBe("public, max-age=3600");
		expect(entries.get(KEY)?.headers.get("content-type")).toBe("image/svg+xml");
	});

	it("answers a hit from the cache, with the max age it was stored for, without producing the body again", async () => {
		const { cache } = fakeCache();
		const deferred: Promise<unknown>[] = [];
		await cached(cache, answer("first", 300), deferred);
		await Promise.all(deferred);
		const produce = vi.fn(answer("second"));
		expect(await cached(cache, produce)).toEqual({ body: "first", maxAgeSeconds: 300 });
		expect(produce).not.toHaveBeenCalled();
	});

	it("answers a hit with only the max age it has left, so browsers do not keep it past the edge's expiry", async () => {
		vi.useFakeTimers({ now: Date.UTC(2026, 10, 14, 12) });
		try {
			const { cache } = fakeCache();
			const deferred: Promise<unknown>[] = [];
			await cached(cache, answer("first", 3600), deferred);
			await Promise.all(deferred);
			vi.advanceTimersByTime(20 * 60 * 1000);
			expect(await cached(cache, answer("second"))).toEqual({ body: "first", maxAgeSeconds: 2400 });
		}
		finally {
			vi.useRealTimers();
		}
	});

	it("caches nothing when producing fails", async () => {
		const { cache, entries } = fakeCache();
		await expect(cached(cache, () => Promise.reject(new Error("Not in the demo")))).rejects.toThrow("Not in the demo");
		expect(entries.size).toBe(0);
	});

	it("stores nothing that is not to be cached", async () => {
		const { cache, entries } = fakeCache();
		await cached(cache, answer("body", 0));
		expect(entries.size).toBe(0);
	});

	it("produces the body every time where there is no edge cache, as in dev", async () => {
		const produce = vi.fn(answer("body"));
		await cached(undefined, produce);
		await cached(undefined, produce);
		expect(produce).toHaveBeenCalledTimes(2);
	});
});
