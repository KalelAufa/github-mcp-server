import { describe, it, expect } from 'vitest'
import { hashToken, safeCompare, sanitizeRepoName, parseRepoFullName, truncate, formatBytes } from '../utils/helpers.js'

describe('hashToken', () => {
  it('returns 8-char hex string', () => {
    expect(hashToken('my-token')).toMatch(/^[0-9a-f]{8}$/)
  })
  it('is deterministic', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'))
  })
  it('differs for different tokens', () => {
    expect(hashToken('abc')).not.toBe(hashToken('xyz'))
  })
})

describe('safeCompare', () => {
  it('returns true for equal strings', () => {
    expect(safeCompare('secret', 'secret')).toBe(true)
  })
  it('returns false for different strings of same length', () => {
    expect(safeCompare('secret1', 'secret2')).toBe(false)
  })
  it('returns false for different lengths', () => {
    expect(safeCompare('short', 'longer-string')).toBe(false)
  })
  it('returns false for empty vs non-empty', () => {
    expect(safeCompare('', 'x')).toBe(false)
  })
})

describe('sanitizeRepoName', () => {
  it('lowercases and replaces invalid chars', () => {
    expect(sanitizeRepoName('My Repo!')).toBe('my-repo-')
  })
  it('allows dots, dashes, underscores', () => {
    expect(sanitizeRepoName('my.repo_name-1')).toBe('my.repo_name-1')
  })
})

describe('parseRepoFullName', () => {
  it('splits owner/repo', () => {
    expect(parseRepoFullName('owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
  })
  it('throws on invalid format', () => {
    expect(() => parseRepoFullName('no-slash')).toThrow('Invalid repository full name')
  })
})

describe('truncate', () => {
  it('returns string unchanged when under limit', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })
  it('truncates and adds ellipsis', () => {
    expect(truncate('hello world', 8)).toBe('hello...')
  })
})

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500.0 B')
  })
  it('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2.0 KB')
  })
  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB')
  })
})
