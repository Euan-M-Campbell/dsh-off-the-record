import { describe, expect, it } from 'vitest'
import type { PostToolDecision, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { redactDecision, WITHHELD } from '../src/tool-vault/decision.ts'
import { ALL_ENCODINGS, base64Cores, buildMatcher, forms, jsonMatches, redactJson } from '../src/tool-vault/redact.ts'
import { secretName } from '../src/vault/index.ts'

const SECRET = 'pg-pass "w0rd" / ä&ok?='
const matcher = buildMatcher([{ name: secretName('DB_PASSWORD'), value: SECRET }], ALL_ENCODINGS, 8)
const empty = buildMatcher([], ALL_ENCODINGS, 8)

describe('secret forms', () => {
  it('finds the value inside a longer base64 stream at every alignment', () => {
    for (const url of [false, true]) {
      const cores = base64Cores(SECRET, url)
      for (const prefix of ['', 'a', 'ab', 'abc', 'Authorization: user:']) {
        const encoded = Buffer.from(`${prefix}${SECRET} and more`).toString(url ? 'base64url' : 'base64')
        expect(cores.some(core => encoded.includes(core)), `${url ? 'base64url' : 'base64'} after "${prefix}"`).toBe(true)
      }
    }
  })

  it('includes the raw, JSON-escaped, and URL-encoded forms', () => {
    const all = forms(SECRET, ALL_ENCODINGS)
    expect(all).toContain(SECRET)
    expect(all).toContain(JSON.stringify(SECRET).slice(1, -1))
    expect(all).toContain(encodeURIComponent(SECRET))
  })
})

describe('matcher', () => {
  it('replaces every form with the secret name', () => {
    const text = [
      `raw: ${SECRET}`,
      `json: ${JSON.stringify({ password: SECRET })}`,
      `url: https://h/?p=${encodeURIComponent(SECRET)}`,
      `base64: ${Buffer.from(SECRET).toString('base64')}`,
      `basic: ${Buffer.from(`admin:${SECRET}`).toString('base64')}`,
      `base64url: ${Buffer.from(SECRET).toString('base64url')}`,
    ].join('\n')
    const redacted = matcher.redact(text)
    for (const form of forms(SECRET, ALL_ENCODINGS)) expect(redacted).not.toContain(form)
    expect(redacted).toContain('raw: [secret:DB_PASSWORD]')
    expect(redacted.match(/\[secret:DB_PASSWORD\]/g)?.length).toBeGreaterThanOrEqual(6)
  })

  it('leaves text without a secret unchanged', () => {
    expect(matcher.matches('nothing to see')).toBe(false)
    expect(matcher.redact('nothing to see')).toBe('nothing to see')
  })

  it('prefers the longest value when one contains another', () => {
    const nested = buildMatcher([
      { name: secretName('SHORT'), value: 'abcdefgh' },
      { name: secretName('LONG'), value: 'abcdefgh-ijklmnop' },
    ], ['raw'], 8)
    expect(nested.redact('x abcdefgh-ijklmnop y abcdefgh')).toBe('x [secret:LONG] y [secret:SHORT]')
  })

  it('skips forms shorter than the minimum', () => {
    expect(buildMatcher([{ name: secretName('TINY'), value: 'abc' }], ['raw'], 8).empty).toBe(true)
  })

  it('redacts and detects inside JSON, keys included', () => {
    const value = { [SECRET]: [`x ${SECRET}`, 1, null, { deep: SECRET }] }
    expect(jsonMatches(value, matcher)).toBe(true)
    expect(JSON.stringify(redactJson(value, matcher))).not.toContain(SECRET)
    expect(jsonMatches({ a: ['clean'] }, matcher)).toBe(false)
  })
})

const text = (value: string) => [{ type: 'text' as const, text: value }]
const success = (value: unknown, extra: Partial<ToolExecutionResult> = {}) => ({ isError: false, value, content: text(JSON.stringify(value)), ...extra }) as ToolExecutionResult
const failure = (message: string, extra: Partial<ToolExecutionResult> = {}) => ({ isError: true, error: { message }, content: text(message), ...extra }) as ToolExecutionResult
const context = (value: string) => ({ role: 'user', content: text(value) }) as never
const accept: PostToolDecision = { kind: 'accept' }

describe('post-execute redaction', () => {
  it('passes everything through when the vault is empty', () => {
    expect(redactDecision(accept, success({ out: SECRET }), empty)).toBe(accept)
  })

  it('passes a clean result through unchanged', () => {
    expect(redactDecision(accept, success({ out: 'clean' }), matcher)).toBe(accept)
  })

  it('replaces the value of a successful result, so content and meta are rebuilt from it', () => {
    expect(redactDecision(accept, success({ out: `pw=${SECRET}` }), matcher)).toEqual({ kind: 'accept', value: { out: 'pw=[secret:DB_PASSWORD]' } })
  })

  it('redacts when only presentation meta carries the secret', () => {
    expect(redactDecision(accept, success({ ok: true }, { meta: { diff: SECRET } }), matcher)).toEqual({ kind: 'accept', value: { ok: true } })
  })

  it('blocks a failed result with redacted feedback', () => {
    expect(redactDecision(accept, failure(`login failed for ${SECRET}`), matcher)).toEqual({
      kind: 'block', feedback: text('login failed for [secret:DB_PASSWORD]'),
    })
  })

  it('redacts content another listener supplied', () => {
    expect(redactDecision({ kind: 'accept', content: text(SECRET) }, success({ ok: true }), matcher)).toEqual({
      kind: 'accept', content: text('[secret:DB_PASSWORD]'),
    })
  })

  it('redacts a value another listener supplied', () => {
    expect(redactDecision({ kind: 'accept', value: { out: SECRET } }, success({ ok: true }), matcher)).toEqual({
      kind: 'accept', value: { out: '[secret:DB_PASSWORD]' },
    })
  })

  it('blocks when replaced content would leave secret meta behind', () => {
    expect(redactDecision({ kind: 'accept', content: text('summary') }, success({ ok: true }, { meta: { diff: SECRET } }), matcher)).toEqual({
      kind: 'block', feedback: text('summary'),
    })
  })

  it('blocks when the tool body attached a context carrying the secret', () => {
    const decision = redactDecision(accept, success({ ok: true }, { additionalContexts: [context(`note ${SECRET}`)] }), matcher)
    expect(decision.kind).toBe('block')
    expect(JSON.stringify(decision)).not.toContain(SECRET)
    expect(JSON.stringify(decision)).toContain('[secret:DB_PASSWORD]')
  })

  it('redacts contexts and feedback on a block decision', () => {
    expect(redactDecision({ kind: 'block', feedback: text(SECRET), additionalContexts: [context(SECRET)] }, success({ ok: true }), matcher)).toEqual({
      kind: 'block', feedback: text('[secret:DB_PASSWORD]'), additionalContexts: [context('[secret:DB_PASSWORD]')],
    })
  })

  it('withholds rather than passes through when redaction fails', () => {
    expect(WITHHELD[0]).toMatchObject({ type: 'text', text: expect.stringContaining('withheld') })
  })
})
