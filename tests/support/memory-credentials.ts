// In-memory credential store for plugin tests: references and records, no ambient layers.
import type { Context } from '@deepseek-ai/cordis'
import CredentialProvider, { type CredentialInfo, type CredentialKey, type CredentialRecord, type CredentialRef, type ResolvedCredential } from '@deepseek-ai/dsh-credentials'

export class MemoryCredentials extends CredentialProvider {
  readonly values = new Map<string, string>()
  readonly records = new Map<string, CredentialRecord>()

  constructor(ctx: Context) {
    super(ctx)
  }

  override resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const value = this.values.get(ref)
    return Promise.resolve(value === undefined ? undefined : { value, source: 'memory' })
  }

  override describe(ref: CredentialRef): Promise<CredentialInfo> {
    return Promise.resolve(this.values.has(ref) ? { configured: true, source: 'memory', writable: true } : { configured: false, writable: true })
  }

  override set(ref: CredentialRef, value: string): Promise<void> {
    this.values.set(ref, value)
    this.notifyUpdated(ref)
    return Promise.resolve()
  }

  override unset(ref: CredentialRef): Promise<void> {
    this.values.delete(ref)
    this.notifyUpdated(ref)
    return Promise.resolve()
  }

  override readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> { return Promise.resolve(this.records.get(key)) }
  override describeRecord(key: CredentialKey) {
    const record = this.records.get(key)
    return Promise.resolve(record === undefined ? { configured: false, writable: true } : { configured: true, kind: record.kind, writable: true })
  }
  override listRecords() {
    return Promise.resolve([...this.records].map(([key, record]) => ({ key: key as CredentialKey, kind: record.kind })))
  }
  override async modifyRecord(key: CredentialKey, mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>) {
    const next = await mutate(this.records.get(key))
    if (next === undefined) return this.records.get(key)
    this.records.set(key, next)
    this.notifyRecordUpdated(key)
    return next
  }
  override deleteRecord(key: CredentialKey): Promise<void> {
    this.records.delete(key)
    this.notifyRecordUpdated(key)
    return Promise.resolve()
  }

  /** Simulate a hand edit of the credential file. */
  editRecord(key: string, record: CredentialRecord | undefined): void {
    if (record === undefined) this.records.delete(key)
    else this.records.set(key, record)
    this.notifyRecordUpdated(key as CredentialKey)
  }
}
