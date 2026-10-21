/**
 * The browser's view of the Host `offTheRecord` Remote service. The harness
 * generates this from types for its own packages; an out-of-tree bundle
 * declares it by hand. The Host serves these methods through the Gateway's
 * descriptor-free (SRC) path, which matches arguments by parameter name.
 * @module dsh-off-the-record/client/remote
 */

import { createTypertRemoteInfo } from '@deepseek-ai/dsh-typert-protocol/remote-info'
import type { TypertRemoteMethodSpec } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'

const PACKAGE = 'dsh-off-the-record'

const codec = (symbol: string, create: () => z.ZodType) => ({ mode: 'strict' as const, typeSymbol: `${PACKAGE}#${symbol}`, create })
const parameter = (method: string, name: string, create: () => z.ZodType) => {
  const spec = codec(`offTheRecord/${method}:${name}`, create)
  return { name, source: 'json' as const, codec: spec, strictCodec: spec }
}
const method = (name: string, description: string, parameters: [string, () => z.ZodType][], result: () => z.ZodType): TypertRemoteMethodSpec => ({
  service: 'offTheRecord',
  description,
  invocation: { kind: 'direct' },
  parameters: parameters.map(([parameterName, create]) => parameter(name, parameterName, create)),
  result: codec(`offTheRecord/${name}:result`, result),
})

const text = () => z.string()
const flag = () => z.boolean()
const nothing = () => z.unknown()

/** The contribution the page mounts with `ctx.remote.$mount()`. */
export const OFF_THE_RECORD_REMOTE = createTypertRemoteInfo({
  package: PACKAGE,
  methods: {
    'offTheRecord/pageStatus': method('pageStatus', 'Everything the settings page shows.', [], () => z.unknown()),
    'offTheRecord/setChannel': method('setChannel', 'Turn a live channel off or on.', [['id', text], ['off', flag]], nothing),
    'offTheRecord/setSearchProvider': method('setSearchProvider', 'Choose the private search provider.', [['provider', text]], nothing),
    'offTheRecord/setSearxngUrl': method('setSearxngUrl', 'Set or clear the SearXNG instance URL.', [['url', text]], nothing),
    'offTheRecord/setBraveKey': method('setBraveKey', 'Store or remove the Brave API key.', [['key', text]], nothing),
    'offTheRecord/setSecret': method('setSecret', 'Add, replace, or remove a vault secret.', [['name', text], ['value', text]], nothing),
    'offTheRecord/setNewIdEachStart': method('setNewIdEachStart', 'Turn a new anonymous installation id at every start on or off.', [['on', flag]], nothing),
  },
}, z)
