export interface EdgeCache {
	match: (key: string) => Promise<Response | undefined>;
	put: (key: string, response: Response) => Promise<void>;
}

export interface EdgeCachedAnswer {
	body: string;
	maxAgeSeconds: number;
}

export interface EdgeCacheRequest {
	cache: EdgeCache | undefined;
	key: string;
	contentType: string;
	produce: () => Promise<EdgeCachedAnswer>;
	defer: (promise: Promise<unknown>) => void;
}

// Cloudflare's per-data-center cache; Node has none, so dev and tests produce every answer.
export function edgeCache() {
	return (globalThis as { caches?: { default?: EdgeCache } }).caches?.default;
}

const STORED_AT_HEADER = "x-edge-stored-at";

function remainingMaxAgeOf(response: Response) {
	const maxAge = Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] ?? 0);
	const storedAt = Number(response.headers.get(STORED_AT_HEADER) ?? Date.now());
	return Math.max(0, maxAge - Math.floor((Date.now() - storedAt) / 1000));
}

// A Worker's response never enters Cloudflare's cache by its Cache-Control alone, so answers worth caching are stored
// here by hand, under a key the caller normalises.
export async function withEdgeCache({ cache, key, contentType, produce, defer }: EdgeCacheRequest): Promise<EdgeCachedAnswer> {
	const hit = await cache?.match(key);
	if (hit) {
		return { body: await hit.text(), maxAgeSeconds: remainingMaxAgeOf(hit) };
	}
	const answer = await produce();
	if (cache && answer.maxAgeSeconds > 0) {
		const response = new Response(answer.body, {
			headers: {
				"content-type": contentType,
				"cache-control": `public, max-age=${answer.maxAgeSeconds}`,
				[STORED_AT_HEADER]: String(Date.now()),
			},
		});
		defer(cache.put(key, response));
	}
	return answer;
}
