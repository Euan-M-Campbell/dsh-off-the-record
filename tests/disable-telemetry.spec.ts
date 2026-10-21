import { describe, expect, it } from 'vitest'
import { compose, harnessLayer, ownLayer, userLayer } from './compose.ts'

const base = harnessLayer('@deepseek-ai/dsh-base')
const webApp = harnessLayer('@deepseek-ai/dsh-web-app')
const own = ownLayer()

describe('disable telemetry', () => {
  describe('in a Web or Desktop profile (dsh-base, dsh-web-app, this bundle)', () => {
    const composed = compose(base, webApp, own)

    it('turns off the feedback session upload', () => {
      expect(composed.row('session-telemetry-otel').config).toEqual({ mode: 'DISABLED' })
    })

    it('stops sending the session log on DeepSeek requests', () => {
      expect(composed.row('session-log-deepseek').config).toEqual({ enabled: false })
    })

    it('stops sending the plugin inventory on DeepSeek requests', () => {
      expect(composed.row('plugin-package-inventory-deepseek').config).toEqual({ enabled: false })
    })

    it('turns off desktop usage analytics and keeps the shipped app version', () => {
      expect(composed.row('product-analytics').config).toEqual({
        enabled: false,
        appVersion: { __jsExpr: 'process.env.DSH_CLIENT_VERSION' },
      })
    })

    it('leaves the managed rows mounted, so services that inject them still resolve', () => {
      for (const id of ['session-telemetry-otel', 'session-log-deepseek', 'plugin-package-inventory-deepseek', 'desktop-product-telemetry']) {
        expect(composed.row(id).disabled, id).not.toBe(true)
      }
    })

    it('matches a row with every override', () => {
      expect(composed.warnings.filter(warning => warning.layer === own.label)).toEqual([])
    })
  })

  it('skips only the desktop analytics override in a profile without dsh-web-app', () => {
    const composed = compose(base, own)
    expect(composed.warnings.filter(warning => warning.layer === own.label)).toEqual([
      { layer: own.label, message: 'patch: entry "product-analytics" not found' },
    ])
    expect(composed.row('session-telemetry-otel').config).toEqual({ mode: 'DISABLED' })
  })

  it('yields to a later layer that re-enables a channel', () => {
    const composed = compose(base, webApp, own, userLayer(`
- id: session-log-deepseek
  config:
    enabled: true
`))
    expect(composed.row('session-log-deepseek').config).toEqual({ enabled: true })
    expect(composed.row('plugin-package-inventory-deepseek').config).toEqual({ enabled: false })
  })

  // An override replaces the row's whole config. If a harness release ships a key
  // an override does not restate, this fails until the override is reviewed.
  it('restates every shipped key except the ones DISABLED never reads', () => {
    const shipped = compose(base, webApp)
    const ours = compose(base, webApp, own)
    const droppedOnPurpose: Record<string, readonly string[]> = {
      'session-telemetry-otel': ['exporter', 'processor', 'shutdownTimeoutMillis', 'maxRequestBytes'],
    }
    for (const id of ['session-telemetry-otel', 'session-log-deepseek', 'plugin-package-inventory-deepseek', 'product-analytics']) {
      const expected = Object.keys(shipped.row(id).config ?? {}).filter(key => !droppedOnPurpose[id]?.includes(key))
      expect(Object.keys(ours.row(id).config ?? {}), id).toEqual(expect.arrayContaining(expected))
    }
  })
})
