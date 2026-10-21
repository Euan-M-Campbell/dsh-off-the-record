/**
 * The Off the Record page, shown on this bundle's page under Settings →
 * Plugins: each managed channel's state with its fix, the search provider and
 * its setup, and the secrets vault by name. Values typed here go to the Host
 * once and are never read back.
 */

import { useState, type CSSProperties, type ReactNode } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { Button, Input, StateDot, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PageFace, PageState } from './controller.ts'
import type { OffTheRecordLocaleKey } from './locales.ts'

export type OffTheRecordPageProps =
  PropsRuntime<'plugins.bundle.config'>
  & PropsLocale<'settings.offTheRecord'>
  & InjectFace<PageFace>

type T = (key: OffTheRecordLocaleKey, params?: Record<string, unknown>) => string
/** The page's actions, as the component receives them. */
type Actions = Omit<PageFace, 'hooks'>
type Status = NonNullable<PageState['status']>
type Channel = Status['channels'][number]

const column: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 }
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const muted: CSSProperties = { opacity: 0.7, fontSize: '0.9em', margin: 0 }
const section: CSSProperties = { ...column, paddingTop: 16 }

function Section({ title, promise, children }: { title: string; promise?: string; children: ReactNode }) {
  return (
    <section style={section}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      {promise !== undefined && <p style={muted}>{promise}</p>}
      {children}
    </section>
  )
}

function summary(t: T, status: Status): string {
  const telemetry = status.channels.filter(channel => channel.part === 'telemetry' && channel.state !== 'not-present')
  return t('summary', {
    off: telemetry.filter(channel => channel.state === 'off').length,
    total: telemetry.length,
    search: status.search.provider || '—',
  })
}

/** A setting's control: a dot (green on, red off) that follows the switch, then the switch. */
function Toggle({ on, label, disabled, title, onChange }: {
  on: boolean
  label: string
  disabled: boolean
  title?: string | undefined
  onChange: (next: boolean) => void
}) {
  return (
    <span style={row}>
      <StateDot state={on ? 'done' : 'error'} />
      <Switch checked={on} label={label} disabled={disabled} title={title} onChange={onChange} />
    </span>
  )
}

/** One labelled row with a toggle, and optional notes under the label. */
function ToggleRow({ label, toggle, children }: { label: string; toggle: ReactNode; children?: ReactNode }) {
  return (
    <div style={column}>
      <div style={{ ...row, justifyContent: 'space-between' }}>
        <span>{label}</span>
        {toggle}
      </div>
      {children}
    </div>
  )
}

/**
 * One channel; its switch is on while the channel sends to DeepSeek. A channel
 * that cannot change live keeps its switch, locked, and says where to change it.
 */
function ChannelRow({ t, channel, live, busy, onSet }: {
  t: T
  channel: Channel
  live: boolean
  busy: boolean
  onSet: (on: boolean) => void
}) {
  const on = channel.state === 'on'
  const absent = channel.state === 'not-present' || channel.state === 'missing'
  const label = t(`channel.${channel.id}` as OffTheRecordLocaleKey)
  return (
    <ToggleRow label={label} toggle={(
      <Toggle on={on} label={label} disabled={busy || !live || absent} title={live ? undefined : t('notLive')} onChange={onSet} />
    )}>
      {absent && <p style={muted}>{t(channel.state === 'missing' ? 'stateMissing' : 'stateNotPresent')}</p>}
      {on && (
        <p style={muted}>
          {channel.changedBy === undefined ? t('changedByUnknown') : t('changedBy', { layer: channel.changedBy })}
          {' '}
          {!live && channel.changedBy !== undefined && t('editPatch', { id: channel.id, layer: channel.changedBy })}
        </p>
      )}
      {channel.state === 'missing' && channel.fix !== undefined && <p style={muted}>{channel.fix}</p>}
    </ToggleRow>
  )
}

function Telemetry({ t, status, busy, face }: { t: T; status: Status; busy: boolean; face: Actions }) {
  const channels = status.channels.filter(channel => channel.part === 'telemetry')
  return (
    <Section title={t('telemetryTitle')}>
      {channels.map(channel => (
        <ChannelRow key={channel.id} t={t} channel={channel} busy={busy}
          live={status.settingsAvailable && status.liveChannels.includes(channel.id)}
          onSet={(on) => { face.setChannel(channel.id, !on) }} />
      ))}
      {status.telemetryEnvBackstop && <p style={muted}>{t('backstop')}</p>}
      <ToggleRow label={t('newIdEachStart')} toggle={(
        <Toggle on={status.newIdEachStart} label={t('newIdEachStart')} disabled={busy || !status.settingsAvailable}
          onChange={(next) => { face.setNewIdEachStart(next) }} />
      )} />
    </Section>
  )
}

