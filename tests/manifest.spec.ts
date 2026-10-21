import { globSync, readFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

const root = new URL('..', import.meta.url)

interface Manifest {
  readonly exports: Record<string, unknown>
  readonly dependencies?: Record<string, string>
  readonly dsh: { readonly bundle: { readonly patch: readonly string[] } }
}

const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as Manifest

describe('bundle manifest', () => {
  it('lists the status patch, then the three part patches, in order', () => {
    expect(manifest.dsh.bundle.patch).toEqual([
      './patches/off-the-record.patch.yml',
      './patches/disable-telemetry.patch.yml',
      './patches/private-search.patch.yml',
      './patches/secrets-vault.patch.yml',
    ])
  })

  it.each(manifest.dsh.bundle.patch)('%s is a YAML array', (patch) => {
    expect(load(readFileSync(new URL(patch, root), 'utf8'), { schema: entryListSchema })).toBeInstanceOf(Array)
  })

  // otr-settings is the package root: the harness attaches a browser half only to the bare package row.
  const exportKey = (plugin: string): string => plugin === 'otr-settings' ? '.' : `./${plugin}`

  it('exports every plugin directory from its built entry', () => {
    // src/client is the browser half, exported as ./client.
    const plugins = globSync('src/*/index.ts', { cwd: root }).map(file => basename(dirname(file))).filter(plugin => plugin !== 'client')
    for (const plugin of plugins) {
      expect(manifest.exports[exportKey(plugin)]).toEqual({
        types: `./lib/types/${plugin}/index.d.ts`,
        default: `./lib/${plugin}/index.js`,
      })
    }
    // Display metadata (locale files, icons) and the browser half are exports, not plugins.
    const exported = Object.keys(manifest.exports).filter(key => key !== './package.json' && key !== './client' && !key.includes('/locale/') && !key.endsWith('/icon'))
    expect(exported.toSorted()).toEqual(plugins.map(exportKey).toSorted())
  })

  it('ships no third-party runtime dependencies', () => {
    const dependencies = manifest.dependencies ?? {}
    expect(Object.keys(dependencies).filter(name => !name.startsWith('@deepseek-ai/'))).toEqual([])
  })

  it('gives the bundle and every component a title in English and Chinese, and an icon, through its exports', async () => {
    const { createRequire } = await import('node:module')
    const { existsSync } = await import('node:fs')
    const require = createRequire(new URL('package.json', root))
    const plugins = globSync('src/*/index.ts', { cwd: root }).map(file => basename(dirname(file)))
      .filter(plugin => plugin !== 'client' && plugin !== 'otr-settings' && plugin !== 'vault')
    for (const [locale, icon] of [['dsh-off-the-record/locale', undefined], ...plugins.map(plugin => [`dsh-off-the-record/${plugin}/locale`, `dsh-off-the-record/${plugin}/icon`])] as const) {
      for (const lang of ['en', 'zh']) {
        const file = require.resolve(`${locale}/${lang}.json`)
        const { meta } = JSON.parse(readFileSync(file, 'utf8')) as { meta: { title?: unknown; description?: unknown } }
        expect(typeof meta.title === 'string' && meta.title.length > 0, file).toBe(true)
        expect(typeof meta.description === 'string' && meta.description.length > 0, file).toBe(true)
      }
      if (icon !== undefined) expect(existsSync(require.resolve(icon))).toBe(true)
    }
    const declared = (JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { icon: string }).icon
    const icons = [fileURLToPath(new URL(declared, root)), ...plugins.map(plugin => require.resolve(`dsh-off-the-record/${plugin}/icon`))]
    // Each component has its own icon, distinct from the bundle's and from each other.
    expect(new Set(icons).size).toBe(icons.length)
    for (const icon of icons) {
      const svg = readFileSync(icon, 'utf8')
      expect(svg.length, icon).toBeLessThan(256 * 1024)
      expect(svg, icon).toMatch(/^<svg [^>]*viewBox="0 0 36 36"/)
      // Self-contained: no external references.
      expect(svg, icon).not.toMatch(/href="(?!#)|url\((?!#)/)
    }
  })
})
