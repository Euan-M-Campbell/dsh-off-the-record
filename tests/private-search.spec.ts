import { describe, expect, it } from 'vitest'
import { compose, harnessLayer, ownLayer, userLayer } from './compose.ts'

const base = harnessLayer('@deepseek-ai/dsh-base')
const webApp = harnessLayer('@deepseek-ai/dsh-web-app')
const own = ownLayer()

describe('private search', () => {
  const composed = compose(base, webApp, own)

  it('mounts both providers', () => {
    expect(composed.row('otr-web-search-searxng')).toMatchObject({ name: 'dsh-off-the-record/web-search-searxng' })
    expect(composed.row('otr-web-search-brave')).toMatchObject({ name: 'dsh-off-the-record/web-search-brave' })
  })

  it('pins search to SearXNG and keeps fetches on the direct http provider', () => {
    expect(composed.row('web').config).toEqual({ searchProvider: 'searxng', fetchProvider: 'http' })
  })

  it('disables both DeepSeek web rows and leaves direct fetching on', () => {
    expect(composed.row('web-search-deepseek').disabled).toBe(true)
    expect(composed.row('web-deepseek-api').disabled).toBe(true)
    expect(composed.row('web-fetch-http').disabled).not.toBe(true)
  })

  it('restates every key the web row ships with', () => {
    const shipped = compose(base, webApp).row('web').config ?? {}
    expect(Object.keys(composed.row('web').config ?? {})).toEqual(expect.arrayContaining(Object.keys(shipped)))
  })

  it('applies in a profile without dsh-web-app too', () => {
    const cli = compose(base, own)
    expect(cli.row('web').config).toEqual({ searchProvider: 'searxng', fetchProvider: 'http' })
    expect(cli.warnings.filter(warning => warning.layer === own.label && !warning.message.includes('product-analytics'))).toEqual([])
  })

  it('leaves a provider selection saved in the profile in force, with no DeepSeek provider for it to reach', () => {
    const switched = compose(base, webApp, own, userLayer(`
- id: web
  config:
    searchProvider: deepseek-search-api
    fetchProvider: deepseek-fetch-api
`))
    expect(switched.row('web').config).toMatchObject({ searchProvider: 'deepseek-search-api' })
    expect(switched.row('web-deepseek-api').disabled).toBe(true)
    expect(switched.row('web-search-deepseek').disabled).toBe(true)
  })
})
