/**
 * Off the Record status: checks every row this bundle manages at startup and
 * after each recomposition, logs one summary line and a warning with the fix
 * for each difference, and serves the same report as `ctx.offTheRecord`.
 *
 * Mounted from the bare package specifier (`dsh-off-the-record`), because the
 * harness attaches a package's browser half only to that row.
 * @module dsh-off-the-record
 */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import z from '@deepseek-ai/schemastery';
import { type CompositionReport } from './check.ts';
import { type PageStatus } from './page.ts';
export { CHANNELS, checkComposition, describeReport, PRIVATE_SEARCH_PROVIDERS } from './check.ts';
export type { ChannelState, ChannelStatus, CompositionReport, LaterLayer, RowView, SearchStatus } from './check.ts';
export { BRAVE_KEY_REF, LIVE_CHANNELS } from './page.ts';
export type { PageStatus } from './page.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        offTheRecord: OffTheRecord;
    }
}
/** Report plus launch facts that are not composition rows. */
export interface OffTheRecordStatus extends CompositionReport {
    /** The profile this process booted, when the harness reports one. */
    readonly profile?: string;
    /** Whether DSH_TELEMETRY_DISABLED was set at launch, an independent backstop for the session upload. */
    readonly telemetryEnvBackstop: boolean;
}
export interface Config {
    /** Delay before re-checking after a recomposition, in milliseconds. */
    recheckDelayMs: number;
}
/**
 * The Off the Record service.
 */
export default class OffTheRecord extends TypertRemoteService {
    private readonly config;
    static inject: string[];
    static Config: z<Config>;
    private latest;
    private lastLog;
    constructor(ctx: Context, config: Config);
    /**
     * The latest report, computing it first if none exists yet.
     * @returns every managed channel's state and the search selection.
     */
    status(): Promise<OffTheRecordStatus>;
    /**
     * Everything the settings page shows, computed fresh.
     * @returns status, live switches, search setup, and secret names.
     */
    pageStatus(): Promise<PageStatus>;
    /**
     * Turn a live channel off (restore this bundle's setting) or on.
     * @param id - channel row id.
     * @param off - true to turn it off.
     */
    setChannel(id: string, off: boolean): Promise<void>;
    /**
     * Choose the private search provider.
     * @param provider - `searxng` or `brave`.
     */
    setSearchProvider(provider: string): Promise<void>;
    /**
     * Set or clear the SearXNG instance URL.
     * @param url - the instance root, or empty to clear it.
     */
    setSearxngUrl(url: string): Promise<void>;
    /**
     * Store or remove the Brave API key; it is written to the credential store, never to configuration.
     * @param key - the key, or empty to remove it.
     */
    setBraveKey(key: string): Promise<void>;
    /**
     * Add, replace, or (with an empty value) remove a vault secret. Values travel to the Host only.
     * @param name - the secret name.
     * @param value - the value, or empty to remove it.
     */
    setSecret(name: string, value: string): Promise<void>;
    /**
     * Delete the anonymous installation id. The harness mints a new one at the next launch.
     * @returns whether a file was removed, and that the change applies at the next launch.
     */
    resetAnonymousId(): Promise<{
        readonly removed: boolean;
        readonly takesEffect: 'next-launch';
    }>;
    /** Recompute the report and log it when it changed. */
    private rows;
    private refresh;
    private profile;
    /** Layers above every bundle, highest precedence first: overlays, the home patch, the profile patch. */
    private laterLayers;
}
