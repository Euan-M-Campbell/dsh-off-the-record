// Runs the built browser bundle (lib/client.js) the way the Web shell does:
// its factory registers with a module loader and receives `require` for the
// shared platform modules. Primitives are stubbed with plain elements; React,
// zod, and the client store are the real packages.
import { readFileSync } from 'node:fs'
import * as react from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import * as store from '@deepseek-ai/dsh-client-store'
import * as zod from 'zod'
import { describe, expect, it, vi } from 'vitest'
import { en, zh } from '../src/client/locales.ts'
import type { PageStatus } from '../src/otr-settings/page.ts'
import { secretName } from '../src/vault/index.ts'

const STATUS: PageStatus = {
  channels: [
    { id: 'session-telemetry-otel', part: 'telemetry', label: 'Feedback session upload', state: 'off' },
    { id: 'session-log-deepseek', part: 'telemetry', label: 'Session log on DeepSeek requests', state: 'on', changedBy: '/home/me/.dsh/profiles/web/cordis.patch.yml', fix: 'Remove it.' },
    { id: 'plugin-package-inventory-deepseek', part: 'telemetry', label: 'Plugin inventory on DeepSeek requests', state: 'off' },
    { id: 'product-analytics', part: 'telemetry', label: 'Desktop usage analytics', state: 'not-present' },
    { id: 'web-search-deepseek', part: 'search', label: 'DeepSeek search provider', state: 'off' },
    { id: 'web-deepseek-api', part: 'search', label: 'DeepSeek Search and Fetch API providers', state: 'off' },
  ],
  search: { provider: 'searxng', fetchProvider: 'http', private: true },
  profile: 'web',
  telemetryEnvBackstop: false,
  newIdEachStart: true,
  settingsAvailable: true,
  liveChannels: ['session-log-deepseek'],
  searxng: { baseURL: 'http://127.0.0.1:8888' },
  brave: { keyConfigured: true, keyWritable: true },
  vault: {
    available: true,
    writable: true,
    secrets: [
      { name: secretName('DB_URL'), origin: 'user', scope: 'global' },
      { name: secretName('SESSION_KEY'), origin: 'generated', scope: 'global' },
      { name: secretName('DB_URL'), origin: 'user', scope: 'workspace', directory: '/work/shop' },
      { name: secretName('OLD_TOKEN'), origin: 'user', scope: 'workspace', directory: '/work/old' },
    ],
    workspaces: [
      { directory: '/work/shop', title: 'Shop', registered: true },
      { directory: '/work/blog', title: 'Blog', registered: true },
      { directory: '/work/old', title: 'old', registered: false },
    ],
  },
}

// Plain stand-ins for the shell's primitives; they keep the props the page passes.
const h = react.createElement
const primitives = {
  Button: ({ children, onClick, disabled }: { children?: react.ReactNode; onClick?: () => void; disabled?: boolean }) => h('button', { onClick, disabled }, children),
  Input: (props: Record<string, unknown>) => h('input', props),
  Switch: ({ checked, label, disabled, onChange }: { checked: boolean; label: string; disabled?: boolean; onChange: (next: boolean) => void }) =>
    h('input', { type: 'checkbox', 'aria-label': label, checked, disabled, onChange: () => { onChange(!checked) } }),
  Tag: ({ children }: { children?: react.ReactNode }) => h('span', { className: 'tag' }, children),
  StateDot: ({ state }: { state: string }) => h('i', { 'data-state': state }),
}

const modules: Record<string, unknown> = {
  react, 'react/jsx-runtime': jsxRuntime, zod, '@deepseek-ai/dsh-client-store': store, '@deepseek-ai/dsh-client-ui-primitives': primitives,
}

interface Loaded { id: string; exports: { apply(ctx: unknown): Promise<void>; inject: string[]; PACKAGE: string } }

function loadBundle(): Loaded {
  let registered: Loaded | undefined
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const window = { __ModuleLoader__: { load: ({ id, factory }: { id: string; factory: (require: (name: string) => unknown) => Loaded['exports'] }) => {
    registered = { id, exports: factory((name) => {
      if (!(name in modules)) throw new Error(`the bundle required ${name}, which is not a platform module`)
      return modules[name]
    }) }
  } } }
  // The shell evaluates the bundle as a script with its module loader on `window`; this does the same.
  // oxlint-disable-next-line typescript/no-implied-eval -- running the built bundle is the point of this test
  new Function('window', source)(window)
  if (registered === undefined) throw new Error('the bundle did not register')
  return registered
}

function translator(dict: Record<string, string>) {
  return (key: string, params?: Record<string, unknown>) =>
    (dict[key] ?? key).replace(/\{(\w+)\}/g, (match, name: string) => params !== undefined && name in params ? String(params[name]) : match)
}

