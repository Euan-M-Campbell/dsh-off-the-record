/**
 * Off the Record status: checks every row this bundle manages at startup and
 * after each recomposition, logs one summary line and a warning with the fix
 * for each difference, and serves the same report as `ctx.offTheRecord`.
 *
 * Mounted from the bare package specifier (`dsh-off-the-record`), because the
 * harness attaches a package's browser half only to that row.
 * @module dsh-off-the-record
 */
import { type Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type CompositionReport } from './check.ts';
export { CHANNELS, checkComposition, describeReport, PRIVATE_SEARCH_PROVIDERS } from './check.ts';
export type { ChannelState, ChannelStatus, CompositionReport, LaterLayer, RowView, SearchStatus } from './check.ts';
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
export default class OffTheRecord extends Service {
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
     * Delete the anonymous installation id. The harness mints a new one at the next launch.
     * @returns whether a file was removed, and that the change applies at the next launch.
     */
    resetAnonymousId(): Promise<{
        readonly removed: boolean;
        readonly takesEffect: 'next-launch';
    }>;
    /** Recompute the report and log it when it changed. */
    private refresh;
    private profile;
    /** Layers above every bundle, highest precedence first: overlays, the home patch, the profile patch. */
    private laterLayers;
}
