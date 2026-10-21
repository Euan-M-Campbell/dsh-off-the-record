// In-memory credential store for plugin tests: references only, no ambient layers.
import type { Context } from '@deepseek-ai/cordis'
import CredentialProvider, { type CredentialInfo, type CredentialKey, type CredentialRecord, type CredentialRef, type ResolvedCredential } from '@deepseek-ai/dsh-credentials'

export class MemoryCredentials extends CredentialProvider {
  readonly values = new Map<string, string>()

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

  override readRecord(_key: CredentialKey): Promise<CredentialRecord | undefined> { return Promise.resolve(undefined) }
  override describeRecord(_key: CredentialKey) { return Promise.resolve({ configured: false, writable: true }) }
  override listRecords() { return Promise.resolve([]) }
  override modifyRecord(_key: CredentialKey, _mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>) {
    return Promise.resolve(undefined)
  }
  override deleteRecord(_key: CredentialKey): Promise<void> { return Promise.resolve() }
}
