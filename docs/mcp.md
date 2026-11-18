# MCP for AI agents

Connect Claude Code, Cursor or Codex to your analytics and ask about your traffic in plain words. `https://analytics.example.com` stands for your self-hosted copy's origin.

Our MCP server lets an AI agent read your reports while it works: "did yesterday's launch bring visitors?", asked in
Claude Code, Cursor or Codex, gets an answer from your real numbers. It is a remote server over Streamable HTTP, so
there is nothing to install or run.

- **URL**: `https://analytics.example.com/mcp`
- **Authentication**: an [API key](api-keys.md) as a bearer token, `Authorization: Bearer ssa_…`

The agent reads every Site of the key's Organization and nothing else, and it can only read.

## Connect your agent

Create a key in the Organization's **Settings → API keys** (name it after the agent), then add the server. The
examples read the key from the `SUPERSAAS_API_KEY` environment variable, so it stays out of files you might commit:

```sh
export SUPERSAAS_API_KEY=ssa_your_key
```

### Claude Code
Add it from the terminal, for you in every project:

```sh
claude mcp add --transport http --scope user supersaas https://analytics.example.com/mcp \
  --header "Authorization: Bearer $SUPERSAAS_API_KEY"
```

Or share it with your team in the project's `.mcp.json`, where Claude Code fills in `${SUPERSAAS_API_KEY}` from each
person's environment:

```json
{
  "mcpServers": {
    "supersaas": {
      "type": "http",
      "url": "https://analytics.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${SUPERSAAS_API_KEY}"
      }
    }
  }
}
```

Check it with `claude mcp list`, or `/mcp` inside Claude Code.

### Cursor
Add the server to `~/.cursor/mcp.json` for every project, or to `.cursor/mcp.json` in one project:

```json
{
  "mcpServers": {
    "supersaas": {
      "url": "https://analytics.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${env:SUPERSAAS_API_KEY}"
      }
    }
  }
}
```

Cursor fills in `${env:SUPERSAAS_API_KEY}` from the environment it was started in. Check that the server shows its
tools in **Cursor Settings → MCP**.

### Codex
Add the server to `~/.codex/config.toml`:

```toml
[mcp_servers.supersaas]
url = "https://analytics.example.com/mcp"
bearer_token_env_var = "SUPERSAAS_API_KEY"
```

`bearer_token_env_var` names the variable, not the key: Codex reads `SUPERSAAS_API_KEY` when it starts. Check it with `codex mcp list`, or `/mcp` inside Codex.

Any other agent that speaks MCP over Streamable HTTP and can send an `Authorization` header connects the same way.
claude.ai and ChatGPT connectors are not supported yet: they sign in with OAuth, which the server does not offer.

## Ask it

Start with a question; the agent picks the tools. For example:

- "How did traffic on example.com change this week compared with last week?"
- "Which pages brought the most visitors from ChatGPT and other AI assistants in the last 30 days?"
- "Which of my sites grew the most this month?"
- "How is the Signup funnel converting, and where do people drop off?"
- "Is anyone on the site right now?"
- "Which countries and Sources bring the most Revenue?"
- "Did yesterday's newsletter show up in the email Channel?"

## Tools

Each tool reads one report of the [API](api.md) and answers its JSON, so a field means the same in both.

| Tool | What it reads |
| --- | --- |
| `list_sites` | The Sites, with the ids the other tools take |
| `summary` | Visitors, Visits, Pageviews, bounce rate and visit duration (with conversion rate and Revenue once set up), and the previous period |
| `timeseries` | Visitors and Pageviews per hour for a single day, per day otherwise |
| `top_list` | The ten largest values of a Dimension, such as pages, referrers, Channels, countries or browsers |
| `goals` | Each Goal's conversions, unique Visitors and conversion rate |
| `funnels` | The Site's Funnels with their steps |
| `funnel` | One Funnel's conversion: how many entered, continued and completed |
| `payments` | Revenue totals, with Revenue by Source and country. Only listed when a Site has a Revenue connection |
| `live` | The Visitors on a Site in the last 5 minutes |

The reports take a Range (`today`, `yesterday`, `24h`, `7d`, `30d`, `90d`, `6m`, `12m`, or `custom` with `from` and
`to`; the last 30 days by default) and Filters such as `country:US` or `channel:search`, as the
[API's report parameters](api.md#report-parameters) describe.

## Good to know

- A Site of another Organization, a missing Funnel or a Range without its dates come back as a tool error the agent
  can read and correct, not as a broken connection.
- Questions asked through MCP never count as Ask AI questions.
- Revoking the key disconnects the agent on its next request.
