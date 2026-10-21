// Boots the published dsh CLI with this bundle installed and a vault secret in
// the credential store, has the mock model use it, and scans everything the
// harness sent or wrote for the value in every supported encoding.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { MockLlmRequestRecord } from '@deepseek-ai/dsh-llm-mock-server'
import { afterAll, describe, expect, it } from 'vitest'
import { ALL_ENCODINGS, forms } from '../src/tool-vault/redact.ts'
import { cleanUp, runTask, writePatch } from './support/boot.ts'

afterAll(cleanUp)

const SECRET = 'Sup3r$ecret-"q"/pa&ss=ok'
const leakForms = forms(SECRET, ALL_ENCODINGS).filter(form => form.length >= 8)

// headless disables the credential store; the vault needs it.
const withCredentials = writePatch('- id: credentials\n  disabled: false\n')

function seedVault(_home: string, dshHome: string): void {
  mkdirSync(dshHome, { recursive: true })
  writeFileSync(join(dshHome, '.credentials.yaml'), `version: 1\nrecords:\n  vault/db-password:\n    kind: api-key\n    key: ${JSON.stringify(SECRET)}\n`, { mode: 0o600 })
}

/** Every file under the harness home except the credential file that legitimately holds the value. */
function writtenFiles(home: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (name === 'node_modules' || name === '.credentials.yaml') continue
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) continue
      if (stat.isDirectory()) walk(path)
      else if (stat.size < 20_000_000) out.push({ path: relative(home, path), text: readFileSync(path, 'latin1') })
    }
  }
  walk(home)
  return out
}

function leaksIn(text: string): string[] {
  return leakForms.filter(form => text.includes(form))
}

interface Run {
  readonly requests: readonly MockLlmRequestRecord[]
  readonly files: { path: string; text: string }[]
}

async function run(bundle: boolean, toolName: string, args: unknown, prepare?: (home: string) => void): Promise<Run> {
  let files: { path: string; text: string }[] = []
  const requests = await runTask([withCredentials], {
    bundle,
    prepareHome: (home, dshHome) => { seedVault(home, dshHome); prepare?.(home) },
    inspectHome: (home) => { files = writtenFiles(home) },
    model: { sequence: ['tool_call_success', 'success'], repeatLast: true, toolName, toolArguments: JSON.stringify(args) },
  })
  return { requests, files }
}

// The harness composes PowerShell (tool "pwsh") instead of bash on Windows.
const windows = process.platform === 'win32'
const shellTool = windows ? 'pwsh' : 'bash'
const printEnvFile = windows ? 'Get-Content app.env' : 'cat app.env'
const printEverywhere = windows
  ? [
      'Write-Output "raw:$env:DB_PASSWORD"',
      '[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($env:DB_PASSWORD))',
      '[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("admin:$env:DB_PASSWORD"))',
      'node -e "const v = process.env.DB_PASSWORD; console.log(JSON.stringify({ v }), encodeURIComponent(v), Buffer.from(v).toString(\'base64url\'))"',
    ].join('; ')
  : [
      'printf "raw:%s\\n" "$DB_PASSWORD"',
      'printf "%s" "$DB_PASSWORD" | base64',
      'printf "admin:%s" "$DB_PASSWORD" | base64',
      'node -e \'const v = process.env.DB_PASSWORD; console.log(JSON.stringify({ v }), encodeURIComponent(v), Buffer.from(v).toString("base64url"))\'',
    ].join('; ')

describe('secrets vault, booted', { timeout: 300_000 }, () => {
  it('passes the secret to the command and keeps every form of it out of model requests and the session log', async () => {
    const { requests, files } = await run(true, 'run_with_secrets', { description: 'Print the password', command: printEverywhere, secrets: ['DB_PASSWORD'] })
    const sent = JSON.stringify(requests.map(request => request.body))
    expect(sent).toContain('raw:[secret:DB_PASSWORD]')
    expect(sent.match(/\[secret:DB_PASSWORD\]/g)?.length).toBeGreaterThanOrEqual(5)
    expect(leaksIn(sent)).toEqual([])
    expect(files.some(file => file.path.includes('session'))).toBe(true)
    expect(files.filter(file => leaksIn(file.text).length > 0).map(file => file.path)).toEqual([])
  })

  it('redacts a secret that any other tool returns', async () => {
    const { requests, files } = await run(true, shellTool, { description: 'Show the env file', command: printEnvFile }, (home) => {
      writeFileSync(join(home, 'app.env'), `DATABASE_PASSWORD=${SECRET}\n`)
    })
    const sent = JSON.stringify(requests.map(request => request.body))
    expect(sent).toContain('DATABASE_PASSWORD=[secret:DB_PASSWORD]')
    expect(leaksIn(sent)).toEqual([])
    expect(files.filter(file => file.path !== 'app.env' && leaksIn(file.text).length > 0).map(file => file.path)).toEqual([])
  })

  it('shows the raw value without the bundle (control)', async () => {
    const { requests } = await run(false, shellTool, { description: 'Show the env file', command: printEnvFile }, (home) => {
      writeFileSync(join(home, 'app.env'), `DATABASE_PASSWORD=${SECRET}\n`)
    })
    expect(leaksIn(JSON.stringify(requests.map(request => request.body)))).not.toEqual([])
  })

  it('lists secrets by name only', async () => {
    const { requests } = await run(true, 'list_secrets', {})
    const sent = JSON.stringify(requests.map(request => request.body))
    expect(sent).toContain('DB_PASSWORD (user)')
    expect(leaksIn(sent)).toEqual([])
  })

  it('refuses a secret that is not in the vault, naming it', async () => {
    const { requests } = await run(true, 'run_with_secrets', { description: 'Use a missing key', command: 'echo "$NOPE_KEY"', secrets: ['NOPE_KEY'] })
    expect(JSON.stringify(requests.map(request => request.body))).toContain('not in the vault: NOPE_KEY')
  })
})

describe('run_with_secrets under the sandbox, booted', { timeout: 300_000 }, () => {
  // Outside the workspace and the platform temporary areas; the default
  // workspace-write sandbox must refuse it for both tools alike.
  const probe = `/Users/Shared/otr-sandbox-probe-${String(process.pid)}`
  const tool = (requests: readonly MockLlmRequestRecord[]) => JSON.stringify(requests.map(request => request.body))

  it.runIf(process.platform === 'darwin')('denies a write outside the workspace, as bash does', async () => {
    const viaBash = tool((await run(true, 'bash', { description: 'Write outside', command: `touch ${probe}` })).requests)
    const viaVault = tool((await run(true, 'run_with_secrets', { description: 'Write outside', command: `touch ${probe}`, secrets: ['DB_PASSWORD'] })).requests)
    expect(viaBash).toContain('[sandbox: file access denied')
    expect(viaVault).toContain('[sandbox: file access denied')
    expect(existsSync(probe)).toBe(false)
  })

  it('fails closed when asked to escalate with no approval answerer', async () => {
    const { requests } = await run(true, 'run_with_secrets', {
      description: 'Write outside', command: `touch ${probe}`, secrets: ['DB_PASSWORD'],
      sandbox_permissions: 'danger-full-access', justification: 'Testing that escalation is refused.',
    })
    expect(tool(requests)).toContain('requires approval, but no approval channel is available')
    expect(existsSync(probe)).toBe(false)
  })
})
