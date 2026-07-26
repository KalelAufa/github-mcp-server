import { execa, execaSync } from 'execa'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { GitError } from '../utils/errors.js'
import { loadConfig } from '../config/index.js'
import { logger } from '../utils/logger.js'

const config = loadConfig()

export class GitService {
  private cloneDir: string

  constructor() {
    this.cloneDir = config.cloneDir || resolve(process.cwd(), 'repos')
    if (!existsSync(this.cloneDir)) {
      mkdirSync(this.cloneDir, { recursive: true })
    }
  }

  private repoPath(owner: string, repo: string): string {
    const safePath = resolve(this.cloneDir, owner, repo)
    const base = resolve(this.cloneDir)
    if (!safePath.startsWith(base + sep) && safePath !== base) {
      throw new GitError(`Path traversal detected: ${owner}/${repo}`)
    }
    return safePath
  }

  async exec(args: string[], cwd?: string, timeout = 120_000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const result = await execa('git', args, {
        cwd: cwd || this.cloneDir,
        timeout,
        all: true,
      })
      return { stdout: result.all || '', stderr: '', exitCode: result.exitCode ?? 0 }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'exitCode' in err) {
        const gErr = err as { exitCode: number; stderr?: string; all?: string; message: string }
        throw new GitError(gErr.message, {
          args: args.join(' '),
          exitCode: gErr.exitCode,
          stderr: gErr.stderr || gErr.all || '',
        })
      }
      throw new GitError(String(err))
    }
  }

  async clone(url: string, destDir?: string): Promise<string> {
    const dest = destDir || this.resolveDest(url)
    logger.info('Cloning repository', { url, dest })
    await this.exec(['clone', '--depth', '1', url, dest])
    return dest
  }

  async fullClone(url: string, destDir?: string): Promise<string> {
    const dest = destDir || this.resolveDest(url)
    logger.info('Full cloning repository', { url, dest })
    await this.exec(['clone', url, dest])
    return dest
  }

  async init(path: string): Promise<void> {
    if (!existsSync(path)) mkdirSync(path, { recursive: true })
    await this.exec(['init'], path)
  }

  async add(pathspec = '.', cwd?: string): Promise<void> {
    await this.exec(['add', pathspec], cwd)
  }

  async commit(message: string, options?: { amend?: boolean; author?: string }, cwd?: string): Promise<void> {
    const args = ['commit', '-m', message]
    if (options?.amend) args.push('--amend')
    if (options?.author) args.push('--author', options.author)
    await this.exec(args, cwd)
  }

  async push(remote = 'origin', branch = 'main', force = false, cwd?: string): Promise<void> {
    const args = ['push', remote, branch]
    if (force) args.push('--force')
    await this.exec(args, cwd)
  }

  async pull(remote = 'origin', branch = 'main', rebase = false, cwd?: string): Promise<void> {
    const args = ['pull']
    if (rebase) args.push('--rebase')
    args.push(remote, branch)
    await this.exec(args, cwd)
  }

  async fetch(remote = 'origin', prune = true): Promise<void> {
    const args = ['fetch', remote]
    if (prune) args.push('--prune')
    await this.exec(args)
  }

  async checkout(branch: string, create = false): Promise<void> {
    const args = ['checkout']
    if (create) args.push('-b')
    args.push(branch)
    await this.exec(args)
  }

  async branch(name: string, options?: { delete?: boolean; rename?: string }): Promise<void> {
    if (options?.delete) {
      await this.exec(['branch', '-d', name])
    } else if (options?.rename) {
      await this.exec(['branch', '-m', name, options.rename])
    } else {
      await this.exec(['branch', name])
    }
  }

  async tag(name: string, message?: string, force = false): Promise<void> {
    const args = ['tag']
    if (force) args.push('-f')
    if (message) args.push('-a', name, '-m', message)
    else args.push(name)
    await this.exec(args)
  }

  async stash(options?: { pop?: boolean; drop?: boolean }): Promise<void> {
    if (options?.pop) await this.exec(['stash', 'pop'])
    else if (options?.drop) await this.exec(['stash', 'drop'])
    else await this.exec(['stash'])
  }

  async diff(args: string[] = [], cwd?: string): Promise<string> {
    const result = await this.exec(['diff', ...args], cwd)
    return result.stdout
  }

  async log(maxCount = 10, format?: string, cwd?: string): Promise<string> {
    const args = ['log']
    if (format) args.push('--format', format)
    args.push(`-${maxCount}`)
    const result = await this.exec(args, cwd)
    return result.stdout
  }

  async merge(branch: string, options?: { squash?: boolean; noFf?: boolean }): Promise<void> {
    const args = ['merge', branch]
    if (options?.squash) args.push('--squash')
    if (options?.noFf) args.push('--no-ff')
    await this.exec(args)
  }

  async rebase(branch: string): Promise<void> {
    await this.exec(['rebase', branch])
  }

  async cherryPick(commit: string): Promise<void> {
    await this.exec(['cherry-pick', commit])
  }

  async revert(commit: string): Promise<void> {
    await this.exec(['revert', '--no-edit', commit])
  }

  async reset(commit = 'HEAD', mode: 'soft' | 'mixed' | 'hard' = 'mixed'): Promise<void> {
    await this.exec(['reset', `--${mode}`, commit])
  }

  async status(cwd?: string): Promise<string> {
    const result = await this.exec(['status', '--porcelain'], cwd)
    return result.stdout
  }

  private resolveDest(url: string): string {
    const match = url.match(/(?:github\.com[\/:])?([^\/]+)\/([^\/\.]+)(?:\.git)?$/)
    if (match) {
      return this.repoPath(match[1], match[2])
    }
    return resolve(this.cloneDir, 'repo')
  }

  isRepo(path?: string): boolean {
    try {
      execaSync('git', ['rev-parse', '--git-dir'], { cwd: path || process.cwd() })
      return true
    } catch {
      return false
    }
  }
}

export const gitService = new GitService()
