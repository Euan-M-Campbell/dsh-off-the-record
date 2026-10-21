/**
 * HTTP plumbing shared by the SearXNG and Brave search providers: one GET with
 * a timeout layered on the caller's signal, typed `WebError` failures, and
 * source de-duplication. Each plugin bundles its own copy at build time.
 * @module dsh-off-the-record/shared/search-http
 */
import { type WebSearchSource } from '@deepseek-ai/dsh-web';
/** Default per-search deadline, in addition to the caller's signal. */
export declare const DEFAULT_SEARCH_TIMEOUT_MS = 15000;
/** Default `user-agent` header; identifies the bundle, not the user. */
export declare const DEFAULT_USER_AGENT = "dsh-off-the-record";
/**
 * Check a configured `user-agent` value: visible ASCII and spaces only, so it
 * can never inject a header line.
 * @param value - the configured header value.
 * @returns whether the value is safe to send.
 */
export declare function isValidUserAgent(value: string): boolean;
/** One provider's naming for error messages. */
export interface SearchRequestOptions {
    /** Human name used in error messages, such as "SearXNG". */
    readonly label: string;
    readonly url: URL;
    readonly headers: Readonly<Record<string, string>>;
    readonly timeoutMs: number;
    readonly signal?: AbortSignal | undefined;
    /** Maps a non-2xx status to a message that names the fix. */
    readonly describeStatus: (status: number) => string;
}
/**
 * GET one JSON document. Redirects fail, cookies are never sent, and the
 * request ends at the earlier of the caller's signal and `timeoutMs`.
 * @param options - target, headers, deadline, and error naming.
 * @returns the parsed JSON body, not yet shape-checked.
 * @throws WebError `WEB_ABORTED` when the caller aborts, otherwise `WEB_PROVIDER_ERROR`.
 */
export declare function getJson(options: SearchRequestOptions): Promise<unknown>;
/**
 * Throw the provider error used for a well-formed body of the wrong shape.
 * @param label - provider name for the message.
 * @returns never.
 */
export declare function unexpectedShape(label: string): never;
/**
 * Keep the first source for each URL, preserving order.
 * @param sources - mapped sources, possibly repeating a URL across engines.
 * @returns sources with unique URLs.
 */
export declare function dedupeSources(sources: readonly WebSearchSource[]): WebSearchSource[];
/**
 * Read an optional non-empty string field from untrusted JSON.
 * @param value - candidate field value.
 * @returns the trimmed string, or undefined when absent or blank.
 */
export declare function text(value: unknown): string | undefined;
/**
 * Narrow untrusted JSON to a plain object.
 * @param value - candidate value.
 * @returns the object, or undefined.
 */
export declare function record(value: unknown): Record<string, unknown> | undefined;
/**
 * Check that a URL from a search result is safe to cite: absolute http(s) only.
 * @param value - candidate URL.
 * @returns the URL string, or undefined.
 */
export declare function sourceUrl(value: unknown): string | undefined;
