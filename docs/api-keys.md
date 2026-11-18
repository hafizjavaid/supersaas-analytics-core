# API keys

Create a read-only key so scripts, the CLI and AI agents can read an Organization's reports. `https://analytics.example.com` stands for your self-hosted copy's origin.

An API key lets something other than the dashboard read your reports: a script calling the [API](api.md),
an AI agent over [MCP](mcp.md), or the [CLI](cli.md) in your terminal. Every key belongs to an
Organization and reads all of its Sites. Keys only read: nothing sent with a key can change a Site, a Goal or anything
else.

Questions an agent answers through a key never count as Ask AI questions.

## Create a key

Owners and Admins open the Organization's **Settings → API keys** and choose **Create key**. Give it a name that says
where it will live, such as `Claude Code` or `Weekly report script`; a key left unnamed is called "API key".

The key is shown once. Copy it before closing the dialog: we store only a hash of it, so it cannot be shown again. If
you lose it, revoke it and create another.

A key looks like `ssa_` followed by 40 characters. The list shows its first 12 characters, so you can tell keys apart,
with who created it and when it was last used (to the minute).

You can create as many keys as you like, and they never expire. Use one key per script or agent, so you can revoke one
without breaking the others.

> Viewers cannot see or create keys. A key keeps working after the Member who created it leaves the
> Organization.

## Use a key

Send the key as a bearer token in the `Authorization` header:

```sh
curl https://analytics.example.com/api/v1/sites \
  -H "Authorization: Bearer ssa_your_key"
```

The [MCP](mcp.md) and [CLI](cli.md) pages show where each of them takes the key.

Treat a key like a password. Anyone who has it can read every report of the Organization, so keep it out of code you
commit and out of websites' JavaScript; put it in an environment variable or a secret store.

## What a key can read

The same reports as Ask AI, for every Site of the key's Organization:

- the Sites, with their ids, domains and timezones
- the key figures (Visitors, Visits, Pageviews, bounce rate, visit duration, conversion rate and Revenue) and the
  previous period
- Visitors and Pageviews over time
- ranked lists by Dimension: pages, entry and exit pages, Outbound links, Channels, referrers, AI assistants, UTM
  parameters, browsers, operating systems, devices, countries, regions, cities and Events
- Goals and Funnels
- Revenue totals, with Revenue by Source and country, for Sites with a [Revenue connection](https://supersaasanalytics.com/docs/integrations/revenue-attribution)
- the number of Live visitors

Every report takes a Range and Filters, as the dashboard does. A key never reads individual Visitors, their journeys,
individual Payments or customer emails, and a Site of another Organization answers as if it did not exist.

## Rate limit

A self-hosted copy does not limit how often a key reads. (The hosted service allows 60 requests a minute per key.)

## Revoke a key

Choose **Revoke** next to the key. Anything using it gets `401` on its next request; there is no grace period, and a
revoked key cannot be restored.
