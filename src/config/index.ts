import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { config as loadDotenv } from 'dotenv'
import type { ServerConfig, AuthConfig } from '../types/index.js'

loadDotenv()

const DEFAULTS: ServerConfig = {
  timeout: 30_000,
  retry: { maxRetries: 3, minTimeout: 1000, maxTimeout: 10_000 },
  rateLimit: { maxRequestsPerMinute: 30, maxConcurrent: 5 },
  logging: { level: 'info', format: 'text' },
  cache: { enabled: true, ttlMs: 60_000, maxSize: 100 },
}

function loadJsonConfig(path: string): Partial<ServerConfig> {
  try {
    const content = readFileSync(path, 'utf-8')
    return JSON.parse(content) as Partial<ServerConfig>
  } catch {
    return {}
  }
}

function mergeConfig(...sources: Array<Partial<ServerConfig>>): ServerConfig {
  const merged = { ...DEFAULTS }
  for (const src of sources) {
    if (src.timeout !== undefined) merged.timeout = src.timeout
    if (src.retry) Object.assign(merged.retry, src.retry)
    if (src.rateLimit) Object.assign(merged.rateLimit, src.rateLimit)
    if (src.logging) Object.assign(merged.logging, src.logging)
    if (src.cache) Object.assign(merged.cache, src.cache)
    if (src.defaultOwner) merged.defaultOwner = src.defaultOwner
    if (src.defaultRepo) merged.defaultRepo = src.defaultRepo
    if (src.organization) merged.organization = src.organization
    if (src.workspace) merged.workspace = src.workspace
    if (src.cloneDir) merged.cloneDir = src.cloneDir
    if (src.proxy) merged.proxy = src.proxy
    if (src.port) merged.port = src.port
    if (src.transport) merged.transport = src.transport
    if (src.httpSecret) merged.httpSecret = src.httpSecret
    if (src.oauth) merged.oauth = { ...(merged.oauth ?? {}), ...src.oauth }
    if (src.githubApp) merged.githubApp = { ...(merged.githubApp ?? {}), ...src.githubApp }
  }
  return merged
}

function paths(): string[] {
  const configPaths = [
    resolve(process.cwd(), 'config.json'),
    resolve(homedir(), '.config', 'github-mcp', 'config.json'),
    resolve('/etc', 'github-mcp', 'config.json'),
  ]
  if (process.env.GITHUB_MCP_CONFIG) {
    configPaths.unshift(resolve(process.env.GITHUB_MCP_CONFIG))
  }
  return configPaths
}

let cached: ServerConfig | null = null
let cachedAuth: AuthConfig | null = null

export function loadConfig(): ServerConfig {
  if (cached) return cached

  const envConfig: Partial<ServerConfig> = {}
  if (process.env.GITHUB_DEFAULT_OWNER) envConfig.defaultOwner = process.env.GITHUB_DEFAULT_OWNER
  if (process.env.GITHUB_DEFAULT_REPO) envConfig.defaultRepo = process.env.GITHUB_DEFAULT_REPO
  if (process.env.GITHUB_ORG) envConfig.organization = process.env.GITHUB_ORG
  if (process.env.GITHUB_WORKSPACE) envConfig.workspace = process.env.GITHUB_WORKSPACE
  if (process.env.GITHUB_CLONE_DIR) envConfig.cloneDir = process.env.GITHUB_CLONE_DIR
  if (process.env.GITHUB_MCP_PORT) {
    const port = Number(process.env.GITHUB_MCP_PORT)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid GITHUB_MCP_PORT: ${process.env.GITHUB_MCP_PORT}`)
    }
    envConfig.port = port
  }
  if (process.env.GITHUB_MCP_LOG_LEVEL) {
    const level = process.env.GITHUB_MCP_LOG_LEVEL
    const validLevels = ['debug', 'info', 'warn', 'error', 'trace']
    if (!validLevels.includes(level)) {
      throw new Error(`Invalid GITHUB_MCP_LOG_LEVEL: ${level}. Valid: ${validLevels.join(', ')}`)
    }
    envConfig.logging = { ...DEFAULTS.logging, level: level as ServerConfig['logging']['level'] }
  }
  if (process.env.GITHUB_MCP_TIMEOUT) {
    const timeout = Number(process.env.GITHUB_MCP_TIMEOUT)
    if (!Number.isFinite(timeout) || timeout < 0) {
      throw new Error(`Invalid GITHUB_MCP_TIMEOUT: ${process.env.GITHUB_MCP_TIMEOUT}`)
    }
    envConfig.timeout = timeout
  }
  if (process.env.GITHUB_MCP_TRANSPORT) {
    const transport = process.env.GITHUB_MCP_TRANSPORT
    if (!['stdio', 'http', 'sse'].includes(transport)) {
      throw new Error(`Invalid GITHUB_MCP_TRANSPORT: ${transport}. Valid: stdio, http, sse`)
    }
    envConfig.transport = transport as ServerConfig['transport']
  }
  if (process.env.GITHUB_MCP_SECRET) {
    envConfig.httpSecret = process.env.GITHUB_MCP_SECRET
  }
  if (process.env.GITHUB_OAUTH_CLIENT_ID || process.env.GITHUB_OAUTH_CLIENT_SECRET || process.env.GITHUB_OAUTH_SCOPES) {
    envConfig.oauth = {
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID,
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      scopes: process.env.GITHUB_OAUTH_SCOPES
        ? process.env.GITHUB_OAUTH_SCOPES.split(/\s+/).filter(Boolean)
        : undefined,
    }
  }
  if (
    process.env.GITHUB_APP_ID ||
    process.env.GITHUB_APP_PRIVATE_KEY ||
    process.env.GITHUB_APP_PRIVATE_KEY_PATH ||
    process.env.GITHUB_APP_INSTALLATION_ID
  ) {
    envConfig.githubApp = {
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
      privateKeyPath: process.env.GITHUB_APP_PRIVATE_KEY_PATH,
      installationId: process.env.GITHUB_APP_INSTALLATION_ID,
    }
  }
  if (process.env.GITHUB_PROXY) envConfig.proxy = process.env.GITHUB_PROXY

  const configs = paths().filter(p => existsSync(p)).map(p => loadJsonConfig(p))
  cached = mergeConfig(DEFAULTS, ...configs, envConfig)
  return cached
}

export function loadAuthConfig(): AuthConfig {
  if (cachedAuth) return cachedAuth

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT
  if (token) {
    cachedAuth = { method: 'token', token }
    return cachedAuth
  }

  const authPath = resolve(homedir(), '.config', 'github-mcp', 'auth.json')
  if (existsSync(authPath)) {
    try {
      const data = JSON.parse(readFileSync(authPath, 'utf-8'))
      if (data.activeToken) {
        cachedAuth = { method: data.method || 'token', token: data.activeToken }
        return cachedAuth
      }
    } catch { /* ignore */ }
  }

  cachedAuth = { method: 'token' }
  return cachedAuth
}

export function resetCache(): void {
  cached = null
  cachedAuth = null
}
