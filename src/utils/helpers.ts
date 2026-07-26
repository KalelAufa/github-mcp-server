import { createHash, timingSafeEqual } from 'node:crypto'
import { ValidationError } from './errors.js'
import { loadConfig } from '../config/index.js'

export function resolveOwner(owner?: string): string {
  const resolved = owner || loadConfig().defaultOwner
  if (!resolved) {
    throw new ValidationError('owner is required (set GITHUB_DEFAULT_OWNER or pass owner argument)')
  }
  return resolved
}

export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function sanitizeRepoName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase()
}

export function parseRepoFullName(fullName: string): { owner: string; repo: string } {
  const parts = fullName.split('/')
  if (parts.length !== 2) {
    throw new Error(`Invalid repository full name: ${fullName}. Expected format: owner/repo`)
  }
  return { owner: parts[0], repo: parts[1] }
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function truncate(str: string, maxLen: number): string {
  return str.length <= maxLen ? str : str.slice(0, maxLen - 3) + '...'
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 8)
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit++
  }
  return `${size.toFixed(1)} ${units[unit]}`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ellipsis(str: string, max = 100): string {
  if (str.length <= max) return str
  return str.slice(0, max) + '...'
}
