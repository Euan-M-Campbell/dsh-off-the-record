// Boot tests load the plugins through the package's exports, which point at
// lib/. Build first so they never run against a stale build.
import { execFileSync } from 'node:child_process'

export default function setup(): void {
  execFileSync(process.execPath, ['scripts/build.ts'], { cwd: new URL('..', import.meta.url), stdio: 'ignore' })
}
