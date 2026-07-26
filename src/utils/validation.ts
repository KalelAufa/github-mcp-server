import { z, type ZodTypeAny } from 'zod'
import { ValidationError } from './errors.js'
import type { ToolDefinition } from '../types/index.js'

interface JsonSchema {
  type?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  enum?: string[]
  items?: JsonSchema
  additionalProperties?: boolean
  description?: string
}

function convert(schema: JsonSchema): ZodTypeAny {
  if (schema.enum && schema.enum.length > 0) {
    return z.enum(schema.enum as [string, ...string[]])
  }
  switch (schema.type) {
    case 'string':
      return z.string()
    case 'number':
      return z.number()
    case 'boolean':
      return z.boolean()
    case 'array':
      return z.array(schema.items ? convert(schema.items) : z.unknown())
    case 'object': {
      const shape: Record<string, ZodTypeAny> = {}
      const required = schema.required ?? []
      for (const [key, prop] of Object.entries(schema.properties ?? {})) {
        const field = convert(prop)
        shape[key] = required.includes(key) ? field : field.optional()
      }
      const obj = z.object(shape)
      return schema.additionalProperties ? obj.passthrough() : obj
    }
    default:
      return z.unknown()
  }
}

export function jsonSchemaToZod(schema: Record<string, unknown>): ZodTypeAny {
  const s = schema as JsonSchema
  if (s.type !== 'object' || !s.properties) {
    return z.unknown()
  }
  const shape: Record<string, ZodTypeAny> = {}
  for (const [key, prop] of Object.entries(s.properties)) {
    const required = (s.required ?? []).includes(key)
    const field = convert(prop)
    shape[key] = required ? field : field.optional()
  }
  return z.object(shape).passthrough()
}

function describeField(
  schema: Record<string, unknown>,
  path: (string | number)[],
): string | undefined {
  let node = schema
  for (const segment of path) {
    const props = (node.properties ?? {}) as Record<string, Record<string, unknown>>
    if (typeof segment === 'string' && props[segment]) {
      node = props[segment]
    } else {
      return undefined
    }
  }
  return (node.description as string | undefined) ?? undefined
}

export function validateToolArgs(
  tool: ToolDefinition,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const schema = jsonSchemaToZod(tool.inputSchema)
  const result = schema.safeParse(args ?? {})
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => {
        const field = i.path.join('.') || '(root)'
        const desc = describeField(tool.inputSchema, i.path)
        return desc ? `${field} (${desc}): ${i.message}` : `${field}: ${i.message}`
      })
      .join('; ')
    throw new ValidationError(`Invalid arguments for ${tool.name}: ${issues}`)
  }
  return result.data as Record<string, unknown>
}
