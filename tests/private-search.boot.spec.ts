// Boots the published dsh CLI's headless profile with a mock model that calls
// web_search, and checks where the search goes.
import type { MockLlmRequestRecord } from '@deepseek-ai/dsh-llm-mock-server'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanUp, runTask, startRecorder, writePatch } from './support/boot.ts'

afterAll(cleanUp)

/** One web_search call, then a plain reply. */
const searchOnce = {
  sequence: ['tool_call_success', 'success'] as const,
  repeatLast: true,
  toolName: 'web_search',
  toolArguments: JSON.stringify({ queries: ['otr probe query'] }),
}

/** The tool result text the model received for its web_search call. */
function toolResult(requests: readonly MockLlmRequestRecord[]): string {
  return JSON.stringify(requests.map(request => request.body))
}

describe('private search, booted', { timeout: 300_000 }, () => {
  it('sends web_search to the configured SearXNG instance', async () => {
    const searxng = await startRecorder((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ results: [{ url: 'https://otr-result.test/', title: 'OTR result', content: 'found via searxng' }] }))
    })
    try {
      const configure = writePatch(`- id: otr-web-search-searxng\n  config:\n    baseURL: ${searxng.url}\n`)
      const requests = await runTask([configure], { bundle: true, model: searchOnce })
      expect(searxng.requests).toHaveLength(1)
      const url = new URL(searxng.requests[0]?.url ?? '', searxng.url)
      expect(url.pathname).toBe('/search')
      expect(url.searchParams.get('q')).toBe('otr probe query')
      expect(url.searchParams.get('format')).toBe('json')
      expect(searxng.requests[0]?.headers.cookie).toBeUndefined()
      expect(toolResult(requests)).toContain('https://otr-result.test/')
      // The DeepSeek adapter only carried model turns; no request went to a DeepSeek tools endpoint.
      expect(requests.every(request => request.path.endsWith('/messages'))).toBe(true)
    } finally {
      await searxng.close()
    }
  })

  it('fails the search without falling back while no instance is configured', async () => {
    const requests = await runTask([], { bundle: true, model: searchOnce })
    expect(toolResult(requests)).toContain('searxng')
    expect(toolResult(requests)).toMatch(/unavailable|not set up/)
    expect(requests.every(request => request.path.endsWith('/messages'))).toBe(true)
  })

  it('fails a stale DeepSeek search selection instead of reaching DeepSeek', async () => {
    const stale = writePatch('- id: web\n  config:\n    searchProvider: deepseek-search-api\n    fetchProvider: deepseek-fetch-api\n')
    const requests = await runTask([stale], { bundle: true, model: searchOnce })
    expect(toolResult(requests)).toContain('deepseek-search-api')
    expect(toolResult(requests)).toContain('not registered')
    expect(requests.every(request => request.path.endsWith('/messages'))).toBe(true)
  })
})
