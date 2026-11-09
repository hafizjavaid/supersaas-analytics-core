# Supersaas Analytics

Cookieless web analytics for Organizations and any number of their own websites. Built with Nuxt 4, Nuxt UI, NuxtHub
and Better Auth, and deployed to Cloudflare Workers with D1.

It replaces `analytics-main` (TanStack Start), with the same behaviour as seen by a Site's Visitors and by the owner.

## What it does

- **Tracking snippet** at `/sd.js`, minified at build time from `tracking-snippet/sd.js` and kept under 1,024 B
  gzipped. A Site embeds `<script defer data-site="<site id>" src="https://<host>/sd.js"></script>`. It reports
  Pageviews, SPA route changes and Outbound link clicks, sends Events through `sd(name, props)` and an identity through
  `sd.identify(id)`, and captures `tel:`, `mailto:` and WhatsApp link clicks, form submits and clicks on
  `[data-sd-event]` elements as Events with the page path, and `sd.visitorId()` returns the Visitor id from the last `/collect` response. It sets no cookies
  and uses no storage.
- **Ingestion** at `POST /collect`. It always answers `204` at once and writes in the background:
  - A Visitor is `sha256(salt:site_id:ip:ua)`, where the salt is random per UTC day and deleted once the day ends, so
    the same person is a new Visitor each day.
  - `sd.identify(id)` stores `hmac(site secret, id)` on the Visitor, never the id itself. Visitors identified with the
    same id share that hash, which links their days.
  - A Visit is a 30-minute window measured from its start.
  - Hits from bot User-Agents, from a Site's ignored IPs or CIDRs (Settings → Filtering), and Pageviews or Events on
    its excluded path globs are dropped before anything is stored.
  - Geo comes from Cloudflare, or from forwarded `x-vercel-ip-*` headers when a Site proxies `/collect` through its
    own domain, which also passes the visitor's IP first in `X-Forwarded-For`.
- **All sites** at `/app/<organization>`, behind sign-in: Visitors, Pageviews (last 24 hours, with their absolute
  change against the 24 hours before) and Live visitors across every Site, then one band per Site with its online
  count, the same figures and an hourly sparkline, all from one request.
- **Live** at `/app/<organization>/live` (every Site, each Visitor with a Site badge) and
  `/app/<organization>/sites/<site>/live`: "N live", Pageviews per minute over the last 30 minutes with the peak,
  referrer, country and device chips, and the current Visitors (page, city, browser, device, Source) beside the globe.
  Hovering a Visitor highlights its point and turns the globe to it. Polled every 15 seconds.
