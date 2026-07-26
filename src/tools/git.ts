import type { ToolDefinition } from '../types/index.js'
import { gitService } from '../services/git.js'
import { loadConfig } from '../config/index.js'

const config = loadConfig()

function resolveCwd(args: Record<string, unknown>): string | undefined {
  const p = args.path as string | undefined
  return p || config.cloneDir
}

export const gitTools: ToolDefinition[] = [
  {
    name: 'git_status',
    description: 'Show working tree status of a locally cloned repository',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Local repository path (default: configured cloneDir)' },
      },
    },
    handler: async (args) => {
      const out = await gitService.status(resolveCwd(args))
      return { content: [{ type: 'text', text: out || 'Working tree clean' }] }
    },
  },
  {
    name: 'git_diff',
    description: 'Show unstaged/staged diff of a local repository',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Local repository path (default: configured cloneDir)' },
        spec: { type: 'string', description: 'Optional pathspec / extra diff args' },
      },
    },
    handler: async (args) => {
      const spec = (args.spec as string) || ''
      const out = await gitService.diff(spec ? spec.split(' ') : [], resolveCwd(args))
      return { content: [{ type: 'text', text: out || 'No diff' }] }
    },
  },
  {
    name: 'git_add',
    description: 'Stage changes in a local repository',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Local repository path (default: configured cloneDir)' },
        pathspec: { type: 'string', description: 'Paths to stage (default: ".")', default: '.' },
      },
    },
    handler: async (args) => {
      const pathspec = (args.pathspec as string) || '.'
      await gitService.add(pathspec, resolveCwd(args))
      return { content: [{ type: 'text', text: `Staged: ${pathspec}` }] }
    },
  },
  {
    name: 'git_commit',
    description: 'Create a commit in a local repository',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Local repository path (default: configured cloneDir)' },
        message: { type: 'string', description: 'Commit message' },
        author: { type: 'string', description: 'Override author (Name <email>)' },
        amend: { type: 'boolean', description: 'Amend the previous commit' },
      },
      required: ['message'],
    },
    handler: async (args) => {
      await gitService.commit(args.message as string, {
        amend: (args.amend as boolean) ?? false,
        author: args.author as string | undefined,
      }, resolveCwd(args))
      return { content: [{ type: 'text', text: `Committed: ${args.message}` }] }
    },
  },
  {
    name: 'git_push',
    description: 'Push commits to a remote',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Local repository path (default: configured cloneDir)' },
        remote: { type: 'string', description: 'Remote name', default: 'origin' },
        branch: { type: 'string', description: 'Branch name', default: 'main' },
        force: { type: 'boolean', description: 'Force push' },
      },
    },
    handler: async (args) => {
      await gitService.push(
        (args.remote as string) || 'origin',
        (args.branch as string) || 'main',
        (args.force as boolean) ?? false,
        resolveCwd(args),
      )
      return { content: [{ type: 'text', text: 'Push complete' }] }
    },
  },
  {
    name: 'git_pull',
    description: 'Pull changes from a remote',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Local repository path (default: configured cloneDir)' },
        remote: { type: 'string', description: 'Remote name', default: 'origin' },
        branch: { type: 'string', description: 'Branch name', default: 'main' },
        rebase: { type: 'boolean', description: 'Use --rebase' },
      },
    },
    handler: async (args) => {
      await gitService.pull(
        (args.remote as string) || 'origin',
        (args.branch as string) || 'main',
        (args.rebase as boolean) ?? false,
        resolveCwd(args),
      )
      return { content: [{ type: 'text', text: 'Pull complete' }] }
    },
  },
  {
    name: 'git_log',
    description: 'Show commit log of a local repository',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Local repository path (default: configured cloneDir)' },
        maxCount: { type: 'number', description: 'Number of commits', default: 10 },
        format: { type: 'string', description: 'git log --format string' },
      },
    },
    handler: async (args) => {
      const out = await gitService.log(
        (args.maxCount as number) || 10,
        args.format as string | undefined,
        resolveCwd(args),
      )
      return { content: [{ type: 'text', text: out || 'No commits' }] }
    },
  },
]
