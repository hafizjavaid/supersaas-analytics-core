# API reference

Every endpoint of the read-only API v1, with its parameters and a sample response. `https://analytics.example.com` stands for your self-hosted copy's origin.

API v1 reads an Organization's reports as JSON. It only reads, and its fields stay as documented here: a new field may
appear, but none is renamed or removed within v1.

## Basics

- **Base URL**: `https://analytics.example.com/api/v1`
- **Authentication**: an [API key](api-keys.md) as a bearer token, `Authorization: Bearer ssa_…`
- **Method**: every endpoint is a `GET`
- **Rate limit**: none on a self-hosted copy
- **Sites**: `:id` is a Site's id from [`GET /sites`](#list-sites)

```sh
curl "https://analytics.example.com/api/v1/sites/$SITE_ID/summary?range=7d&f=country:US" \
  -H "Authorization: Bearer $SUPERSAAS_API_KEY"
```

## Report parameters

Every report except Sites, Funnels (the list) and Live takes these query parameters:

| Parameter | Value |
| --- | --- |
| `range` | `today`, `yesterday`, `24h`, `7d`, `30d`, `90d`, `6m`, `12m` or `custom`. Default `30d` |
| `from`, `to` | First and last day of a `custom` Range, `YYYY-MM-DD` in the Site's timezone. Both required with `custom` |
| `f` | A Filter, `dimension:value`. Repeat it to combine Filters: a Visit must match all of them |

Days follow the Site's timezone. `24h` is a rolling window ending now; the others are whole days. Each report's
previous period is the one of equal length just before the Range.

### Filters

A Filter narrows every figure of a report to the Visits that match it, as the dashboard's Filter chips do.

