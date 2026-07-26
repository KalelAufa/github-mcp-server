import { Octokit } from 'octokit'
import pRetry from 'p-retry'
import pLimit from 'p-limit'
import { LRUCache } from 'lru-cache'
import { authManager } from '../auth/index.js'
import { logger } from '../utils/logger.js'
import { RateLimitError, NotFoundError, AuthError } from '../utils/errors.js'
import { loadConfig } from '../config/index.js'
import { SERVER_VERSION } from '../version.js'

const config = loadConfig()
const limiter = pLimit(config.rateLimit.maxConcurrent)

interface CacheEntry<T> {
  data: T
  etag?: string
}

export class GitHubRestClient {
  private octokit: Octokit
  private cache: LRUCache<string, CacheEntry<unknown>>
  private staleCache: LRUCache<string, CacheEntry<unknown>>

  constructor() {
    let token: string | undefined
    try { token = authManager.getToken() } catch { /* no token yet — refreshToken() must be called after login */ }
    this.octokit = new Octokit({
      auth: token,
      userAgent: `github-mcp-server/${SERVER_VERSION}`,
      request: {
        timeout: config.timeout,
      },
    })
    this.cache = new LRUCache({
      max: config.cache.maxSize,
      ttl: config.cache.ttlMs,
    })
    this.staleCache = new LRUCache({
      max: config.cache.maxSize * 4,
      ttl: Math.max(config.cache.ttlMs * 10, 300_000),
    })
  }

  private getClient(): Octokit {
    return this.octokit
  }

  refreshToken(): void {
    this.octokit = new Octokit({
      auth: authManager.getToken(),
      userAgent: `github-mcp-server/${SERVER_VERSION}`,
    })
  }

  private cacheKey(method: string, url: string, params?: Record<string, unknown>): string {
    return `${method}:${url}:${JSON.stringify(params ?? {})}`
  }

  private freshGet<T>(key: string): CacheEntry<T> | undefined {
    if (!config.cache.enabled) return undefined
    return this.cache.get(key) as CacheEntry<T> | undefined
  }

  private staleGet<T>(key: string): CacheEntry<T> | undefined {
    if (!config.cache.enabled) return undefined
    return this.staleCache.get(key) as CacheEntry<T> | undefined
  }

  private storeEntry<T>(key: string, data: T, etag?: string): void {
    if (!config.cache.enabled) return
    const entry = { data, etag } as CacheEntry<T>
    this.cache.set(key, entry)
    this.staleCache.set(key, entry)
  }

  async paginate<T>(
    url: string,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    const items: T[] = []
    try {
      const response = await this.octokit.paginate(url, params ?? {})
      items.push(...(response as T[]))
    } catch (err: unknown) {
      this.handleError(err)
    }
    return items
  }

  invalidateCache(urlPrefix: string): void {
    if (!config.cache.enabled) return
    for (const key of this.cache.keys()) {
      if (key.includes(urlPrefix)) {
        this.cache.delete(key)
        this.staleCache.delete(key)
      }
    }
  }

  async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const cKey = this.cacheKey(method, url, params)

    if (method === 'GET') {
      const fresh = this.freshGet<T>(cKey)
      if (fresh) return fresh.data
    }

    const stale = method === 'GET' ? this.staleGet<T>(cKey) : undefined
    const headers: Record<string, string> | undefined =
      stale?.etag ? { 'If-None-Match': stale.etag } : undefined

    return limiter(async () => {
      return pRetry(
        async () => {
          try {
            const response = await this.octokit.request(`${method} ${url}`, {
              ...params,
              headers,
            })
            if (response.status === 304 && stale) {
              this.cache.set(cKey, stale)
              return stale.data
            }
            if (method === 'GET') {
              this.storeEntry(cKey, response.data as T, response.headers.etag)
            }
            return response.data as T
          } catch (err: unknown) {
            this.handleError(err)
          }
        },
        {
          retries: config.retry.maxRetries,
          minTimeout: config.retry.minTimeout,
          maxTimeout: config.retry.maxTimeout,
          onFailedAttempt: (err) => {
            logger.warn('API request failed, retrying', {
              attempt: err.attemptNumber,
              url,
              error: err.message,
            })
          },
        },
      )
    })
  }

  async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>('GET', url, params)
  }

  async post<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const result = await this.request<T>('POST', url, params)
    this.invalidateCache(url)
    return result
  }

  async patch<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const result = await this.request<T>('PATCH', url, params)
    this.invalidateCache(url)
    return result
  }

  async put<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const result = await this.request<T>('PUT', url, params)
    this.invalidateCache(url)
    return result
  }

  async del<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const result = await this.request<T>('DELETE', url, params)
    this.invalidateCache(url)
    return result
  }

  async getRepo(owner: string, repo: string): Promise<Record<string, unknown>> {
    return this.get(`/repos/${owner}/${repo}`)
  }

  async createRepo(name: string, opts: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const { owner, ...rest } = opts as { owner?: string }
    if (owner) {
      return this.post(`/orgs/${owner}/repos`, { name, ...rest })
    }
    return this.post('/user/repos', { name, ...rest })
  }

  async getContents(owner: string, repo: string, path: string, ref?: string): Promise<Record<string, unknown> | Record<string, unknown>[]> {
    const params: Record<string, unknown> = {}
    if (ref) params.ref = ref
    return this.get(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, params)
  }

  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    sha?: string,
    branch?: string,
  ): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = {
      message,
      content: Buffer.from(content).toString('base64'),
    }
    if (sha) params.sha = sha
    if (branch) params.branch = branch
    return this.put(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, params)
  }

  async deleteFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    sha: string,
    branch?: string,
  ): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = { message, sha }
    if (branch) params.branch = branch
    return this.del(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, params)
  }

  private handleError(err: unknown): never {
    if (err && typeof err === 'object' && 'status' in err) {
      const status = (err as { status: number }).status
      const msg = (err as { message?: string }).message ?? 'Unknown error'

      if (status === 403) {
        const rateLimit = (err as { headers?: Record<string, string> }).headers?.['x-ratelimit-remaining']
        if (rateLimit === '0') {
          const resetAt = (err as { headers?: Record<string, string> }).headers?.['x-ratelimit-reset'] ?? 'unknown'
          throw new RateLimitError(resetAt)
        }
      }
      if (status === 404) throw new NotFoundError(msg)
      if (status === 401) {
        throw new AuthError('Authentication failed. Check your GitHub token.')
      }
    }
    if (err && typeof err === 'object' && 'message' in err) {
      throw new Error(String((err as { message: unknown }).message))
    }
    throw new Error(String(err))
  }
}

export const restClient = new GitHubRestClient()
