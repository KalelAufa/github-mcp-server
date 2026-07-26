import type { ToolDefinition } from '../types/index.js'
import { restClient } from '../api/rest.js'
import { resolveOwner } from '../utils/helpers.js'

export const actionTools: ToolDefinition[] = [
  {
    name: 'list_workflows',
    description: 'List GitHub Actions workflows in a repository',
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
      const result = await restClient.get(`/repos/${owner}/${repo}/actions/workflows`)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'dispatch_workflow',
    description: 'Trigger a workflow_dispatch event for a GitHub Actions workflow',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        workflowId: { type: 'string', description: 'Workflow ID or filename' },
        ref: { type: 'string', description: 'Branch, tag, or SHA to run on (default: default_branch)' },
        inputs: { type: 'object', description: 'Workflow inputs (JSON object)', additionalProperties: true },
      },
      required: ['repo', 'workflowId', 'ref'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const workflowId = args.workflowId as string
      const ref = args.ref as string
      const body: Record<string, unknown> = { ref }
      if (args.inputs) body.inputs = args.inputs
      await restClient.post(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, body)
      return { content: [{ type: 'text', text: `Workflow '${workflowId}' dispatched on ${ref}` }] }
    },
  },
  {
    name: 'list_workflow_runs',
    description: 'List workflow runs for a workflow or repository',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        workflowId: { type: 'string', description: 'Workflow ID or filename (optional)' },
        branch: { type: 'string', description: 'Filter by branch' },
        status: { type: 'string', enum: ['completed', 'in_progress', 'queued', 'requested', 'waiting'], description: 'Filter by status' },
        event: { type: 'string', description: 'Filter by event (e.g., push, pull_request)' },
        perPage: { type: 'number', description: 'Results per page' },
      },
      required: ['repo'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const workflowId = args.workflowId as string | undefined
      const params: Record<string, unknown> = { per_page: (args.perPage as number) || 20 }
      if (args.branch) params.branch = args.branch
      if (args.status) params.status = args.status
      if (args.event) params.event = args.event

      const base = workflowId
        ? `/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs`
        : `/repos/${owner}/${repo}/actions/runs`
      const result = await restClient.get(base, params)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'get_workflow_run',
    description: 'Get details of a specific workflow run',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        runId: { type: 'number', description: 'Workflow run ID' },
      },
      required: ['repo', 'runId'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const runId = args.runId as number
      const result = await restClient.get(`/repos/${owner}/${repo}/actions/runs/${runId}`)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'rerun_workflow',
    description: 'Re-run a workflow run',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        runId: { type: 'number', description: 'Workflow run ID' },
        failedOnly: { type: 'boolean', description: 'Only re-run failed jobs' },
      },
      required: ['repo', 'runId'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const runId = args.runId as number
      if (args.failedOnly) {
        await restClient.post(`/repos/${owner}/${repo}/actions/runs/${runId}/rerun-failed-jobs`)
      } else {
        await restClient.post(`/repos/${owner}/${repo}/actions/runs/${runId}/rerun`)
      }
      return { content: [{ type: 'text', text: `Workflow run ${runId} re-triggered` }] }
    },
  },
  {
    name: 'cancel_workflow_run',
    description: 'Cancel a workflow run',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        runId: { type: 'number', description: 'Workflow run ID' },
      },
      required: ['repo', 'runId'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const runId = args.runId as number
      await restClient.post(`/repos/${owner}/${repo}/actions/runs/${runId}/cancel`)
      return { content: [{ type: 'text', text: `Workflow run ${runId} cancelled` }] }
    },
  },
  {
    name: 'get_workflow_logs',
    description: 'Get workflow run logs (download URL)',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        runId: { type: 'number', description: 'Workflow run ID' },
      },
      required: ['repo', 'runId'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const runId = args.runId as number
      const result = await restClient.get(`/repos/${owner}/${repo}/actions/runs/${runId}/logs`)
      return {
        content: [{
          type: 'text',
          text: `Logs download URL: ${(result as Record<string, unknown>).url || 'Use the Location header from the response'}`,
        }],
      }
    },
  },
  {
    name: 'list_workflow_artifacts',
    description: 'List artifacts from a workflow run',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        runId: { type: 'number', description: 'Workflow run ID' },
      },
      required: ['repo', 'runId'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const runId = args.runId as number
      const result = await restClient.get(`/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
]
