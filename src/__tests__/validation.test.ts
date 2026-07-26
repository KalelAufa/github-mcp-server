import { describe, it, expect } from 'vitest'
import { jsonSchemaToZod, validateToolArgs } from '../utils/validation.js'
import type { ToolDefinition } from '../types/index.js'

const dummyHandler = async () => ({ content: [{ type: 'text', text: '' }] })

describe('jsonSchemaToZod', () => {
  it('validates required string fields', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    })
    expect(schema.safeParse({ name: 'hello' }).success).toBe(true)
    expect(schema.safeParse({}).success).toBe(false)
  })

  it('makes non-required fields optional', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'number' } },
      required: ['name'],
    })
    expect(schema.safeParse({ name: 'x' }).success).toBe(true)
    expect(schema.safeParse({ name: 'x', age: 5 }).success).toBe(true)
  })

  it('validates enum fields', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: { color: { type: 'string', enum: ['red', 'green', 'blue'] } },
      required: ['color'],
    })
    expect(schema.safeParse({ color: 'red' }).success).toBe(true)
    expect(schema.safeParse({ color: 'yellow' }).success).toBe(false)
  })

  it('validates nested object required fields', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        outer: {
          type: 'object',
          properties: {
            inner: { type: 'string' },
            opt: { type: 'string' },
          },
          required: ['inner'],
        },
      },
      required: ['outer'],
    })
    expect(schema.safeParse({ outer: { inner: 'x' } }).success).toBe(true)
    expect(schema.safeParse({ outer: {} }).success).toBe(false)
    expect(schema.safeParse({ outer: { inner: 'x', opt: 'y' } }).success).toBe(true)
  })

  it('validates boolean fields', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: { flag: { type: 'boolean' } },
      required: ['flag'],
    })
    expect(schema.safeParse({ flag: true }).success).toBe(true)
    expect(schema.safeParse({ flag: 'true' }).success).toBe(false)
  })

  it('validates array fields', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: { tags: { type: 'array', items: { type: 'string' } } },
      required: ['tags'],
    })
    expect(schema.safeParse({ tags: ['a', 'b'] }).success).toBe(true)
    expect(schema.safeParse({ tags: [1, 2] }).success).toBe(false)
  })
})

describe('validateToolArgs', () => {
  const tool: ToolDefinition = {
    name: 'test_tool',
    description: 'test',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repo name' },
        owner: { type: 'string', description: 'Owner' },
      },
      required: ['repo'],
    },
    handler: dummyHandler,
  }

  it('passes valid args', () => {
    expect(() => validateToolArgs(tool, { repo: 'my-repo' })).not.toThrow()
  })

  it('throws ValidationError for missing required field', () => {
    expect(() => validateToolArgs(tool, {})).toThrow('Invalid arguments')
  })

  it('includes field description in error message', () => {
    try {
      validateToolArgs(tool, {})
    } catch (e) {
      expect(String(e)).toContain('Repo name')
    }
  })

  it('passes optional field when absent', () => {
    const result = validateToolArgs(tool, { repo: 'x' })
    expect(result.repo).toBe('x')
    expect(result.owner).toBeUndefined()
  })
})
