/**
 * `SearxngSearchProvider`: a `WebSearchProvider` backed by the user's own
 * SearXNG instance (`GET {baseURL}/search?q=…&format=json`).
 * @module dsh-off-the-record/web-search-searxng/provider
 */
import { type WebSearchProvider, type WebSearchRequest, type WebSearchResult, type WebSearchSource } from '@deepseek-ai/dsh-web';
/** Stable id this provider registers under; `web.searchProvider` names it. */
export declare const SEARXNG_PROVIDER_ID = "searxng";
/** Live provider settings, read at each call so configuration edits apply without a restart. */
export interface SearxngSettings {
    /** Instance root, such as `http://127.0.0.1:8888`; empty while unconfigured. */
    readonly baseURL: string;
    /** Comma-separated SearXNG engine names; empty sends none. */
    readonly engines: string;
    /** Comma-separated SearXNG categories; empty sends none. */
    readonly categories: string;
    readonly searchTimeoutMs: number;
    readonly userAgent: string;
}
/**
 * Whether a hostname names this machine or a private network, where plain
 * `http:` is acceptable. Single-label names (Docker and Compose service names)
 * count as private.
 * @param hostname - `URL.hostname`, with IPv6 brackets.
 * @returns whether the host is loopback, link-local, or private.
 */
export declare function isPrivateHost(hostname: string): boolean;
/**
 * Validate an instance root.
 * @param baseURL - configured value.
 * @returns undefined when usable, otherwise the reason it is not.
 */
export declare function baseUrlProblem(baseURL: string): string | undefined;
/**
 * Build the search URL beneath the instance root, keeping any path prefix.
 * @param settings - live settings with a valid `baseURL`.
 * @param query - the search text.
 * @returns the request URL.
 */
export declare function searchUrl(settings: SearxngSettings, query: string): URL;
/**
 * Map one SearXNG result to a source.
 * @param value - one entry of `results[]`.
 * @returns the source, or undefined when it has no citeable URL.
 */
export declare function mapSearxngResult(value: unknown): WebSearchSource | undefined;
/**
 * Map a SearXNG JSON response. Direct answers become `content`; older
 * instances send them as strings, newer ones as `{ answer }` objects.
 * @param body - the parsed response.
 * @returns the normalized result; the web service applies `maxResults`.
 */
export declare function mapSearxngResponse(body: unknown): WebSearchResult;
/**
 * Explain a non-2xx status with the fix.
 * @param status - HTTP status.
 * @returns the error message.
 */
export declare function describeSearxngStatus(status: number): string;
/** Search through the configured SearXNG instance. */
export declare class SearxngSearchProvider implements WebSearchProvider {
    private readonly settings;
    readonly id = "searxng";
    constructor(settings: () => SearxngSettings);
    available(): boolean;
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
}
