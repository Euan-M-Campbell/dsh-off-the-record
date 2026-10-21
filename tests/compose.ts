// Composes bundle layers through the include's own patch algorithm, the same
// applyEntryPatches call the harness makes at boot and in --dump-config.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyEntryPatches, entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { load } from 'js-yaml'

export interface Row {
  readonly id?: string
  readonly name?: string
  readonly disabled?: unknown
  readonly config?: Record<string, unknown>
  readonly [key: string]: unknown
}

export interface Layer {
  readonly label: string
  readonly patches: PatchOptions[]
}

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('..', import.meta.url))

/** Parse one patch file in the harness's entry-list dialect (`!!js` stays an unevaluated `{ __jsExpr }`). */
export function readPatch(file: string): PatchOptions[] {
  const parsed = load(readFileSync(file, 'utf8'), { schema: entryListSchema })
  if (!Array.isArray(parsed)) throw new TypeError(`${file} must be a YAML array of patches`)
  return parsed as PatchOptions[]
}

function bundleLayer(label: string, manifestPath: string): Layer {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dsh: { bundle: { patch: string | string[] } } }
  const files = [manifest.dsh.bundle.patch].flat()
  return { label, patches: files.flatMap(file => readPatch(resolve(dirname(manifestPath), file))) }
}

/** A harness bundle layer, read from the installed devDependency. */
export function harnessLayer(name: '@deepseek-ai/dsh-base' | '@deepseek-ai/dsh-web-app'): Layer {
  return bundleLayer(name, require.resolve(`${name}/package.json`))
}

/** This bundle's layer, read through its own package.json. */
export function ownLayer(): Layer {
  return bundleLayer('dsh-off-the-record', resolve(root, 'package.json'))
}

/** An inline user layer, as in a profile's cordis.patch.yml. */
export function userLayer(yaml: string): Layer {
  return { label: 'profile', patches: load(yaml, { schema: entryListSchema }) as PatchOptions[] }
}

export interface Composition {
  readonly rows: readonly Row[]
  /** Skipped-patch warnings, keyed by the layer that caused them. */
  readonly warnings: readonly { readonly layer: string; readonly message: string }[]
  row(id: string): Row
}

/** Compose layers over the empty profile root, in application order. */
export function compose(...layers: Layer[]): Composition {
  const warnings: { layer: string; message: string }[] = []
  let rows: Row[] = []
  // One layer at a time so each warning is attributed to its layer; patches in a
  // later layer still see rows earlier layers inserted.
  for (const layer of layers) {
    rows = applyEntryPatches(rows as never, structuredClone(layer.patches), (message: string, ...args: unknown[]) => {
      let index = 0
      warnings.push({ layer: layer.label, message: message.replace(/%C/g, () => JSON.stringify(args[index++])) })
    }) as Row[]
  }
  return {
    rows,
    warnings,
    row(id) {
      const found = rows.find(row => row.id === id)
      if (found === undefined) throw new Error(`no composed row ${id}`)
      return found
    },
  }
}