| Dimension | Value |
| --- | --- |
| `page`, `entry_page`, `exit_page` | A path, such as `/pricing` |
| `channel` | `direct`, `search`, `social`, `ai`, `email`, `paid` or `referral`, in lower case |
| `ai_assistant` | The assistant's domain: `chatgpt.com`, `perplexity.ai`, `gemini.google.com`, `claude.ai`, `copilot.microsoft.com`, `chat.deepseek.com`, `grok.com`, `chat.mistral.ai`, `meta.ai`, `you.com`, `phind.com` or `poe.com` |
| `referrer` | A domain without `www.`, such as `news.ycombinator.com` |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` | The parameter's value |
| `country` | A two-letter country code, such as `US` |
| `region`, `city` | The country code, a dash and the name, such as `CH-BE` or `US-Portland` |
| `browser`, `os` | As the ranked lists show them, such as `Chrome` or `macOS` |
| `device` | `desktop`, `mobile` or `tablet` |
| `event` | An Event's name, such as `Signup` |
| `goal` | `event:<name>`, `page:<path>` or `outbound` |

So `?f=channel:search&f=country:DE` reads Visits from search engines in Germany.

## Errors

Errors answer JSON with `statusCode` and `statusMessage`; a `400` adds the reasons under `data.issues`, each with a
`path` and a `message`.

| Status | When |
| --- | --- |
| `400` | An unknown `range`, `custom` without `from` and `to`, a day that is not `YYYY-MM-DD`, or a Filter that cannot be read |
| `401` | No key, an unknown key, or a revoked one. The dashboard's session cookie does not count |
| `404` | An unknown Site or one of another Organization, an unknown Dimension or Funnel, or Payments for a Site without a Revenue connection |
| `429` | Only on the hosted service: more than 60 requests in a minute. Wait the seconds in `Retry-After` |

```json
{
  "statusCode": 400,
  "statusMessage": "Validation failed",
  "data": {
    "issues": [{ "code": "custom", "path": ["f"], "message": "Unknown Filter: channel:Search" }]
  }
}
```

## Conventions

- Rates (`bounceRate`, `conversionRate` and the like) are shares from `0` to `1`: `0.42` is 42%.
- Durations are seconds. Timestamps are Unix seconds.
- Money is in the minor unit of `currency`, such as cents: `48900` with `USD` is $489.00.
- Every report names its Site (`site`: `id`, `name`, `domain`) and its Range (`range`: `from`, `to` and `hours`, which
  is `24` for the `24h` Range and `null` otherwise).

## List Sites

`GET /sites`

The Organization's Sites.

```json
{
  "sites": [
    {
      "id": "0b9f6a52-3c1e-4d7a-9a51-6f0c2b8e4d13",
      "name": "Example",
      "domain": "example.com",
      "timezone": "Europe/Berlin",
      "createdAt": 1767225600
    }
  ]
}
```

`timezone` is the IANA timezone the Site's days are counted in.

## Summary

`GET /sites/:id/summary`

The key figures over the Range, and the same for the period before it. Takes the [report parameters](#report-parameters).

```json
{
  "site": { "id": "0b9f6a52-…", "name": "Example", "domain": "example.com" },
  "range": { "from": "2026-11-08", "to": "2026-11-14", "hours": null },
  "currency": "USD",
  "current": {
    "visitors": 1284,
    "visits": 1530,
    "pageviews": 4210,
    "bounceRate": 0.42,
    "avgVisitDurationSeconds": 125,
    "conversionRate": 0.031,
    "revenue": 48900
  },
  "previous": {
    "visitors": 1043,
    "visits": 1251,
    "pageviews": 3602,
    "bounceRate": 0.47,
    "avgVisitDurationSeconds": 118,
    "conversionRate": 0.028,
    "revenue": 39900
  }
}
```

`conversionRate` is `null` while the Site has no Goals. `revenue` and `currency` are `null` without a Revenue
connection.

## Timeseries

`GET /sites/:id/timeseries`

Visitors and Pageviews over the Range: per hour for a single day or `24h`, per day otherwise. Takes the
[report parameters](#report-parameters).

```json
{
  "site": { "id": "0b9f6a52-…", "name": "Example", "domain": "example.com" },
  "range": { "from": "2026-11-08", "to": "2026-11-14", "hours": null },
  "interval": "day",
  "points": [
    { "timestamp": 1762556400, "visitors": 171, "pageviews": 560 },
    { "timestamp": 1762642800, "visitors": 188, "pageviews": 602 }
  ]
}
```

`timestamp` is the start of the hour or day.

## Ranked list

`GET /sites/:id/top/:dimension`

The ten largest values of a Dimension over the Range. Takes the [report parameters](#report-parameters).

| Dimension | `value` counts |
| --- | --- |
| `page` | Pageviews |
| `entry_page`, `exit_page` | Visits that started or ended on the page |
| `outbound_link` | Clicks |
| `channel`, `referrer`, `ai_assistant` | Visits |
| `utm_campaign`, `utm_medium`, `utm_term`, `utm_content` | Visits |
| `browser`, `os`, `device` | Visits |
| `country`, `region`, `city` | Visits |
| `event` | Events, per name and page |

```json
{
  "site": { "id": "0b9f6a52-…", "name": "Example", "domain": "example.com" },
  "range": { "from": "2026-11-08", "to": "2026-11-14", "hours": null },
  "dimension": "referrer",
  "metric": "visits",
  "total": 1530,
  "rows": [
    { "label": "google.com", "value": 512 },
    { "label": "news.ycombinator.com", "value": 201 },
    { "label": "chatgpt.com", "value": 88 }
  ]
}
```

`metric` says what `value` counts, and `total` is that count over all values, not only the ten listed. Labels are
the dashboard's: Channels read `Search` and AI assistants `ChatGPT`, while their Filters take `channel:search` and
`ai_assistant:chatgpt.com`.

## Goals

`GET /sites/:id/goals`

Each Goal's conversions over the Range. Takes the [report parameters](#report-parameters).

```json
{
  "site": { "id": "0b9f6a52-…", "name": "Example", "domain": "example.com" },
  "range": { "from": "2026-11-08", "to": "2026-11-14", "hours": null },
  "visitors": 1284,
  "converted": 52,
  "conversionRate": 0.0405,
  "goals": [
    {
      "id": "5d0e7c1a-…",
      "name": "Signup",
      "kind": "event",
      "value": "Signup",
      "conversions": 41,
      "visitors": 40,
      "conversionRate": 0.0312
    }
  ]
}
```

`converted` counts the Visitors who completed any Goal. Per Goal, `conversions` counts every completion and `visitors`
the unique Visitors. `kind` is `event`, `page` or `outbound`.

## Funnels

`GET /sites/:id/funnels`

The Site's Funnels with their steps. Takes no parameters.

```json
{
  "site": { "id": "0b9f6a52-…", "name": "Example", "domain": "example.com" },
  "funnels": [
    {
      "id": "9a3c4f80-…",
      "name": "Signup",
      "window": "24h",
      "steps": [
        { "kind": "page", "value": "/", "label": "" },
        { "kind": "page", "value": "/pricing", "label": "Pricing" },
        { "kind": "event", "value": "Signup", "label": "" }
      ]
    }
  ]
}
```

`window` (`1h`, `24h`, `7d` or `30d`) is how long a person has from the first step to the last.

## Funnel

`GET /sites/:id/funnels/:funnelId`

One Funnel's conversion over the Range. Takes the [report parameters](#report-parameters).

```json
{
  "site": { "id": "0b9f6a52-…", "name": "Example", "domain": "example.com" },
  "range": { "from": "2026-11-08", "to": "2026-11-14", "hours": null },
  "funnel": { "id": "9a3c4f80-…", "name": "Signup", "window": "24h", "steps": [] },
  "visitors": 1284,
  "entered": 1100,
  "completed": 40,
  "enteredRate": 0.857,
  "conversionRate": 0.036,
  "steps": [
    {
      "step": { "kind": "page", "value": "/", "label": "" },
      "label": "/",
      "visitors": 1100,
      "entryRate": 0.857,
      "continueRate": null,
      "dropped": 0
    },
    {
      "step": { "kind": "page", "value": "/pricing", "label": "Pricing" },
      "label": "Pricing",
      "visitors": 310,
      "entryRate": 0.241,
      "continueRate": 0.282,
      "dropped": 790
    }
  ]
}
```

`funnel` is shaped as in the list above (its steps left out here). `conversionRate` is completed out of entered. Per
step, `label` is the step's label or else its value, `entryRate` is out of all `visitors`, and `continueRate` is out of
the step before (`null` for the first step).

## Payments

`GET /sites/:id/payments`

Revenue over the Range, for a Site with a [Revenue connection](https://supersaasanalytics.com/docs/integrations/revenue-attribution) (else `404`).
Takes the [report parameters](#report-parameters). Totals and breakdowns only: never single Payments or customers.

```json
{
  "site": { "id": "0b9f6a52-…", "name": "Example", "domain": "example.com" },
  "range": { "from": "2026-11-08", "to": "2026-11-14", "hours": null },
  "currency": "USD",
  "current": { "revenue": 48900, "payments": 11, "avgOrderValue": 4445, "avgTimeToConvertSeconds": 259200 },
  "previous": { "revenue": 39900, "payments": 9, "avgOrderValue": 4433, "avgTimeToConvertSeconds": 302400 },
  "sources": [{ "value": "google.com", "revenue": 19800, "payments": 4 }],
  "countries": [{ "value": "US", "revenue": 29700, "payments": 6 }]
}
```

`sources` (Revenue by the payer's first Source) and `countries` are the ten largest by Revenue.
`avgTimeToConvertSeconds` is `null` without Payments.

## Live

`GET /sites/:id/live`

The Visitors on the Site now: those seen in the last 5 minutes. Takes no parameters.

```json
{
  "site": { "id": "0b9f6a52-…", "name": "Example", "domain": "example.com" },
  "visitors": 12
}
```
