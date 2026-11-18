# CLI

Read your reports from the terminal, from scripts and from AI agents with the supersaas command. `https://analytics.example.com` stands for your self-hosted copy's origin.

The `supersaas` command prints your reports in the terminal: as tables for you, or as the [API](api.md)'s
JSON for scripts and agents. It is a small client of the API with no dependencies, and it only reads.

## Install

It needs Node 20 or later.

```sh
npm install --global supersaas-analytics
```

Or run it without installing, with `npx supersaas-analytics` in place of `supersaas`:

```sh
npx supersaas-analytics stats example.com
```

## Log in

Create an [API key](api-keys.md) in the Organization's **Settings → API keys**, then:

```sh
supersaas login --url https://analytics.example.com
```

It asks for the key without showing it, checks it and saves it, and tells you how many Sites it reads. To pass the key
from a password manager or a script, pipe it in:
`echo "$KEY" | supersaas login --url https://analytics.example.com`. There is no flag for the key, so it
never lands in your shell history.

The key is saved in `~/.config/supersaas/config.json` (`%APPDATA%\supersaas\config.json` on Windows); on macOS and
Linux only you can read it. `supersaas logout` deletes it.

In CI or for an agent, skip `login` and set `SUPERSAAS_URL` and `SUPERSAAS_API_KEY` instead; the key wins over the saved one.

## Commands

A `<site>` is the Site's domain, such as `example.com`, or its id.

| Command | What it prints |
| --- | --- |
| `supersaas login [--url <url>]` | Asks for an API key, checks it and saves it with the URL |
| `supersaas logout` | Forgets the saved key |
| `supersaas sites` | The Organization's Sites |
| `supersaas stats <site>` | Visitors, Visits, Pageviews, bounce rate and visit duration against the period before |
| `supersaas top <site> <dimension>` | The ten largest values of a Dimension |
| `supersaas live [site]` | The Visitors of the last 5 minutes, on one Site or every Site |
| `supersaas goals <site>` | Conversions per Goal |
| `supersaas funnels <site> [funnel]` | The Site's Funnels, or one Funnel's steps by its id or name |
| `supersaas snippet <site>` | The Tracking snippet for the Site |

`top` takes these Dimensions: `page`, `entry_page`, `exit_page`, `outbound_link`, `channel`, `referrer`,
`ai_assistant`, `utm_campaign`, `utm_medium`, `utm_term`, `utm_content`, `browser`, `os`, `device`, `country`,
`region`, `city` and `event`.

`stats`, `top`, `goals` and `funnels` with a Funnel take report options:

| Option | Value |
| --- | --- |
| `-r`, `--range` | `today`, `yesterday`, `24h`, `7d`, `30d`, `90d`, `6m` or `12m`. Default `30d` |
| `--from`, `--to` | A custom Range, `YYYY-MM-DD` in the Site's timezone; both are needed |
| `-f`, `--filter` | A Filter, `dimension:value`, such as `country:US` or `channel:search`. Repeat it to combine |

The [Filters table](api.md#filters) lists every Dimension a Filter takes and its values.
`supersaas <command> --help` shows a command's options.

## Examples

```sh
supersaas stats example.com --range 7d
```

```text
Example (example.com), 2026-11-08 to 2026-11-14

Metric                Value  Previous    Change
Visitors              1,284     1,043      +23%
Visits                1,530     1,251      +22%
Pageviews             4,210     3,602      +17%
Bounce rate             42%       47%    -5 pts
Avg visit duration    2m 5s    1m 58s       +6%
Conversion rate        3.1%      2.8%  +0.3 pts
Revenue             $489.00   $399.00      +23%
```

Rates change in points; the rest in percent, or `new` when the period before had none.

```sh
supersaas top example.com referrer --range 7d --filter country:US
```

```text
Example (example.com), 2026-11-08 to 2026-11-14

Referrer              Visits  Share
google.com               512    33%
news.ycombinator.com     201    13%
chatgpt.com               88   5.8%
github.com                61     4%
```

```sh
supersaas funnels example.com Signup --range 30d
```

```text
Signup (24h window), Example (example.com), 2026-10-16 to 2026-11-14

Step     Visitors  Continued  Dropped
/           1,100          -        0
Pricing       310        28%      790
Signup         40        13%      270

1,100 of 1,284 Visitors entered (86%), 40 completed (3.6%).
```

## JSON for scripts and agents

Every command takes `--json` and prints the API's JSON instead of a table, the same fields as the
[API reference](api.md):

```sh
supersaas stats example.com --range 7d --json | jq '.current.visitors'
```

`live` without a Site prints `{ "visitors": <total>, "sites": [ … ] }`, one entry per Site.

Errors go to stderr, with exit code `1` for a refused key, an unknown Site or a bad Range, and `2` for a command it
cannot read. An agent with a shell can use the CLI as it is; one that speaks MCP may prefer the
[MCP server](mcp.md).

## Self-hosted copies

The CLI talks to the hosted service, `https://supersaasanalytics.com`, unless you point it at your copy, as `login`
above does with `--url`. `login` saves the URL with the key, so later commands need no flag. Or set `SUPERSAAS_URL`
for one shell, or pass `--url` to any command. A saved key is only ever sent to the URL it was saved for: pointing `--url` elsewhere without
`SUPERSAAS_API_KEY` answers "No API key for …" instead of sending it.

## Good to know

- Each command makes one request to resolve the Site and one for the report (`funnels` with a Funnel makes three, and
  `live` without a Site one per Site).
- `snippet` builds the tag from the URL you are logged in to, so a Self-hosted copy prints its own origin.
