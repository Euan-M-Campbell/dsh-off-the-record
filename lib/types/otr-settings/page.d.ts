/**
 * What the Off the Record settings page shows, and the changes it can make.
 * Every write goes through a harness service (settings, credentials, vault)
 * and is validated here, on the Host; the page sends names and values only.
 * @module dsh-off-the-record/otr-settings/page
 */
import type { Context } from '@deepseek-ai/cordis';
import { type SecretInfo } from '../vault/index.ts';
import type { CompositionReport, RowView } from './check.ts';
/** Channels whose switch is live (`.volatile()`), and so can be changed from the page. */
export declare const LIVE_CHANNELS: readonly string[];
/** The Brave key's credential reference. */
export declare const BRAVE_KEY_REF = "BRAVE_API_KEY";
/** Everything the page renders, in one JSON value. */
export interface PageStatus extends CompositionReport {
    readonly profile?: string;
    readonly telemetryEnvBackstop: boolean;
    readonly newIdEachStart: boolean;
    /** Whether the harness settings service is available to make live changes. */
    readonly settingsAvailable: boolean;
    /** Channel ids the page can switch without a restart. */
    readonly liveChannels: readonly string[];
    readonly searxng: {
        readonly baseURL: string;
        readonly problem?: string;
    };
    readonly brave: {
        readonly keyConfigured: boolean;
        readonly keyWritable: boolean;
    };
    readonly vault: {
        readonly available: boolean;
        readonly writable: boolean;
        /** Every secret in every scope. */
        readonly secrets: readonly SecretInfo[];
        /** Workspaces a secret can be added to: the harness's workspaces, and directories that already hold secrets. */
        readonly workspaces: readonly WorkspaceChoice[];
    };
}
/** One workspace the page offers as a secret's scope. */
export interface WorkspaceChoice {
    /** Canonical directory, the scope's key. */
    readonly directory: string;
    /** The workspace's title in the harness, or the folder name. */
    readonly title: string;
    /** Whether the harness still lists it as a workspace. */
    readonly registered: boolean;
}
/**
 * Workspaces a secret can belong to: the harness's own (Web and Desktop), and
 * any directory that already holds secrets, such as a removed workspace or one
 * used from the CLI.
 * @param ctx - the Off the Record service context.
 * @param secrets - every stored secret.
 * @returns choices, harness workspaces first.
 */
export declare function workspaceChoices(ctx: Context, secrets: readonly SecretInfo[]): WorkspaceChoice[];
/**
 * Assemble the page status from the composition report and the live services.
 * @param ctx - the Off the Record service context.
 * @param report - the composition report with launch facts.
 * @param rows - Loader entries.
 * @returns the page status.
 */
export declare function pageStatus(ctx: Context, report: CompositionReport & {
    readonly profile?: string;
    readonly telemetryEnvBackstop: boolean;
    readonly newIdEachStart: boolean;
}, rows: readonly RowView[]): Promise<PageStatus>;
/**
 * Turn a live channel off or on. Off removes the profile's override, so this
 * bundle's setting applies again; on writes `enabled: true` into the profile.
 * @param ctx - the Off the Record service context.
 * @param id - a channel id from {@link LIVE_CHANNELS}.
 * @param off - true to turn the channel off.
 */
export declare function setChannel(ctx: Context, id: string, off: boolean): Promise<void>;
/**
 * Turn replacing the anonymous installation id at every start on or off. On is
 * this bundle's default, so turning it on removes the profile override.
 * @param ctx - the Off the Record service context.
 * @param on - true to replace the id at every start.
 */
export declare function setNewIdEachStart(ctx: Context, on: boolean): Promise<void>;
/**
 * Choose the private search provider. SearXNG is this bundle's own selection,
 * so choosing it removes any profile override, including a stale DeepSeek one.
 * @param ctx - the Off the Record service context.
 * @param provider - `searxng` or `brave`.
 */
export declare function setSearchProvider(ctx: Context, provider: string): Promise<void>;
/**
 * Set or clear the SearXNG instance URL.
 * @param ctx - the Off the Record service context.
 * @param url - the instance root, or empty to clear it.
 */
export declare function setSearxngUrl(ctx: Context, url: string): Promise<void>;
/**
 * Store or remove the Brave API key in the harness credential store.
 * @param ctx - the Off the Record service context.
 * @param key - the key, or empty to remove it.
 */
export declare function setBraveKey(ctx: Context, key: string): Promise<void>;
/**
 * Add or replace a vault secret, or remove it when the value is empty.
 * @param ctx - the Off the Record service context.
 * @param name - the secret name.
 * @param value - the value, or empty to remove the secret.
 * @param directory - a workspace directory from the page's choices, or empty for a global secret.
 */
export declare function setSecret(ctx: Context, name: string, value: string, directory: string): Promise<void>;
