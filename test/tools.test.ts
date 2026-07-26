import { describe, it, expect } from 'vitest'
import { repositoryTools } from '../src/tools/repository.ts'
import { issueTools } from '../src/tools/issues.ts'
import { branchTools } from '../src/tools/branches.ts'
import { fileTools } from '../src/tools/files.ts'
import { pullRequestTools } from '../src/tools/pullRequests.ts'
import { releaseTools } from '../src/tools/releases.ts'
import { searchTools } from '../src/tools/search.ts'
import { secretTools } from '../src/tools/secrets.ts'
import { actionTools } from '../src/tools/actions.ts'
import { aiTools } from '../src/tools/ai.ts'
import type { ToolDefinition } from '../src/types/index.ts'

const allTools: ToolDefinition[] = [
  ...repositoryTools,
  ...issueTools,
  ...branchTools,
  ...fileTools,
  ...pullRequestTools,
  ...releaseTools,
  ...searchTools,
  ...secretTools,
  ...actionTools,
  ...aiTools,
]

describe('tool registry', () => {
  it('has no duplicate tool names', () => {
    const names = allTools.map((t) => t.name)
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })

  it('every tool has a name, description, inputSchema and handler', () => {
    for (const tool of allTools) {
      expect(typeof tool.name).toBe('string')
      expect(tool.name.length).toBeGreaterThan(0)
      expect(typeof tool.description).toBe('string')
      expect(tool.inputSchema.type).toBe('object')
      expect(typeof tool.handler).toBe('function')
    }
  })

  it('every tool name is unique and search tools defined once', () => {
    expect(allTools.filter((t) => t.name === 'search_repositories').length).toBe(1)
    expect(allTools.filter((t) => t.name === 'search_issues').length).toBe(1)
    expect(allTools.filter((t) => t.name === 'search_code').length).toBe(1)
  })
})
