import test from 'node:test'
import assert from 'node:assert/strict'
import {
  exportJson,
  exportMarkdown,
  redact,
  rowsFromEvents,
  textOf,
  truncateUtf8,
} from '../lib/core.js'

const events = [
  { seq: 0, time: 1000, type: 'turn/start', data: { turn: 1 } },
  {
    seq: 1,
    time: 1001,
    type: 'user/message',
    data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Hello api_key=secret99' }] },
  },
  {
    seq: 2,
    time: 1002,
    type: 'request/header',
    data: { config: { provider: 'opencode-go', model: 'hy4-flash-free' } },
  },
  {
    seq: 3,
    time: 1003,
    type: 'assistant/message',
    data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: 'Hi there' }] } },
  },
  {
    seq: 4,
    time: 1004,
    type: 'tool/call',
    data: { callId: 'c1', name: 'bash', arguments: { command: 'echo token=abcd' } },
  },
  {
    seq: 5,
    time: 1005,
    type: 'tool/result',
    data: { message: { content: [{ type: 'tool-result', content: [{ type: 'text', text: 'done' }] }] } },
  },
  { seq: 6, time: 1006, type: 'unknown/event', data: { nope: 'ignored' } },
]

test('redact strips credential shapes', () => {
  assert.equal(redact('api_key=hunter2'), 'api_key=[redacted]')
  assert.equal(redact('https://x/?token=abc&a=1'), 'https://x/?token=[redacted]&a=1')
  assert.equal(redact('plain text'), 'plain text')
})

test('textOf handles strings, blocks, tool results and skips reasoning', () => {
  assert.equal(textOf('hi'), 'hi')
  assert.equal(
    textOf([
      { type: 'text', text: 'a' },
      { type: 'thinking', text: 'secret reasoning' },
      { type: 'tool-result', content: [{ type: 'text', text: 'b' }] },
    ]),
    'a\nb',
  )
  assert.equal(textOf({ nope: 1 }), '')
})

test('rowsFromEvents exports the right event types and ignores unknown ones', () => {
  const rows = rowsFromEvents(events)
  assert.deepEqual(rows.map((r) => r.type), [
    'turn/start',
    'user/message',
    'assistant/message',
    'tool/call',
    'tool/result',
  ])
  assert.equal(rows[1].text.includes('api_key=[redacted]'), true)
  assert.equal(rows[1].text.includes('secret99'), false)
  assert.deepEqual(rows[2].route, { provider: 'opencode-go', model: 'hy4-flash-free' })
  assert.match(rows[3].text, /\$ echo token=\[redacted\]/)
  assert.match(rows[4].text, /done/)
})

test('exportMarkdown is readable and fully redacted', () => {
  const md = exportMarkdown(events)
  assert.match(md, /^# Session export/)
  assert.match(md, /# Turn 1/)
  assert.match(md, /## User/)
  assert.match(md, /## Assistant/)
  assert.equal(md.includes('secret99'), false)
  assert.equal(md.includes('abcd'), false)
  assert.equal(md.includes('ignored'), false)
})

test('exportJson is valid JSON with only allowlisted fields', () => {
  const json = JSON.parse(exportJson(events))
  assert.equal(json.length, 5)
  assert.equal(json[0].seq, 0)
  assert.equal(json[0].time, 1000)
  assert.equal(Object.keys(json[1]).sort().join(','), 'seq,text,time,type')
})

test('truncateUtf8 respects the byte cap on multibyte text', () => {
  const text = '中'.repeat(100)
  const cut = truncateUtf8(text, 32)
  assert.ok(Buffer.byteLength(cut, 'utf8') > 32) // the marker is appended after the cut
  assert.ok(cut.includes('export truncated'))
  assert.equal(truncateUtf8('short', 100), 'short')
})

test('maxBytes caps the final export', () => {
  const md = exportMarkdown(events, { maxBytes: 120 })
  assert.ok(md.includes('export truncated'))
  assert.ok(Buffer.byteLength(md, 'utf8') < 200)
})

test('empty sessions still produce a valid header', () => {
  assert.match(exportMarkdown([]), /0 exported event\(s\)/)
  assert.deepEqual(JSON.parse(exportJson([])), [])
})
