import type { ToolDefinition, AuditCheck, RepoHealth } from '../types/index.js'
import { restClient } from '../api/rest.js'
import { resolveOwner } from '../utils/helpers.js'

export const aiTools: ToolDefinition[] = [
  {
    name: 'review_repository',
    description: 'Comprehensive repository review including health, security, and code quality',
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
      const review: Record<string, unknown> = {}

      const repoData = await restClient.getRepo(owner, repo) as Record<string, unknown>
      review.basic = {
        name: repoData.name,
        description: repoData.description,
        defaultBranch: repoData.default_branch,
        visibility: repoData.private ? 'private' : 'public',
        archived: repoData.archived,
        language: repoData.language,
        topics: repoData.topics,
        createdAt: repoData.created_at,
        updatedAt: repoData.updated_at,
      }

      const [readme, contributing, codeOfConduct] = await Promise.all([
        restClient.get(`/repos/${owner}/${repo}/readme`).catch(() => null),
        restClient.get(`/repos/${owner}/${repo}/contents/CONTRIBUTING.md`).catch(() => null),
        restClient.get(`/repos/${owner}/${repo}/contents/CODE_OF_CONDUCT.md`).catch(() => null),
      ])
      review.hasReadme = !!readme
      review.hasContributing = !!contributing
      review.hasCodeOfConduct = !!codeOfConduct

      const license = repoData.license as Record<string, unknown> | null
      review.license = license?.spdx_id || 'No license detected'

      return { content: [{ type: 'text', text: JSON.stringify(review, null, 2) }] }
    },
  },
  {
    name: 'repository_health',
    description: 'Analyze repository health and generate a health score',
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

      const repoData = await restClient.getRepo(owner, repo) as Record<string, unknown>
      const [readme, license, contributing, coc] = await Promise.all([
        restClient.get(`/repos/${owner}/${repo}/readme`).catch(() => null),
        restClient.get(`/repos/${owner}/${repo}/license`).catch(() => null),
        restClient.get(`/repos/${owner}/${repo}/contents/CONTRIBUTING.md`).catch(() => null),
        restClient.get(`/repos/${owner}/${repo}/contents/CODE_OF_CONDUCT.md`).catch(() => null),
      ])

      let score = 100
      const checks: AuditCheck[] = []

      if (repoData.description) { checks.push({ name: 'Has description', status: 'pass', details: String(repoData.description).slice(0, 100) }) }
      else { checks.push({ name: 'Has description', status: 'fail', details: 'Repository has no description' }); score -= 15 }

      if (readme) { checks.push({ name: 'Has README', status: 'pass', details: 'README found' }) }
      else { checks.push({ name: 'Has README', status: 'fail', details: 'No README file' }); score -= 20 }

      if (license) { checks.push({ name: 'Has license', status: 'pass', details: ((license as Record<string, unknown>).license as Record<string, unknown>)?.spdx_id as string || 'License found' }) }
      else { checks.push({ name: 'Has license', status: 'warn', details: 'No license file' }); score -= 10 }

      if (contributing) { checks.push({ name: 'Has CONTRIBUTING.md', status: 'pass', details: 'Contributing guide found' }) }
      else { checks.push({ name: 'Has CONTRIBUTING.md', status: 'warn', details: 'No contributing guide' }); score -= 5 }

      if (coc) { checks.push({ name: 'Has CODE_OF_CONDUCT', status: 'pass', details: 'Code of Conduct found' }) }
      else { checks.push({ name: 'Has CODE_OF_CONDUCT', status: 'warn', details: 'No Code of Conduct' }); score -= 5 }

      const topics = repoData.topics as string[] | undefined
      if (topics && topics.length > 0) { checks.push({ name: 'Has topics', status: 'pass', details: `${topics.length} topics` }) }
      else { checks.push({ name: 'Has topics', status: 'warn', details: 'No topics set' }); score -= 5 }

      const openIssues = (repoData.open_issues_count as number) || 0
      checks.push({ name: 'Open issues', status: openIssues > 50 ? 'warn' : 'pass', details: `${openIssues} open issues` })
      if (openIssues > 50) score -= 10

      const pushedAt = repoData.pushed_at as string
      const daysSincePush = Math.floor((Date.now() - new Date(pushedAt).getTime()) / 86400000)
      if (daysSincePush > 90) { checks.push({ name: 'Recently active', status: 'warn', details: `Last push ${daysSincePush} days ago` }); score -= 10 }
      else { checks.push({ name: 'Recently active', status: 'pass', details: `Last push ${daysSincePush} days ago` }) }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            repository: `${owner}/${repo}`,
            score: Math.max(0, score),
            rating: score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Poor',
            checks,
            summary: score >= 70 ? 'Repository is healthy' : 'Repository needs improvement',
          }, null, 2),
        }],
      }
    },
  },
  {
    name: 'repository_audit',
    description: 'Comprehensive security and configuration audit of a repository',
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
      const checks: AuditCheck[] = []
      let score = 100

      const [repoData, branches, secrets, vulnerableAlerts] = await Promise.all([
        restClient.getRepo(owner, repo).catch(() => ({})),
        restClient.get(`/repos/${owner}/${repo}/branches`).catch(() => []),
        restClient.get(`/repos/${owner}/${repo}/actions/secrets`).catch(() => ({ secrets: [] })),
        restClient.get(`/repos/${owner}/${repo}/dependabot/alerts`, { state: 'open', per_page: 1 }).catch(() => []),
      ])

      if ((repoData as Record<string, unknown>).archived) {
        checks.push({ name: 'Repository archived', status: 'warn', details: 'Repository is archived' })
      } else {
        checks.push({ name: 'Repository active', status: 'pass', details: 'Repository is active' })
      }

      const branchNames = (branches as Array<{ name: string }>).map(b => b.name)
      const hasDefaultBranch = branchNames.includes((repoData as Record<string, unknown>).default_branch as string || 'main')
      checks.push({ name: 'Default branch present', status: hasDefaultBranch ? 'pass' : 'fail', details: hasDefaultBranch ? 'Default branch found' : 'Default branch missing' })
      if (!hasDefaultBranch) score -= 10

      const vulnCount = (vulnerableAlerts as unknown[]).length
      if (vulnCount > 0) {
        checks.push({ name: 'Dependabot alerts', status: 'fail', details: `${vulnCount} open dependency alerts` })
        score -= 20
      } else {
        checks.push({ name: 'Dependabot alerts', status: 'pass', details: 'No open dependency alerts' })
      }

      const secretCount = ((secrets as { secrets: unknown[] }).secrets || []).length
      if (secretCount === 0) {
        checks.push({ name: 'Actions secrets', status: 'warn', details: 'No Actions secrets configured (might be fine for public repos)' })
      } else {
        checks.push({ name: 'Actions secrets', status: 'pass', details: `${secretCount} secrets configured` })
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            repository: `${owner}/${repo}`,
            score: Math.max(0, score),
            checks,
            summary: score >= 80 ? 'Repository audit passed' : 'Issues found that should be addressed',
          }, null, 2),
        }],
      }
    },
  },
  {
    name: 'generate_release_notes',
    description: 'Generate release notes from commits between two refs',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        previousTag: { type: 'string', description: 'Previous release tag' },
        currentTag: { type: 'string', description: 'Current release tag (default: HEAD)' },
      },
      required: ['repo', 'previousTag'],
    },
    handler: async (args) => {
      const owner = resolveOwner(args.owner as string)
      const repo = args.repo as string
      const base = args.previousTag as string
      const head = (args.currentTag as string) || 'HEAD'

      const compare = await restClient.get(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`) as Record<string, unknown>
      const commits = compare.commits as Array<{ commit: { message: string; author: { name: string } }; sha: string }> | undefined

      if (!commits) {
        return { content: [{ type: 'text', text: 'No commits found in range' }] }
      }

      const features: string[] = []
      const fixes: string[] = []
      const others: string[] = []

      const featRe = /^(feat|feature)(\(.+\))?[!:]?\s/i
      const fixRe = /^fix(\(.+\))?[!:]?\s/i
      for (const c of commits) {
        const msg = c.commit.message.split('\n')[0]
        if (featRe.test(msg)) {
          features.push(msg)
        } else if (fixRe.test(msg)) {
          fixes.push(msg)
        } else {
          others.push(msg)
        }
      }

      const notes = [`# Release ${head}`]
      if (features.length) notes.push('', '## 🚀 Features', '', ...features.map(f => `- ${f}`))
      if (fixes.length) notes.push('', '## 🐛 Bug Fixes', '', ...fixes.map(f => `- ${f}`))
      if (others.length) notes.push('', '## 🔧 Other Changes', '', ...others.map(f => `- ${f}`))

      return { content: [{ type: 'text', text: notes.join('\n') }] }
    },
  },
  {
    name: 'tech_stack_detector',
    description: 'Detect the technology stack used in a repository',
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

      const repoData = await restClient.getRepo(owner, repo) as Record<string, unknown>
      const contents = await restClient.getContents(owner, repo, '') as Record<string, unknown>[]

      const tech: Record<string, string[]> = { languages: [], frameworks: [], tools: [], databases: [], ci: [] }

      if (repoData.language) tech.languages.push(repoData.language as string)

      const fileNames = (contents || []).map(c => c.name as string).join(' ')
      const filesLower = fileNames.toLowerCase()

      if (fileNames.includes('package.json')) {
        tech.frameworks.push('Node.js/JavaScript/TypeScript')
        try {
          const pkg = await restClient.getContents(owner, repo, 'package.json') as Record<string, unknown>
          if (pkg.content) {
            const parsed = JSON.parse(Buffer.from(pkg.content as string, 'base64').toString())
            const deps = { ...parsed.dependencies, ...parsed.devDependencies } as Record<string, string>
            if (deps.react) tech.frameworks.push('React')
            if (deps.next) tech.frameworks.push('Next.js')
            if (deps.express) tech.frameworks.push('Express')
            if (deps.vue) tech.frameworks.push('Vue.js')
            if (deps.angular) tech.frameworks.push('Angular')
            if (deps.typescript) tech.languages.push('TypeScript')
            if (deps.prisma) tech.databases.push('Prisma ORM')
            if (deps.tailwindcss) tech.frameworks.push('Tailwind CSS')
            if (deps.jest || deps.vitest) tech.tools.push('Jest/Vitest')
            if (deps.cypress) tech.tools.push('Cypress')
          }
        } catch { /* ignore */ }
      }

      if (filesLower.includes('cargo.toml')) tech.languages.push('Rust')
      if (filesLower.includes('go.mod')) tech.languages.push('Go')
      if (filesLower.includes('pom.xml') || filesLower.includes('build.gradle')) tech.languages.push('Java')
      if (filesLower.includes('requirements.txt') || filesLower.includes('setup.py') || filesLower.includes('pyproject.toml')) tech.languages.push('Python')
      if (filesLower.includes('cmakelists.txt')) tech.tools.push('CMake')
      if (filesLower.includes('dockerfile')) tech.tools.push('Docker')
      if (filesLower.includes('docker-compose')) tech.tools.push('Docker Compose')
      if (filesLower.includes('.github')) tech.ci.push('GitHub Actions')
      if (filesLower.includes('jenkinsfile')) tech.ci.push('Jenkins')
      if (filesLower.includes('.gitlab-ci')) tech.ci.push('GitLab CI')
      if (filesLower.includes('terraform')) tech.tools.push('Terraform')

      return { content: [{ type: 'text', text: JSON.stringify(tech, null, 2) }] }
    },
  },
]