async function mountPage(overrides: Partial<PageStatus> = {}) {
  const calls: [string, unknown[]][] = []
  const remote = Object.fromEntries(['setChannel', 'setSearchProvider', 'setSearxngUrl', 'setBraveKey', 'setSecret', 'setNewIdEachStart'].map(method => [
    method, (...args: unknown[]) => { calls.push([method, args]); return Promise.resolve({ ok: true, value: null }) },
  ]))
  const offTheRecord = { ...remote, pageStatus: () => Promise.resolve({ ok: true, value: { ...STATUS, ...overrides } }) }
  const mounted: unknown[] = []
  let registration: { def: Record<string, unknown>; component: (props: Record<string, unknown>) => react.ReactNode } | undefined
  const locales: Record<string, unknown> = {}
  const ctx: Record<string, unknown> = {
    effect: (fn: () => unknown) => { fn() },
    inject: (_names: string[], callback: (child: unknown) => void) => { callback(ctx) },
    remote: {
      $mount: (contribution: unknown) => { mounted.push(contribution); return Promise.resolve(() => Promise.resolve()) },
      $on: () => () => undefined,
      offTheRecord,
    },
    locale: { register: (ns: string, dicts: unknown) => { locales[ns] = dicts; return () => undefined } },
    slots: {
      inject: (_name: string, callback: () => unknown) => { callback() },
      register: (def: Record<string, unknown>, component: (props: Record<string, unknown>) => react.ReactNode) => { registration = { def, component }; return () => undefined },
    },
  }
  const bundle = loadBundle()
  await bundle.exports.apply(ctx)
  if (registration === undefined) throw new Error('the page did not register')
  const face = (registration.def.inject as () => Record<string, unknown> & { hooks: { otrPage: { getSnapshot(): unknown } } })()
  await vi.waitFor(() => { expect((face.hooks.otrPage.getSnapshot() as { status?: unknown }).status).toBeDefined() })
  const render = (view: 'page' | 'summary', dict: Record<string, string> = en) => renderToStaticMarkup(h(registration!.component, {
    ...face, view, t: translator(dict), useOtrPage: (select: (state: unknown) => unknown) => select(face.hooks.otrPage.getSnapshot()),
  }))
  return { bundle, mounted, registration, locales, face, calls, render }
}

