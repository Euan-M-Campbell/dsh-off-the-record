/**
 * Secret redaction: finds each stored value, raw or in a common encoding, and
 * replaces it with `[secret:NAME]`. Pure; rebuilt whenever the vault changes.
 * @module dsh-off-the-record/tool-vault/redact
 */

import type { SecretName } from '../vault/index.ts'

/** Encodings a value is searched for in. */
export type RedactEncoding = 'raw' | 'base64' | 'base64url' | 'url' | 'json'

export const ALL_ENCODINGS: readonly RedactEncoding[] = ['raw', 'base64', 'base64url', 'url', 'json']

export interface Matcher {
  /** True when the vault is empty, so nothing can match. */
  readonly empty: boolean
  /** Whether any form of any stored value occurs in the text. */
  matches(text: string): boolean
  /** Replace every occurrence with `[secret:NAME]`. */
  redact(text: string): string
}

/**
 * The part of a value's base64 encoding that does not depend on the bytes
 * around it, for each of the three alignments it can start at inside a longer
 * encoded stream.
 * @param value - the secret.
 * @param url - base64url alphabet instead of standard base64.
 * @returns the stable encoded runs.
 */
export function base64Cores(value: string, url: boolean): string[] {
  const bytes = Buffer.from(value, 'utf8')
  const cores: string[] = []
  for (let offset = 0; offset < 3; offset++) {
    const padded = Buffer.concat([Buffer.alloc(offset), bytes])
    const encoded = padded.toString(url ? 'base64url' : 'base64')
    // Characters that mix prefix bits with value bits, or trailing bits with
    // whatever follows, change with the surrounding bytes.
    const start = Math.ceil((offset * 8) / 6)
    const end = Math.floor((padded.length * 8) / 6)
    cores.push(encoded.slice(start, end))
  }
  return cores
}

/**
 * Every searchable form of one value.
 * @param value - the secret.
 * @param encodings - which encodings to include.
 * @returns distinct forms.
 */
export function forms(value: string, encodings: readonly RedactEncoding[]): string[] {
  const out = new Set<string>()
  for (const encoding of encodings) {
    switch (encoding) {
      case 'raw': out.add(value); break
      case 'json': out.add(JSON.stringify(value).slice(1, -1)); break
      case 'url': out.add(encodeURIComponent(value)); break
      case 'base64': for (const core of base64Cores(value, false)) out.add(core); break
      case 'base64url': for (const core of base64Cores(value, true)) out.add(core); break
    }
  }
  return [...out]
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Build a matcher over the current vault contents.
 * @param entries - name/value pairs.
 * @param encodings - encodings to search.
 * @param minLength - forms shorter than this are skipped, so short encoded runs never match ordinary text.
 * @returns the matcher.
 */
export function buildMatcher(
  entries: readonly { readonly name: SecretName; readonly value: string }[],
  encodings: readonly RedactEncoding[],
  minLength: number,
): Matcher {
  const owner = new Map<string, SecretName>()
  for (const { name, value } of entries) {
    for (const form of forms(value, encodings)) {
      if (form.length >= minLength && !owner.has(form)) owner.set(form, name)
    }
  }
  if (owner.size === 0) return { empty: true, matches: () => false, redact: text => text }
  // Longest first, so a value that contains another is replaced whole.
  const source = [...owner.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')
  const test = new RegExp(source)
  const replace = new RegExp(source, 'g')
  return {
    empty: false,
    matches: text => test.test(text),
    redact: text => text.replace(replace, form => `[secret:${owner.get(form) ?? 'unknown'}]`),
  }
}

/**
 * Redact every string in a JSON value, keys included.
 * @param value - any JSON value.
 * @param matcher - the matcher.
 * @returns a redacted copy.
 */
export function redactJson<T>(value: T, matcher: Matcher): T {
  if (typeof value === 'string') return matcher.redact(value) as T
  if (Array.isArray(value)) return value.map(item => redactJson(item, matcher) as unknown) as T
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [matcher.redact(key), redactJson(item, matcher)])) as T
  }
  return value
}

/**
 * Whether any string inside a JSON value matches.
 * @param value - any JSON value.
 * @param matcher - the matcher.
 * @returns true on the first match.
 */
export function jsonMatches(value: unknown, matcher: Matcher): boolean {
  if (typeof value === 'string') return matcher.matches(value)
  if (Array.isArray(value)) return value.some(item => jsonMatches(item, matcher))
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).some(([key, item]) => matcher.matches(key) || jsonMatches(item, matcher))
  }
  return false
}
