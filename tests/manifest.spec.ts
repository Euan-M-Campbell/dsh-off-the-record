import { globSync, readFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'
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
  it('lists the three part patches in order', () => {
    expect(manifest.dsh.bundle.patch).toEqual([
      './patches/disable-telemetry.patch.yml',
      './patches/private-search.patch.yml',
      './patches/secrets-vault.patch.yml',
    ])
  })

  it.each(manifest.dsh.bundle.patch)('%s is a YAML array', (patch) => {
    expect(load(readFileSync(new URL(patch, root), 'utf8'), { schema: entryListSchema })).toBeInstanceOf(Array)
  })

  it('exports every plugin directory from its built entry', () => {
    const plugins = globSync('src/*/index.ts', { cwd: root }).map(file => basename(dirname(file)))
    for (const plugin of plugins) {
      expect(manifest.exports[`./${plugin}`]).toEqual({
        types: `./lib/types/${plugin}/index.d.ts`,
        default: `./lib/${plugin}/index.js`,
      })
    }
    const exported = Object.keys(manifest.exports).filter(key => key !== './package.json').map(key => key.slice(2))
    expect(exported.toSorted()).toEqual(plugins.toSorted())
  })

  it('ships no third-party runtime dependencies', () => {
    const dependencies = manifest.dependencies ?? {}
    expect(Object.keys(dependencies).filter(name => !name.startsWith('@deepseek-ai/'))).toEqual([])
  })
})
