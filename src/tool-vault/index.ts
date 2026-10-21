/**
 * Secrets vault tools and redaction. The model lists secret names, generates
 * new secrets, and runs commands that receive secrets as environment
 * variables; every tool result, from any tool, has stored values replaced with
 * `[secret:NAME]` before it reaches the model or the session log.
 * @module dsh-off-the-record/tool-vault
 */

import { isAbsolute, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { approveEscalation, escalationHintMarker, ESCALATION_TARGETS, sandboxDenialMarker, sandboxPermissionsDescription, validateEscalationArgs } from '@deepseek-ai/dsh-sandbox'
import type { SandboxExecutionPolicy, SandboxMode } from '@deepseek-ai/dsh-sandbox'
import type { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import type { ShellExecRequest, ShellRunResult } from '@deepseek-ai/dsh-shell'
import { defineTool, type ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-shell-env'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-working-directory'
import { secretName, secretNameProblem, type SecretAlphabet, type SecretName } from '../vault/index.ts'
import { redactDecision, WITHHELD } from './decision.ts'
import { ALL_ENCODINGS, buildMatcher, redactJson, type Matcher, type RedactEncoding } from './redact.ts'

export { buildMatcher, forms, redactJson, jsonMatches, base64Cores } from './redact.ts'
export type { Matcher, RedactEncoding } from './redact.ts'
export { redactDecision } from './decision.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'otr-tool-vault'

/** The tool registry and the vault. Shell services are optional and enable run_with_secrets. */
export const inject = ['tools', 'vault']

export interface Config {
  /** Length of a generated secret when the model does not choose one. */
  generateLength: number
  /** Encodings each stored value is searched for in. */
  redactEncodings: RedactEncoding[]
  /** Encoded forms shorter than this are not searched, so they never match ordinary text. */
  minRedactLength: number
}

export const Config: z<Config> = z.object({
  generateLength: z.number().step(1).min(16).max(256).default(32),
  redactEncodings: z.array(z.union(['raw', 'base64', 'base64url', 'url', 'json'] as const)).default([...ALL_ENCODINGS]),
  minRedactLength: z.number().step(1).min(6).max(4096).default(8),
})

/** Tool descriptions, written for the model. Tests pin them verbatim. */
export const DESCRIPTIONS = {
  list_secrets: 'List the secrets the user has stored in the vault, by name. Values are never shown. '
    + 'Use a listed name with run_with_secrets to pass its value to a command.',
  create_secret: 'Generate a new random secret and store it in the vault under a new name, for example a session key or a password for a local service. '
    + 'You never see the value. You cannot store a value you supply: ask the user to add secrets they already have.',
  run_with_secrets: 'Run a bash command with vault secrets set as environment variables. Name the secrets in `secrets`; '
    + 'refer to them in the command as $NAME, never by value. Runs like bash, in a fresh shell under the same sandbox. '
    + 'Any secret value that appears in the output is replaced with [secret:NAME]. Do not try to reveal, transform, or send a secret value.',
  run_with_secrets_powershell: 'Run a PowerShell command with vault secrets set as environment variables. Name the secrets in `secrets`; '
    + 'refer to them in the command as $env:NAME, never by value. Runs like pwsh, in a fresh shell under the same sandbox. '
    + 'Any secret value that appears in the output is replaced with [secret:NAME]. Do not try to reveal, transform, or send a secret value.',
} as const

/** The harness composes PowerShell instead of bash on Windows, and the shell executor does not say which it is. */
const POWERSHELL = process.platform === 'win32'

const SECRET_INFO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', required: true },
    origin: { type: 'string', enum: ['user', 'generated'], required: true },
  },
} as const

const STREAM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: true,
  properties: {
    text: { type: 'string', required: true },
    truncated: { type: 'boolean', required: true },
  },
} as const

