import { describe, it, expect } from 'vitest'
import { jsonSchemaToZod, validateToolArgs } from '../src/utils/validation.ts'
import type { ToolDefinition } from '../src/types/index.ts'

const tool: ToolDefinition = {
  name: 'demo',
  description: 'demo tool',
  inputSchema: {
    type: 'object',
    properties: {
      repo: { type: 'string' },
      perPage: { type: 'number' },
      state: { type: 'string', enum: ['open', 'closed'] },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['repo'],
  },
  handler: async (a) => ({ content: [{ type: 'text', text: JSON.stringify(a) }] }),
}

describe('validateToolArgs', () => {
  it('accepts valid input', () => {
    const result = validateToolArgs(tool, { repo: 'x', perPage: 5, state: 'open', tags: ['a'] })
    expect(result.repo).toBe('x')
    expect(result.tags).toEqual(['a'])
  })

  it('throws ValidationError on missing required field', () => {
    expect(() => validateToolArgs(tool, { perPage: 5 })).toThrow()
  })

  it('throws ValidationError on enum violation', () => {
    expect(() => validateToolArgs(tool, { repo: 'x', state: 'bogus' })).toThrow()
  })

  it('allows unknown extra keys (passthrough)', () => {
    const result = validateToolArgs(tool, { repo: 'x', extra: 42 })
    expect((result as Record<string, unknown>).extra).toBe(42)
  })

  it('coerces nested object schemas', () => {
    const schema = { type: 'object', properties: { a: { type: 'object', properties: { b: { type: 'string' } } } }, required: [] }
    const zod = jsonSchemaToZod(schema)
    expect(zod.safeParse({ a: { b: 'ok' } }).success).toBe(true)
    expect(zod.safeParse({ a: { b: 5 } }).success).toBe(false)
  })
})
