// Boots the published dsh CLI's headless profile against the mock Messages
// server and inspects the real requests the DeepSeek adapter sends.
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanUp, fields, root, runTask, startRecorder, writePatch } from './support/boot.ts'

afterAll(cleanUp)

const recordFeedbackPatch = join(root, 'tests/fixtures/record-feedback.patch.yml')

/** Count OTLP export requests for one headless turn followed by recorded feedback. */
async function feedbackUploads(bundle: boolean): Promise<number> {
  const collector = await startRecorder((_request, response) => { response.writeHead(200, { 'content-type': 'application/json' }).end('{}') })
  try {
    await runTask([recordFeedbackPatch], { bundle, otlpUrl: `${collector.url}/v1/logs` })
    return collector.requests.length
  } finally {
    await collector.close()
  }
}

describe('disable telemetry, booted', { timeout: 300_000 }, () => {
  it('sends the session log and plugin inventory without the bundle (control)', async () => {
    const sent = fields(await runTask([]))
    expect(sent).toContain('dsh_session_log')
    expect(sent).toContain('dsh_plugin_packages')
  })

  it('sends neither field with the bundle', async () => {
    const requests = await runTask([], { bundle: true })
    expect(requests.length).toBeGreaterThan(0)
    const sent = fields(requests)
    expect(sent).not.toContain('dsh_session_log')
    expect(sent).not.toContain('dsh_plugin_packages')
  })

  it('uploads the session on feedback without the bundle (control)', async () => {
    expect(await feedbackUploads(false)).toBeGreaterThan(0)
  })

  it('uploads nothing on feedback with the bundle', async () => {
    expect(await feedbackUploads(true)).toBe(0)
  })

  it('sends the session log again when a later layer re-enables it', async () => {
    const reenable = writePatch('- id: session-log-deepseek\n  config:\n    enabled: true\n')
    const sent = fields(await runTask([reenable], { bundle: true }))
    expect(sent).toContain('dsh_session_log')
    expect(sent).not.toContain('dsh_plugin_packages')
  })
})

describe('Off the Record status, booted', { timeout: 300_000 }, () => {
  it('starts quietly when every managed row is as the bundle sets it', async () => {
    let stderr = ''
    await runTask([], { bundle: true, onOutput: (output) => { stderr = output.stderr } })
    expect(stderr).not.toContain('dsh-off-the-record:')
    expect(stderr).not.toContain('did not activate')
  })

  it('warns about a channel a later layer turned back on, naming the layer', async () => {
    let stderr = ''
    const reenable = writePatch('- id: session-log-deepseek\n  config:\n    enabled: true\n')
    await runTask([reenable], { bundle: true, onOutput: (output) => { stderr = output.stderr } })
    expect(stderr).toContain('dsh-off-the-record: Session log on DeepSeek requests is on (set in a --patch overlay)')
  })
})
