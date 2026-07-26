import type { ToolDefinition } from '../types/index.js'
import { authManager } from '../auth/index.js'
import * as flows from '../auth/flows.js'
import { restClient } from '../api/rest.js'
import { graphqlClient } from '../api/graphql.js'
import { loadConfig } from '../config/index.js'
import { AuthError } from '../utils/errors.js'

function refreshClients(): void {
  restClient.refreshToken()
  graphqlClient.refreshToken()
}

export const authTools: ToolDefinition[] = [
  {
    name: 'auth_device_login',
    description: 'Start GitHub OAuth Device Flow. Returns a user code + verification URL to authorize, then poll with auth_device_poll.',
    inputSchema: {
      type: 'object',
      properties: {
        scopes: { type: 'array', items: { type: 'string' }, description: 'OAuth scopes (default: ["repo"])' },
      },
    },
    handler: async (args) => {
      const scopes = args.scopes as string[] | undefined
      const resp = await authManager.startDeviceLogin(scopes)
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: 'Open the verification URL, enter the code, then call auth_device_poll.',
            userCode: resp.userCode,
            verificationUri: resp.verificationUri,
            verificationUriComplete: resp.verificationUriComplete,
            pollIntervalSeconds: resp.interval,
          }, null, 2),
        }],
      }
    },
  },
  {
    name: 'auth_device_poll',
    description: 'Poll the OAuth Device Flow for completion after the user authorizes.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const account = await authManager.pollDeviceLogin()
        refreshClients()
        return { content: [{ type: 'text', text: `Device login complete. Active account: ${account.login} (${account.method}).` }] }
      } catch (err) {
        if (err instanceof flows.DeviceFlowPendingError) {
          return { content: [{ type: 'text', text: 'Authorization still pending. Wait a few seconds, then call auth_device_poll again.' }] }
        }
        if (err instanceof flows.DeviceFlowSlowDownError) {
          return { content: [{ type: 'text', text: 'Slow down: wait longer before polling again.' }] }
        }
        throw err
      }
    },
  },
  {
    name: 'auth_web_login',
    description: 'Start GitHub OAuth Web (Authorization Code) Flow. Returns the authorize URL; after authorizing, call auth_web_callback with the code.',
    inputSchema: {
      type: 'object',
      properties: {
        scopes: { type: 'array', items: { type: 'string' }, description: 'OAuth scopes (default: ["repo"])' },
      },
    },
    handler: async (args) => {
      const cfg = loadConfig()
      const clientId = cfg.oauth?.clientId
      if (!clientId) {
        throw new AuthError('OAuth client_id not configured. Set GITHUB_OAUTH_CLIENT_ID.')
      }
      const scope = (args.scopes as string[] | undefined) ?? cfg.oauth?.scopes ?? ['repo']
      const state = authManager.generateWebLoginState()
      const url = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scope.join(' '))}&state=${encodeURIComponent(state)}`
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: 'Open the URL, authorize, then call auth_web_callback with the ?code= and ?state= values from the redirect.',
            authorizeUrl: url,
          }, null, 2),
        }],
      }
    },
  },
  {
    name: 'auth_web_callback',
    description: 'Complete the OAuth Web Flow. Pass both code and state from the redirect URL.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Authorization code from the redirect URL' },
        state: { type: 'string', description: 'State parameter from the redirect URL (CSRF protection)' },
      },
      required: ['code', 'state'],
    },
    handler: async (args) => {
      const account = await authManager.completeWebLogin(args.code as string, args.state as string)
      refreshClients()
      return { content: [{ type: 'text', text: `Web login complete. Active account: ${account.login} (${account.method}).` }] }
    },
  },
  {
    name: 'auth_app_login',
    description: 'Authenticate as a GitHub App: generate a JWT from the app private key and exchange it for an installation token.',
    inputSchema: {
      type: 'object',
      properties: {
        installationId: { type: 'string', description: 'Installation ID (optional; uses configured/default installation)' },
      },
    },
    handler: async (args) => {
      const installationId = args.installationId as string | number | undefined
      const account = await authManager.addAppLogin(installationId)
      refreshClients()
      return { content: [{ type: 'text', text: `GitHub App login complete. Active account: ${account.login} (${account.method}).` }] }
    },
  },
  {
    name: 'auth_status',
    description: 'Show the currently active account (without exposing the token).',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const acc = authManager.getActiveAccount()
      if (!acc) {
        return { content: [{ type: 'text', text: 'No active account. Use env GITHUB_TOKEN or an auth_*_login tool.' }] }
      }
      return { content: [{ type: 'text', text: JSON.stringify({ login: acc.login, method: acc.method, active: acc.active }, null, 2) }] }
    },
  },
  {
    name: 'auth_list_accounts',
    description: 'List all stored accounts (tokens hidden).',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const accounts = authManager.listAccounts()
      return { content: [{ type: 'text', text: JSON.stringify(accounts, null, 2) }] }
    },
  },
  {
    name: 'auth_switch_account',
    description: 'Switch the active account by id.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Account id from auth_list_accounts' },
      },
      required: ['accountId'],
    },
    handler: async (args) => {
      const account = authManager.switchAccount(args.accountId as string)
      if (!account) throw new AuthError(`Account not found: ${args.accountId}`)
      refreshClients()
      return { content: [{ type: 'text', text: `Switched to account: ${account.login} (${account.method}).` }] }
    },
  },
  {
    name: 'auth_logout',
    description: 'Remove an account (or the active account if accountId omitted).',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Account id to remove (optional)' },
      },
    },
    handler: async (args) => {
      const id = args.accountId as string | undefined
      if (id) {
        authManager.removeAccount(id)
      } else {
        const active = authManager.getActiveAccount()
        if (active) authManager.removeAccount(active.id)
      }
      refreshClients()
      return { content: [{ type: 'text', text: 'Account removed.' }] }
    },
  },
]
