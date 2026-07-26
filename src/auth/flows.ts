import { createSign, createPrivateKey } from 'node:crypto'

const GITHUB_HOST = 'https://github.com'
const GITHUB_API = 'https://api.github.com'

export class DeviceFlowPendingError extends Error {
  constructor() {
    super('Authorization pending')
    this.name = 'DeviceFlowPendingError'
  }
}

export class DeviceFlowSlowDownError extends Error {
  constructor() {
    super('Slow down')
    this.name = 'DeviceFlowSlowDownError'
  }
}

export interface DeviceCodeResponse {
  deviceCode: string
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
  expiresIn: number
  interval: number
}

export async function startDeviceFlow(clientId: string, scopes: string[]): Promise<DeviceCodeResponse> {
  const res = await fetch(`${GITHUB_HOST}/login/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, scope: scopes.join(' ') }),
  })
  if (!res.ok) {
    throw new Error(`Device code request failed: ${res.status} ${await res.text()}`)
  }
  const d = (await res.json()) as Record<string, unknown>
  return {
    deviceCode: d.device_code as string,
    userCode: d.user_code as string,
    verificationUri: d.verification_uri as string,
    verificationUriComplete: d.verification_uri_complete as string | undefined,
    expiresIn: d.expires_in as number,
    interval: d.interval as number,
  }
}

export async function pollDeviceFlow(clientId: string, deviceCode: string): Promise<string> {
  const res = await fetch(`${GITHUB_HOST}/login/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
      client_id: clientId,
    }),
  })
  const d = (await res.json()) as Record<string, unknown>
  if (res.status === 200 && d.access_token) {
    return d.access_token as string
  }
  const error = d.error as string | undefined
  if (error === 'authorization_pending') throw new DeviceFlowPendingError()
  if (error === 'slow_down') throw new DeviceFlowSlowDownError()
  if (error === 'expired_token') throw new Error('Device code expired. Please restart the login flow.')
  if (error === 'access_denied') throw new Error('Authorization denied by the user.')
  throw new Error(`OAuth device flow failed: ${error ?? res.status}`)
}

export async function exchangeWebCode(clientId: string, clientSecret: string, code: string): Promise<string> {
  const res = await fetch(`${GITHUB_HOST}/login/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  })
  const d = (await res.json()) as Record<string, unknown>
  if (!res.ok || !d.access_token) {
    throw new Error(`OAuth web flow failed: ${(d.error as string) ?? res.status}`)
  }
  return d.access_token as string
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url')
}

export function buildAppJwt(appId: string, privateKey: string): string {
  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = { iat: now - 60, exp: now + 540, iss: appId }
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const keyObject = createPrivateKey(privateKey)
  const signature = createSign('RSA-SHA256').update(signingInput).sign(keyObject, 'base64url')
  return `${signingInput}.${signature}`
}

export async function getInstallationToken(
  appId: string,
  privateKey: string,
  installationId?: string | number,
): Promise<string> {
  const jwt = buildAppJwt(appId, privateKey)
  const authHeader = { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github+json' }

  let installId = installationId
  if (!installId) {
    const res = await fetch(`${GITHUB_API}/app/installations`, { headers: authHeader })
    if (!res.ok) {
      throw new Error(`Listing installations failed: ${res.status} ${await res.text()}`)
    }
    const installs = (await res.json()) as Array<{ id: number }>
    if (installs.length === 0) {
      throw new Error('No GitHub App installations found for this app')
    }
    installId = installs[0].id
  }

  const res = await fetch(`${GITHUB_API}/app/installations/${installId}/access_tokens`, {
    method: 'POST',
    headers: authHeader,
  })
  if (!res.ok) {
    throw new Error(`Creating installation token failed: ${res.status} ${await res.text()}`)
  }
  const d = (await res.json()) as Record<string, unknown>
  return d.token as string
}
