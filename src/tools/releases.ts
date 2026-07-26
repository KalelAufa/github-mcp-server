import type { ToolDefinition } from '../types/index.js'
import { restClient } from '../api/rest.js'
import { authManager } from '../auth/index.js'
import { GitHubMcpError } from '../utils/errors.js'
import { resolveOwner } from '../utils/helpers.js'

export const releaseTools: ToolDefinition[] = [
  {
    name: 'create_release',
    description: 'Create a new release',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        tagName: { type: 'string', description: 'Git tag name' },
        targetCommitish: { type: 'string', description: 'Branch or commit SHA' },
        name: { type: 'string', description: 'Release name' },
        body: { type: 'string', description: 'Release description' },
        draft: { type: 'boolean', description: 'Create as draft' },
        prerelease: { type: 'boolean', description: 'Mark as prerelease' },
        generateReleaseNotes: { type: 'boolean', description: 'Auto-generate release notes' },
      },
      required: ['repo', 'tagName'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const body: Record<string, unknown> = {
        tag_name: args.tagName,
        name: (args.name as string) || (args.tagName as string),
        body: (args.body as string) || '',
        draft: (args.draft as boolean) || false,
        prerelease: (args.prerelease as boolean) || false,
        generate_release_notes: (args.generateReleaseNotes as boolean) || false,
      }
      if (args.targetCommitish) body.target_commitish = args.targetCommitish
      const result = await restClient.post(`/repos/${owner}/${repo}/releases`, body)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'get_release',
    description: 'Get release details',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        releaseId: { type: 'number', description: 'Release ID (optional)' },
        tag: { type: 'string', description: 'Release tag (alternative to releaseId)' },
      },
      required: ['repo'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      let result: unknown
      if (args.tag) {
        result = await restClient.get(`/repos/${owner}/${repo}/releases/tags/${args.tag}`)
      } else if (args.releaseId) {
        result = await restClient.get(`/repos/${owner}/${repo}/releases/${args.releaseId}`)
      } else {
        result = await restClient.get(`/repos/${owner}/${repo}/releases/latest`)
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'update_release',
    description: 'Update a release',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        releaseId: { type: 'number', description: 'Release ID' },
        name: { type: 'string', description: 'New release name' },
        body: { type: 'string', description: 'New release body' },
        draft: { type: 'boolean', description: 'Draft status' },
        prerelease: { type: 'boolean', description: 'Prerelease status' },
        tagName: { type: 'string', description: 'New tag name' },
      },
      required: ['repo', 'releaseId'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const releaseId = args.releaseId as number
      const body: Record<string, unknown> = {}
      if (args.name) body.name = args.name
      if (args.body !== undefined) body.body = args.body
      if (args.draft !== undefined) body.draft = args.draft
      if (args.prerelease !== undefined) body.prerelease = args.prerelease
      if (args.tagName) body.tag_name = args.tagName
      const result = await restClient.patch(`/repos/${owner}/${repo}/releases/${releaseId}`, body)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'delete_release',
    description: 'Delete a release',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        releaseId: { type: 'number', description: 'Release ID' },
      },
      required: ['repo', 'releaseId'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const releaseId = args.releaseId as number
      await restClient.del(`/repos/${owner}/${repo}/releases/${releaseId}`)
      return { content: [{ type: 'text', text: `Release ${releaseId} deleted` }] }
    },
  },
  {
    name: 'upload_release_asset',
    description: 'Upload an asset to a release',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        releaseId: { type: 'number', description: 'Release ID' },
        name: { type: 'string', description: 'Asset file name' },
        contentType: { type: 'string', description: 'MIME type' },
        data: { type: 'string', description: 'Base64-encoded file data' },
      },
      required: ['repo', 'releaseId', 'name', 'data'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const releaseId = args.releaseId as number
      const name = args.name as string
      const data = args.data as string
      const contentType = (args.contentType as string) || 'application/octet-stream'

      const binary = Buffer.from(data, 'base64')
      const uploadUrl = `https://uploads.github.com/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`

      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authManager.getToken()}`,
          'Content-Type': contentType,
          'Content-Length': String(binary.length),
        },
        body: binary,
      })

      if (!res.ok) {
        const body = await res.text()
        throw new GitHubMcpError(
          `Failed to upload asset (${res.status}): ${body}`,
          'UPLOAD_FAILED',
          res.status,
        )
      }

      const result = await res.json()
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'list_releases',
    description: 'List releases in a repository',
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
      const result = await restClient.get(`/repos/${owner}/${repo}/releases`, { per_page: perPage })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
]
