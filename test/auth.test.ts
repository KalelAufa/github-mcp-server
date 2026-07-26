import { describe, it, expect } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { buildAppJwt } from '../src/auth/flows.ts'

describe('GitHub App JWT', () => {
  it('produces a valid 3-part RS256 JWT signed with the app private key', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const appId = '12345'
    const jwt = buildAppJwt(appId, privateKey.export({ type: 'pkcs1', format: 'pem' }) as string)

    const parts = jwt.split('.')
    expect(parts.length).toBe(3)

    const [headerB64, payloadB64, sigB64] = parts
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString())
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())

    expect(header.alg).toBe('RS256')
    expect(header.typ).toBe('JWT')
    expect(payload.iss).toBe(appId)
    expect(typeof payload.iat).toBe('number')
    expect(typeof payload.exp).toBe('number')
    expect(payload.exp).toBeGreaterThan(payload.iat)

    const verify = require('node:crypto').createVerify('RSA-SHA256')
    verify.update(`${headerB64}.${payloadB64}`)
    const ok = verify.verify(publicKey, Buffer.from(sigB64, 'base64url'))
    expect(ok).toBe(true)
  })
})
