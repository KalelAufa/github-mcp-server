import { createWriteStream } from 'node:fs'
import type { LoggingConfig } from '../types/index.js'

const LEVELS = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 } as const
type Level = keyof typeof LEVELS

class Logger {
  private config: LoggingConfig = { level: 'info', format: 'text' }
  private sink: (line: string) => void = (line) => process.stderr.write(line)

  configure(config: LoggingConfig) {
    this.config = config
    if (config.file) {
      const stream = createWriteStream(config.file, { flags: 'a' })
      this.sink = (line) => { stream.write(line) }
    } else {
      this.sink = (line) => process.stderr.write(line)
    }
  }

  private shouldLog(level: Level): boolean {
    return LEVELS[level] >= LEVELS[this.config.level]
  }

  private format(level: Level, message: string, meta?: Record<string, unknown>): string {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    }
    return (this.config.format === 'json' ? JSON.stringify(entry) : this.formatText(entry)) + '\n'
  }

  private formatText(entry: Record<string, unknown>): string {
    const { timestamp, level, message, ...rest } = entry
    const meta = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : ''
    return `[${timestamp}] ${String(level).toUpperCase()} ${message}${meta}`
  }

  trace(message: string, meta?: Record<string, unknown>) {
    if (this.shouldLog('trace')) this.sink(this.format('trace', message, meta))
  }
  debug(message: string, meta?: Record<string, unknown>) {
    if (this.shouldLog('debug')) this.sink(this.format('debug', message, meta))
  }
  info(message: string, meta?: Record<string, unknown>) {
    if (this.shouldLog('info')) this.sink(this.format('info', message, meta))
  }
  warn(message: string, meta?: Record<string, unknown>) {
    if (this.shouldLog('warn')) this.sink(this.format('warn', message, meta))
  }
  error(message: string, meta?: Record<string, unknown>) {
    if (this.shouldLog('error')) this.sink(this.format('error', message, meta))
  }
}

export const logger = new Logger()
