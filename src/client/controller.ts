/**
 * Page state and actions over the Host `offTheRecord` Remote. Every change is
 * made on the Host, which validates it; the page re-reads the status after a
 * change because the Host recomposes asynchronously.
 * @module dsh-off-the-record/client/controller
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { PageStatus } from '../otr-settings/page.ts'

export type { PageStatus }

/** One Remote call's outcome, as the Gateway returns it. */
export type CallResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly message?: string } }

/** The Remote methods the page calls. */
export interface OffTheRecordRemote {
  pageStatus(): Promise<CallResult<PageStatus>>
  setChannel(id: string, off: boolean): Promise<CallResult<unknown>>
  setSearchProvider(provider: string): Promise<CallResult<unknown>>
  setSearxngUrl(url: string): Promise<CallResult<unknown>>
  setBraveKey(key: string): Promise<CallResult<unknown>>
  setSecret(name: string, value: string): Promise<CallResult<unknown>>
  setNewIdEachStart(on: boolean): Promise<CallResult<unknown>>
}

/** What the page renders. */
export interface PageState {
  status: PageStatus | undefined
  loadError: string | undefined
  /** The last action's outcome: `saved`, or an error message. */
  notice: { readonly kind: 'saved' | 'error'; readonly message?: string } | undefined
  /** Name of the action in flight, if any. */
  busy: string | undefined
}

/** The face the slot registration hands to the page component. */
export interface PageFace {
  hooks: { otrPage: SnapshotStore<PageState> }
  reload(): void
  setChannel(id: string, off: boolean): void
  setSearchProvider(provider: string): void
  setSearxngUrl(url: string): void
  setBraveKey(key: string): void
  setSecret(name: string, value: string): void
  setNewIdEachStart(on: boolean): void
}

const message = (error: unknown): string =>
  typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message
    : String(error)

export class PageController {
  readonly store: SnapshotStore<PageState>
  private disposed = false
  private readonly timers = new Set<ReturnType<typeof setTimeout>>()

  /**
   * @param remote - the mounted `offTheRecord` Remote namespace.
   * @param settleDelays - re-read delays after a change, in milliseconds.
   */
  constructor(private readonly remote: OffTheRecordRemote, private readonly settleDelays: readonly number[] = [300, 1500]) {
    this.store = createSnapshotStore<PageState>({ status: undefined, loadError: undefined, notice: undefined, busy: undefined }, { flush: 'sync' })
  }

  /** Read the status now. */
  async reload(): Promise<void> {
    try {
      const result = await this.remote.pageStatus()
      if (this.disposed) return
      if (result.ok) this.store.update((draft) => { draft.status = result.value; draft.loadError = undefined })
      else this.store.update((draft) => { draft.loadError = result.error.message ?? 'unknown error' })
    } catch (error: unknown) {
      if (!this.disposed) this.store.update((draft) => { draft.loadError = message(error) })
    }
  }

  /** The face for the slot registration. */
  face(): PageFace {
    return {
      hooks: { otrPage: this.store },
      reload: () => { void this.reload() },
      setChannel: (id, off) => { void this.run('channel', () => this.remote.setChannel(id, off)) },
      setSearchProvider: (provider) => { void this.run('provider', () => this.remote.setSearchProvider(provider)) },
      setSearxngUrl: (url) => { void this.run('searxng', () => this.remote.setSearxngUrl(url)) },
      setBraveKey: (key) => { void this.run('brave', () => this.remote.setBraveKey(key)) },
      setSecret: (name, value) => { void this.run('secret', () => this.remote.setSecret(name, value)) },
      setNewIdEachStart: (on) => { void this.run('anonymous-id', () => this.remote.setNewIdEachStart(on)) },
    }
  }

  /** Stop timers and ignore late answers. */
  dispose(): void {
    this.disposed = true
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
  }

  private async run(name: string, call: () => Promise<CallResult<unknown>>): Promise<void> {
    if (this.store.getSnapshot().busy !== undefined) return
    this.store.update((draft) => { draft.busy = name; draft.notice = undefined })
    let notice: PageState['notice']
    try {
      const result = await call()
      notice = result.ok ? { kind: 'saved' } : { kind: 'error', message: result.error.message ?? 'unknown error' }
    } catch (error: unknown) {
      notice = { kind: 'error', message: message(error) }
    }
    if (this.disposed) return
    this.store.update((draft) => { draft.busy = undefined; draft.notice = notice })
    await this.reload()
    for (const delay of this.settleDelays) {
      const timer = setTimeout(() => { this.timers.delete(timer); void this.reload() }, delay)
      this.timers.add(timer)
    }
  }
}
