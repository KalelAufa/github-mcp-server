import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import type { ToolDefinition } from './types/index.js'
import { SERVER_VERSION } from './version.js'
import { loadConfig, loadAuthConfig } from './config/index.js'
import { logger } from './utils/logger.js'
import { validateToolArgs } from './utils/validation.js'
import { GitHubMcpError } from './utils/errors.js'

import { repositoryTools } from './tools/repository.js'
import { issueTools } from './tools/issues.js'
import { branchTools } from './tools/branches.js'
import { fileTools } from './tools/files.js'
import { pullRequestTools } from './tools/pullRequests.js'
import { releaseTools } from './tools/releases.js'
import { searchTools } from './tools/search.js'
import { secretTools } from './tools/secrets.js'
import { actionTools } from './tools/actions.js'
import { aiTools } from './tools/ai.js'
import { gitTools } from './tools/git.js'
import { authTools } from './tools/auth.js'

const config = loadConfig()
logger.configure(config.logging)

const authConfig = loadAuthConfig()
if (!authConfig.token) {
  logger.warn('No GitHub token found. API calls will fail until you set GITHUB_TOKEN or log in via an auth_*_login tool.')
}

const allTools: ToolDefinition[] = [
  ...repositoryTools,
  ...issueTools,
  ...branchTools,
  ...fileTools,
  ...pullRequestTools,
  ...releaseTools,
  ...searchTools,
  ...secretTools,
  ...actionTools,
  ...aiTools,
  ...gitTools,
  ...authTools,
]

const seen = new Set<string>()
for (const tool of allTools) {
  if (seen.has(tool.name)) {
    logger.error(`Duplicate tool name detected and will be shadowed: ${tool.name}`)
  }
  seen.add(tool.name)
}

function createServer(): Server {
  const server = new Server(
    { name: 'github-mcp-server', version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const tool = allTools.find((t) => t.name === name)
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      }
    }
    try {
      const validated = validateToolArgs(tool, args ?? {})
      return await tool.handler(validated)
    } catch (err) {
      if (err instanceof GitHubMcpError) {
        return err.toMcpResponse()
      }
      const message = err instanceof Error ? err.message : String(err)
      logger.error('Tool execution failed', { tool: name, error: message })
      return {
        content: [{ type: 'text', text: `Error executing ${name}: ${message}` }],
        isError: true,
      }
    }
  })

  return server
}

const transportMode = config.transport ?? 'stdio'

async function startStdio(): Promise<void> {
  const transport = new StdioServerTransport()
  await createServer().connect(transport)
  process.stderr.write('GitHub MCP Server running on stdio transport\n')
}

const MAX_BODY_BYTES = 1_048_576 // 1 MB

async function readJsonBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    total += buf.length
    if (total > MAX_BODY_BYTES) throw new Error('Request body too large (max 1MB)')
    chunks.push(buf)
  }
  if (chunks.length === 0) return undefined
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
}

function checkHttpAuth(req: import('node:http').IncomingMessage, secret: string | undefined): boolean {
  if (!secret) return true
  const auth = req.headers['authorization']
  if (!auth || !auth.startsWith('Bearer ')) return false
  const provided = auth.slice(7)
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

async function startStreamableHttp(): Promise<void> {
  const http = await import('node:http')
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js')
  type Transport = InstanceType<typeof StreamableHTTPServerTransport>
  const transports = new Map<string, Transport>()

  const httpServer = http.createServer(async (req, res) => {
    if (!checkHttpAuth(req, config.httpSecret)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Bearer' }).end('Unauthorized')
      return
    }
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/mcp') {
      res.writeHead(404).end()
      return
    }
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    let transport = sessionId ? transports.get(sessionId) : undefined
    if (!transport) {
      if (req.method !== 'POST') {
        res.writeHead(405).end()
        return
      }
      let newSessionId: string | undefined
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          newSessionId = id
          transports.set(id, transport as Transport)
        },
      })
      res.on('close', () => {
        if (newSessionId) transports.delete(newSessionId)
      })
      await createServer().connect(transport)
    }
    try {
      const body = await readJsonBody(req)
      await transport.handleRequest(req, res, body)
    } catch {
      if (!res.headersSent) res.writeHead(400).end()
    }
  })

  const port = config.port ?? 3000
  httpServer.listen(port, () => {
    process.stderr.write(`GitHub MCP Server running on streamable HTTP at http://localhost:${port}/mcp\n`)
  })
  httpServer.on('error', (e) => logger.error('HTTP server error', { error: String(e) }))
}

async function startSse(): Promise<void> {
  const http = await import('node:http')
  const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js')
  type Transport = InstanceType<typeof SSEServerTransport>
  const sseTransports = new Map<string, Transport>()

  const httpServer = http.createServer(async (req, res) => {
    if (!checkHttpAuth(req, config.httpSecret)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Bearer' }).end('Unauthorized')
      return
    }
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/sse') {
      const transport = new SSEServerTransport('/messages', res)
      sseTransports.set(transport.sessionId, transport)
      res.on('close', () => {
        sseTransports.delete(transport.sessionId)
        void transport.close()
      })
      await createServer().connect(transport)
      return
    }
    if (url.pathname === '/messages') {
      const sid = url.searchParams.get('sessionId')
      const transport = sid ? sseTransports.get(sid) : undefined
      if (!transport) {
        res.writeHead(400).end('Unknown session')
        return
      }
      try {
        const body = await readJsonBody(req)
        await transport.handlePostMessage(req, res, body)
      } catch {
        if (!res.headersSent) res.writeHead(400).end()
      }
      return
    }
    res.writeHead(404).end()
  })

  const port = config.port ?? 3000
  httpServer.listen(port, () => {
    process.stderr.write(`GitHub MCP Server running on SSE at http://localhost:${port}/sse\n`)
  })
  httpServer.on('error', (e) => logger.error('HTTP server error', { error: String(e) }))
}

async function main(): Promise<void> {
  if (transportMode === 'http') await startStreamableHttp()
  else if (transportMode === 'sse') await startSse()
  else await startStdio()
}

main().catch((err) => {
  process.stderr.write(`Fatal error starting server: ${String(err)}\n`)
  process.exit(1)
})
