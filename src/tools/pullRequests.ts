import type { ToolDefinition } from '../types/index.js'
import { restClient } from '../api/rest.js'
import { resolveOwner } from '../utils/helpers.js'

export const pullRequestTools: ToolDefinition[] = [
  {
    name: 'create_pull_request',
    description: 'Create a pull request',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        title: { type: 'string', description: 'PR title' },
        body: { type: 'string', description: 'PR body/description' },
        head: { type: 'string', description: 'Head branch (source)' },
        base: { type: 'string', description: 'Base branch (target)' },
        draft: { type: 'boolean', description: 'Create as draft' },
        maintainerCanModify: { type: 'boolean', default: true },
      },
      required: ['repo', 'title', 'head', 'base'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const result = await restClient.post(`/repos/${owner}/${repo}/pulls`, {
        title: args.title,
        body: args.body || '',
        head: args.head,
        base: args.base,
        draft: args.draft || false,
        maintainer_can_modify: (args.maintainerCanModify as boolean) ?? true,
      })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'get_pull_request',
    description: 'Get pull request details',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        pullNumber: { type: 'number', description: 'PR number' },
      },
      required: ['repo', 'pullNumber'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const pullNumber = args.pullNumber as number
      const result = await restClient.get(`/repos/${owner}/${repo}/pulls/${pullNumber}`)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'update_pull_request',
    description: 'Update a pull request',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        pullNumber: { type: 'number', description: 'PR number' },
        title: { type: 'string', description: 'New title' },
        body: { type: 'string', description: 'New body' },
        state: { type: 'string', enum: ['open', 'closed'], description: 'New state' },
      },
      required: ['repo', 'pullNumber'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const pullNumber = args.pullNumber as number
      const body: Record<string, unknown> = {}
      if (args.title) body.title = args.title
      if (args.body !== undefined) body.body = args.body
      if (args.state) body.state = args.state
      const result = await restClient.patch(`/repos/${owner}/${repo}/pulls/${pullNumber}`, body)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'merge_pull_request',
    description: 'Merge a pull request',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        pullNumber: { type: 'number', description: 'PR number' },
        method: { type: 'string', enum: ['merge', 'squash', 'rebase'], description: 'Merge method' },
        title: { type: 'string', description: 'Merge commit title' },
        message: { type: 'string', description: 'Merge commit message' },
      },
      required: ['repo', 'pullNumber'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const pullNumber = args.pullNumber as number
      const body: Record<string, unknown> = {
        merge_method: (args.method as string) || 'merge',
      }
      if (args.title) body.commit_title = args.title
      if (args.message) body.commit_message = args.message
      const result = await restClient.put(`/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, body)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'list_pull_requests',
    description: 'List pull requests in a repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'PR state' },
        sort: { type: 'string', enum: ['created', 'updated', 'popularity', 'long-running'] },
        direction: { type: 'string', enum: ['asc', 'desc'] },
        perPage: { type: 'number', description: 'Results per page' },
      },
      required: ['repo'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const result = await restClient.get(`/repos/${owner}/${repo}/pulls`, {
        state: (args.state as string) || 'open',
        sort: (args.sort as string) || 'created',
        direction: (args.direction as string) || 'desc',
        per_page: (args.perPage as number) || 30,
      })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'create_pull_request_review',
    description: 'Create a review on a pull request',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        pullNumber: { type: 'number', description: 'PR number' },
        body: { type: 'string', description: 'Review comment' },
        event: { type: 'string', enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'], description: 'Review action' },
        comments: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, body: { type: 'string' }, position: { type: 'number' } } }, description: 'Line-specific comments' },
      },
      required: ['repo', 'pullNumber', 'body', 'event'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const pullNumber = args.pullNumber as number
      const body: Record<string, unknown> = {
        body: args.body,
        event: args.event,
      }
      if (args.comments) body.comments = args.comments
      const result = await restClient.post(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, body)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'get_pull_request_files',
    description: 'Get the list of files changed in a pull request',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        pullNumber: { type: 'number', description: 'PR number' },
      },
      required: ['repo', 'pullNumber'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const pullNumber = args.pullNumber as number
      const result = await restClient.get(`/repos/${owner}/${repo}/pulls/${pullNumber}/files`)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'get_pull_request_commits',
    description: 'Get the list of commits in a pull request',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        pullNumber: { type: 'number', description: 'PR number' },
      },
      required: ['repo', 'pullNumber'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const pullNumber = args.pullNumber as number
      const result = await restClient.get(`/repos/${owner}/${repo}/pulls/${pullNumber}/commits`)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'close_pull_request',
    description: 'Close a pull request without merging',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        pullNumber: { type: 'number', description: 'PR number' },
      },
      required: ['repo', 'pullNumber'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const pullNumber = args.pullNumber as number
      const result = await restClient.patch(`/repos/${owner}/${repo}/pulls/${pullNumber}`, { state: 'closed' })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'reopen_pull_request',
    description: 'Reopen a closed pull request',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        pullNumber: { type: 'number', description: 'PR number' },
      },
      required: ['repo', 'pullNumber'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const pullNumber = args.pullNumber as number
      const result = await restClient.patch(`/repos/${owner}/${repo}/pulls/${pullNumber}`, { state: 'open' })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
]
