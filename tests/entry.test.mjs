import test from 'node:test'
import assert from 'node:assert/strict'
import { name, inject, apply } from '../lib/index.js'

function makeCtx() {
  const registered = []
  return {
    registered,
    commands: { register: (command) => registered.push(command) },
    logger: { info: () => {} },
  }
}

test('entry exports bundle identity', () => {
  assert.equal(name, 'dsh-plugin-session-archive')
  assert.deepEqual(inject, ['commands'])
})

test('apply registers /session-export only', () => {
  const ctx = makeCtx()
  apply(ctx)
  assert.equal(ctx.registered.length, 1)
  assert.equal(ctx.registered[0].name, 'session-export')
})

test('handler exports markdown by default', () => {
  const ctx = makeCtx()
  apply(ctx)
  const result = ctx.registered[0].handler({
    agent: {
      session: {
        events: [
          { type: 'user/message', data: { content: [{ type: 'text', text: 'hello' }] } },
        ],
      },
    },
    rawInput: '',
  })
  assert.equal(result.kind, 'success')
  assert.match(result.text, /# Session export/)
  assert.match(result.text, /hello/)
})

test('handler supports json and survives a missing session', () => {
  const ctx = makeCtx()
  apply(ctx)
  const result = ctx.registered[0].handler({ agent: {}, rawInput: 'json --max-kb=1' })
  assert.equal(result.kind, 'success')
  assert.deepEqual(JSON.parse(result.text), [])
})
