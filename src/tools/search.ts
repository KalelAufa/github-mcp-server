import type { ToolDefinition } from '../types/index.js'
import { restClient } from '../api/rest.js'
import { graphqlClient } from '../api/graphql.js'

export const searchTools: ToolDefinition[] = [
  {
    name: 'search_repositories',
    description: 'Search repositories using GitHub search syntax',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g., "language:typescript stars:>1000")' },
        limit: { type: 'number', description: 'Max results' },
      },
      required: ['query'],
    },
    handler: async (args) => {
      const result = await graphqlClient.search('repository', args.query as string, (args.limit as number) || 20)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'search_issues',
    description: 'Search issues and pull requests using GitHub search syntax',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g., "is:issue is:open label:bug")' },
        limit: { type: 'number', description: 'Max results' },
      },
      required: ['query'],
    },
    handler: async (args) => {
      const result = await graphqlClient.search('issue', args.query as string, (args.limit as number) || 20)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'search_code',
    description: 'Search code across GitHub repositories',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Code search query' },
        limit: { type: 'number', description: 'Max results' },
      },
      required: ['query'],
    },
    handler: async (args) => {
      const limit = (args.limit as number) || 20
      const result = await restClient.get('/search/code', { q: args.query, per_page: limit })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'search_users',
    description: 'Search GitHub users',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'User search query' },
        limit: { type: 'number', description: 'Max results' },
      },
      required: ['query'],
    },
    handler: async (args) => {
      const limit = (args.limit as number) || 20
      const result = await restClient.get('/search/users', { q: args.query, per_page: limit })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'github_graphql_query',
    description: 'Execute a custom GitHub GraphQL query',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'GraphQL query string' },
        variables: { type: 'object', description: 'Query variables', additionalProperties: true },
      },
      required: ['query'],
    },
    handler: async (args) => {
      const result = await graphqlClient.query(args.query as string, (args.variables as Record<string, unknown>) || {})
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'github_rest_api',
    description: 'Call any GitHub REST API endpoint directly',
    inputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'], description: 'HTTP method' },
        endpoint: { type: 'string', description: 'API endpoint (e.g., /repos/owner/repo)' },
        params: { type: 'object', description: 'Request parameters/body', additionalProperties: true },
      },
      required: ['method', 'endpoint'],
    },
    handler: async (args) => {
      const method = args.method as 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
      const endpoint = args.endpoint as string
      const params = (args.params as Record<string, unknown>) || {}
      const result = await restClient.request(method, endpoint, params)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
]
