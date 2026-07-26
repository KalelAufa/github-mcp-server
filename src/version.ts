import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

function readVersion(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url))
    for (const rel of ['../package.json', '../../package.json']) {
      try {
        const pkg = JSON.parse(readFileSync(resolve(dir, rel), 'utf-8')) as { version?: string }
        if (pkg.version) return pkg.version
      } catch { /* try next path */ }
    }
  } catch { /* fall through */ }
  return '0.0.0'
}

export const SERVER_VERSION = readVersion()
