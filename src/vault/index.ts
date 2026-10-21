/**
 * Secrets vault Service Definition: `ctx.vault`, secret names, scopes, and the
 * storage layout on harness credential records. `vault-local` provides it;
 * `tool-vault` consumes it. The model sees secret names and origins, never values.
 *
 * A secret is global, or belongs to one workspace: a project directory. A
 * session uses the global secrets plus those of the directory its root session
 * was created in; a workspace secret wins over a global one of the same name.
 * @module dsh-off-the-record/vault
 */

import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { type Context, Service } from '@deepseek-ai/cordis'

declare const secretNameBrand: unique symbol

/** A validated secret name: a POSIX environment identifier the vault may set. */
export type SecretName = string & { readonly [secretNameBrand]: true }

/** Who put the value in the vault. */
export type SecretOrigin = 'user' | 'generated'

/** Where a secret applies: everywhere, or in one workspace. */
export type SecretScope = 'global' | 'workspace'

/** What the model and configuration surfaces may know about one secret. */
export interface SecretInfo {
  readonly name: SecretName
  readonly origin: SecretOrigin
  readonly scope: SecretScope
  /** The workspace's canonical directory, for a workspace secret. */
  readonly directory?: string
}

/** A canonical workspace directory, as {@link workspaceDirectory} returns it. */
export type WorkspaceDirectory = string & { readonly __workspaceDirectory: true }

/**
 * Canonicalize a workspace directory, so one folder always maps to one key:
 * symlinks resolved and, on case-insensitive file systems, the real case.
 * A directory that no longer exists keeps its absolute path.
 * @param directory - an absolute or relative directory.
 * @returns the canonical directory.
 */
export function workspaceDirectory(directory: string): WorkspaceDirectory {
  const absolute = resolve(directory)
  try {
    return realpathSync.native(absolute) as WorkspaceDirectory
  } catch {
    return absolute as WorkspaceDirectory
  }
}

/** Alphabets `generate` draws from. */
export type SecretAlphabet = 'hex' | 'base64url' | 'alphanumeric'

export interface GenerateOptions {
  readonly length: number
  readonly alphabet: SecretAlphabet
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    vault: SecretVault
  }
  interface Events {
    /** The set of stored secrets or one of their values changed. */
    'vault/changed'(): void
  }
}

const NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/

/** Names that would change how a command runs rather than pass it a secret. */
const RESERVED_NAMES = new Set([
  'PATH', 'HOME', 'SHELL', 'USER', 'LOGNAME', 'PWD', 'OLDPWD', 'TMPDIR', 'TERM', 'LANG', 'IFS', 'CDPATH',
  'ENV', 'BASH_ENV', 'PS1', 'PS2', 'PS4', 'PROMPT_COMMAND', 'NODE_OPTIONS', 'NODE_PATH', 'PYTHONPATH',
  'PYTHONSTARTUP', 'PERL5OPT', 'PERL5LIB', 'RUBYOPT', 'RUBYLIB', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
])
const RESERVED_PREFIXES = ['LD_', 'DYLD_', 'DSH_', 'BASH_FUNC_', 'LC_', 'GIT_']

/**
 * Explain why a string cannot be a secret name.
 * @param value - candidate name.
 * @returns undefined when valid, otherwise the reason.
 */
export function secretNameProblem(value: string): string | undefined {
  if (!NAME_PATTERN.test(value)) return `"${value}" is not a valid secret name: use capital letters, digits, and underscores, starting with a letter`
  if (value.length > 128) return `"${value.slice(0, 16)}…" is longer than 128 characters`
  if (RESERVED_NAMES.has(value) || RESERVED_PREFIXES.some(prefix => value.startsWith(prefix))) {
    return `"${value}" is reserved: it would change how commands run`
  }
  return undefined
}

/**
 * Validate and brand a secret name.
 * @param value - candidate name.
 * @returns the branded name.
 * @throws TypeError naming the problem.
 */
export function secretName(value: string): SecretName {
  const problem = secretNameProblem(value)
  if (problem !== undefined) throw new TypeError(problem)
  return value as SecretName
}

/** Credential-record scope that holds global vault entries. */
export const VAULT_RECORD_SCOPE = 'vault'

