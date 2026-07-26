import type { ToolDefinition } from '../types/index.js'
import { restClient } from '../api/rest.js'
import { resolveOwner } from '../utils/helpers.js'
import nacl from 'tweetnacl'

export const secretTools: ToolDefinition[] = [
  {
    name: 'list_repository_secrets',
    description: 'List repository secrets (names only)',
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
      const result = await restClient.get(`/repos/${owner}/${repo}/actions/secrets`)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'create_repository_secret',
    description: 'Create or update a repository secret',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        secretName: { type: 'string', description: 'Secret name (uppercase)' },
        value: { type: 'string', description: 'Secret value' },
      },
      required: ['repo', 'secretName', 'value'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const secretName = args.secretName as string
      const value = args.value as string

      const pubKey = await restClient.get(`/repos/${owner}/${repo}/actions/secrets/public-key`)

      const encrypted = encryptSecret(value, (pubKey as { key: string }).key)

      const result = await restClient.put(`/repos/${owner}/${repo}/actions/secrets/${secretName}`, {
        encrypted_value: encrypted,
        key_id: (pubKey as { key_id: string }).key_id,
      })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'delete_repository_secret',
    description: 'Delete a repository secret',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        secretName: { type: 'string', description: 'Secret name' },
      },
      required: ['repo', 'secretName'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const secretName = args.secretName as string
      await restClient.del(`/repos/${owner}/${repo}/actions/secrets/${secretName}`)
      return { content: [{ type: 'text', text: `Secret '${secretName}' deleted` }] }
    },
  },
  {
    name: 'list_organization_secrets',
    description: 'List organization secrets',
    inputSchema: {
      type: 'object',
      properties: {
        org: { type: 'string', description: 'Organization name' },
      },
      required: ['org'],
    },
    handler: async (args) => {
      const org = args.org as string
      const result = await restClient.get(`/orgs/${org}/actions/secrets`)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'list_repository_variables',
    description: 'List repository variables',
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
      const result = await restClient.get(`/repos/${owner}/${repo}/actions/variables`)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'create_repository_variable',
    description: 'Create a repository variable',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        name: { type: 'string', description: 'Variable name' },
        value: { type: 'string', description: 'Variable value' },
      },
      required: ['repo', 'name', 'value'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const name = args.name as string
      const value = args.value as string
      const result = await restClient.post(`/repos/${owner}/${repo}/actions/variables`, { name, value })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  },
  {
    name: 'update_repository_variable',
    description: 'Update a repository variable',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        name: { type: 'string', description: 'Variable name' },
        value: { type: 'string', description: 'New variable value' },
      },
      required: ['repo', 'name', 'value'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const name = args.name as string
      const value = args.value as string
      await restClient.patch(`/repos/${owner}/${repo}/actions/variables/${name}`, { value })
      return { content: [{ type: 'text', text: `Variable '${name}' updated` }] }
    },
  },
  {
    name: 'delete_repository_variable',
    description: 'Delete a repository variable',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        name: { type: 'string', description: 'Variable name' },
      },
      required: ['repo', 'name'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const name = args.name as string
      await restClient.del(`/repos/${owner}/${repo}/actions/variables/${name}`)
      return { content: [{ type: 'text', text: `Variable '${name}' deleted` }] }
    },
  },
]

function encryptSecret(value: string, key: string): string {
  const publicKey = Buffer.from(key, 'base64')
  const keypair = nacl.box.keyPair()
  const messageBytes = Buffer.from(value, 'utf-8')
  const nonce = new Uint8Array(nacl.box.nonceLength)
  const encrypted = nacl.box(messageBytes, nonce, publicKey, keypair.secretKey)
  const sealed = new Uint8Array(keypair.publicKey.length + encrypted.length)
  sealed.set(keypair.publicKey, 0)
  sealed.set(encrypted, keypair.publicKey.length)
  return Buffer.from(sealed).toString('base64')
}
