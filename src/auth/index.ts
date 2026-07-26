import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { randomBytes } from 'node:crypto'
import type { Account, AuthMethod } from '../types/index.js'
import { AuthError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { hashToken, safeCompare } from '../utils/helpers.js'
import { loadConfig } from '../config/index.js'
import * as flows from './flows.js'

// Lazy dynamic imports avoid circular dep (rest/graphql import authManager at module init).
// After account switch, re-auth the API clients with the new token.
function refreshApiClients(): void {
  import('../api/rest.js').then(m => m.restClient.refreshToken()).catch(() => undefined)
  import('../api/graphql.js').then(m => m.graphqlClient.refreshToken()).catch(() => undefined)
}

const AUTH_FILE = resolve(homedir(), '.config', 'github-mcp', 'auth.json')

interface AuthStore {
  accounts: Account[]
  activeId: string | null
}

function ensureDir(): void {
  const dir = resolve(homedir(), '.config', 'github-mcp')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function loadStore(): AuthStore {
  try {
    if (existsSync(AUTH_FILE)) {
      return JSON.parse(readFileSync(AUTH_FILE, 'utf-8')) as AuthStore
    }
  } catch (err) {
    logger.warn('Failed to load auth store', { error: String(err) })
  }
  return { accounts: [], activeId: null }
}

function saveStore(store: AuthStore): void {
  ensureDir()
  writeFileSync(AUTH_FILE, JSON.stringify(store, null, 2), { encoding: 'utf-8', mode: 0o600 })
}

export class AuthManager {
  private store: AuthStore
  private currentToken: string | null = null
  private pendingDevice?: { deviceCode: string; interval: number; expiresAt: number }
  private pendingOAuthState?: string

  constructor() {
    this.store = loadStore()
    this.initFromEnv()
  }

  private initFromEnv(): void {
    const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT
    if (envToken) {
      // Keep env token in-memory only — never persist to disk
      this.currentToken = envToken
    }
  }

  getToken(): string {
    if (this.currentToken) return this.currentToken

    if (this.store.activeId) {
      const account = this.store.accounts.find(a => a.id === this.store.activeId)
      if (account) {
        this.currentToken = account.token
        return account.token
      }
    }

    const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT
    if (envToken) {
      this.currentToken = envToken
      return envToken
    }

    throw new AuthError(
      'No GitHub token configured. Set GITHUB_TOKEN environment variable or add an account.',
    )
  }

  addAccount(login: string, token: string, method: AuthMethod = 'token'): Account {
    const existing = this.store.accounts.find(a => safeCompare(a.token, token))
    if (existing) {
      existing.active = true
      this.store.activeId = existing.id
      this.currentToken = token
      saveStore(this.store)
      return existing
    }

    const account: Account = {
      id: `${login}-${hashToken(token)}`,
      login,
      token,
      method,
      active: true,
    }

    this.store.accounts.forEach(a => (a.active = false))
    this.store.accounts.push(account)
    this.store.activeId = account.id
    this.currentToken = token
    saveStore(this.store)
    refreshApiClients()
    logger.info('Account added', { login, method })
    return account
  }

  switchAccount(accountId: string): Account | null {
    const account = this.store.accounts.find(a => a.id === accountId)
    if (!account) {
      throw new AuthError(`Account not found: ${accountId}`)
    }
    this.store.accounts.forEach(a => (a.active = false))
    account.active = true
    this.store.activeId = account.id
    this.currentToken = account.token
    saveStore(this.store)
    refreshApiClients()
    logger.info('Switched account', { login: account.login })
    return account
  }

  removeAccount(accountId: string): void {
    this.store.accounts = this.store.accounts.filter(a => a.id !== accountId)
    if (this.store.activeId === accountId) {
      this.store.activeId = this.store.accounts[0]?.id ?? null
      this.currentToken = this.store.activeId
        ? this.store.accounts.find(a => a.id === this.store.activeId)?.token ?? null
        : null
    }
    saveStore(this.store)
  }

  listAccounts(): Omit<Account, 'token'>[] {
    return this.store.accounts.map(({ token: _, ...rest }) => rest)
  }

  getActiveAccount(): Account | null {
    if (!this.store.activeId) return null
    return this.store.accounts.find(a => a.id === this.store.activeId) ?? null
  }

  async startDeviceLogin(scopes?: string[]): Promise<flows.DeviceCodeResponse> {
    const cfg = loadConfig()
    const clientId = cfg.oauth?.clientId
    if (!clientId) {
      throw new AuthError('OAuth client_id not configured. Set GITHUB_OAUTH_CLIENT_ID.')
    }
    const resp = await flows.startDeviceFlow(clientId, scopes ?? cfg.oauth?.scopes ?? ['repo'])
    this.pendingDevice = {
      deviceCode: resp.deviceCode,
      interval: resp.interval,
      expiresAt: Date.now() + resp.expiresIn * 1000,
    }
    return resp
  }

  async pollDeviceLogin(): Promise<Account> {
    if (!this.pendingDevice) {
      throw new AuthError('No device authorization in progress. Call the device login tool first.')
    }
    if (Date.now() > this.pendingDevice.expiresAt) {
      this.pendingDevice = undefined
      throw new AuthError('Device code expired. Restart the login flow.')
    }
    try {
      const token = await flows.pollDeviceFlow(
        loadConfig().oauth!.clientId!,
        this.pendingDevice.deviceCode,
      )
      this.pendingDevice = undefined
      return this.addAccount('oauth-device', token, 'oauth-device')
    } catch (err) {
      if (err instanceof flows.DeviceFlowPendingError || err instanceof flows.DeviceFlowSlowDownError) {
        throw err
      }
      this.pendingDevice = undefined
      throw err
    }
  }

  generateWebLoginState(): string {
    const state = randomBytes(16).toString('hex')
    this.pendingOAuthState = state
    return state
  }

  async completeWebLogin(code: string, state?: string): Promise<Account> {
    if (this.pendingOAuthState) {
      if (!state || state !== this.pendingOAuthState) {
        this.pendingOAuthState = undefined
        throw new AuthError('OAuth state mismatch. Possible CSRF attack or stale callback.')
      }
      this.pendingOAuthState = undefined
    }
    const cfg = loadConfig()
    const clientId = cfg.oauth?.clientId
    const clientSecret = cfg.oauth?.clientSecret
    if (!clientId || !clientSecret) {
      throw new AuthError(
        'OAuth client_id/client_secret not configured. Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET.',
      )
    }
    const token = await flows.exchangeWebCode(clientId, clientSecret, code)
    return this.addAccount('oauth-web', token, 'oauth-web')
  }

  async addAppLogin(installationId?: string | number): Promise<Account> {
    const cfg = loadConfig()
    const app = cfg.githubApp
    if (!app || !app.appId || (!app.privateKey && !app.privateKeyPath)) {
      throw new AuthError('GitHub App app_id and private_key not configured. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.')
    }
    const privateKey = app.privateKey ?? readFileSync(app.privateKeyPath!, 'utf-8')
    const token = await flows.getInstallationToken(app.appId, privateKey, installationId ?? app.installationId)
    return this.addAccount('github-app', token, 'github-app')
  }
}

export const authManager = new AuthManager()
