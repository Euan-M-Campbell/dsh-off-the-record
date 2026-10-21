// Builds every plugin under src/<plugin>/index.ts: declarations with tsc, JavaScript with tsdown.
// Until the first plugin exists the bundle is patch files only, and there is nothing to build.
// Both tools run through node with their resolved bin, which also works on Windows.
import { execFileSync } from 'node:child_process'
import { globSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const root = new URL('..', import.meta.url)
const require = createRequire(import.meta.url)

/** Resolve a package's command-line entry from its package.json `bin`. */
function bin(name: string, command: string): string {
  const manifestPath = require.resolve(`${name}/package.json`)
  const { bin: entry } = JSON.parse(readFileSync(manifestPath, 'utf8')) as { bin: string | Record<string, string> }
  const relative = typeof entry === 'string' ? entry : entry[command]
  if (relative === undefined) throw new Error(`build: ${name} has no "${command}" command`)
  return join(dirname(manifestPath), relative)
}

if (globSync('src/*/index.ts', { cwd: root }).length === 0) {
  console.log('build: no plugins under src/, nothing to build')
} else {
  execFileSync(process.execPath, [bin('typescript', 'tsc'), '-p', 'tsconfig.build.json'], { cwd: root, stdio: 'inherit' })
  execFileSync(process.execPath, [bin('tsdown', 'tsdown')], { cwd: root, stdio: 'inherit' })
}
