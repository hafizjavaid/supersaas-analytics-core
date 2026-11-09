# Proxying through your domain

Serve `sd.js` and `/collect` from your own domain, so ad blockers and strict browsers treat them as first-party.
`https://analytics.example.com` stands for your self-hosted copy's origin.

Some ad blockers block analytics scripts loaded from another domain. Serving the snippet from your own domain avoids
that. Your server forwards two paths to your copy:

| On your domain | Forwarded to |
| --- | --- |
| `/sd.js` | `https://analytics.example.com/sd.js` |
| `/collect` | `https://analytics.example.com/collect` |

Replace `https://analytics.example.com` with your copy's origin, as in the snippet in your Site's **Settings → Install**.
Then change the snippet to load the script from your own domain:

```html
<script defer data-site="YOUR_SITE_ID" src="/sd.js"></script>
```

## How the snippet finds `/collect`

The snippet sends its hits to `/collect` on the origin it was loaded from. Loaded from `https://example.com/sd.js`, it
posts to `https://example.com/collect`. You may serve the script under any path, such as `/js/stats.js`, but `/collect`
must stay at the root of your domain. If your website already uses `/collect` for something else, proxying is not
possible yet.

## What a proxy must forward

Your copy counts Visitors from the visitor's IP address and browser, so a proxy has to pass them on:

- **The User-Agent header**, unchanged. Without it, hits arrive with your server's HTTP library as their User-Agent:
  most are dropped as bots, and the rest count every visitor as the same browser.
- **The visitor's IP address**, first in `X-Forwarded-For`. Without it, every Visitor seems to come from your server,
  people on the same browser version are counted as one Visitor, and ignored IPs never match.
- **The `Sd-Visitor` response header** back to the browser, which [`sd.visitorId()`](https://supersaasanalytics.com/docs/integrations/revenue-attribution)
  reads.
- **The body**, as is. It is a small JSON string sent as `text/plain`.

Your website's cookies may travel along with a rewrite. `/collect` never reads them, but a proxy that forwards only the
headers above, like the Next.js and Cloudflare examples below, does not send them at all.

Country, region and city come from where the request reaches your copy, so through a proxy they would describe your
server. Forward the visitor's location in these headers, and your copy uses them instead:

| Header | Value |
| --- | --- |
| `x-vercel-ip-country` | Two-letter country code, such as `DE` |
| `x-vercel-ip-country-region` | Region code, such as `BE` |
| `x-vercel-ip-city` | City name, URL-encoded |
| `x-vercel-ip-latitude` / `x-vercel-ip-longitude` | Coordinates, used for the Live globe |

They carry Vercel's names because a website on Vercel already receives them, so passing them on is enough there. On
other hosts, fill them from the host's own geolocation, as the Cloudflare example below does.

## Nuxt

Proxy the script with a route rule and `/collect` with a server route that adds the visitor's IP:

`nuxt.config.ts`:

```ts
export default defineNuxtConfig({
	routeRules: {
		"/sd.js": { proxy: "https://analytics.example.com/sd.js" },
	},
});
```

`server/routes/collect.post.ts`:

```ts
export default defineEventHandler(event => proxyRequest(event, "https://analytics.example.com/collect", {
	headers: { "x-forwarded-for": getRequestIP(event, { xForwardedFor: true }) ?? "" },
}));
```

`proxyRequest` forwards the request's other headers, the User-Agent and any `x-vercel-ip-*` headers included, and
returns the response's headers. On Cloudflare, add the location from `event.context.cf` as in the
[Cloudflare example](#cloudflare).

## Next.js

Rewrite the script in `next.config`, and forward `/collect` with a Route Handler:

`next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	async rewrites() {
		return [{ source: "/sd.js", destination: "https://analytics.example.com/sd.js" }];
	},
};

export default nextConfig;
```

`app/collect/route.ts`:

```ts
const FORWARDED = ["user-agent", "x-forwarded-for", "x-vercel-ip-country", "x-vercel-ip-country-region", "x-vercel-ip-city", "x-vercel-ip-latitude", "x-vercel-ip-longitude"];

export async function POST(request: Request) {
	const headers = new Headers({ "content-type": "text/plain" });
	for (const name of FORWARDED) {
		const value = request.headers.get(name);
		if (value) {
			headers.set(name, value);
		}
	}
	const response = await fetch("https://analytics.example.com/collect", { method: "POST", headers, body: await request.text() });
	return new Response(null, { status: response.status, headers: { "sd-visitor": response.headers.get("sd-visitor") ?? "" } });
}
```

On Vercel, the request already carries the visitor's IP and location. Self-hosted, make sure the server in front of
Next.js sets `X-Forwarded-For`.

## Vercel

Without a framework, or with any framework, add rewrites to `vercel.json`:

`vercel.json`:

```json
{
	"rewrites": [
		{ "source": "/sd.js", "destination": "https://analytics.example.com/sd.js" },
		{ "source": "/collect", "destination": "https://analytics.example.com/collect" }
	]
}
```

Vercel forwards the request with the visitor's User-Agent and IP. If every Visitor then shows up in the same city,
Vercel did not pass the location on: use the Next.js Route Handler above instead, which forwards it explicitly.

## Netlify

Add two proxy rules to `_redirects` in your publish directory:

`_redirects`:

```txt
/sd.js    https://analytics.example.com/sd.js    200
/collect  https://analytics.example.com/collect  200
```

The `200` status makes them rewrites rather than redirects. Netlify forwards the visitor's User-Agent and IP, but not
their location: Locations then show where Netlify's server is, not the visitor. For visitors' own countries and cities,
forward `/collect` from a Netlify Edge Function that sets the location headers from Netlify's `context.geo`, the way the
Cloudflare example does from `request.cf`.

## Cloudflare

If your website is on Cloudflare, a Worker on your domain can forward both paths and add the visitor's IP and location
from `request.cf`:

`worker.js`:

```js
const ORIGIN = "https://analytics.example.com";

export default {
	async fetch(request) {
		const { pathname } = new URL(request.url);
		const cf = request.cf ?? {};
		const headers = new Headers({
			"content-type": "text/plain",
			"user-agent": request.headers.get("user-agent") ?? "",
			"x-forwarded-for": request.headers.get("cf-connecting-ip") ?? "",
		});
		const location = {
			"x-vercel-ip-country": cf.country,
			"x-vercel-ip-country-region": cf.regionCode,
			"x-vercel-ip-city": cf.city && encodeURIComponent(cf.city),
			"x-vercel-ip-latitude": cf.latitude,
			"x-vercel-ip-longitude": cf.longitude,
		};
		for (const [name, value] of Object.entries(location)) {
			if (value) {
				headers.set(name, value);
			}
		}
		const body = request.method === "POST" ? await request.text() : undefined;
		return fetch(`${ORIGIN}${pathname}`, { method: request.method, headers, body });
	},
};
```

Deploy it with routes for `example.com/sd.js` and `example.com/collect`, so the rest of your website is untouched:

`wrangler.jsonc`:

```jsonc
{
	"name": "analytics-proxy",
	"main": "worker.js",
	"compatibility_date": "2026-06-30",
	"routes": [
		{ "pattern": "example.com/sd.js", "zone_name": "example.com" },
		{ "pattern": "example.com/collect", "zone_name": "example.com" }
	]
}
```

## Check the proxy

1. Load a page and look for `GET /sd.js` and `POST /collect` on your own domain in the browser's network tab.
   `/collect` should answer `204` with an `Sd-Visitor` header.
2. Open the Site's **Live** page. You should appear with your own country and city.
3. Visit from a second device on another network. It should be a second Live visitor.
