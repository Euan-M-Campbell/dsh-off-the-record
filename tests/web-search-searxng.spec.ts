import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as searxng from '../src/web-search-searxng/index.ts'
import {
  baseUrlProblem,
  isPrivateHost,
  mapSearxngResponse,
  SearxngSearchProvider,
  searchUrl,
  type SearxngSettings,
} from '../src/web-search-searxng/provider.ts'

const settings: SearxngSettings = {
  baseURL: 'http://127.0.0.1:8888',
  engines: '',
  categories: '',
  searchTimeoutMs: 15_000,
  userAgent: 'dsh-off-the-record',
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

function stubFetch(response: Response | (() => Promise<Response>)) {
  const mock = vi.fn(async (_url: URL, _init?: RequestInit) => typeof response === 'function' ? response() : response.clone())
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => { vi.unstubAllGlobals() })

describe('SearXNG instance URL', () => {
  it.each([
    ['https://search.example.com', undefined],
    ['https://example.com/searx', undefined],
    ['http://127.0.0.1:8888', undefined],
    ['http://localhost:8080', undefined],
    ['http://192.168.1.20', undefined],
    ['http://10.0.0.5', undefined],
    ['http://172.20.0.2', undefined],
    ['http://searxng:8080', undefined],
    ['http://nas.local', undefined],
    ['http://[::1]:8888', undefined],
    ['http://search.example.com', 'plain http is allowed only for this machine or a private network; use https'],
    ['http://172.32.0.1', 'plain http is allowed only for this machine or a private network; use https'],
    ['', 'no SearXNG instance is configured'],
    ['not a url', '"not a url" is not a URL'],
    ['https://user:pw@search.example.com', 'the SearXNG URL must not contain credentials'],
    ['https://search.example.com/?x=1', 'the SearXNG URL must not contain a query or fragment'],
    ['ftp://search.example.com', 'unsupported protocol ftp:'],
  ])('%s', (baseURL, problem) => {
    expect(baseUrlProblem(baseURL)).toBe(problem)
  })

  it('treats link-local and unique-local IPv6 as private', () => {
    expect(isPrivateHost('[fd12:3456::1]')).toBe(true)
    expect(isPrivateHost('[fe80::1]')).toBe(true)
    expect(isPrivateHost('[2001:db8::1]')).toBe(false)
  })

  it('builds the search URL beneath a path prefix with the optional filters', () => {
    const url = searchUrl({ ...settings, baseURL: 'https://example.com/searx', engines: 'duckduckgo,wikipedia', categories: 'general' }, 'a b&c')
    expect(url.origin + url.pathname).toBe('https://example.com/searx/search')
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'a b&c', format: 'json', engines: 'duckduckgo,wikipedia', categories: 'general' })
  })
})

describe('SearXNG response mapping', () => {
  it('maps results, de-duplicates URLs, and turns answers into content', () => {
    expect(mapSearxngResponse({
      results: [
        { url: 'https://a.test/', title: ' A ', content: 'first', publishedDate: '2026-01-01T00:00:00' },
        { url: 'https://a.test/', title: 'A again', content: 'from another engine' },
        { url: 'https://b.test/', title: '', content: null },
        { url: 'javascript:alert(1)', title: 'bad' },
        { title: 'no url' },
      ],
      answers: ['plain answer', { answer: 'object answer', url: 'https://c.test' }, ''],
    })).toEqual({
      content: 'plain answer\nobject answer',
      sources: [
        { url: 'https://a.test/', title: 'A', snippet: 'first', publishedAt: '2026-01-01T00:00:00' },
        { url: 'https://b.test/' },
      ],
      truncated: false,
    })
  })

  it('returns no sources for an empty result list', () => {
    expect(mapSearxngResponse({ results: [] })).toEqual({ sources: [], truncated: false })
  })

  it('rejects a body of the wrong shape as a provider error', () => {
    expect(() => mapSearxngResponse({ results: {} })).toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
    expect(() => mapSearxngResponse([])).toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })
})

