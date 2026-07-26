import type { ToolDefinition } from '../types/index.js'
import { restClient } from '../api/rest.js'
import { resolveOwner } from '../utils/helpers.js'

export const branchTools: ToolDefinition[] = [
  {
    name: 'create_branch',
    description: 'Create a new branch in a repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        branch: { type: 'string', description: 'New branch name' },
        fromRef: { type: 'string', description: 'Source branch/tag/commit (default: default branch)' },
      },
      required: ['repo', 'branch'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const branch = args.branch as string
      const fromRef = (args.fromRef as string) || 'HEAD'

      const repoData = await restClient.getRepo(owner, repo)
      const defaultBranch = (repoData.default_branch as string) || 'main'
      const ref = fromRef === 'HEAD' ? `heads/${defaultBranch}` : `heads/${fromRef}`

      const refData = await restClient.get(`/repos/${owner}/${repo}/git/ref/${ref}`)
      const sha = (refData as { object: { sha: string } }).object.sha

      const result = await restClient.post(`/repos/${owner}/${repo}/git/refs`, {
        ref: `refs/heads/${branch}`,
        sha,
      })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'delete_branch',
    description: 'Delete a branch from a repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        branch: { type: 'string', description: 'Branch name to delete' },
      },
      required: ['repo', 'branch'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const branch = args.branch as string
      await restClient.del(`/repos/${owner}/${repo}/git/refs/heads/${branch}`)
      return { content: [{ type: 'text', text: `Branch '${branch}' deleted from ${owner}/${repo}` }] }
    },
  },
  {
    name: 'rename_branch',
    description: 'Rename a branch in a repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        branch: { type: 'string', description: 'Current branch name' },
        newName: { type: 'string', description: 'New branch name' },
      },
      required: ['repo', 'branch', 'newName'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const branch = args.branch as string
      const newName = args.newName as string
      const repoData = await restClient.getRepo(owner, repo)
      const result = await restClient.patch(`/repos/${owner}/${repo}/branches/${branch}/rename`, { new_name: newName })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'protect_branch',
    description: 'Add branch protection rules',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        branch: { type: 'string', description: 'Branch name' },
        requiredApprovingReviewCount: { type: 'number', description: 'Required reviews' },
        dismissStaleReviews: { type: 'boolean' },
        requireCodeOwnerReview: { type: 'boolean' },
        enforceAdmins: { type: 'boolean' },
        requireLinearHistory: { type: 'boolean' },
        requiredStatusChecks: { type: 'array', items: { type: 'string' }, description: 'Required status check contexts' },
      },
      required: ['repo', 'branch'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const branch = args.branch as string
      const protection: Record<string, unknown> = {
        required_status_checks: (args.requiredStatusChecks as string[])?.length
          ? { strict: true, contexts: args.requiredStatusChecks as string[] }
          : null,
        enforce_admins: (args.enforceAdmins as boolean) ?? true,
        required_pull_request_reviews: {
          required_approving_review_count: (args.requiredApprovingReviewCount as number) ?? 1,
          dismiss_stale_reviews: (args.dismissStaleReviews as boolean) ?? false,
          require_code_owner_reviews: (args.requireCodeOwnerReview as boolean) ?? false,
        },
        restrictions: null,
        required_linear_history: (args.requireLinearHistory as boolean) ?? false,
      }
      const result = await restClient.put(`/repos/${owner}/${repo}/branches/${branch}/protection`, protection)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'unprotect_branch',
    description: 'Remove branch protection rules',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        branch: { type: 'string', description: 'Branch name' },
      },
      required: ['repo', 'branch'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const branch = args.branch as string
      await restClient.del(`/repos/${owner}/${repo}/branches/${branch}/protection`)
      return { content: [{ type: 'text', text: `Protection removed from '${branch}' in ${owner}/${repo}` }] }
    },
  },
  {
    name: 'compare_branches',
    description: 'Compare two branches',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        base: { type: 'string', description: 'Base branch' },
        head: { type: 'string', description: 'Head branch' },
      },
      required: ['repo', 'base', 'head'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const base = args.base as string
      const head = args.head as string
      const result = await restClient.get(`/repos/${owner}/${repo}/compare/${base}...${head}`)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
]