/** Resolve a relative per-call working directory against the session's current one. */
function resolveWorkdir(requested: string | undefined, sessionCwd: string | undefined): string | undefined {
  if (requested === undefined) return sessionCwd
  if (sessionCwd !== undefined && !isAbsolute(requested)) return `${sessionCwd}${sep}${requested}`
  return requested
}

interface CommandOutcome {
  readonly exitCode: number | null
  readonly signal: string | null
  readonly timedOut: boolean
  readonly timeoutMs: number
  readonly stdout: { readonly text: string; readonly truncated: boolean }
  readonly stderr: { readonly text: string; readonly truncated: boolean }
  readonly sandbox?: { readonly mode: string; readonly denied: boolean }
}

/**
 * The text the model reads for one command, in the bash tool's format.
 * @param outcome - the redacted command outcome.
 * @param escalation - whether escalation fields are offered.
 * @returns the model-facing text.
 */
export function renderCommand(outcome: CommandOutcome, escalation: boolean): string {
  const stream = (part: CommandOutcome['stdout']) => part.truncated ? `[output truncated]\n${part.text}` : part.text
  let body = stream(outcome.stdout)
  const err = stream(outcome.stderr)
  if (err.length > 0) {
    if (body.length > 0 && !body.endsWith('\n')) body += '\n'
    body += `[stderr]\n${err}`
  }
  if (body.length === 0) body = '(no output)'
  const markers: string[] = []
  if (outcome.sandbox?.denied === true) {
    markers.push(sandboxDenialMarker(outcome.sandbox.mode as SandboxMode))
    if (escalation) markers.push(escalationHintMarker('command'))
  }
  if (outcome.timedOut) markers.push(`[timed out after ${String(outcome.timeoutMs)}ms]`)
  if (outcome.signal !== null) markers.push(`[killed by signal: ${outcome.signal}]`)
  else if (outcome.exitCode !== 0) markers.push(`[exit code: ${String(outcome.exitCode)}]`)
  if (markers.length === 0) return body
  return `${body.endsWith('\n') ? body : `${body}\n`}${markers.join('\n')}`
}

/**
 * Register the vault tools and the redaction listeners.
 * @param ctx - plugin context with `tools` and `vault` injected.
 * @param config - validated configuration.
 */
