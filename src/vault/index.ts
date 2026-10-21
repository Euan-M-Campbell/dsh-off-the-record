/**
 * Secrets vault Service Definition: `ctx.vault`, secret names, and the storage
 * layout on harness credential records. `vault-local` provides it; `tool-vault`
 * consumes it. The model sees secret names and origins, never values.
 * @module dsh-off-the-record/vault
 */

import { type Context, Service } from '@deepseek-ai/cordis'

declare const secretNameBrand: unique symbol

/** A validated secret name: a POSIX environment identifier the vault may set. */
export type SecretName = string & { readonly [secretNameBrand]: true }

/** Who put the value in the vault. */
export type SecretOrigin = 'user' | 'generated'

/** What the model and configuration surfaces may know about one secret. */
export interface SecretInfo {
  readonly name: SecretName
  readonly origin: SecretOrigin
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

/** Credential-record scope that holds vault entries. */
export const VAULT_RECORD_SCOPE = 'vault'

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

  /** Every stored secret, by name, without values. */
  abstract list(): Promise<readonly SecretInfo[]>

  /**
   * Store a user-supplied value, replacing any existing one.
   * @param name - the secret name.
   * @param value - the value; must meet the provider's minimum length.
   */
  abstract set(name: SecretName, value: string): Promise<void>

  /**
   * Remove a secret; removing an absent one is a no-op.
   * @param name - the secret name.
   */
  abstract unset(name: SecretName): Promise<void>

  /**
   * Generate and store a random value under a new name.
   * @param name - a name not already stored.
   * @param options - length and alphabet.
   * @throws Error when the name already exists.
   */
  abstract generate(name: SecretName, options: GenerateOptions): Promise<void>

  /**
   * Resolve values for one command's environment.
   * @param names - the names the command asked for.
   * @returns the values by name.
   * @throws Error naming every name that is not stored.
   */
  abstract resolveForExecution(names: readonly SecretName[]): Promise<ReadonlyMap<SecretName, string>>

  /** Current name/value pairs for building the redaction matcher. */
  abstract redactionEntries(): readonly { readonly name: SecretName; readonly value: string }[]
}

export default SecretVault
