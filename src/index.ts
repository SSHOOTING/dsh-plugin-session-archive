import { exportJson, exportMarkdown } from './core.js'

export const name = 'dsh-plugin-session-archive'
export const inject = ['commands']

interface CommandContext {
  commands: {
    register(command: {
      name: string
      description: string
      input?: { hint?: string }
      handler: (args: { agent?: { session?: { events?: readonly unknown[] } }; rawInput?: string }) =>
        | { kind: 'success'; text: string }
        | { kind: 'error'; text: string }
    }): () => void
  }
  /** Cordis lifecycle scope; registers disposables so disable/reload leaves no duplicate command. */
  effect?: (body: () => Generator, label?: string) => void
  logger?: { info?: (message: string) => void }
}

/** Cordis entry: `/session-export [md|json] [--max-kb=N]`. */
export function apply(ctx: CommandContext): void {
  const dispose = ctx.commands.register({
    name: 'session-export',
    description: 'Export this session as redacted Markdown or JSON (local only)',
    input: { hint: '[md|json] [--max-kb=128]' },
    handler: ({ agent, rawInput }) => {
      try {
        const args = (rawInput ?? '').trim().split(/\s+/).filter(Boolean)
        const json = args.includes('json')
        const kbArg = args.find((arg) => arg.startsWith('--max-kb='))
        const parsed = kbArg ? Number(kbArg.slice('--max-kb='.length)) : 128
        const maxBytes = Number.isFinite(parsed) ? Math.max(1, Math.min(512, parsed)) * 1024 : 128 * 1024
        const events = Array.isArray(agent?.session?.events) ? agent.session.events : []
        const text = json
          ? exportJson(events, { maxBytes })
          : exportMarkdown(events, { maxBytes })
        return { kind: 'success', text }
      } catch (error) {
        return { kind: 'error', text: `[session-export] failed: ${error instanceof Error ? error.message : String(error)}` }
      }
    },
  })
  if (typeof ctx.effect === 'function') {
    ctx.effect(function* () { yield dispose }, `${name} lifecycle`)
  }
  ctx.logger?.info?.('[dsh-plugin-session-archive] loaded (read-only; /session-export available)')
}