describe('SearxngSearchProvider', () => {
  it('sends one GET with no cookies, no redirects, and the configured user agent', async () => {
    const fetchMock = stubFetch(json({ results: [] }))
    await new SearxngSearchProvider(() => ({ ...settings, userAgent: 'custom-agent/1' })).search({ query: 'q' })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe('http://127.0.0.1:8888/search?q=q&format=json')
    expect(init).toMatchObject({ method: 'GET', redirect: 'error', credentials: 'omit' })
    expect(init?.headers).toEqual({ accept: 'application/json', 'user-agent': 'custom-agent/1' })
  })

  it('is unavailable, and refuses to search, without an instance URL', async () => {
    const fetchMock = stubFetch(json({ results: [] }))
    const provider = new SearxngSearchProvider(() => ({ ...settings, baseURL: '' }))
    expect(provider.available()).toBe(false)
    await expect(provider.search({ query: 'q' })).rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_NOT_CONFIGURED' }))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('names the settings.yml fix when the json format is disabled', async () => {
    stubFetch(new Response('Forbidden', { status: 403 }))
    await expect(new SearxngSearchProvider(() => settings).search({ query: 'q' })).rejects.toThrow(
      expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: expect.stringContaining('settings.yml') }))
  })

  it.each([429, 500])('reports HTTP %i as a provider error', async (status) => {
    stubFetch(new Response('', { status }))
    await expect(new SearxngSearchProvider(() => settings).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: expect.stringContaining(String(status)) }))
  })

  it('reports an unreachable instance as a provider error', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed')))
    await expect(new SearxngSearchProvider(() => settings).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: expect.stringContaining('request failed') }))
  })

  it('reports a body that is not JSON as a provider error', async () => {
    stubFetch(new Response('<html>', { status: 200 }))
    await expect(new SearxngSearchProvider(() => settings).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('reports a caller abort as WEB_ABORTED', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { reject(new DOMException('aborted', 'AbortError')) })
    })))
    const controller = new AbortController()
    const pending = new SearxngSearchProvider(() => settings).search({ query: 'q' }, controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })

  it('reports its own timeout as a provider error that names the deadline', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { reject(new DOMException('timed out', 'TimeoutError')) })
    })))
    await expect(new SearxngSearchProvider(() => ({ ...settings, searchTimeoutMs: 20 })).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: expect.stringContaining('20 ms') }))
  })
})

describe('web-search-searxng plugin', () => {
  it('has no default export', () => {
    expect('default' in searxng).toBe(false)
  })

  it('serves ctx.web searches while mounted and unregisters on dispose', async () => {
    stubFetch(json({ results: [{ url: 'https://a.test/', title: 'A' }] }))
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: 'searxng' })
    const fiber = await ctx.plugin(searxng, { baseURL: 'http://127.0.0.1:8888' })
    await expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({ sources: [{ url: 'https://a.test/', title: 'A' }] })
    await fiber.dispose()
    await expect(ctx.web.search({ query: 'q' })).rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' }))
  })

  it('stays registered but unavailable with no instance URL, so nothing falls back', async () => {
    const fetchMock = stubFetch(json({ results: [] }))
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: 'searxng' })
    await ctx.plugin(searxng, {})
    await expect(ctx.web.search({ query: 'q' })).rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE' }))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never reads an instance URL from the environment', async () => {
    const fetchMock = stubFetch(json({ results: [] }))
    vi.stubEnv('SEARXNG_URL', 'http://127.0.0.1:9999')
    vi.stubEnv('SEARXNG_BASE_URL', 'http://127.0.0.1:9999')
    try {
      const ctx = new Context()
      await ctx.plugin(WebRuntime, { searchProvider: 'searxng' })
      await ctx.plugin(searxng, {})
      await expect(ctx.web.search({ query: 'q' })).rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE' }))
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('fails at load on a malformed instance URL', async () => {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: 'searxng' })
    await expect(ctx.plugin(searxng, { baseURL: 'http://search.example.com' })).rejects.toThrow('use https')
  })
})
