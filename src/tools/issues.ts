import type { ToolDefinition } from '../types/index.js'
import { restClient } from '../api/rest.js'
import { resolveOwner } from '../utils/helpers.js'

export const issueTools: ToolDefinition[] = [
  {
    name: 'create_issue',
    description: 'Create an issue in a repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        title: { type: 'string', description: 'Issue title' },
        body: { type: 'string', description: 'Issue body/description' },
        assignees: { type: 'array', items: { type: 'string' }, description: 'Usernames to assign' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Label names' },
        milestone: { type: 'number', description: 'Milestone number' },
      },
      required: ['repo', 'title'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const body: Record<string, unknown> = {
        title: args.title,
        body: (args.body as string) || '',
      }
      if (args.assignees) body.assignees = args.assignees
      if (args.labels) body.labels = args.labels
      if (args.milestone !== undefined) body.milestone = args.milestone
      const result = await restClient.post(`/repos/${owner}/${repo}/issues`, body)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'update_issue',
    description: 'Update an issue',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        issueNumber: { type: 'number', description: 'Issue number' },
        title: { type: 'string', description: 'New title' },
        body: { type: 'string', description: 'New body' },
        state: { type: 'string', enum: ['open', 'closed'], description: 'New state' },
        assignees: { type: 'array', items: { type: 'string' }, description: 'Usernames to assign' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Label names' },
        milestone: { type: 'number', description: 'Milestone number' },
      },
      required: ['repo', 'issueNumber'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const issueNumber = args.issueNumber as number
      const body: Record<string, unknown> = {}
      if (args.title) body.title = args.title
      if (args.body !== undefined) body.body = args.body
      if (args.state) body.state = args.state
      if (args.assignees) body.assignees = args.assignees
      if (args.labels) body.labels = args.labels
      if (args.milestone !== undefined) body.milestone = args.milestone
      const result = await restClient.patch(`/repos/${owner}/${repo}/issues/${issueNumber}`, body)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'get_issue',
    description: 'Get issue details',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        issueNumber: { type: 'number', description: 'Issue number' },
      },
      required: ['repo', 'issueNumber'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const issueNumber = args.issueNumber as number
      const result = await restClient.get(`/repos/${owner}/${repo}/issues/${issueNumber}`)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'list_issues',
    description: 'List issues in a repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state' },
        labels: { type: 'string', description: 'Comma-separated label names' },
        sort: { type: 'string', enum: ['created', 'updated', 'comments'], description: 'Sort field' },
        direction: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction' },
        since: { type: 'string', description: 'ISO 8601 date filter' },
        perPage: { type: 'number', description: 'Results per page' },
      },
      required: ['repo'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const params: Record<string, unknown> = {
        state: (args.state as string) || 'open',
        sort: (args.sort as string) || 'created',
        direction: (args.direction as string) || 'desc',
        per_page: (args.perPage as number) || 30,
      }
      if (args.labels) params.labels = args.labels
      if (args.since) params.since = args.since
      const result = await restClient.get(`/repos/${owner}/${repo}/issues`, params)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'comment_on_issue',
    description: 'Add a comment to an issue or pull request',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        issueNumber: { type: 'number', description: 'Issue or PR number' },
        body: { type: 'string', description: 'Comment text' },
      },
      required: ['repo', 'issueNumber', 'body'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const issueNumber = args.issueNumber as number
      const body = args.body as string
      const result = await restClient.post(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, { body })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'close_issue',
    description: 'Close an issue',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        issueNumber: { type: 'number', description: 'Issue number' },
      },
      required: ['repo', 'issueNumber'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const issueNumber = args.issueNumber as number
      const result = await restClient.patch(`/repos/${owner}/${repo}/issues/${issueNumber}`, { state: 'closed' })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'reopen_issue',
    description: 'Reopen a closed issue',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        issueNumber: { type: 'number', description: 'Issue number' },
      },
      required: ['repo', 'issueNumber'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const issueNumber = args.issueNumber as number
      const result = await restClient.patch(`/repos/${owner}/${repo}/issues/${issueNumber}`, { state: 'open' })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'list_issue_comments',
    description: 'List comments on an issue or pull request',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        issueNumber: { type: 'number', description: 'Issue or PR number' },
      },
      required: ['repo', 'issueNumber'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const issueNumber = args.issueNumber as number
      const result = await restClient.get(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'manage_labels',
    description: 'Create, update, or delete labels in a repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        action: { type: 'string', enum: ['create', 'update', 'delete', 'list'], description: 'Action to perform' },
        name: { type: 'string', description: 'Label name' },
        color: { type: 'string', description: 'Hex color code (for create/update)' },
        description: { type: 'string', description: 'Label description' },
        newName: { type: 'string', description: 'New name (for update)' },
      },
      required: ['repo', 'action'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const action = args.action as string
      const name = args.name as string | undefined

      if (action === 'list') {
        const result = await restClient.get(`/repos/${owner}/${repo}/labels`)
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }
      if (!name) return { content: [{ type: 'text', text: 'Label name is required' }], isError: true }

      if (action === 'create') {
        const result = await restClient.post(`/repos/${owner}/${repo}/labels`, {
          name,
          color: (args.color as string) || 'ededed',
          description: (args.description as string) || '',
        })
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }
      if (action === 'update') {
        const body: Record<string, unknown> = {}
        if (args.color) body.color = args.color
        if (args.description) body.description = args.description
        if (args.newName) body.new_name = args.newName
        const result = await restClient.patch(`/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`, body)
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }
      if (action === 'delete') {
        await restClient.del(`/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`)
        return { content: [{ type: 'text', text: `Label '${name}' deleted` }] }
      }
      return { content: [{ type: 'text', text: `Unknown action: ${action}` }], isError: true }
    },
  },
  {
    name: 'manage_milestones',
    description: 'Create, update, or list milestones',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        action: { type: 'string', enum: ['create', 'update', 'list'], description: 'Action' },
        title: { type: 'string', description: 'Milestone title' },
        description: { type: 'string', description: 'Milestone description' },
        dueOn: { type: 'string', description: 'Due date (ISO 8601)' },
        state: { type: 'string', enum: ['open', 'closed'], description: 'Milestone state' },
        number: { type: 'number', description: 'Milestone number (for update)' },
      },
      required: ['repo', 'action'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const action = args.action as string

      if (action === 'list') {
        const result = await restClient.get(`/repos/${owner}/${repo}/milestones`, {
          state: (args.state as string) || 'open',
        })
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }
      if (action === 'create') {
        if (!args.title) return { content: [{ type: 'text', text: 'Title is required' }], isError: true }
        const body: Record<string, unknown> = { title: args.title }
        if (args.description) body.description = args.description
        if (args.dueOn) body.due_on = args.dueOn
        const result = await restClient.post(`/repos/${owner}/${repo}/milestones`, body)
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }
      if (action === 'update') {
        const number = args.number as number
        if (!number) return { content: [{ type: 'text', text: 'Milestone number is required' }], isError: true }
        const body: Record<string, unknown> = {}
        if (args.title) body.title = args.title
        if (args.description) body.description = args.description
        if (args.dueOn) body.due_on = args.dueOn
        if (args.state) body.state = args.state
        const result = await restClient.patch(`/repos/${owner}/${repo}/milestones/${number}`, body)
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }
      return { content: [{ type: 'text', text: `Unknown action: ${action}` }], isError: true }
    },
  },
]
