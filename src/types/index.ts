import type { z } from 'zod'

export type AuthMethod = 'token' | 'fine-grained' | 'oauth-device' | 'oauth-web' | 'github-app'

export interface AuthConfig {
  method: AuthMethod
  token?: string
  clientId?: string
  clientSecret?: string
  scopes?: string[]
}

export interface Account {
  id: string
  login: string
  token: string
  method: AuthMethod
  active: boolean
}

export interface ServerConfig {
  port?: number
  transport?: 'stdio' | 'http' | 'sse'
  httpSecret?: string
  defaultOwner?: string
  defaultRepo?: string
  organization?: string
  workspace?: string
  cloneDir?: string
  timeout: number
  retry: RetryConfig
  rateLimit: RateLimitConfig
  logging: LoggingConfig
  proxy?: string
  cache: CacheConfig
  oauth?: OAuthClientConfig
  githubApp?: GitHubAppConfig
}

export interface OAuthClientConfig {
  clientId?: string
  clientSecret?: string
  scopes?: string[]
}

export interface GitHubAppConfig {
  appId?: string
  privateKey?: string
  privateKeyPath?: string
  installationId?: string | number
}

export interface RetryConfig {
  maxRetries: number
  minTimeout: number
  maxTimeout: number
}

export interface RateLimitConfig {
  maxRequestsPerMinute: number
  maxConcurrent: number
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error' | 'trace'
  format: 'json' | 'text'
  file?: string
}

export interface CacheConfig {
  enabled: boolean
  ttlMs: number
  maxSize: number
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>
    isError?: boolean
  }>
}

export interface GitHubContent {
  name: string
  path: string
  sha: string
  size: number
  type: 'file' | 'dir' | 'symlink' | 'submodule'
  content?: string
  encoding?: string
  downloadUrl?: string
}

export interface FileChange {
  path: string
  content: string
  encoding?: 'utf-8' | 'base64'
}

export interface BranchProtectionRule {
  requiredApprovingReviewCount?: number
  dismissStaleReviews?: boolean
  requireCodeOwnerReview?: boolean
  requiredStatusCheckContexts?: string[]
  enforceAdmins?: boolean
  restrictPushes?: boolean
  allowsDeletions?: boolean
  allowsForcePushes?: boolean
  requireLinearHistory?: boolean
}

export interface ReleaseAsset {
  id: number
  name: string
  size: number
  contentType: string
  downloadUrl: string
}

export interface WorkflowRun {
  id: number
  name: string
  status: string
  conclusion: string | null
  headBranch: string
  createdAt: string
  updatedAt: string
  htmlUrl: string
}

export interface SearchResult<T> {
  total: number
  items: T[]
}

export interface DiscussionComment {
  id: string
  body: string
  author: string
  createdAt: string
  replyTo?: string
}

export interface AuditResult {
  repository: string
  score: number
  checks: AuditCheck[]
  summary: string
}

export interface AuditCheck {
  name: string
  status: 'pass' | 'fail' | 'warn'
  details: string
}

export interface RepoHealth {
  stars: number
  forks: number
  openIssues: number
  openPRs: number
  lastCommit: string
  hasLicense: boolean
  hasReadme: boolean
  hasContributing: boolean
  hasCodeOfConduct: boolean
  topics: string[]
  language: string | null
  archived: boolean
  healthScore: number
}
