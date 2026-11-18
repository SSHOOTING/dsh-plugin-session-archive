/**
 * Pure, dependency-free core for dsh-plugin-session-archive.
 *
 * Turns a DSH session event log into a redacted Markdown/JSON transcript.
 * Only allowlisted text fields are read; no arbitrary event data is serialized,
 * and no network or filesystem access happens here.
 */

export interface ExportOptions {
  /** Hard cap on the returned text, in UTF-8 bytes. */
  maxBytes?: number
  /** Max characters kept from one tool result. */
  toolResultChars?: number
}

export interface ExportRow {
  seq: number | null
  time: number | null
  type: string
  text: string
  route?: { provider: string; model: string }
}

export const DEFAULT_MAX_BYTES = 128 * 1024
const DEFAULT_TOOL_RESULT_CHARS = 4000

const SECRET =
  /((?:token|key|secret|password|authorization|bearer)[^\s:=]{0,24}[:=]\s*)[^\s&]+/gi
const QUERY_SECRET = /([?&](?:token|key|secret|password|auth)=)[^&#\s]+/gi

/** Strip credential-looking substrings from any string we are about to emit. */
export function redact(value: unknown): string {
  const text = value instanceof Error ? value.stack || value.message : String(value)
  return text.replace(SECRET, '$1[redacted]').replace(QUERY_SECRET, '$1[redacted]')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cap(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n… [truncated ${text.length - max} chars]`
}

/** Only a few known tool-argument keys are rendered, so nothing arbitrary leaks. */
function argsText(value: unknown, max: number): string {
  if (typeof value === 'string') return cap(redact(value), max)
  if (!isRecord(value)) return ''
  const parts: string[] = []
  if (typeof value.command === 'string') parts.push(`$ ${redact(value.command)}`)
  if (typeof value.path === 'string') parts.push(`path: ${redact(value.path)}`)
  if (typeof value.query === 'string') parts.push(`query: ${redact(value.query)}`)
  return cap(parts.join('\n'), max)
}

/** Extract plain text from DSH content blocks without touching unknown fields. */
export function textOf(content: unknown): string {
  if (typeof content === 'string') return redact(content)
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (!isRecord(block)) return ''
        if (block.type === 'tool-result') return textOf(block.content)
        if (block.type === 'thinking' || block.type === 'reasoning') return ''
        if (typeof block.text === 'string') return redact(block.text)
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (isRecord(content) && content.content !== undefined) return textOf(content.content)
  if (isRecord(content) && typeof content.text === 'string') return redact(content.text)
  return ''
}

function routeOf(event: Record<string, unknown>): { provider: string; model: string } | undefined {
  if (!isRecord(event.data)) return undefined
  if (event.type === 'request/header') {
    const config = event.data.config
    if (isRecord(config) && typeof config.provider === 'string' && typeof config.model === 'string') {
      return { provider: redact(config.provider), model: redact(config.model) }
    }
  }
  if (event.type === 'request/context') {
    if (typeof event.data.provider === 'string' && typeof event.data.model === 'string') {
      return { provider: redact(event.data.provider), model: redact(event.data.model) }
    }
  }
  return undefined
}

/** Convert events into safe, renderable rows. Unknown event types are ignored. */
export function rowsFromEvents(events: readonly unknown[], options: ExportOptions = {}): ExportRow[] {
  const resultCap = options.toolResultChars ?? DEFAULT_TOOL_RESULT_CHARS
  const rows: ExportRow[] = []
  let lastRoute: { provider: string; model: string } | undefined

  for (const raw of events) {
    if (!isRecord(raw) || typeof raw.type !== 'string') continue
    const event = raw
    const route = routeOf(event)
    if (route) lastRoute = route
    const data = isRecord(event.data) ? event.data : {}
    const seq = typeof event.seq === 'number' ? event.seq : null
    const time = typeof event.time === 'number' ? event.time : null

    if (event.type === 'user/message') {
      const source = isRecord(data.source) ? data.source : {}
      const label = source.kind === 'skill-invocation' && typeof source.name === 'string'
        ? `User (skill: ${redact(source.name)})`
        : 'User'
      rows.push({ seq, time, type: event.type, text: `## ${label}\n\n${textOf(data.content)}` })
      continue
    }

    if (event.type === 'assistant/message') {
      const message = isRecord(data.message) ? data.message : {}
      rows.push({
        seq,
        time,
        type: event.type,
        text: `## Assistant\n\n${textOf(message.content)}`,
        ...lastRoute ? { route: { ...lastRoute } } : {},
      })
      continue
    }

    if (event.type === 'tool/call') {
      const name = typeof data.name === 'string' ? redact(data.name) : 'unknown'
      const args = argsText(data.arguments, 1000)
      rows.push({ seq, time, type: event.type, text: `### Tool call: ${name}\n\n${args}` })
      continue
    }

    if (event.type === 'tool/result') {
      const message = isRecord(data.message) ? data.message : {}
      const blocks = Array.isArray(message.content) ? message.content : []
      const parts = blocks
        .filter((block) => isRecord(block) && block.type === 'tool-result')
        .map((block) => cap(textOf(block), resultCap))
      if (data.error !== undefined) parts.push(`error: ${redact(data.error)}`)
      rows.push({ seq, time, type: event.type, text: `### Tool result\n\n${parts.join('\n')}` })
      continue
    }

    if (event.type === 'turn/start' && typeof data.turn === 'number') {
      rows.push({ seq, time, type: event.type, text: `# Turn ${data.turn}` })
    }
  }

  return rows
}

/** Cut at a character boundary so the result never exceeds maxBytes. */
export function truncateUtf8(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text
  let low = 0
  let high = text.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (Buffer.byteLength(text.slice(0, mid), 'utf8') <= maxBytes) low = mid
    else high = mid - 1
  }
  return `${text.slice(0, low)}\n… [export truncated at ${maxBytes} bytes]`
}

export function exportMarkdown(events: readonly unknown[], options: ExportOptions = {}): string {
  const rows = rowsFromEvents(events, options)
  const header = `# Session export\n\n${rows.length} exported event(s). Credential-looking strings are redacted.\n\n`
  const body = rows.map((row) => row.text).join('\n\n')
  return truncateUtf8(header + body, options.maxBytes ?? DEFAULT_MAX_BYTES)
}

export function exportJson(events: readonly unknown[], options: ExportOptions = {}): string {
  const rows = rowsFromEvents(events, options)
  return truncateUtf8(JSON.stringify(rows, null, 2), options.maxBytes ?? DEFAULT_MAX_BYTES)
}
