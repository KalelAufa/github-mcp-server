import type { ToolDefinition } from '../types/index.js'
import { restClient } from '../api/rest.js'
import { ValidationError } from '../utils/errors.js'
import { resolveOwner } from '../utils/helpers.js'

export const fileTools: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read a file from a GitHub repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'File path' },
        ref: { type: 'string', description: 'Branch, tag, or commit SHA' },
      },
      required: ['repo', 'path'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const path = args.path as string
      const ref = args.ref as string | undefined
      const result = await restClient.getContents(owner, repo, path, ref)

      if (Array.isArray(result)) {
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }

      const data = result as Record<string, string>
      if (data.content && data.encoding === 'base64') {
        const decoded = Buffer.from(data.content, 'base64').toString('utf-8')
        return {
          content: [
            { type: 'text', text: `File: ${data.path}\nSHA: ${data.sha}\nSize: ${data.size} bytes\n\n${decoded}` },
          ],
        }
      }

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'create_file',
    description: 'Create a new file in a GitHub repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'File path' },
        content: { type: 'string', description: 'File content' },
        message: { type: 'string', description: 'Commit message' },
        branch: { type: 'string', description: 'Branch name' },
      },
      required: ['repo', 'path', 'content', 'message'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const path = args.path as string
      const content = args.content as string
      const message = args.message as string
      const branch = args.branch as string | undefined
      const result = await restClient.createOrUpdateFile(owner, repo, path, content, message, undefined, branch)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'update_file',
    description: 'Update an existing file in a GitHub repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'File path' },
        content: { type: 'string', description: 'New file content' },
        message: { type: 'string', description: 'Commit message' },
        sha: { type: 'string', description: 'Current file SHA (from read_file)' },
        branch: { type: 'string', description: 'Branch name' },
      },
      required: ['repo', 'path', 'content', 'message', 'sha'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const path = args.path as string
      const content = args.content as string
      const message = args.message as string
      const sha = args.sha as string
      const branch = args.branch as string | undefined
      const result = await restClient.createOrUpdateFile(owner, repo, path, content, message, sha, branch)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file from a GitHub repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'File path' },
        message: { type: 'string', description: 'Commit message' },
        sha: { type: 'string', description: 'Current file SHA' },
        branch: { type: 'string', description: 'Branch name' },
      },
      required: ['repo', 'path', 'message', 'sha'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const path = args.path as string
      const message = args.message as string
      const sha = args.sha as string
      const branch = args.branch as string | undefined
      const result = await restClient.deleteFile(owner, repo, path, message, sha, branch)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'get_repository_contents',
    description: 'List contents of a directory in a repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'Directory path (default: root)' },
        ref: { type: 'string', description: 'Branch, tag, or commit SHA' },
      },
      required: ['repo'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const path = (args.path as string) || ''
      const ref = args.ref as string | undefined
      const result = await restClient.getContents(owner, repo, path, ref)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'compare_files',
    description: 'Compare two commits, branches, or tags',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        base: { type: 'string', description: 'Base ref (branch/tag/commit)' },
        head: { type: 'string', description: 'Head ref (branch/tag/commit)' },
      },
      required: ['repo', 'base', 'head'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const base = args.base as string
      const head = args.head as string
      const result = await restClient.get(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
]
