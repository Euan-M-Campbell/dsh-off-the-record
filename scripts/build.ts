// Builds every plugin under src/<plugin>/index.ts: declarations with tsc, JavaScript with tsdown.
// Until the first plugin exists the bundle is patch files only, and there is nothing to build.
import { execFileSync } from 'node:child_process'
import { globSync } from 'node:fs'

const root = new URL('..', import.meta.url)

if (globSync('src/*/index.ts', { cwd: root }).length === 0) {
  console.log('build: no plugins under src/, nothing to build')
} else {
  execFileSync('tsc', ['-p', 'tsconfig.build.json'], { cwd: root, stdio: 'inherit' })
  execFileSync('tsdown', [], { cwd: root, stdio: 'inherit' })
}
