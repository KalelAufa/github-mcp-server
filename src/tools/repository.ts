import { z } from 'zod'
import type { ToolDefinition } from '../types/index.js'
import { restClient } from '../api/rest.js'
import { gitService } from '../services/git.js'
import { parseRepoFullName, resolveOwner } from '../utils/helpers.js'
import { ValidationError } from '../utils/errors.js'
import { loadConfig } from '../config/index.js'

const config = loadConfig()

function resolveRepo(repo?: string): string {
  return repo || config.defaultRepo || ''
}

export const repositoryTools: ToolDefinition[] = [
  {
    name: 'create_repository',
    description: 'Create a new GitHub repository',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Repository name' },
        description: { type: 'string', description: 'Repository description' },
        private: { type: 'boolean', description: 'Whether the repo is private' },
        owner: { type: 'string', description: 'Organization name (omit for personal)' },
        autoInit: { type: 'boolean', description: 'Initialize with README' },
        gitignoreTemplate: { type: 'string', description: 'Gitignore template' },
        licenseTemplate: { type: 'string', description: 'License template' },
      },
      required: ['name'],
    },
    handler: async (args) => {
      const { name, description, private: isPrivate, owner, autoInit, gitignoreTemplate, licenseTemplate } = args as {
        name: string
        description?: string
        private?: boolean
        owner?: string
        autoInit?: boolean
        gitignoreTemplate?: string
        licenseTemplate?: string
      }
      const result = await restClient.createRepo(name, {
        owner: owner || undefined,
        description: description || '',
        private: isPrivate ?? false,
        autoInit: autoInit ?? false,
        gitignoreTemplate,
        licenseTemplate,
      })
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      }
    },
  },
  {
    name: 'delete_repository',
    description: 'Delete a GitHub repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
      },
      required: ['repo'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      await restClient.del(`/repos/${owner}/${repo}`)
      return { content: [{ type: 'text', text: `Repository ${owner}/${repo} deleted successfully` }] }
    },
  },
  {
    name: 'get_repository',
    description: 'Get repository details',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
      },
      required: ['repo'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const result = await restClient.getRepo(owner, repo)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'list_repositories',
    description: 'List repositories for a user or organization',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'User or organization name' },
        type: { type: 'string', enum: ['all', 'owner', 'public', 'private', 'member'], description: 'Type of repos' },
        sort: { type: 'string', enum: ['created', 'updated', 'pushed', 'full_name'], description: 'Sort field' },
        direction: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction' },
        perPage: { type: 'number', description: 'Results per page (max 100)' },
      },
    },
    handler: async (args) => {
      const owner = (args.owner as string | undefined) || config.defaultOwner
      const type = (args.type as string) || 'owner'
      const sort = (args.sort as string) || 'updated'
      const direction = (args.direction as string) || 'desc'
      const perPage = (args.perPage as number) || 30

      if (owner) {
        const result = await restClient.get(`/orgs/${encodeURIComponent(owner)}/repos`, { type, sort, direction, per_page: perPage })
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }
      const result = await restClient.get('/user/repos', { type, sort, direction, per_page: perPage })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'fork_repository',
    description: 'Fork a repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        organization: { type: 'string', description: 'Organization to fork to' },
      },
      required: ['owner', 'repo'],
    },
    handler: async (args) => {
      const { owner, repo, organization } = args as { owner: string; repo: string; organization?: string }
      const params: Record<string, unknown> = {}
      if (organization) params.organization = organization
      const result = await restClient.post(`/repos/${owner}/${repo}/forks`, params)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'rename_repository',
    description: 'Rename a repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Current repository name' },
        newName: { type: 'string', description: 'New repository name' },
      },
      required: ['repo', 'newName'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const newName = args.newName as string
      const result = await restClient.patch(`/repos/${owner}/${repo}`, { name: newName })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'archive_repository',
    description: 'Archive a repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
      },
      required: ['repo'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const result = await restClient.patch(`/repos/${owner}/${repo}`, { archived: true })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'unarchive_repository',
    description: 'Unarchive a repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
      },
      required: ['repo'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const result = await restClient.patch(`/repos/${owner}/${repo}`, { archived: false })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'transfer_repository',
    description: 'Transfer a repository to another user or organization',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Current repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        newOwner: { type: 'string', description: 'New owner (user or organization)' },
      },
      required: ['repo', 'newOwner'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const newOwner = args.newOwner as string
      const result = await restClient.post(`/repos/${owner}/${repo}/transfer`, { new_owner: newOwner })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'clone_repository',
    description: 'Clone a repository to local filesystem',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        url: { type: 'string', description: 'Full clone URL (overrides owner/repo)' },
        depth: { type: 'number', description: 'Clone depth (omit for full clone)' },
      },
      required: [],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      let url = args.url as string
      if (!url && owner && repo) {
        url = `https://github.com/${owner}/${repo}.git`
      }
      if (!url) throw new ValidationError('Either owner+repo or url must be provided')

      const depth = args.depth as number | undefined
      const cloneDir = depth ? await gitService.clone(url) : await gitService.fullClone(url)
      return { content: [{ type: 'text', text: `Repository cloned to: ${cloneDir}` }] }
    },
  },
  {
    name: 'get_repository_topics',
    description: 'Get repository topics',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
      },
      required: ['repo'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const result = await restClient.get(`/repos/${owner}/${repo}/topics`)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'update_repository_topics',
    description: 'Replace all repository topics',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        names: { type: 'array', items: { type: 'string' }, description: 'Topic names' },
      },
      required: ['repo', 'names'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const names = args.names as string[]
      const result = await restClient.put(`/repos/${owner}/${repo}/topics`, { names })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'get_repository_stats',
    description: 'Get repository statistics (traffic, clones, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
      },
      required: ['repo'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const [views, clones, referrers, paths] = await Promise.all([
        restClient.get(`/repos/${owner}/${repo}/traffic/views`).catch(() => null),
        restClient.get(`/repos/${owner}/${repo}/traffic/clones`).catch(() => null),
        restClient.get(`/repos/${owner}/${repo}/traffic/popular/referrers`).catch(() => null),
        restClient.get(`/repos/${owner}/${repo}/traffic/popular/paths`).catch(() => null),
      ])
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ views, clones, referrers, paths }, null, 2),
        }],
      }
    },
  },
  {
    name: 'list_languages',
    description: 'List repository languages',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
      },
      required: ['repo'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const result = await restClient.get(`/repos/${owner}/${repo}/languages`)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'list_tags',
    description: 'List repository tags',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        perPage: { type: 'number', description: 'Results per page' },
      },
      required: ['repo'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const perPage = (args.perPage as number) || 30
      const result = await restClient.get(`/repos/${owner}/${repo}/tags`, { per_page: perPage })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'list_branches',
    description: 'List repository branches',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
      },
      required: ['repo'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const result = await restClient.get(`/repos/${owner}/${repo}/branches`)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
]
