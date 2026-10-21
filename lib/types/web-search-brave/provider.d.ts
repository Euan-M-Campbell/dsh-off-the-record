/**
 * `BraveSearchProvider`: a `WebSearchProvider` backed by the Brave Search API
 * (`GET https://api.search.brave.com/res/v1/web/search`). The endpoint is
 * fixed, so the API key can never be sent anywhere else.
 * @module dsh-off-the-record/web-search-brave/provider
 */
import { type WebSearchProvider, type WebSearchRequest, type WebSearchResult, type WebSearchSource } from '@deepseek-ai/dsh-web';
/** Stable id this provider registers under; `web.searchProvider` names it. */
export declare const BRAVE_PROVIDER_ID = "brave";
/** The only endpoint this provider contacts. */
export declare const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
/** Brave's largest accepted `count`. */
export declare const BRAVE_MAX_COUNT = 20;
/** Live provider settings, read at each call. */
export interface BraveSettings {
    readonly searchTimeoutMs: number;
    readonly userAgent: string;
}
/** Key access: a cheap cached presence check, and a per-search resolve. */
export interface BraveKeySource {
    /** Whether a key was configured at the last credential refresh. */
    configured(): boolean;
    /** Resolve the key for one search; undefined while unconfigured. */
    resolve(): Promise<string | undefined>;
}
/**
 * Brave descriptions carry `<strong>` highlighting and HTML entities; reduce
 * them to plain text.
 * @param value - one description.
 * @returns plain text.
 */
export declare function plainText(value: string): string;
/**
 * Map one Brave web result to a source.
 * @param value - one entry of `web.results[]`.
 * @returns the source, or undefined when it has no citeable URL.
 */
export declare function mapBraveResult(value: unknown): WebSearchSource | undefined;
/**
 * Map a Brave response. A query with no web results omits `web` entirely.
 * @param body - the parsed response.
 * @returns the normalized result; the web service applies `maxResults`.
 */
export declare function mapBraveResponse(body: unknown): WebSearchResult;
/**
 * Explain a non-2xx status with the fix.
 * @param status - HTTP status.
 * @returns the error message.
 */
export declare function describeBraveStatus(status: number): string;
/** Search through the Brave Search API with the user's key. */
export declare class BraveSearchProvider implements WebSearchProvider {
    private readonly key;
    private readonly settings;
    readonly id = "brave";
    constructor(key: BraveKeySource, settings: () => BraveSettings);
    available(): boolean;
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
}
