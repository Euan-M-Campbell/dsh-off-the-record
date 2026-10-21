// Runs the published dsh CLI's headless profile against the mock Messages
// server, optionally with this bundle installed the way a user installs it.
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { startMockLlmServer, type MockLlmRequestRecord, type MockLlmServerOptions } from '@deepseek-ai/dsh-llm-mock-server'

const require = createRequire(import.meta.url)
export const root = fileURLToPath(new URL('../..', import.meta.url))
const dshBin = resolve(dirname(require.resolve('@deepseek-ai/dsh/package.json')), 'lib/bin.js')

const scratch: string[] = []

/** Remove every temporary directory the helpers created. */
export function cleanUp(): void {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
}

/**
 * Write a patch file into a temporary directory.
 * @param yaml - the patch content.
 * @returns the file path.
 */
export function writePatch(yaml: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'otr-patch-'))
  scratch.push(dir)
  const file = join(dir, 'test.patch.yml')
  writeFileSync(file, yaml)
  return file
}

export interface TaskOptions {
  /** Install the bundle with `dsh plugin add` before the run: `true` for this checkout, or an install spec such as a GitHub tag. */
  readonly bundle?: boolean | string
  readonly task?: string
  /** OTLP logs endpoint; defaults to a dead local port so nothing reaches DeepSeek's collector. */
  readonly otlpUrl?: string
  /** Mock model script; defaults to one successful reply. */
  readonly model?: Partial<MockLlmServerOptions>
  /** Receives the task run's stdout and stderr. */
  readonly onOutput?: (output: { readonly stdout: string; readonly stderr: string }) => void
  /** Runs before the harness starts, with the temporary home (the cwd) and its DSH_HOME. */
  readonly prepareHome?: (home: string, dshHome: string) => void
  /** Runs after the task, before cleanup. */
  readonly inspectHome?: (home: string, dshHome: string) => void
  /** Extra environment for the harness process. */
  readonly env?: Readonly<Record<string, string>>
}

/**
 * Run one headless task in a fresh harness home.
 * @param patches - `--patch` overlays, in order, applied after every bundle.
 * @param options - bundle install, task text, telemetry endpoint, and model script.
 * @returns every request the mock model received.
 */
export async function runTask(patches: readonly string[], options: TaskOptions = {}): Promise<readonly MockLlmRequestRecord[]> {
  const server = await startMockLlmServer({ apiKey: 'mock-key', sequence: ['success'], repeatLast: true, successText: 'done', ...options.model })
  const home = mkdtempSync(join(tmpdir(), 'otr-boot-'))
  scratch.push(home)
  const run = (args: readonly string[]) => promisify(execFile)(process.execPath, [dshBin, ...args], {
    cwd: home,
    timeout: Number(process.env.OTR_BOOT_TIMEOUT_MS ?? 120_000),
    env: {
      PATH: process.env.PATH ?? '',
      HOME: home,
      DSH_HOME: join(home, '.dsh'),
      DEEPSEEK_BASE_URL: server.baseURL,
      DEEPSEEK_API_KEY: 'mock-key',
      DSH_TELEMETRY_OTLP_URL: options.otlpUrl ?? 'http://127.0.0.1:9/v1/logs',
      ...options.env,
    },
  })
  try {
    options.prepareHome?.(home, join(home, '.dsh'))
    if (options.bundle !== undefined && options.bundle !== false) {
      await run(['plugin', '--profile', 'headless', 'add', options.bundle === true ? root : options.bundle])
    }
    const output = await run(['--profile', 'headless', ...patches.flatMap(patch => ['--patch', patch]), options.task ?? 'Reply with the word done.'])
    options.onOutput?.(output)
    options.inspectHome?.(home, join(home, '.dsh'))
    return [...server.requests]
  } finally {
    await server.close()
  }
}

/** A local HTTP server that records each request. */
export interface Recorder {
  readonly url: string
  readonly requests: readonly { readonly method: string; readonly url: string; readonly headers: IncomingMessage['headers'] }[]
  close(): Promise<void>
}

/**
 * Start a local HTTP server.
 * @param respond - writes each response.
 * @returns the server's base URL and recorded requests.
 */
export async function startRecorder(respond: (request: IncomingMessage, response: ServerResponse) => void): Promise<Recorder> {
  const requests: { method: string; url: string; headers: IncomingMessage['headers'] }[] = []
  const server = createServer((request, response) => {
    requests.push({ method: request.method ?? '', url: request.url ?? '', headers: request.headers })
    request.resume()
    request.on('end', () => { respond(request, response) })
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${String(port)}`,
    requests,
    close: () => new Promise<void>((resolve) => { server.close(() => { resolve() }) }),
  }
}

/**
 * Top-level field names across the mock model's request bodies.
 * @param requests - captured requests.
 * @returns the set of field names.
 */
export function fields(requests: readonly MockLlmRequestRecord[]): Set<string> {
  return new Set(requests.flatMap(request =>
    typeof request.body === 'object' && request.body !== null ? Object.keys(request.body) : []))
}