function Search({ t, status, busy, face }: { t: T; status: Status; busy: boolean; face: Actions }) {
  const [url, setUrl] = useState(status.searxng.baseURL)
  const [key, setKey] = useState('')
  const provider = status.search.provider
  const editable = status.settingsAvailable
  return (
    <Section title={t('searchTitle')}>
      <div style={row}>
        <span>{t('provider')}</span>
        {(['searxng', 'brave'] as const).map(id => (
          <Button key={id} size="sm" variant={provider === id ? 'primary' : 'outline'} disabled={busy || !editable || provider === id}
            onClick={() => { face.setSearchProvider(id) }}>
            {t(id === 'searxng' ? 'providerSearxng' : 'providerBrave')}
          </Button>
        ))}
      </div>
      {!status.search.private && <p style={muted}>{t('notPrivate', { provider: provider || '—' })}</p>}
      {provider !== 'brave' && (
      <label style={row}>
        <span>{t('searxngUrl')}</span>
        <Input value={url} placeholder="http://127.0.0.1:8888" disabled={busy || !editable} onChange={(event) => { setUrl(event.target.value) }} />
        <Button size="sm" variant="outline" disabled={busy || !editable || url === status.searxng.baseURL} onClick={() => { face.setSearxngUrl(url) }}>{t('save')}</Button>
        <span style={muted}>
          {status.searxng.baseURL.length === 0 ? t('notSet') : status.searxng.problem ?? t('set')}
        </span>
        {status.searxng.baseURL.length > 0 && (
          <Button size="sm" variant="ghost" disabled={busy || !editable} onClick={() => { face.setSearxngUrl('') }}>{t('remove')}</Button>
        )}
      </label>
      )}
      {provider === 'brave' && (
      <label style={row}>
        <span>{t('braveKey')}</span>
        <Input type="password" autoComplete="off" value={key} disabled={busy || !status.brave.keyWritable} onChange={(event) => { setKey(event.target.value) }} />
        <Button size="sm" variant="outline" disabled={busy || key.trim().length === 0} onClick={() => { face.setBraveKey(key); setKey('') }}>{t('save')}</Button>
        <span style={muted}>{status.brave.keyConfigured ? t('set') : t('notSet')}</span>
        {status.brave.keyConfigured && (
          <Button size="sm" variant="ghost" disabled={busy || !status.brave.keyWritable} onClick={() => { face.setBraveKey('') }}>{t('remove')}</Button>
        )}
      </label>
      )}
    </Section>
  )
}

function Vault({ t, status, busy, face }: { t: T; status: Status; busy: boolean; face: Actions }) {
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const { vault } = status
  return (
    <Section title={t('vaultTitle')}>
      {vault.secrets.map(secret => (
        <div key={secret.name} style={{ ...row, justifyContent: 'space-between' }}>
          <span style={row}><code>{secret.name}</code><Tag>{t(secret.origin === 'user' ? 'originUser' : 'originGenerated')}</Tag></span>
          <Button size="sm" variant="ghost" disabled={busy || !vault.writable} onClick={() => { face.setSecret(secret.name, '') }}>{t('remove')}</Button>
        </div>
      ))}
      {vault.writable
        ? (
            <span style={row}>
              <Input value={name} placeholder="DB_URL" aria-label={t('secretName')} disabled={busy}
                onChange={(event) => { setName(event.target.value.toUpperCase()) }} />
              <Input type="password" autoComplete="off" value={value} aria-label={t('secretValue')} disabled={busy}
                onChange={(event) => { setValue(event.target.value) }} />
              <Button size="sm" variant="outline" disabled={busy || name.length === 0 || value.length === 0}
                onClick={() => { face.setSecret(name, value); setValue('') }}>{t('add')}</Button>
            </span>
          )
        : <p style={muted}>{t('vaultUnavailable')}</p>}
    </Section>
  )
}

/**
 * Render the bundle's one-line summary, or the full page.
 * @param props - view, locale, page state hook, and actions.
 * @returns the summary text or the page.
 */
export function OffTheRecordPage(props: OffTheRecordPageProps) {
  const t = props.t as T
  const state = props.useOtrPage(snapshot => snapshot)
  const status = state.status
  if (props.view === 'summary') return status === undefined ? t('tagline') : summary(t, status)
  if (status === undefined) {
    return state.loadError === undefined
      ? <p style={muted}>{t('loading')}</p>
      : <div style={row}><span>{t('loadFailed', { error: state.loadError })}</span><Button size="sm" onClick={() => { props.reload() }}>{t('retry')}</Button></div>
  }
  const busy = state.busy !== undefined
  return (
    <div style={column}>
      {!status.settingsAvailable && <p style={muted}>{t('settingsUnavailable')}</p>}
      {state.notice?.kind === 'error' && (
        <p role="alert" style={muted}>{t('actionFailed', { error: state.notice.message ?? '' })}</p>
      )}
      <Telemetry t={t} status={status} busy={busy} face={props} />
      <Search key={status.searxng.baseURL} t={t} status={status} busy={busy} face={props} />
      <Vault t={t} status={status} busy={busy} face={props} />
    </div>
  )
}
