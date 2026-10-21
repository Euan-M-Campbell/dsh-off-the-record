/**
 * Off the Record page, browser half. Mounts the Host `offTheRecord` Remote,
 * then registers the page into this bundle's own slot on the Plugins page
 * (`plugins.bundle.config`, keyed by package name).
 * @module dsh-off-the-record/client
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: the ctx.remote, ctx.locale, and Plugins page slot merges.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { PageController, type OffTheRecordRemote } from './controller.ts'
import { en, NS, zh, type OffTheRecordLocaleKey } from './locales.ts'
import { OffTheRecordPage } from './OffTheRecordPage.tsx'
import { OFF_THE_RECORD_REMOTE } from './remote.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Off the Record page copy. */
    'settings.offTheRecord': OffTheRecordLocaleKey
  }
}

/** This bundle's package name, the key of its Plugins page slot. */
export const PACKAGE = 'dsh-off-the-record'

export const inject = ['remote', 'slots', 'locale']

/** Host events after which the page re-reads its status. */
const INVALIDATING_EVENTS = ['settings/document-updated', 'credentials/record-updated', 'credentials/reference-updated'] as const

/**
 * Mount the Remote and register the page.
 * @param ctx - the browser plugin context.
 */
export async function apply(ctx: Context): Promise<void> {
  const unmount = await ctx.remote.$mount(OFF_THE_RECORD_REMOTE)
  ctx.effect(() => () => { void unmount() }, 'off-the-record: remote')
  ctx.inject(['remote.offTheRecord', 'slots', 'locale'], (page) => {
    const controller = new PageController(Reflect.get(page.remote, 'offTheRecord') as OffTheRecordRemote)
    page.effect(() => () => { controller.dispose() }, 'off-the-record: controller')
    page.effect(() => page.locale.register(NS, { en, zh }), 'off-the-record: dictionaries')
    for (const event of INVALIDATING_EVENTS) {
      page.effect(() => page.remote.$on(event, () => { void controller.reload() }), `off-the-record: ${event}`)
    }
    void controller.reload()
    page.slots.inject('plugins.bundle.config', () => page.slots.register({
      name: 'plugins.bundle.config', key: PACKAGE, locale: NS, inject: () => controller.face(),
    }, OffTheRecordPage))
  })
}