/** Credential-record scope that holds workspace vault entries. */
export const WORKSPACE_RECORD_SCOPE = 'vault-ws'

/**
 * The record id of a workspace secret: `d` + 16 hex characters of the
 * directory's SHA-256, then the name's record id. Record ids are lowercase and
 * may not start with a digit, hence the prefix; the directory itself is stored
 * in the record.
 * @param directory - canonical workspace directory.
 * @param name - the secret name.
 * @returns the record id within {@link WORKSPACE_RECORD_SCOPE}.
 */
export function workspaceRecordId(directory: WorkspaceDirectory, name: SecretName): string {
  return `d${createHash('sha256').update(directory).digest('hex').slice(0, 16)}-${recordId(name)}`
}

/**
 * Split a workspace record id into its directory hash and secret name.
 * @param id - record id within {@link WORKSPACE_RECORD_SCOPE}.
 * @returns the name, or undefined when the id is not a workspace secret's.
 */
export function nameFromWorkspaceRecordId(id: string): SecretName | undefined {
  const match = /^d[0-9a-f]{16}-(.+)$/.exec(id)
  return match?.[1] === undefined ? undefined : nameFromRecordId(match[1])
}

/**
 * Credential record ids are lowercase kebab-case; names map reversibly because
 * they contain no `-`.
 * @param name - a secret name.
 * @returns the record id, such as `db-url` for `DB_URL`.
 */
export function recordId(name: SecretName): string {
  return name.toLowerCase().replaceAll('_', '-')
}

/**
 * Map a record id back to its secret name.
 * @param id - record id within the vault scope.
 * @returns the name, or undefined when the id is not a valid vault name.
 */
export function nameFromRecordId(id: string): SecretName | undefined {
  const candidate = id.toUpperCase().replaceAll('-', '_')
  return secretNameProblem(candidate) === undefined ? candidate as SecretName : undefined
}

/**
 * The vault service. Values leave it only through {@link resolveForExecution},
 * for a command's environment, and {@link redactionEntries}, for the redaction
 * matcher; neither path reaches the model.
 */
export abstract class SecretVault extends Service {
  constructor(ctx: Context) {
    super(ctx, 'vault')
  }

  /**
   * The secrets a session in one workspace may use: every global secret, and
   * the workspace's own, which replace global ones of the same name.
   * @param directory - the session's canonical workspace directory, if it has one.
   */
  abstract list(directory?: WorkspaceDirectory): Promise<readonly SecretInfo[]>

  /** Every stored secret in every scope, for configuration surfaces. */
  abstract listAll(): Promise<readonly SecretInfo[]>

  /**
   * Store a user-supplied value, replacing any existing one.
   * @param name - the secret name.
   * @param value - the value; must meet the provider's minimum length.
   * @param directory - the workspace, or undefined for a global secret.
   */
  abstract set(name: SecretName, value: string, directory?: WorkspaceDirectory): Promise<void>

  /**
   * Remove a secret; removing an absent one is a no-op.
   * @param name - the secret name.
   * @param directory - the workspace, or undefined for a global secret.
   */
  abstract unset(name: SecretName, directory?: WorkspaceDirectory): Promise<void>

  /**
   * Generate and store a random value under a new name.
   * @param name - a name not already stored in that scope.
   * @param options - length and alphabet.
   * @param directory - the workspace, or undefined for a global secret.
   * @throws Error when the name already exists in that scope.
   */
  abstract generate(name: SecretName, options: GenerateOptions, directory?: WorkspaceDirectory): Promise<void>

  /**
   * Resolve values for one command's environment, the workspace's own first.
   * @param names - the names the command asked for.
   * @param directory - the session's canonical workspace directory, if it has one.
   * @returns the values by name.
   * @throws Error naming every name that is not stored.
   */
  abstract resolveForExecution(names: readonly SecretName[], directory?: WorkspaceDirectory): Promise<ReadonlyMap<SecretName, string>>

  /** Every stored name/value pair, in every scope, for the redaction matcher. */
  abstract redactionEntries(): readonly { readonly name: SecretName; readonly value: string }[]
}

export default SecretVault
