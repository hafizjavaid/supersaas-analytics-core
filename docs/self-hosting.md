# Self-hosting on Cloudflare

Supersaas Analytics is fair source: you can run your own copy on your own Cloudflare account for free. The copy has no
Trial, no billing, no Quota and no limits on Sites or Members, because you pay for the infrastructure yourself. It never
calls our servers.

## What you need

- A Cloudflare account with Workers. The free plan is enough to start, but D1 and Workers have daily limits on it.
- A domain on that Cloudflare account, for example `example.com` to serve `analytics.example.com`.
- Node 22 or later, and pnpm.
- Optionally, a way to send email: a [Resend](https://resend.com) API key or any SMTP server. Without one, the copy
  still works, with fewer features (see [Email](#email)).

## Deploy to Cloudflare

### 1. Get the code

```sh
git clone <repository URL>
cd supersaas-analytics
pnpm install
npx wrangler login
```

### 2. Create the resources

```sh
npx wrangler d1 create supersaas-analytics-db
npx wrangler kv namespace create supersaas-analytics-kv
npx wrangler kv namespace create supersaas-analytics-cache
npx wrangler r2 bucket create supersaas-analytics
```

Put the names and ids from these commands into `wrangler.jsonc`:

- `d1_databases[0].database_name` and `database_id`. Leave `migrations_table` and `migrations_dir` as they are.
- `kv_namespaces`: the ids for `KV` and `CACHE`.
- `r2_buckets[0].bucket_name`: the bucket's name.

The KV namespaces and the R2 bucket are not used by any feature yet, but the Worker expects their bindings.

Then uncomment `routes` and set the pattern to your hostname. The Worker has no `workers.dev` URL
(`"workers_dev": false`), so this is the only way in.

### 3. Settings

Add these to `vars` in `wrangler.jsonc`:

```jsonc
"vars": {
	"NUXT_AUTH_URL": "https://analytics.example.com",
	"NUXT_PUBLIC_TRACKER_ORIGIN": ""
}
```

Then add the one required secret:

```sh
npx wrangler secret put NUXT_AUTH_SECRET          # openssl rand -base64 32
```

### 4. Deploy

```sh
pnpm run deploy
```

Use `pnpm run deploy`, not `pnpm deploy`, which is a pnpm built-in. The script builds the Worker, applies new
migrations to D1, then deploys. The first deploy creates every table.

`triggers.crons` in `wrangler.jsonc` wakes the Worker every day at 00:10 UTC to roll up the previous day, at 00:40 UTC
to write and email the Digests, and hourly for the search sync. Leave it as it is: it must match
`nitro.scheduledTasks` in `nuxt.config.ts`, and without it, past days show no data.

To check the copy:

- `curl https://analytics.example.com/api/deployment` answers JSON, with `"signUpOpen":true` until the first account.
- `curl -I https://analytics.example.com/sd.js` answers `200`.

## The first account

Open your domain and sign up. **The first account becomes the Super-admin**: **Admin** in the user menu opens Users,
Organizations and Database. Sign-up then closes.

## Adding Members

Everyone else joins through an Organization invite: **Settings → Members → Invite**. An invited email can create an
account even though sign-up is closed. With email set up, the invite is emailed; without it, you get a link to send them
yourself, and **Copy link** on a pending invite gives it again.

To let anyone sign up, set `SIGNUPS` to `open`. To create another Organization, choose **New Organization** in the user
menu.

## Environment variables

Required:

| Variable | What it does |
| --- | --- |
| `NUXT_AUTH_SECRET` | Signs sessions and encrypts Search Console tokens. Changing it signs everyone out. |
| `NUXT_AUTH_URL` | The copy's public origin, with no trailing slash. Email links, Digests and OAuth callbacks use it. |

Optional:

| Variable | What it does |
| --- | --- |
| `SIGNUPS` | `open` lets anyone sign up. Otherwise sign-up closes after the first account. |
| `NUXT_PUBLIC_TRACKER_ORIGIN` | The origin shown in the tracking code. Empty uses the copy's own origin. |
| `RESEND_API_TOKEN` | Sends email through Resend. |
| `NUXT_EMAIL_SMTP_HOST`, `NUXT_EMAIL_SMTP_PORT`, `NUXT_EMAIL_SMTP_USERNAME`, `NUXT_EMAIL_SMTP_PASSWORD` | Sends email through SMTP when `RESEND_API_TOKEN` is not set. |
| `NUXT_EMAIL_FROM` | The sender, for example `Analytics <analytics@example.com>`. |
| `NUXT_AUTH_GOOGLE_CLIENT_ID`, `NUXT_AUTH_GOOGLE_CLIENT_SECRET` | "Continue with Google". Callback: `<origin>/api/auth/callback/google`. |
| `NUXT_AUTH_GITHUB_CLIENT_ID`, `NUXT_AUTH_GITHUB_CLIENT_SECRET` | "Continue with GitHub". Callback: `<origin>/api/auth/callback/github`. |
| `NUXT_SEARCH_CONSOLE_GOOGLE_CLIENT_ID`, `NUXT_SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET` | Google Search Console (see below). Empty uses the sign-in client. |
| `NUXT_ANTHROPIC_API_KEY` | Ask AI and the summary on top of each Digest, billed to your Anthropic account. Hidden without it. |

Put plain settings in `vars` and keys in secrets: `npx wrangler secret put <NAME>`.

## Email

Email is optional. Set `RESEND_API_TOKEN`, or the four `NUXT_EMAIL_SMTP_*` variables, plus `NUXT_EMAIL_FROM`.

SMTP runs over Cloudflare's TCP sockets, which block port 25: use port 465 (TLS) or 587 (STARTTLS, the default).

Without email:

- Sign-in is email and password, Google or GitHub. Magic links, "Forgot password" and email verification are turned
  off, and new accounts are trusted with the address they give.
- An invite gives you a link to send yourself.
- The Super-admin sets a forgotten password from **Admin → Users → Set password**.
- Digests are hidden and never sent.

## Search Console (optional)

[Search Console](https://supersaasanalytics.com/docs/integrations/search-console) data is read with OAuth on behalf of the person who connects. Your
copy needs a Google OAuth client with the read-only `https://www.googleapis.com/auth/webmasters.readonly` scope. Until
it has one, Google is hidden under **Settings → Integrations**. Bing, Stripe and Polar use keys pasted per Site and
need nothing on the server.

1. In the [Google Cloud console](https://console.cloud.google.com/), choose or create the project. The one that holds
   the "Sign in with Google" client works.
2. Enable the **Google Search Console API** under **APIs & Services → Library**.
3. Under **Google Auth Platform → Data access**, add the scope `.../auth/webmasters.readonly`.
4. Under **Clients**, create a **Web application** client, or open the sign-in one, and add the redirect URI
   `<origin>/api/search-connections/google/callback`.
5. Set `NUXT_SEARCH_CONSOLE_GOOGLE_CLIENT_ID` and `NUXT_SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET`. Left empty, the sign-in
   client (`NUXT_AUTH_GOOGLE_CLIENT_ID` and `NUXT_AUTH_GOOGLE_CLIENT_SECRET`) is used.

`webmasters.readonly` is a sensitive scope, so **submit the app for verification early**: it takes days to weeks.
Until Google verifies it, only the test users listed under **Audience** can connect, and they see an "unverified app"
warning.

## Updating

Keep your `wrangler.jsonc` changes in a commit of their own, so they merge cleanly:

```sh
git pull
pnpm install
pnpm run deploy
```

Migrations are applied before the new Worker goes live. Read the release notes before a large update.

## The licence

The source is published under the [Functional Source License](https://fsl.software) (FSL-1.1-ALv2), a fair source
licence. You can use, change and run it for any purpose, at work too, except offering it to others as a commercial
product or service that competes with Supersaas Analytics. Two years after each release, that release becomes
Apache 2.0. A self-hosted copy shows a small "Powered by Supersaas Analytics" link.

## Troubleshooting

- **Anyone can sign up**: `SIGNUPS` is `open`. Remove it from `vars` and deploy again.
- **Sign-up is closed for a new colleague**: invite them from **Settings → Members**, or set `SIGNUPS` to `open`.
- **Past days are empty but today has data**: the cron has not run. Check **Workers → supersaasanalytics → Settings →
  Triggers**.
- **No email arrives**: check `RESEND_API_TOKEN` or the SMTP settings, and that `NUXT_EMAIL_FROM` is allowed to send
  from your provider. `npx wrangler tail` shows the error.

## Next steps

- [Installation](installation.md): add the tracking snippet to your website.
- [Proxying through your domain](proxying.md): serve the snippet from your website's own domain.
