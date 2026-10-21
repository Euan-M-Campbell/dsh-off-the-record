/**
 * Secrets vault tools and redaction. The model lists secret names, generates
 * new secrets, and runs commands that receive secrets as environment
 * variables; every tool result, from any tool, has stored values replaced with
 * `[secret:NAME]` before it reaches the model or the session log.
 * @module dsh-off-the-record/tool-vault
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type RedactEncoding } from './redact.ts';
export { buildMatcher, forms, redactJson, jsonMatches, base64Cores } from './redact.ts';
export type { Matcher, RedactEncoding } from './redact.ts';
export { redactDecision } from './decision.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "otr-tool-vault";
/** The tool registry and the vault. Shell services are optional and enable run_with_secrets. */
export declare const inject: string[];
export interface Config {
    /** Length of a generated secret when the model does not choose one. */
    generateLength: number;
    /** Encodings each stored value is searched for in. */
    redactEncodings: RedactEncoding[];
    /** Encoded forms shorter than this are not searched, so they never match ordinary text. */
    minRedactLength: number;
}
export declare const Config: z<Config>;
/** Tool descriptions, written for the model. Tests pin them verbatim. */
export declare const DESCRIPTIONS: {
    readonly list_secrets: string;
    readonly create_secret: string;
    readonly run_with_secrets: string;
    readonly run_with_secrets_powershell: string;
};
interface CommandOutcome {
    readonly exitCode: number | null;
    readonly signal: string | null;
    readonly timedOut: boolean;
    readonly timeoutMs: number;
    readonly stdout: {
        readonly text: string;
        readonly truncated: boolean;
    };
    readonly stderr: {
        readonly text: string;
        readonly truncated: boolean;
    };
    readonly sandbox?: {
        readonly mode: string;
        readonly denied: boolean;
    };
}
/**
 * The text the model reads for one command, in the bash tool's format.
 * @param outcome - the redacted command outcome.
 * @param escalation - whether escalation fields are offered.
 * @returns the model-facing text.
 */
export declare function renderCommand(outcome: CommandOutcome, escalation: boolean): string;
/**
 * Register the vault tools and the redaction listeners.
 * @param ctx - plugin context with `tools` and `vault` injected.
 * @param config - validated configuration.
 */
export declare function apply(ctx: Context, config: Config): void;
