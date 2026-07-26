export class GitHubMcpError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'GitHubMcpError'
  }

  toMcpResponse() {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              error: this.code,
              message: this.message,
              details: this.details,
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    }
  }
}

export class AuthError extends GitHubMcpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'AUTH_ERROR', 401, details)
    this.name = 'AuthError'
  }
}

export class NotFoundError extends GitHubMcpError {
  constructor(resource: string, details?: Record<string, unknown>) {
    super(`Not found: ${resource}`, 'NOT_FOUND', 404, details)
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends GitHubMcpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details)
    this.name = 'ValidationError'
  }
}

export class RateLimitError extends GitHubMcpError {
  constructor(resetAt: string) {
    super('GitHub API rate limit exceeded', 'RATE_LIMIT', 429, { resetAt })
    this.name = 'RateLimitError'
  }
}

export class PermissionError extends GitHubMcpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'PERMISSION_DENIED', 403, details)
    this.name = 'PermissionError'
  }
}

export class GitError extends GitHubMcpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'GIT_ERROR', 500, details)
    this.name = 'GitError'
  }
}
