// Boots the published dsh CLI's headless profile against the mock Messages
// server and inspects the real requests the DeepSeek adapter sends.
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { startMockLlmServer, type MockLlmRequestRecord } from '@deepseek-ai/dsh-llm-mock-server'
import { afterAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('..', import.meta.url))
const dshBin = resolve(dirname(require.resolve('@deepseek-ai/dsh/package.json')), 'lib/bin.js')
const bundlePatches = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  dsh: { bundle: { patch: string[] } }
}).dsh.bundle.patch.map(file => resolve(root, file))

const homes: string[] = []
afterAll(() => { for (const home of homes) rmSync(home, { recursive: true, force: true }) })

interface TaskOptions {
  readonly task?: string
  /** OTLP logs endpoint; defaults to a dead local port. */
  readonly otlpUrl?: string
}

/** Run one headless task with optional --patch overlays; returns every request the mock received. */
async function runTask(patches: readonly string[], options: TaskOptions = {}): Promise<readonly MockLlmRequestRecord[]> {
  const server = await startMockLlmServer({ apiKey: 'mock-key', sequence: ['success'], repeatLast: true, successText: 'done' })
  const home = mkdtempSync(join(tmpdir(), 'otr-boot-'))
  homes.push(home)
  try {
    await promisify(execFile)(process.execPath, [
      dshBin, '--profile', 'headless',
      ...patches.flatMap(patch => ['--patch', patch]),
      options.task ?? 'Reply with the word done.',
    ], {
      cwd: home,
      timeout: 120_000,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: home,
        DSH_HOME: join(home, '.dsh'),
        DEEPSEEK_BASE_URL: server.baseURL,
        DEEPSEEK_API_KEY: 'mock-key',
        // Never reach DeepSeek's collector, even in the control run.
        DSH_TELEMETRY_OTLP_URL: options.otlpUrl ?? 'http://127.0.0.1:9/v1/logs',
      },
    })
    return [...server.requests]
  } finally {
    await server.close()
  }
}

const recordFeedbackPatch = join(root, 'tests/fixtures/record-feedback.patch.yml')

/** Count OTLP export requests for one headless turn followed by recorded feedback. */
async function feedbackUploads(patches: readonly string[]): Promise<number> {
  let uploads = 0
  const collector = createServer((request, response) => {
    uploads += 1
    request.resume()
    request.on('end', () => { response.writeHead(200, { 'content-type': 'application/json' }).end('{}') })
  })
  await new Promise<void>(resolve => { collector.listen(0, '127.0.0.1', resolve) })
  try {
    const { port } = collector.address() as AddressInfo
    await runTask([...patches, recordFeedbackPatch], { otlpUrl: `http://127.0.0.1:${port}/v1/logs` })
    return uploads
  } finally {
    await new Promise<void>(resolve => { collector.close(() => { resolve() }) })
  }
}

function fields(requests: readonly MockLlmRequestRecord[]): Set<string> {
  return new Set(requests.flatMap(request =>
    typeof request.body === 'object' && request.body !== null ? Object.keys(request.body) : []))
}

describe('disable telemetry, booted', { timeout: 300_000 }, () => {
  it('sends the session log and plugin inventory without the bundle (control)', async () => {
    const sent = fields(await runTask([]))
    expect(sent).toContain('dsh_session_log')
    expect(sent).toContain('dsh_plugin_packages')
  })

  it('sends neither field with the bundle', async () => {
    const requests = await runTask(bundlePatches)
    expect(requests.length).toBeGreaterThan(0)
    const sent = fields(requests)
    expect(sent).not.toContain('dsh_session_log')
    expect(sent).not.toContain('dsh_plugin_packages')
  })

  it('uploads the session on feedback without the bundle (control)', async () => {
    expect(await feedbackUploads([])).toBeGreaterThan(0)
  })

  it('uploads nothing on feedback with the bundle', async () => {
    expect(await feedbackUploads(bundlePatches)).toBe(0)
  })

  it('sends the session log again when a later layer re-enables it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'otr-reenable-'))
    homes.push(dir)
    const reenable = join(dir, 'reenable.patch.yml')
    writeFileSync(reenable, '- id: session-log-deepseek\n  config:\n    enabled: true\n')
    const sent = fields(await runTask([...bundlePatches, reenable]))
    expect(sent).toContain('dsh_session_log')
    expect(sent).not.toContain('dsh_plugin_packages')
  })
})
