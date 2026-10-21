/**
 * HTTP plumbing shared by the SearXNG and Brave search providers: one GET with
 * a timeout layered on the caller's signal, typed `WebError` failures, and
 * source de-duplication. Each plugin bundles its own copy at build time.
 * @module dsh-off-the-record/shared/search-http
 */

import { WebError, type WebSearchSource } from '@deepseek-ai/dsh-web'

/** Default per-search deadline, in addition to the caller's signal. */
export const DEFAULT_SEARCH_TIMEOUT_MS = 15_000

/** Largest response body read from a search provider; search results are far smaller. */
export const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

/** Default `user-agent` header; identifies the bundle, not the user. */
export const DEFAULT_USER_AGENT = 'dsh-off-the-record'

/**
 * Check a configured `user-agent` value: visible ASCII and spaces only, so it
 * can never inject a header line.
 * @param value - the configured header value.
 * @returns whether the value is safe to send.
 */
export function isValidUserAgent(value: string): boolean {
  return /^[\x21-\x7e][\x20-\x7e]{0,255}$/.test(value)
}

/** One provider's naming for error messages. */
export interface SearchRequestOptions {
  /** Human name used in error messages, such as "SearXNG". */
  readonly label: string
  readonly url: URL
  readonly headers: Readonly<Record<string, string>>
  readonly timeoutMs: number
  readonly signal?: AbortSignal | undefined
  /** Maps a non-2xx status to a message that names the fix. */
  readonly describeStatus: (status: number) => string
}

/**
 * GET one JSON document. Redirects fail, cookies are never sent, and the
 * request ends at the earlier of the caller's signal and `timeoutMs`.
 * @param options - target, headers, deadline, and error naming.
 * @returns the parsed JSON body, not yet shape-checked.
 * @throws WebError `WEB_ABORTED` when the caller aborts, otherwise `WEB_PROVIDER_ERROR`.
 */
export async function getJson(options: SearchRequestOptions): Promise<unknown> {
  const { label, signal } = options
  const timeout = AbortSignal.timeout(options.timeoutMs)
  const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
  const failure = (error: unknown, what: string): WebError => {
    if (signal?.aborted === true) return new WebError(`${label} search aborted`, 'WEB_ABORTED', { cause: error })
    if (timeout.aborted) {
      return new WebError(`${label} did not answer within ${String(options.timeoutMs)} ms`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    return new WebError(`${label} ${what}: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
  }

  let response: Response
  try {
    response = await fetch(options.url, {
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      headers: { accept: 'application/json', ...options.headers },
      signal: combined,
    })
  } catch (error: unknown) {
    throw failure(error, 'request failed')
  }

  if (!response.ok) {
    // Release the connection without reading a body whose content is not needed.
    void response.body?.cancel().catch(() => undefined)
    if (signal?.aborted === true) throw new WebError(`${label} search aborted`, 'WEB_ABORTED')
    throw new WebError(options.describeStatus(response.status), 'WEB_PROVIDER_ERROR')
  }

  let body: string
  try {
    body = await readBounded(response, MAX_RESPONSE_BYTES)
  } catch (error: unknown) {
    if (error instanceof WebError) throw error
    throw failure(error, 'response could not be read')
  }
  try {
    return JSON.parse(body) as unknown
  } catch (error: unknown) {
    throw failure(error, 'returned a body that is not JSON')
  }
}

/**
 * Read a response body as text, refusing one larger than the limit.
 * @param response - the response.
 * @param limit - most bytes accepted.
 * @returns the decoded body.
 */
async function readBounded(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > limit) {
    void response.body?.cancel().catch(() => undefined)
    throw new WebError(`the search response is larger than ${String(limit)} bytes`, 'WEB_PROVIDER_ERROR')
  }
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      void reader.cancel().catch(() => undefined)
      throw new WebError(`the search response is larger than ${String(limit)} bytes`, 'WEB_PROVIDER_ERROR')
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

/**
 * Throw the provider error used for a well-formed body of the wrong shape.
 * @param label - provider name for the message.
 * @returns never.
 */
export function unexpectedShape(label: string): never {
  throw new WebError(`${label} returned an unexpected response shape`, 'WEB_PROVIDER_ERROR')
}

/**
 * Keep the first source for each URL, preserving order.
 * @param sources - mapped sources, possibly repeating a URL across engines.
 * @returns sources with unique URLs.
 */
export function dedupeSources(sources: readonly WebSearchSource[]): WebSearchSource[] {
  const seen = new Set<string>()
  return sources.filter((source) => {
    if (seen.has(source.url)) return false
    seen.add(source.url)
    return true
  })
}

/**
 * Read an optional non-empty string field from untrusted JSON.
 * @param value - candidate field value.
 * @returns the trimmed string, or undefined when absent or blank.
 */
export function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

/**
 * Narrow untrusted JSON to a plain object.
 * @param value - candidate value.
 * @returns the object, or undefined.
 */
export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/**
 * Check that a URL from a search result is safe to cite: absolute http(s) only.
 * @param value - candidate URL.
 * @returns the URL string, or undefined.
 */
export function sourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !URL.canParse(value)) return undefined
  const { protocol } = new URL(value)
  return protocol === 'http:' || protocol === 'https:' ? value : undefined
}
