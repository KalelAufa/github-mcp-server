# GitHub MCP Server

Production-ready [Model Context Protocol](https://modelcontextprotocol.io) server that wraps the
GitHub REST + GraphQL APIs so AI assistants can manage repositories, issues, pull requests,
releases, actions, secrets, and more.

## Features

- ~90 tools covering repositories, issues, branches, files, pull requests, releases,
  GitHub Actions, secrets/variables, search, and AI-assisted repo analysis.
- Multiple auth methods (env token, auth file with multiple accounts).
- Built-in resilience: rate-limit throttling (`p-limit`), retries with backoff (`p-retry`),
  LRU response cache with ETag revalidation.
- Zod-based input validation for every tool.
- Structured error mapping (`GitHubMcpError` → MCP `isError` responses).
- Logs to **stderr** (safe for stdio transport) or a file.

## Install

```bash
npm install
npm run build
```

## Configuration

Configuration is merged from (highest priority first):

1. Environment variables
2. JSON config files (`config.json`) at:
   - `$GITHUB_MCP_CONFIG` (if set)
   - `./config.json` (cwd)
   - `~/.config/github-mcp/config.json`
   - `/etc/github-mcp/config.json`
3. Built-in defaults

See `config.json.example` for all options.

### Authentication

The server is method-aware and supports every GitHub token type:

| Method | Token kind | How to provide |
|--------|-----------|----------------|
| `token` | Personal Access Token (classic `ghp_`, OAuth `gho_`, App user-to-server `ghu_`, installation `ghs_`) | `GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_PAT` or auth store |
| `fine-grained` | Fine-grained PAT (`github_pat_`) | same as above (sent as `Bearer`) |
| `oauth-device` | OAuth Device Flow | `auth_device_login` → `auth_device_poll` tools |
| `oauth-web` | OAuth Authorization Code Flow | `auth_web_login` → `auth_web_callback` tools |
| `github-app` | GitHub App JWT → installation token | `auth_app_login` tool (needs app id + private key) |

#### Static token

```bash
export GITHUB_TOKEN=ghp_xxx        # or GH_TOKEN / GITHUB_PAT
```

Or use the auth store file `~/.config/github-mcp/auth.json`:

```json
{ "activeToken": "ghp_xxx", "method": "token" }
```

#### OAuth (Device / Web)

Configure the OAuth app client, then drive the flow from the MCP client:

```bash
export GITHUB_OAUTH_CLIENT_ID=Iv1.xxx
export GITHUB_OAUTH_CLIENT_SECRET=xxx      # required for web flow
export GITHUB_OAUTH_SCOPES="repo read:org"
```

- Device: call `auth_device_login` (returns a user code + URL), authorize in a browser, then `auth_device_poll`.
- Web: call `auth_web_login` (returns an authorize URL), authorize, then `auth_web_callback` with the `code`.

#### GitHub App

```bash
export GITHUB_APP_ID=123456
export GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY----- ..."   # or GITHUB_APP_PRIVATE_KEY_PATH=/path/key.pem
export GITHUB_APP_INSTALLATION_ID=98765432                            # optional; first installation used if omitted
```

Call `auth_app_login` to mint an installation token (the server builds the JWT with RS256 and exchanges it).

#### Managing accounts

Tools `auth_status`, `auth_list_accounts`, `auth_switch_account`, and `auth_logout`
let you inspect and switch between multiple stored accounts. Any successful login
refreshes the active token used by the REST/GraphQL clients.

## Usage

### Transports

The server supports three transports, selected via `GITHUB_MCP_TRANSPORT`
(`stdio` by default):

| Transport | Env | Endpoint | Notes |
|-----------|-----|----------|-------|
| `stdio`   | `GITHUB_MCP_TRANSPORT=stdio` | stdin/stdout | Default; logs go to stderr |
| `http`    | `GITHUB_MCP_TRANSPORT=http`  | `http://host:PORT/mcp` | Streamable HTTP (MCP session per connection) |
| `sse`     | `GITHUB_MCP_TRANSPORT=sse`   | `http://host:PORT/sse` + `POST /messages` | Legacy SSE |

For `http`/`sse`, also set `GITHUB_MCP_PORT` (default `3000`).

### With an MCP client (stdio, default)

```bash
GITHUB_TOKEN=ghp_xxx node dist/index.js
```

Register it in your client's MCP server list:

```json
{
  "mcpServers": {
    "github": {
      "command": "node",
      "args": ["/path/to/github-mcp-server/dist/index.js"],
      "env": { "GITHUB_TOKEN": "ghp_xxx" }
    }
  }
}
```

### Streamable HTTP example

```bash
GITHUB_TOKEN=ghp_xxx GITHUB_MCP_TRANSPORT=http GITHUB_MCP_PORT=3000 node dist/index.js
# Client connects to http://localhost:3000/mcp (Accept: application/json, text/event-stream)
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_PAT` | GitHub personal access / fine-grained token |
| `GITHUB_DEFAULT_OWNER` | Default repo owner when a tool omits `owner` |
| `GITHUB_DEFAULT_REPO` | Default repo when a tool omits `repo` |
| `GITHUB_ORG` | Default organization |
| `GITHUB_WORKSPACE` | Workspace path |
| `GITHUB_CLONE_DIR` | Directory for cloned repos |
| `GITHUB_MCP_TRANSPORT` | `stdio` (default) / `http` / `sse` |
| `GITHUB_MCP_PORT` | Port (for http/sse transport) |
| `GITHUB_MCP_TIMEOUT` | Request timeout (ms) |
| `GITHUB_MCP_LOG_LEVEL` | `trace` `debug` `info` `warn` `error` |
| `GITHUB_PROXY` | Outbound proxy URL |
| `GITHUB_MCP_CONFIG` | Path to a `config.json` |

## Development

```bash
npm run dev        # tsx watch
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # vitest run
npm run build      # tsc -> dist/
```

## License

MIT
