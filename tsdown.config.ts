import { globSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { defineConfig } from 'tsdown'
import { lowerDecorators } from './scripts/lower-decorators.ts'

// One entry per plugin directory: src/<plugin>/index.ts builds to lib/<plugin>/index.js,
// which package.json exports as dsh-off-the-record/<plugin>.
const entry = Object.fromEntries(
  globSync('src/*/index.ts', { cwd: import.meta.dirname })
    .filter(file => basename(dirname(file)) !== 'client')
    .map(file => [`${basename(dirname(file))}/index`, file]),
)

/**
 * Modules the Web shell shares with every client bundle (its PLATFORM_MODULES
 * table); the bundle requires them, never inlines them. Every other import is
 * either type-only, and erased, or inlined.
 */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  'zod', '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
]

/** The shell's module loader registers each plugin bundle as a factory over an injected `require`. */
const CLIENT_BANNER = 'window.__ModuleLoader__.load({\n\tid: "dsh-off-the-record",\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;'
const CLIENT_FOOTER = '\t\treturn module.exports;\n\t}\n});'

export default defineConfig([{
  entry,
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  // The Off the Record service's @Remote methods reach the page through the
  // Gateway's SRC mode, which needs no generated artifacts, only lowered decorators.
  plugins: [lowerDecorators()],
}, {
  // The settings page's browser half: lib/client.js, exported as ./client.
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  outExtensions: () => ({ js: '.js' }),
  dts: false,
  clean: false,
  deps: { neverBundle: PLATFORM_MODULES, alwaysBundle: [/^@deepseek-ai\/dsh-typert-protocol(\/|$)/] },
  outputOptions: { banner: CLIENT_BANNER, footer: CLIENT_FOOTER },
}])
