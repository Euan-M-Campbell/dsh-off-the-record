/**
 * Local secrets vault: `ctx.vault` stored on the harness credential store's
 * records, under `vault/<name>`. A record written by hand in
 * `$DSH_HOME/.credentials.yaml` takes the friendly form
 * `{ kind: api-key, key: <value> }`; generated secrets are stored as
 * `{ kind: grant, payload: { value, origin, createdAt } }`.
 *
 * Profiles without the credential store (one-shot `headless`) get an empty,
 * read-only vault rather than a row that never activates.
 * @module dsh-off-the-record/vault-local
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialKey, credentialKeyId, credentialKeyScope, type CredentialRecord } from '@deepseek-ai/dsh-credentials'
import {
  nameFromRecordId,
  recordId,
  SecretVault,
  VAULT_RECORD_SCOPE,
  type GenerateOptions,
  type SecretAlphabet,
  type SecretInfo,
  type SecretName,
  type SecretOrigin,
} from '../vault/index.ts'

export interface Config {
  /** Shortest value the vault accepts; shorter values could not be redacted reliably. */
  minValueLength: number
  /** Most secrets the vault holds. */
  maxSecrets: number
}

interface Entry {
  readonly name: SecretName
  readonly value: string
  readonly origin: SecretOrigin
}

const ALPHABETS: Record<SecretAlphabet, string> = {
  hex: '0123456789abcdef',
  base64url: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
  alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
}

/**
 * Draw a uniformly random string; rejection sampling avoids modulo bias.
 * @param options - length and alphabet.
 * @returns the random value.
 */
export function randomSecret(options: GenerateOptions): string {
  const alphabet = ALPHABETS[options.alphabet]
  const limit = 256 - (256 % alphabet.length)
  let out = ''
  while (out.length < options.length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(options.length * 2))) {
      if (byte < limit) out += alphabet[byte % alphabet.length]
      if (out.length === options.length) break
    }
  }
  return out
}

/**
 * Read one vault record in either stored form.
 * @param record - the stored credential record.
 * @returns the value and origin, or undefined when the record holds no value.
 */
export function readEntry(record: CredentialRecord | undefined): { value: string; origin: SecretOrigin } | undefined {
  if (record === undefined) return undefined
  if (record.kind === 'api-key') return record.key === undefined || record.key.length === 0 ? undefined : { value: record.key, origin: 'user' }
  const payload = record.payload as { value?: unknown; origin?: unknown } | null
  if (typeof payload?.value !== 'string' || payload.value.length === 0) return undefined
  return { value: payload.value, origin: payload.origin === 'generated' ? 'generated' : 'user' }
}

/** The local vault service. */
export default class LocalVault extends SecretVault {
  static Config: z<Config> = z.object({
    minValueLength: z.number().step(1).min(8).max(4096).default(8),
    maxSecrets: z.number().step(1).min(1).max(4096).default(256),
  })

  private entries: readonly Entry[] = []
  private generation = 0

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx)
    ctx.on('credentials/record-updated', (key) => {
      if (credentialKeyScope(key) === VAULT_RECORD_SCOPE) this.reload()
    })
    // The credential store may start after this row, or come and go with its own
    // row: load whenever it becomes available, and empty the cache when it leaves.
    ctx.inject(['credentials'], (storeCtx) => {
      this.reload()
      storeCtx.effect(() => () => { this.reload() })
    })
    this.reload()
  }

  list(): Promise<readonly SecretInfo[]> {
    return Promise.resolve(this.entries.map(({ name, origin }) => ({ name, origin })))
  }

  async set(name: SecretName, value: string): Promise<void> {
    this.checkValue(value)
    await this.write(name, { kind: 'api-key', key: value }, false)
  }

  async unset(name: SecretName): Promise<void> {
    await this.store().deleteRecord(credentialKey(VAULT_RECORD_SCOPE, recordId(name)))
    await this.reloadNow()
  }

  async generate(name: SecretName, options: GenerateOptions): Promise<void> {
    if (options.length < this.config.minValueLength) {
      throw new Error(`a generated secret must be at least ${String(this.config.minValueLength)} characters`)
    }
    const value = randomSecret(options)
    await this.write(name, { kind: 'grant', payload: { value, origin: 'generated', createdAt: new Date().toISOString() } }, true)
  }

  async resolveForExecution(names: readonly SecretName[]): Promise<ReadonlyMap<SecretName, string>> {
    const credentials = this.ctx.get('credentials')
    const resolved = new Map<SecretName, string>()
    const missing: SecretName[] = []
    for (const name of names) {
      // Read fresh: a value changed since the last reload must not run with the old one.
      const entry = credentials === undefined ? undefined : readEntry(await credentials.readRecord(credentialKey(VAULT_RECORD_SCOPE, recordId(name))))
      if (entry === undefined || entry.value.length < this.config.minValueLength) missing.push(name)
      else resolved.set(name, entry.value)
    }
    if (missing.length > 0) throw new Error(`not in the vault: ${missing.join(', ')}`)
    return resolved
  }

  redactionEntries(): readonly { readonly name: SecretName; readonly value: string }[] {
    return this.entries
  }

  private store() {
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) throw new Error('this profile has no credential store, so the vault is read-only')
    return credentials
  }

  private checkValue(value: string): void {
    if (value.length < this.config.minValueLength) {
      throw new Error(`a secret must be at least ${String(this.config.minValueLength)} characters, so it can be found and hidden in output`)
    }
  }

  /** Write one record; `create` refuses to replace an existing value. */
  private async write(name: SecretName, record: CredentialRecord, create: boolean): Promise<void> {
    const credentials = this.store()
    if (!this.entries.some(entry => entry.name === name) && this.entries.length >= this.config.maxSecrets) {
      throw new Error(`the vault already holds ${String(this.config.maxSecrets)} secrets`)
    }
    let existed = false
    await credentials.modifyRecord(credentialKey(VAULT_RECORD_SCOPE, recordId(name)), (current) => {
      existed = readEntry(current) !== undefined
      return Promise.resolve(create && existed ? undefined : record)
    })
    if (create && existed) throw new Error(`${name} already exists; choose another name`)
    await this.reloadNow()
  }

  private reload(): void {
    this.reloadNow().catch((error: unknown) => { this.ctx.logger.warn('could not read the vault: %s', String(error)) })
  }

  private async reloadNow(): Promise<void> {
    const current = ++this.generation
    const credentials = this.ctx.get('credentials')
    const entries: Entry[] = []
    if (credentials !== undefined) {
      for (const { key } of await credentials.listRecords()) {
        if (credentialKeyScope(key) !== VAULT_RECORD_SCOPE) continue
        const name = nameFromRecordId(credentialKeyId(key))
        const entry = name === undefined ? undefined : readEntry(await credentials.readRecord(key))
        if (name === undefined || entry === undefined) {
          this.ctx.logger.warn('ignoring vault record %s: it has no usable name or value', key)
          continue
        }
        if (entry.value.length < this.config.minValueLength) {
          this.ctx.logger.warn('ignoring vault record %s: its value is shorter than %d characters', key, this.config.minValueLength)
          continue
        }
        entries.push({ name, ...entry })
      }
    }
    if (current !== this.generation) return
    entries.sort((a, b) => a.name.localeCompare(b.name))
    this.entries = entries
    this.ctx.emit('vault/changed')
  }
}
