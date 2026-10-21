import { globSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { defineConfig } from 'tsdown'

// One entry per plugin directory: src/<plugin>/index.ts builds to lib/<plugin>/index.js,
// which package.json exports as dsh-off-the-record/<plugin>.
const entry = Object.fromEntries(
  globSync('src/*/index.ts', { cwd: import.meta.dirname })
    .map(file => [`${basename(dirname(file))}/index`, file]),
)

export default defineConfig({
  entry,
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
