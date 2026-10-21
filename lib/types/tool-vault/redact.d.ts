/**
 * Secret redaction: finds each stored value, raw or in a common encoding, and
 * replaces it with `[secret:NAME]`. Pure; rebuilt whenever the vault changes.
 * @module dsh-off-the-record/tool-vault/redact
 */
import type { SecretName } from '../vault/index.ts';
/** Encodings a value is searched for in. */
export type RedactEncoding = 'raw' | 'base64' | 'base64url' | 'url' | 'json';
export declare const ALL_ENCODINGS: readonly RedactEncoding[];
export interface Matcher {
    /** True when the vault is empty, so nothing can match. */
    readonly empty: boolean;
    /** Whether any form of any stored value occurs in the text. */
    matches(text: string): boolean;
    /** Replace every occurrence with `[secret:NAME]`. */
    redact(text: string): string;
}
/**
 * The part of a value's base64 encoding that does not depend on the bytes
 * around it, for each of the three alignments it can start at inside a longer
 * encoded stream.
 * @param value - the secret.
 * @param url - base64url alphabet instead of standard base64.
 * @returns the stable encoded runs.
 */
export declare function base64Cores(value: string, url: boolean): string[];
/**
 * Every searchable form of one value.
 * @param value - the secret.
 * @param encodings - which encodings to include.
 * @returns distinct forms.
 */
export declare function forms(value: string, encodings: readonly RedactEncoding[]): string[];
/**
 * Build a matcher over the current vault contents.
 * @param entries - name/value pairs.
 * @param encodings - encodings to search.
 * @param minLength - forms shorter than this are skipped, so short encoded runs never match ordinary text.
 * @returns the matcher.
 */
export declare function buildMatcher(entries: readonly {
    readonly name: SecretName;
    readonly value: string;
}[], encodings: readonly RedactEncoding[], minLength: number): Matcher;
/**
 * Redact every string in a JSON value, keys included.
 * @param value - any JSON value.
 * @param matcher - the matcher.
 * @returns a redacted copy.
 */
export declare function redactJson<T>(value: T, matcher: Matcher): T;
/**
 * Whether any string inside a JSON value matches.
 * @param value - any JSON value.
 * @param matcher - the matcher.
 * @returns true on the first match.
 */
export declare function jsonMatches(value: unknown, matcher: Matcher): boolean;
