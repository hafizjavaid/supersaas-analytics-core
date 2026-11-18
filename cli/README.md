# supersaas-analytics

Read your [Supersaas Analytics](https://supersaasanalytics.com) reports from the terminal, from scripts and from AI
agents. A thin client of the read-only API v1.

```sh
npm install --global supersaas-analytics
supersaas login            # paste an API key from Organization Settings → API keys
supersaas sites
supersaas stats example.com --range 7d
```

Or without installing: `npx supersaas-analytics stats example.com`.

## Commands

| Command | What it prints |
| --- | --- |
| `supersaas login [--url <url>]` | Asks for an API key, checks it and saves it with the URL |
| `supersaas logout` | Forgets the saved key |
| `supersaas sites` | The Organization's Sites |
| `supersaas stats <site>` | Visitors, Visits, Pageviews, bounce rate and visit duration against the period before |
| `supersaas top <site> <dimension>` | The ten largest values of a Dimension, such as `page`, `referrer` or `country` |
| `supersaas live [site]` | Visitors in the last 5 minutes, on one Site or every Site |
| `supersaas goals <site>` | Conversions per Goal |
| `supersaas funnels <site> [funnel]` | The Site's Funnels, or one Funnel's steps by its id or name |
| `supersaas snippet <site>` | The Tracking snippet for the Site |

A `<site>` is its domain or id. Reports take `--range` (`today`, `yesterday`, `24h`, `7d`, `30d`, `90d`, `6m`, `12m`),
`--from` and `--to` for a custom Range, and `--filter dimension:value` (repeatable). Every command takes `--json` for
the API's JSON. Run `supersaas <command> --help` for details.

The full guide, with every Filter and the JSON of each report: <https://supersaasanalytics.com/docs/api/cli>.

## Self-hosted copies

Pass `--url https://analytics.example.com` to `login`, or set `SUPERSAAS_URL`. `SUPERSAAS_API_KEY` uses a key without
saving it, for CI and agents. A saved key is only ever sent to the URL it was saved for.

The key is saved in `~/.config/supersaas/config.json` (`%APPDATA%\supersaas\config.json` on Windows).

## License

MIT
