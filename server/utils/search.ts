import type { H3Event } from "h3";
import type { SearchConnectionRow, SearchEngineFilter } from "#layers/core/server/db/queries/search";
import { getSearchConnection, getSearchConnections, recordSyncError, replaceSearchData, saveSyncProgress } from "#layers/core/server/db/queries/search";
import type { SearchConnection, SearchProperty } from "#layers/core/shared/types/search";
import type { SearchEngine, SyncCursor } from "#layers/core/shared/utils/search";
import { isSearchEngine, isSearchRange, planSearchSync, SEARCH_ENGINE_NAMES, searchRefreshDue } from "#layers/core/shared/utils/search";
import { appOrigin } from "./app-origin";
import { appSecret } from "./app-secret";
import { decryptSecret, encryptSecret } from "./secret-box";
import { fetchBingData, listBingProperties } from "./search-bing";
import { fetchGoogleChunk, listGoogleProperties } from "./search-google";
import { SearchSyncError } from "./search-sync-error";

// Fetching a month costs a few requests, so a run stops after this many and the hourly task carries on the backfill.
const CHUNKS_PER_RUN = 4;

// Keyed by NUXT_AUTH_SECRET, so rotating that secret means connecting the search engines again.
function credentialKey() {
	return appSecret();
}

// The same key material signs the OAuth state; the HMAC's own prefix keeps the two uses apart.
export function oauthStateSecret() {
	return credentialKey();
}

export function googleRedirectUri(event: H3Event) {
	return `${appOrigin(event)}/api/search-connections/google/callback`;
}

export function sealCredential(plaintext: string) {
	return encryptSecret(plaintext, credentialKey());
}

export function openCredential(connection: SearchConnectionRow) {
	return decryptSecret(connection.credential, credentialKey());
}

export function searchConnectionOf(connection: SearchConnectionRow): SearchConnection {
	return {
		engine: connection.engine,
		property: connection.property,
		syncedAt: connection.syncedAt,
		syncedThrough: connection.syncedThrough,
		backfilledFrom: connection.backfilledFrom,
		lastError: connection.lastError,
		createdAt: connection.createdAt,
	};
}

function cursorOf(connection: SearchConnectionRow): SyncCursor {
	return { syncedThrough: connection.syncedThrough, backfilledFrom: connection.backfilledFrom, syncedAt: connection.syncedAt };
}

function utcToday(nowSec: number) {
	return new Date(nowSec * 1000).toISOString().slice(0, 10);
}

async function syncGoogle(connection: SearchConnectionRow, nowSec: number) {
	const property = connection.property!;
	const refreshToken = await openCredential(connection);
	const today = utcToday(nowSec);
	const latest = new Date((nowSec - 86_400) * 1000).toISOString().slice(0, 10);
	const cursor = cursorOf(connection);
	for (const chunk of planSearchSync(cursor, today, nowSec).slice(0, CHUNKS_PER_RUN)) {
		const { days, rows } = await fetchGoogleChunk(refreshToken, property, chunk);
		await replaceSearchData(connection, chunk, days, rows);
		cursor.syncedThrough = cursor.syncedThrough && cursor.syncedThrough > chunk.to ? cursor.syncedThrough : chunk.to;
		cursor.backfilledFrom = cursor.backfilledFrom && cursor.backfilledFrom < chunk.from ? cursor.backfilledFrom : chunk.from;
		if (chunk.to === latest) {
			cursor.syncedAt = nowSec;
		}
		await saveSyncProgress(connection, cursor);
	}
}

// Bing answers with all its months at once, so a sync replaces the days it covers, at most twice a day.
async function syncBing(connection: SearchConnectionRow, nowSec: number) {
	const cursor = cursorOf(connection);
	if (!searchRefreshDue(cursor, nowSec)) {
		return;
	}
	const { days, rows } = await fetchBingData(await openCredential(connection), connection.property!);
	const dates = [...days, ...rows].map(entry => entry.date).sort();
	const from = dates[0];
	const to = dates.at(-1);
	if (from && to) {
		await replaceSearchData(connection, { from, to }, days, rows);
	}
	await saveSyncProgress(connection, { syncedThrough: to ?? cursor.syncedThrough, backfilledFrom: from ?? cursor.backfilledFrom, syncedAt: nowSec });
}

interface SearchEngineAdapter {
	sync: (connection: SearchConnectionRow, nowSec: number) => Promise<void>;
	listProperties: (credential: string) => Promise<SearchProperty[]>;
}

const searchEngines: Record<SearchEngine, SearchEngineAdapter> = {
	google: { sync: syncGoogle, listProperties: listGoogleProperties },
	bing: { sync: syncBing, listProperties: listBingProperties },
};

// Never throws: a failed sync is kept on the connection for the settings page, and the next run tries again.
export async function syncSearchConnection(connection: SearchConnectionRow, nowSec = Math.floor(Date.now() / 1000)) {
	if (!connection.property) {
		return;
	}
	try {
		await searchEngines[connection.engine].sync(connection, nowSec);
	}
	catch (error) {
		console.error(`[search:sync] ${connection.engine} for Site ${connection.siteId}`, error);
		const message = error instanceof SearchSyncError ? error.message : `Could not reach ${SEARCH_ENGINE_NAMES[connection.engine]}. The next sync tries again.`;
		await recordSyncError(connection, message);
	}
}

export function startSearchSync(event: H3Event, siteId: string, engine: SearchEngine) {
	event.waitUntil(getSearchConnection(siteId, engine).then(connection => connection && syncSearchConnection(connection)));
}

// Handlers under `search-connections/[engine]`: 404 for an unknown engine or one the Site has not connected.
export async function requireSearchConnection(event: H3Event, permission: OrganizationPermission = { integration: ["create"] }) {
	const engine = getRouterParam(event, "engine");
	const site = await requireSite(event, permission);
	const connection = isSearchEngine(engine) ? await getSearchConnection(site.id, engine) : undefined;
	if (!connection) {
		throw createError({ statusCode: 404, statusMessage: "Search engine not connected" });
	}
	return { site, connection };
}

// A refusal the person can fix is a 400 with its message; anything else means the engine could not be reached.
export async function askSearchEngine<T>(engine: SearchEngine, request: () => Promise<T>): Promise<T> {
	try {
		return await request();
	}
	catch (error) {
		if (error instanceof SearchSyncError) {
			throw createError({ statusCode: 400, statusMessage: `${SEARCH_ENGINE_NAMES[engine]} refused`, message: error.message });
		}
		throw createError({ statusCode: 502, statusMessage: `Could not reach ${SEARCH_ENGINE_NAMES[engine]}. Try again in a moment.` });
	}
}

export async function listSearchProperties(connection: SearchConnectionRow): Promise<SearchProperty[]> {
	const credential = await openCredential(connection);
	return askSearchEngine(connection.engine, () => searchEngines[connection.engine].listProperties(credential));
}

// `?range=` falls back to 28d and `?engine=` to all. `engines` are the Site's engines with a property picked.
export async function requireSiteAndSearchRange(event: H3Event) {
	const site = await requireSite(event);
	const query = getQuery(event);
	const connections = await getSearchConnections(site.id);
	const engine: SearchEngineFilter = isSearchEngine(query.engine) ? query.engine : "all";
	return {
		site,
		engines: connections.filter(connection => connection.property).map(connection => connection.engine).sort(),
		range: isSearchRange(query.range) ? query.range : "28d" as const,
		engine,
	};
}
