import { Octokit } from 'octokit'
import pRetry from 'p-retry'
import { authManager } from '../auth/index.js'
import { logger } from '../utils/logger.js'
import { loadConfig } from '../config/index.js'
import { GitHubMcpError } from '../utils/errors.js'
import { SERVER_VERSION } from '../version.js'

const config = loadConfig()

export class GitHubGraphQLClient {
  private octokit: Octokit

  constructor() {
    let token: string | undefined
    try { token = authManager.getToken() } catch { /* no token yet */ }
    this.octokit = new Octokit({
      auth: token,
      userAgent: `github-mcp-server/${SERVER_VERSION}`,
    })
  }

  refreshToken(): void {
    this.octokit = new Octokit({
      auth: authManager.getToken(),
      userAgent: `github-mcp-server/${SERVER_VERSION}`,
    })
  }

  async query<T = Record<string, unknown>>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    return pRetry(
      async () => {
        try {
          const response = await this.octokit.graphql<T>(query, { ...variables })
          return response
        } catch (err: unknown) {
          if (err && typeof err === 'object' && 'errors' in err) {
            const gqlErrors = (err as { errors: Array<{ message: string; type?: string }> }).errors
            const messages = gqlErrors.map(e => e.message).join('; ')
            throw new GitHubMcpError(
              `GraphQL error: ${messages}`,
              'GRAPHQL_ERROR',
              422,
              { errors: gqlErrors },
            )
          }
          throw err
        }
      },
      {
        retries: config.retry.maxRetries,
        minTimeout: config.retry.minTimeout,
        maxTimeout: config.retry.maxTimeout,
      },
    )
  }

  async paginatedQuery<T>(
    query: string,
    field: string,
    variables?: Record<string, unknown>,
    pageSize = 100,
  ): Promise<T[]> {
    const allItems: T[] = []
    let cursor: string | null = null
    let hasNext = true

    while (hasNext) {
      const vars = { ...variables, first: pageSize, after: cursor }
      const result = await this.query<Record<string, unknown>>(query, vars)

      const pageData = this.extractPage(result, field)
      if (!pageData) break

      allItems.push(...(pageData.nodes as T[]))
      cursor = pageData.pageInfo?.endCursor ?? null
      hasNext = pageData.pageInfo?.hasNextPage ?? false
    }

    return allItems
  }

  private extractPage(
    data: Record<string, unknown>,
    field: string,
  ): { nodes: unknown[]; pageInfo: { endCursor: string | null; hasNextPage: boolean } } | null {
    const parts = field.split('.')
    let current: unknown = data
    for (const part of parts) {
      if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part]
      } else {
        return null
      }
    }
    return current as { nodes: unknown[]; pageInfo: { endCursor: string | null; hasNextPage: boolean } }
  }

  async search<T>(
    type: 'repository' | 'issue' | 'pullRequest' | 'code' | 'user' | 'discussion',
    query: string,
    limit = 20,
  ): Promise<{ total: number; items: T[] }> {
    const searchQuery = `
      query($q: String!, $first: Int!) {
        search(query: $q, type: ${type.toUpperCase()}, first: $first) {
          repositoryCount
          issueCount
          codeCount
          edges {
            node {
              ... on Repository { nameWithOwner description stargazerCount forkCount }
              ... on Issue { title url state repository { nameWithOwner } }
              ... on PullRequest { title url state repository { nameWithOwner } }
            }
          }
        }
      }
    `

    const result = await this.query<Record<string, unknown>>(searchQuery, {
      q: query,
      first: limit,
    })

    const search = result.search as Record<string, unknown>
    const total = ((search.repositoryCount ?? search.issueCount ?? search.codeCount ?? 0) as number)
    const edges = search.edges as Array<{ node: T }> | undefined
    const items = edges?.map(e => e.node) ?? []

    return { total, items }
  }
}

export const graphqlClient = new GitHubGraphQLClient()
