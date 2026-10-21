/**
 * SearXNG search provider plugin. Registers provider id `searxng` into the
 * `ctx.web` registry; `patches/private-search.patch.yml` selects it.
 *
 * The instance URL comes only from this plugin's configuration, never from the
 * environment: the environment includes the opened project's `.env`, and a
 * repository must not be able to redirect searches to its own server.
 * @module dsh-off-the-record/web-search-searxng
 */
import type { Context, Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export { SEARXNG_PROVIDER_ID, SearxngSearchProvider } from './provider.ts';
export type { SearxngSettings } from './provider.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "otr-web-search-searxng";
/** The web seam this provider registers into. */
export declare const inject: string[];
/** Plugin configuration; every field is live-editable. */
export interface Config {
    /** Instance root, such as `http://127.0.0.1:8888`. Empty leaves search unconfigured. */
    baseURL: Volatile<string>;
    /** Comma-separated SearXNG engine names to query; empty uses the instance's defaults. */
    engines: Volatile<string>;
    /** Comma-separated SearXNG categories; empty uses the instance's defaults. */
    categories: Volatile<string>;
    /** Per-search deadline in milliseconds, on top of the caller's cancellation. */
    searchTimeoutMs: Volatile<number>;
    /** `user-agent` header sent to the instance. */
    userAgent: Volatile<string>;
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    baseURL: z<string, string, "volatile-defined">;
    engines: z<string, string, "volatile-defined">;
    categories: z<string, string, "volatile-defined">;
    searchTimeoutMs: z<number, number, "volatile-defined">;
    userAgent: z<string, string, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    baseURL: z<string, string, "volatile-defined">;
    engines: z<string, string, "volatile-defined">;
    categories: z<string, string, "volatile-defined">;
    searchTimeoutMs: z<number, number, "volatile-defined">;
    userAgent: z<string, string, "volatile-defined">;
}>>, "plain">;
/**
 * Register the SearXNG provider with `ctx.web`. A malformed instance URL fails
 * the plugin at load; an empty one leaves the provider registered but unavailable.
 * @param ctx - plugin context with `web` injected.
 * @param config - validated configuration.
 */
export declare function apply(ctx: Context, config: Config): void;
