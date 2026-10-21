import { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import WebRuntime from '@deepseek-ai/dsh-web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as brave from '../src/web-search-brave/index.ts'
import { BraveSearchProvider, describeBraveStatus, mapBraveResponse, plainText } from '../src/web-search-brave/provider.ts'
import { MemoryCredentials } from './support/memory-credentials.ts'

const settings = { searchTimeoutMs: 15_000, userAgent: 'dsh-off-the-record' }
const key = (value: string | undefined) => ({ configured: () => value !== undefined, resolve: () => Promise.resolve(value) })

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

function stubFetch(response: Response) {
  const mock = vi.fn(async (_url: URL, _init?: RequestInit) => response.clone())
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => { vi.unstubAllGlobals() })

describe('Brave response mapping', () => {
  it('strips highlighting and entities, de-duplicates URLs, and keeps page age', () => {
    expect(mapBraveResponse({
      web: {
        results: [
          { url: 'https://a.test/', title: 'A &amp; B', description: 'The <strong>best</strong> &quot;thing&quot; &#39;here&#x27;', page_age: '2026-02-03T00:00:00' },
          { url: 'https://a.test/', title: 'duplicate' },
          { url: 'https://b.test/', title: '<b></b>', description: '   ' },
          { url: 'file:///etc/passwd', title: 'bad' },
        ],
      },
    })).toEqual({
      sources: [
        { url: 'https://a.test/', title: 'A & B', snippet: 'The best "thing" \'here\'', publishedAt: '2026-02-03T00:00:00' },
        { url: 'https://b.test/' },
      ],
      truncated: false,
    })
  })

  it('treats a response without web results as empty', () => {
    expect(mapBraveResponse({ type: 'search', query: { original: 'q' } })).toEqual({ sources: [], truncated: false })
  })

  it('rejects a body of the wrong shape as a provider error', () => {
    expect(() => mapBraveResponse({ web: { results: 'x' } })).toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
    expect(() => mapBraveResponse('x')).toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('leaves unknown entities alone', () => {
    expect(plainText('a &unknown; b')).toBe('a &unknown; b')
  })
})

describe('BraveSearchProvider', () => {
  it('sends the key only to the fixed endpoint, with count clamped to 20', async () => {
    const fetchMock = stubFetch(json({ web: { results: [] } }))
    await new BraveSearchProvider(key('brave-key'), () => settings).search({ query: 'a b', maxResults: 50 })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe('https://api.search.brave.com/res/v1/web/search?q=a+b&count=20')
    expect(init).toMatchObject({ method: 'GET', redirect: 'error', credentials: 'omit' })
    expect(init?.headers).toEqual({ accept: 'application/json', 'x-subscription-token': 'brave-key', 'user-agent': 'dsh-off-the-record' })
  })

  it('omits count when the request sets no bound', async () => {
    const fetchMock = stubFetch(json({ web: { results: [] } }))
    await new BraveSearchProvider(key('brave-key'), () => settings).search({ query: 'q' })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://api.search.brave.com/res/v1/web/search?q=q')
  })

  it('is unavailable, and refuses to search, without a key', async () => {
    const fetchMock = stubFetch(json({}))
    const provider = new BraveSearchProvider(key(undefined), () => settings)
    expect(provider.available()).toBe(false)
    await expect(provider.search({ query: 'q' })).rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CREDENTIAL_MISSING' }))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([401, 402, 403, 429, 500])('reports HTTP %i as a provider error', async (status) => {
    stubFetch(new Response('', { status }))
    await expect(new BraveSearchProvider(key('k'), () => settings).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: describeBraveStatus(status) }))
  })

  it('never puts the key in an error message', async () => {
    stubFetch(new Response('', { status: 401 }))
    await expect(new BraveSearchProvider(key('secret-brave-key'), () => settings).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ message: expect.not.stringContaining('secret-brave-key') }))
  })
})

describe('web-search-brave plugin', () => {
  async function mount(stored?: string) {
    const ctx = new Context()
    await ctx.plugin(MemoryCredentials)
    if (stored !== undefined) await ctx.credentials.set(credentialRef('BRAVE_API_KEY'), stored)
    await ctx.plugin(WebRuntime, { searchProvider: 'brave' })
    const fiber = await ctx.plugin(brave, {})
    return { ctx, fiber }
  }

  it('has no default export', () => {
    expect('default' in brave).toBe(false)
  })

  it('searches with the stored key and unregisters on dispose', async () => {
    const fetchMock = stubFetch(json({ web: { results: [{ url: 'https://a.test/', title: 'A' }] } }))
    const { ctx, fiber } = await mount('stored-key')
    await vi.waitFor(() => expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({ sources: [{ url: 'https://a.test/' }] }))
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-subscription-token': 'stored-key' })
    await fiber.dispose()
    await expect(ctx.web.search({ query: 'q' })).rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' }))
  })

  it('becomes available when a key is stored and unavailable when it is removed', async () => {
    stubFetch(json({ web: { results: [] } }))
    const { ctx } = await mount()
    await expect(ctx.web.search({ query: 'q' })).rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE' }))
    await ctx.credentials.set(credentialRef('BRAVE_API_KEY'), 'new-key')
    await vi.waitFor(() => expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({ sources: [] }))
    await ctx.credentials.unset(credentialRef('BRAVE_API_KEY'))
    await vi.waitFor(() => expect(ctx.web.search({ query: 'q' })).rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE' })))
  })
})