describe('client bundle', () => {
  it('registers with the module loader under the package name and requires only platform modules', () => {
    const bundle = loadBundle()
    expect(bundle.id).toBe('dsh-off-the-record')
    expect(bundle.exports.inject).toEqual(['remote', 'slots', 'locale'])
  })

  it('mounts the Remote contribution and registers the page in its bundle slot', async () => {
    const { mounted, registration, locales } = await mountPage()
    const contribution = mounted[0] as { package: string; methods: Record<string, unknown> }
    expect(contribution.package).toBe('dsh-off-the-record')
    expect(Object.keys(contribution.methods).sort()).toEqual([
      'offTheRecord/pageStatus', 'offTheRecord/setBraveKey', 'offTheRecord/setChannel', 'offTheRecord/setNewIdEachStart',
      'offTheRecord/setSearchProvider', 'offTheRecord/setSearxngUrl', 'offTheRecord/setSecret',
    ])
    expect(registration.def).toMatchObject({ name: 'plugins.bundle.config', key: 'dsh-off-the-record', locale: 'settings.offTheRecord' })
    expect(locales['settings.offTheRecord']).toEqual({ en, zh })
  })

  it('renders the summary line', async () => {
    const { render } = await mountPage()
    expect(render('summary')).toBe('2 of 3 telemetry channels off · search: searxng')
  })

  it('renders every section with the state, the layer responsible, and the secrets by name', async () => {
    const { render } = await mountPage()
    const html = render('page')
    for (const text of [en.telemetryTitle, en.searchTitle, en.vaultTitle]) expect(html).toContain(text.replaceAll('\'', '&#x27;').replaceAll('"', '&quot;'))
    // No summary or tagline line above the sections; the bundle header already says it.
    expect(html).not.toContain(en.tagline.replaceAll('\'', '&#x27;'))
    expect(html).not.toContain('telemetry channels off')
    expect(html).toContain('Turned on in /home/me/.dsh/profiles/web/cordis.patch.yml.')
    expect(html).toContain('DB_URL')
    expect(html).toContain('SESSION_KEY')
    // Only the selected provider's settings show: SearXNG's address, not Brave's key.
    expect(html).toContain('value="http://127.0.0.1:8888"')
    expect(html).not.toContain(en.braveKey)
    expect(html).not.toContain('postgres')
  })

  it('renders in Chinese', async () => {
    const { render } = await mountPage()
    const html = render('page', zh)
    expect(html).toContain(zh.telemetryTitle)
    expect(html).toContain(zh.vaultTitle)
    expect(render('summary', zh)).toBe('已关闭 2/3 个遥测通道 · 搜索：searxng')
  })

  it('shows the SearXNG address on one line, with its problem in place of Set when invalid', async () => {
    const valid = (await mountPage()).render('page')
    expect(valid).toContain(`>${en.set}<`)
    const invalid = (await mountPage({ searxng: { baseURL: 'http://search.example.com', problem: 'plain http is allowed only for this machine or a private network; use https' } })).render('page')
    expect(invalid).toContain('use https')
    expect(invalid).not.toContain(`>${en.set}<`)
    const unset = (await mountPage({ searxng: { baseURL: '', problem: 'no SearXNG instance is configured' } })).render('page')
    expect(unset).toContain(`>${en.notSet}<`)
  })

  it('groups secrets as global and per workspace, and offers every workspace as a scope', async () => {
    const html = (await mountPage()).render('page')
    const order = ['Global', 'SESSION_KEY', 'Shop', 'old · no longer a workspace', 'OLD_TOKEN'].map(text => html.indexOf(text))
    expect(order.every(index => index >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    // A workspace with no secrets gets no heading, but can be chosen as a scope.
    expect(html).not.toContain('>Blog</span>')
    expect([...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]+)<\/option>/g)].map(match => [match[1], match[2]])).toEqual([
      ['', 'Global'], ['/work/shop', 'Shop'], ['/work/blog', 'Blog'], ['/work/old', 'old'],
    ])
  })

  it('shows the Brave key, not the SearXNG address, when Brave is selected', async () => {
    const { render } = await mountPage({ search: { provider: 'brave', fetchProvider: 'http', private: true } })
    const html = render('page')
    expect(html).toContain(en.braveKey)
    expect(html).toContain(`>${en.set}<`)
    expect(html).not.toContain(en.searxngUrl)
  })

  it('explains an unavailable vault and a non-private search provider', async () => {
    const { render } = await mountPage({ vault: { available: true, writable: false, secrets: [], workspaces: [] }, search: { provider: 'deepseek-search-api', fetchProvider: 'deepseek-fetch-api', private: false } })
    const html = render('page')
    expect(html).toContain(en.vaultUnavailable)
    expect(html).toContain('Search is set to &quot;deepseek-search-api&quot;, which is not private.')
  })

  it('gives every channel a switch: on means sending, and only live channels can be switched', async () => {
    const { render } = await mountPage()
    const html = render('page')
    const switches = [...html.matchAll(/<input type="checkbox" aria-label="([^"]+)"[^>]*>/g)].map(match => ({ label: match[1], tag: match[0] }))
    const state = (label: string) => switches.find(entry => entry.label === label)?.tag ?? ''
    expect(switches.map(entry => entry.label)).toEqual([
      en['channel.session-telemetry-otel'], en['channel.session-log-deepseek'], en['channel.plugin-package-inventory-deepseek'],
      en['channel.product-analytics'], en.newIdEachStart,
    ])
    // A new installation id at every start: on by default, and switchable.
    expect(state(en.newIdEachStart)).toContain('checked')
    expect(state(en.newIdEachStart)).not.toContain('disabled')
    // The session log is on (a profile override) and live: checked and enabled.
    expect(state(en['channel.session-log-deepseek'])).toContain('checked')
    expect(state(en['channel.session-log-deepseek'])).not.toContain('disabled')
    // The feedback upload is off and needs a restart to change: unchecked and disabled.
    expect(state(en['channel.session-telemetry-otel'])).not.toContain('checked')
    expect(state(en['channel.session-telemetry-otel'])).toContain('disabled')
    // Each toggle has a dot that follows its switch: green on (the session log and the rotating id), red off.
    expect(html.match(/data-state="done"/g)?.length).toBe(2)
    expect(html.match(/data-state="error"/g)?.length).toBe(3)
    // The DeepSeek web providers stay off by design and are not shown.
    expect(html).not.toContain('DeepSeek Search Provider')
  })

  it('turns a channel on when its switch is turned on, and off when turned off', async () => {
    const { registration, face, calls } = await mountPage()
    expect(registration).toBeDefined()
    const act = face as unknown as { setChannel(id: string, off: boolean): void }
    act.setChannel('session-log-deepseek', false)
    await vi.waitFor(() => { expect(calls).toEqual([['setChannel', ['session-log-deepseek', false]]]) })
  })

  it('sends each action to the Host with its arguments', async () => {
    const { face, calls } = await mountPage()
    const act = face as unknown as Record<string, (...args: unknown[]) => void>
    act.setChannel?.('session-log-deepseek', true)
    await vi.waitFor(() => { expect(calls).toHaveLength(1) })
    act.setSearchProvider?.('brave')
    await vi.waitFor(() => { expect(calls).toHaveLength(2) })
    act.setSecret?.('NEW_KEY', 'new-value-123', '/work/shop')
    await vi.waitFor(() => { expect(calls).toHaveLength(3) })
    act.setNewIdEachStart?.(false)
    await vi.waitFor(() => { expect(calls).toHaveLength(4) })
    expect(calls).toEqual([
      ['setChannel', ['session-log-deepseek', true]],
      ['setSearchProvider', ['brave']],
      ['setSecret', ['NEW_KEY', 'new-value-123', '/work/shop']],
      ['setNewIdEachStart', [false]],
    ])
  })
})

describe('page copy', () => {
  it('has the same keys in English and Chinese', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
  })

})