- **Dashboard** at `/app/<organization>/sites/<site>`:
  - a Range picker (today, yesterday, last 24 hours, 7, 30 and 90 days, 6 and 12 months, custom) and
    a Live visitor badge
  - a KPI strip (Visitors, Pageviews, Bounce rate, Visit duration, and Conversion rate once the Site has a Goal), each
    with its change against the previous period, that toggles the chart's series
  - ranked Pages (with Outbound links), Sources, Devices and Locations (with a live globe). Sources group into
    Channels (Direct, Search, Social, AI assistant, Email, Paid, Referral) from the referrer and UTM, with tabs for
    referrers, AI assistants and the UTM campaign, medium, term and content
  - a Realtime card (Visitors online, the last 30 minutes of Pageviews and the current Visitors) with "View realtime →"
  - Events, one row per Event and the page it fired on. Clicking one opens a panel that breaks it down by property key
    and value, for that page or all pages, read from raw rows.
  - Goals (Site Settings → Attribution): Quick add chips for the auto-captured WhatsApp, Phone, Email, Form submit and
    Outbound clicks, or a custom Goal on an Event name or a page pattern (`/blog/*`). The Goals card lists each Goal's
    unique Visitors, total conversions and conversion rate, read from raw rows; clicking one narrows the dashboard to
    the Visits that converted (`?f=goal:event:signup`).
  - **Funnels** per Site: 2 to 8 Pageview-pattern or Event steps completed in order within 1 hour, 24 hours, 7 or 30
    days (other pages in between are fine; Identified visitors count across days). Each card shows Entered, Completed
    and Conversion rate, each step's count and share of entries, and "↓ X% continue · N dropped" between steps. A
    builder slide-over previews the draft over the current Range; the dashboard shows a Funnel with "All funnels →".
  - a **Journeys** explorer per Site: columns "Starting point → 1 step after → 2 steps after …" of the pages Visitors
    open, with each node's Visitors and share, starting points grouped by their first path segment, a "No further
    action" row for the Visitors who left, and "Events on <page>" for the selected node. It reads raw rows, follows the
    Range and Filters, and each Funnel card links to it with "Explore journeys →".
  - a **Pages** tab per Site: Pages, Pageviews, Visits, Avg. bounce and Avg. duration, then a searchable table sorted by
    any column with each page's title and path (or full URL), a trend sparkline, views, Visits with their change, bounce
    rate and time on page. It follows the Range and Filters.
  - a **Users** tab per Site: Visitors, Pageviews, Views per Visitor and Avg. time, then the Visitors of the Range
    ("Visitor 083047", country, Source, device, Visits, Pageviews, time, entry → exit), searchable by visitor id,
    country or page. Clicking one opens its journey: totals, the first Source, Visit chips and a timeline of
    Pageviews (time on page, entry marked), Outbound links and Events with their properties. An Identified visitor's
    journey covers every day with the same identify hash.
  - Filters: clicking a ranked row narrows the whole dashboard to the Visits that match it. Filters stack, live in the
    URL (`?f=country:PK&f=browser:Safari`) and show as removable chips. Filtered views read raw rows.
- **Daily Rollup** at 00:10 UTC for each Site's previous local day. Key figures read past days only from Rollups, and today
  and "Last 24 hours" from raw rows. Single-day and 24-hour charts are hourly, from raw rows.
- **Accounts and Organizations** with Better Auth: email and password (verified), magic links, Google and GitHub.
  Members have one role, Owner, Admin or Viewer, and each Organization has exactly one Owner. Email goes through Resend
  and is printed to the console in dev.

## Quick start

```sh
pnpm install
pnpm dev            # http://localhost:3001
pnpm db:seed        # fill a Site with demo traffic
```

| Command | What it does |
| --- | --- |
| `pnpm dev` | dev server on port 3001, SQLite in `.data/db` |
| `pnpm test` | Vitest: unit and server projects |
| `pnpm lint` / `pnpm typecheck` | ESLint (demo-next style) / vue-tsc |
| `pnpm db:generate` | generate a migration from `server/db/schema` |
| `pnpm db:seed [siteId] [days]` | replace a Site's analytics with demo data (dev only) |
| `pnpm rollup [YYYY-MM-DD]` | run the daily Rollup on the dev server |
| `pnpm run deploy` | build for Cloudflare, migrate the remote D1, deploy |

Environment variables are listed in `.env.example`. None are needed locally.

## Guides

- [Local development](docs/local-development.md)
- [Testing](docs/testing.md) and [Manual testing on your machine](docs/manual-testing-local.md)
- [Production deployment](docs/production-deployment.md) and
  [Verifying production](docs/manual-testing-production.md)
- [Revenue attribution](docs/revenue-attribution.md), [Search Console](docs/search-console.md) and
  [Self-hosting](docs/self-hosting.md)

For running your own copy: [Self-hosting on Cloudflare](docs/self-hosting.md), [Installation](docs/installation.md)
of the tracking snippet, and [Proxying through your domain](docs/proxying.md). The full documentation is at
[supersaasanalytics.com/docs](https://supersaasanalytics.com/docs).

The domain language is in `CONTEXT.md` and the decisions are in `docs/adr/`.

## Licence

Supersaas Analytics is fair source, under the [Functional Source License, Version 1.1, ALv2 Future
License](LICENSE) (FSL-1.1-ALv2, see [fsl.software](https://fsl.software)).

- You may self-host it for free and modify it for your own sites.
- You may not sell it or offer it as a competing service.
- Each release becomes Apache 2.0 two years after it is published.