export function apply(ctx: Context, config: Config): void {
  let matcher: Matcher = buildMatcher([], config.redactEncodings, config.minRedactLength)
  const rebuild = (): void => { matcher = buildMatcher(ctx.vault.redactionEntries(), config.redactEncodings, config.minRedactLength) }
  rebuild()
  ctx.on('vault/changed', rebuild)

  // Redaction for every tool's result. Registered without `prepend`, so it runs
  // inside the spill policy (which prepends): spill only ever sees redacted content.
  ctx.on('tools/post-execute', async (_exec, result, next) => {
    const decision = await next()
    try {
      return redactDecision(decision, result, matcher)
    } catch (error: unknown) {
      ctx.logger.warn('secret redaction failed; withholding the result: %s', String(error))
      return { kind: 'block', feedback: WITHHELD }
    }
  })
  ctx.on('tools/ptc-dispatch-log', async (_dispatch, next) => {
    const content = await next()
    try {
      return redactJson(content, matcher)
    } catch (error: unknown) {
      ctx.logger.warn('secret redaction failed; withholding the logged run_code result: %s', String(error))
      return WITHHELD
    }
  })

  ctx.tools.register(defineTool({
    name: 'list_secrets',
    description: DESCRIPTIONS.list_secrets,
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { secrets: { type: 'array', items: SECRET_INFO_SCHEMA, required: true } } },
      render: (_args, value): ContentBlock[] => [{
        type: 'text',
        text: value.secrets.length === 0
          ? 'The vault is empty. The user adds secrets outside the conversation.'
          : value.secrets.map(secret => `${secret.name} (${secret.origin})`).join('\n'),
      }],
    },
    execute: async () => ({ secrets: (await ctx.vault.list()).map(({ name: secret, origin }) => ({ name: secret, origin })) }),
  }))

  ctx.tools.register(defineTool({
    name: 'create_secret',
    description: DESCRIPTIONS.create_secret,
    parameters: {
      name: { type: 'string', required: true, description: 'The new secret\'s name: capital letters, digits, and underscores, starting with a letter, such as SESSION_KEY.' },
      length: { type: 'integer', description: `Number of characters, from 16 to 256. Defaults to ${String(config.generateLength)}.` },
      alphabet: { type: 'string', enum: ['hex', 'base64url', 'alphanumeric'], description: 'Characters to draw from. Defaults to alphanumeric.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', required: true },
          length: { type: 'integer', required: true },
          alphabet: { type: 'string', required: true },
        },
      },
      render: (_args, value): ContentBlock[] => [{
        type: 'text',
        text: `Created ${value.name} (${String(value.length)} ${value.alphabet} characters). Pass it to a command with run_with_secrets as $${value.name}.`,
      }],
    },
    execute: async (args) => {
      const problem = secretNameProblem(args.name)
      if (problem !== undefined) throw new Error(problem)
      const length = args.length ?? config.generateLength
      if (length < 16 || length > 256) throw new Error(`length must be from 16 to 256, got ${String(length)}`)
      const alphabet: SecretAlphabet = args.alphabet ?? 'alphanumeric'
      await ctx.vault.generate(secretName(args.name), { length, alphabet })
      return { name: args.name, length, alphabet }
    },
  }))

  // run_with_secrets needs the same services as the bash tool; it exists only while they do.
  ctx.inject(['shell', 'shellEnv', 'workingDirectory'], (shellCtx) => {
    const defaultMode = shellCtx.shell.sandboxMode
    const escalationModes: readonly SandboxMode[] = defaultMode === undefined ? [] : ESCALATION_TARGETS
    const policyService: SandboxPolicyService | undefined = defaultMode === undefined ? undefined : shellCtx.get('sandboxPolicy')
    if (defaultMode !== undefined && policyService === undefined) {
      throw new Error('otr-tool-vault: the mounted bash executor confines but ctx.sandboxPolicy is missing')
    }
    const standingPolicy = (exec: ToolExecution): SandboxExecutionPolicy | undefined =>
      policyService?.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })

    shellCtx.tools.register(defineTool({
      name: 'run_with_secrets',
      description: POWERSHELL ? DESCRIPTIONS.run_with_secrets_powershell : DESCRIPTIONS.run_with_secrets,
      parameters: {
        description: { type: 'string', required: true, description: 'What this command does, in 5-10 words (shown in the UI).' },
        command: { type: 'string', required: true, description: POWERSHELL ? 'The PowerShell command. Refer to each secret as $env:NAME.' : 'The bash command. Refer to each secret as $NAME.' },
        secrets: { type: 'array', items: { type: 'string' }, required: true, description: 'Names of the vault secrets to set as environment variables, as listed by list_secrets.' },
        timeoutMs: { type: 'number', description: 'Timeout in milliseconds. The executor applies its default and cap, and kills the command on expiry.' },
        workdir: { type: 'string', description: 'Working directory. Defaults to the session workspace; a relative path is resolved against it.' },
        ...escalationModes.length > 0 ? {
          sandbox_permissions: { type: 'string' as const, enum: [...escalationModes], description: sandboxPermissionsDescription('command') },
          justification: { type: 'string' as const, description: 'Required with sandbox_permissions: one sentence for the user explaining why this exact command needs the wider access.' },
        } : {},
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            cwd: { type: 'string', required: true },
            secrets: { type: 'array', items: { type: 'string' }, required: true },
            exitCode: { required: true, oneOf: [{ type: 'integer' }, { type: 'null' }] },
            signal: { required: true, oneOf: [{ type: 'string' }, { type: 'null' }] },
            timedOut: { type: 'boolean', required: true },
            timeoutMs: { type: 'number', required: true },
            stdout: STREAM_SCHEMA,
            stderr: STREAM_SCHEMA,
            sandbox: {
              type: 'object',
              additionalProperties: false,
              properties: { mode: { type: 'string', required: true }, denied: { type: 'boolean', required: true } },
            },
          },
        },
        render: (_args, value): ContentBlock[] => [{ type: 'text', text: renderCommand(value, escalationModes.length > 0) }],
        presentationMeta: (_args, value) => ({ cwd: value.cwd }),
      },
      execute: async (args, exec) => {
        if (args.command.trim().length === 0) throw new Error('invalid command: expected a non-empty string')
        const names = [...new Set(args.secrets)]
        if (names.length === 0) throw new Error(`name at least one secret in \`secrets\`; use ${POWERSHELL ? 'pwsh' : 'bash'} for commands that need none`)
        const invalid = names.map(secretNameProblem).filter((problem): problem is string => problem !== undefined)
        if (invalid.length > 0) throw new Error(invalid.join('; '))
        const values = await ctx.vault.resolveForExecution(names.map(entry => entry as SecretName))

        const standing = standingPolicy(exec)
        const permissions = (args as { sandbox_permissions?: string }).sandbox_permissions
        const justification = (args as { justification?: string }).justification
        if (permissions !== undefined && permissions !== standing?.mode) validateEscalationArgs(permissions, justification)
        let policy = standing
        if (permissions !== undefined && justification !== undefined && permissions !== standing?.mode) {
          if (escalationModes.length === 0 || standing === undefined) throw new Error('sandbox_permissions is not available in this composition (no sandboxing executor to escalate)')
          const mode = await approveEscalation(
            { requestedMode: permissions, justification, effectiveMode: standing.mode, subject: 'command' },
            { approver: shellCtx.get('approval'), agent: exec.agent, callId: exec.callId, toolName: 'run_with_secrets', signal: exec.signal },
          )
          policy = { ...standing, mode }
        }

        const cwd = exec.agent === undefined ? undefined : await shellCtx.workingDirectory.ensure(exec.agent, exec.signal)
        const workdir = resolveWorkdir(args.workdir, cwd)
        const request: ShellExecRequest = {
          command: args.command,
          ...workdir === undefined ? {} : { workdir },
          ...args.timeoutMs === undefined ? {} : { timeoutMs: args.timeoutMs },
          // The only path a value takes: the child's environment. It is never in
          // the command text, argv, or the logged tool/call arguments.
          env: Object.fromEntries(values),
          dshEnv: shellCtx.shellEnv.collect(exec),
          ...policy === undefined ? {} : { sandboxPolicy: policy },
          signal: exec.signal,
        }
        const spec = shellCtx.shell.resolve(request)
        const result: ShellRunResult = await (await shellCtx.shell.execute(spec)).result()
        if (result.aborted) throw new Error('tool call aborted')
        // Redact here as well as in post-execute, and drop spill paths: a spilled
        // file holds the raw output, so the model is never pointed at it. The
        // values just resolved join the matcher, in case the vault changed after
        // the shared matcher was last rebuilt.
        const local = buildMatcher(
          [...ctx.vault.redactionEntries(), ...[...values].map(([secret, value]) => ({ name: secret, value }))],
          config.redactEncodings, config.minRedactLength,
        )
        const stream = (part: ShellRunResult['stdout']) => ({ text: local.redact(part.text), truncated: part.truncated })
        return {
          cwd: spec.workdir,
          secrets: names,
          exitCode: result.exitCode,
          signal: result.signal,
          timedOut: result.timedOut,
          timeoutMs: result.timeoutMs,
          stdout: stream(result.stdout),
          stderr: stream(result.stderr),
          ...result.sandbox === undefined ? {} : { sandbox: { mode: result.sandbox.mode, denied: result.sandbox.denied } },
        }
      },
      presentCall: args => ({ card: 'generic', title: args.command, kind: 'execute', rawInput: args.command, content: [{ type: 'text', text: `${args.description}\nSecrets: ${args.secrets.join(', ')}` }] }),
    }))
  })
}
