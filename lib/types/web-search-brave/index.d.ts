/**
 * Brave Search provider plugin. Registers provider id `brave` into the
 * `ctx.web` registry. The API key is a harness credential resolved per search;
 * it never enters configuration, a session, or the vault. Profiles without the
 * credential store (one-shot `headless`) read it from the launch environment.
 * @module dsh-off-the-record/web-search-brave
 */
import type { Context, Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export { BRAVE_PROVIDER_ID, BRAVE_SEARCH_ENDPOINT, BraveSearchProvider } from './provider.ts';
export type { BraveKeySource, BraveSettings } from './provider.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "otr-web-search-brave";
/** The web seam this provider registers into. The credential store is optional and read per use. */
export declare const inject: string[];
/** Plugin configuration; every field is live-editable. */
export interface Config {
    /** Credential reference holding the Brave API key. */
    apiKeyEnv: Volatile<string>;
    /** Per-search deadline in milliseconds, on top of the caller's cancellation. */
    searchTimeoutMs: Volatile<number>;
    /** `user-agent` header sent to Brave. */
    userAgent: Volatile<string>;
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    apiKeyEnv: z<string, string, "volatile-defined">;
    searchTimeoutMs: z<number, number, "volatile-defined">;
    userAgent: z<string, string, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    apiKeyEnv: z<string, string, "volatile-defined">;
    searchTimeoutMs: z<number, number, "volatile-defined">;
    userAgent: z<string, string, "volatile-defined">;
}>>, "plain">;
/**
 * Register the Brave provider with `ctx.web`. `available()` answers from the
 * last credential description, refreshed at start, on every stored-credential
 * change, and after each search.
 * @param ctx - plugin context with `web` injected.
 * @param config - validated configuration.
 */
export declare function apply(ctx: Context, config: Config): void;
