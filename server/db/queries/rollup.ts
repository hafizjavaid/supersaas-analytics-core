import { and, eq, sql } from "drizzle-orm";
import { db } from "hub:db";
import { shiftDate, startOfDayUtcMs, todayInTz } from "#layers/core/shared/utils/dates";
import { tables } from "#layers/core/server/utils/database";

const { dailyDevices, dailyEvents, dailyLocations, dailySources } = tables;

export function previousDateInTz(timezone: string) {
	return shiftDate(todayInTz(timezone), -1);
}

// Every write is an upsert and the grouped tables are cleared first, so re-running a day (a backfill or a retry) gives the same rows.
export async function aggregateSiteDay(siteId: string, timezone: string, date: string) {
	const startSec = Math.floor(startOfDayUtcMs(date, timezone) / 1000);
	const endSec = Math.floor(startOfDayUtcMs(shiftDate(date, 1), timezone) / 1000);

	// These Rollups gained Dimensions after launch; replacing the day drops rows grouped the old, coarser way.
	await db.delete(dailySources).where(and(eq(dailySources.siteId, siteId), eq(dailySources.date, date)));
	await db.delete(dailyDevices).where(and(eq(dailyDevices.siteId, siteId), eq(dailyDevices.date, date)));
	await db.delete(dailyLocations).where(and(eq(dailyLocations.siteId, siteId), eq(dailyLocations.date, date)));
	await db.delete(dailyEvents).where(and(eq(dailyEvents.siteId, siteId), eq(dailyEvents.date, date)));

	await db.run(sql`
		INSERT INTO daily_summary (site_id, date, visitors, visits, pageviews, bounce_rate, avg_duration_seconds)
		SELECT
			${siteId},
			${date},
			COALESCE((SELECT COUNT(DISTINCT visitor_id) FROM visits WHERE site_id = ${siteId} AND started_at >= ${startSec} AND started_at < ${endSec}), 0),
			COALESCE((SELECT COUNT(*) FROM visits WHERE site_id = ${siteId} AND started_at >= ${startSec} AND started_at < ${endSec}), 0),
			COALESCE((SELECT COUNT(*) FROM pages WHERE site_id = ${siteId} AND timestamp >= ${startSec} AND timestamp < ${endSec}), 0),
			COALESCE((SELECT AVG(is_bounce) FROM visits WHERE site_id = ${siteId} AND started_at >= ${startSec} AND started_at < ${endSec}), 0),
			COALESCE((SELECT AVG(ended_at - started_at) FROM visits WHERE site_id = ${siteId} AND started_at >= ${startSec} AND started_at < ${endSec}), 0)
		ON CONFLICT (site_id, date) DO UPDATE SET
			visitors = excluded.visitors,
			visits = excluded.visits,
			pageviews = excluded.pageviews,
			bounce_rate = excluded.bounce_rate,
			avg_duration_seconds = excluded.avg_duration_seconds
	`);

	// Time on page runs to the next Pageview of the same Visit, so it is found over the whole day before grouping by path.
	await db.run(sql`
		INSERT INTO daily_pages (site_id, date, path, title, pageviews, visitors, visits, entrances, exits, bounces, time_on_page_seconds, timed_pageviews)
		SELECT
			${siteId},
			${date},
			p.path,
			(SELECT t.title FROM pages t
				WHERE t.site_id = ${siteId} AND t.path = p.path AND t.timestamp >= ${startSec} AND t.timestamp < ${endSec} AND t.title <> ''
				ORDER BY t.timestamp DESC LIMIT 1),
			COUNT(*),
			COUNT(DISTINCT v.visitor_id),
			COUNT(DISTINCT p.visit_id),
			COUNT(DISTINCT CASE WHEN v.entry_page = p.path THEN v.id END),
			COUNT(DISTINCT CASE WHEN v.exit_page = p.path THEN v.id END),
			COUNT(DISTINCT CASE WHEN v.entry_page = p.path AND v.is_bounce = 1 THEN v.id END),
			COALESCE(SUM(p.next_timestamp - p.timestamp), 0),
			COUNT(p.next_timestamp)
		FROM (
			SELECT path, visit_id, timestamp, LEAD(timestamp) OVER (PARTITION BY visit_id ORDER BY timestamp, id) AS next_timestamp
			FROM pages
			WHERE site_id = ${siteId} AND timestamp >= ${startSec} AND timestamp < ${endSec}
		) p
		JOIN visits v ON v.id = p.visit_id
		WHERE v.site_id = ${siteId}
		GROUP BY p.path
		ON CONFLICT (site_id, date, path) DO UPDATE SET
			title = excluded.title,
			pageviews = excluded.pageviews,
			visitors = excluded.visitors,
			visits = excluded.visits,
			entrances = excluded.entrances,
			exits = excluded.exits,
			bounces = excluded.bounces,
			time_on_page_seconds = excluded.time_on_page_seconds,
			timed_pageviews = excluded.timed_pageviews
	`);

	await db.run(sql`
		INSERT INTO daily_sources (site_id, date, referrer_domain, utm_source, utm_medium, utm_campaign, utm_term, utm_content, channel, visits)
		SELECT
			${siteId},
			${date},
			s.referrer_domain,
			COALESCE(s.utm_source, ''),
			COALESCE(s.utm_medium, ''),
			COALESCE(s.utm_campaign, ''),
			COALESCE(s.utm_term, ''),
			COALESCE(s.utm_content, ''),
			MAX(s.channel),
			COUNT(*)
		FROM visits v
		JOIN sources s ON s.id = v.source_id
		WHERE v.site_id = ${siteId} AND v.started_at >= ${startSec} AND v.started_at < ${endSec}
		GROUP BY
			s.referrer_domain,
			COALESCE(s.utm_source, ''),
			COALESCE(s.utm_medium, ''),
			COALESCE(s.utm_campaign, ''),
			COALESCE(s.utm_term, ''),
			COALESCE(s.utm_content, '')
		ON CONFLICT (site_id, date, referrer_domain, utm_source, utm_medium, utm_campaign, utm_term, utm_content) DO UPDATE SET
			channel = excluded.channel,
			visits = excluded.visits
	`);

	await db.run(sql`
		INSERT INTO daily_devices (site_id, date, device_type, browser, os, visits)
		SELECT
			${siteId},
			${date},
			d.device_type,
			d.browser,
			d.os,
			COUNT(*)
		FROM visits v
		JOIN devices d ON d.id = v.device_id
		WHERE v.site_id = ${siteId} AND v.started_at >= ${startSec} AND v.started_at < ${endSec}
		GROUP BY d.device_type, d.browser, d.os
		ON CONFLICT (site_id, date, device_type, browser, os) DO UPDATE SET
			visits = excluded.visits
	`);

	await db.run(sql`
		INSERT INTO daily_locations (site_id, date, country, region, city, visits)
		SELECT
			${siteId},
			${date},
			l.country,
			COALESCE(l.region, ''),
			COALESCE(l.city, ''),
			COUNT(*)
		FROM visits v
		JOIN locations l ON l.id = v.location_id
		WHERE v.site_id = ${siteId} AND v.started_at >= ${startSec} AND v.started_at < ${endSec}
		GROUP BY l.country, COALESCE(l.region, ''), COALESCE(l.city, '')
		ON CONFLICT (site_id, date, country, region, city) DO UPDATE SET
			visits = excluded.visits
	`);

	await db.run(sql`
		INSERT INTO daily_outbound_links (site_id, date, url, clicks)
		SELECT
			${siteId},
			${date},
			o.url,
			COUNT(*)
		FROM outbound_links o
		WHERE o.site_id = ${siteId} AND o.timestamp >= ${startSec} AND o.timestamp < ${endSec}
		GROUP BY o.url
		ON CONFLICT (site_id, date, url) DO UPDATE SET
			clicks = excluded.clicks
	`);

	await db.run(sql`
		INSERT INTO daily_events (site_id, date, name, path, count)
		SELECT
			${siteId},
			${date},
			e.name,
			COALESCE(e.path, ''),
			COUNT(*)
		FROM events e
		WHERE e.site_id = ${siteId} AND e.timestamp >= ${startSec} AND e.timestamp < ${endSec}
		GROUP BY e.name, COALESCE(e.path, '')
		ON CONFLICT (site_id, date, name, path) DO UPDATE SET
			count = excluded.count
	`);
}
