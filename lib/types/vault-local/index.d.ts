/**
 * Local secrets vault: `ctx.vault` stored on the harness credential store's
 * records, under `vault/<name>`. A record written by hand in
 * `$DSH_HOME/.credentials.yaml` takes the friendly form
 * `{ kind: api-key, key: <value> }`; generated secrets are stored as
 * `{ kind: grant, payload: { value, origin, createdAt } }`.
 *
 * Profiles without the credential store (one-shot `headless`) get an empty,
 * read-only vault rather than a row that never activates.
 * @module dsh-off-the-record/vault-local
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type CredentialRecord } from '@deepseek-ai/dsh-credentials';
import { SecretVault, type GenerateOptions, type SecretInfo, type SecretName, type SecretOrigin } from '../vault/index.ts';
export interface Config {
    /** Shortest value the vault accepts; shorter values could not be redacted reliably. */
    minValueLength: number;
    /** Most secrets the vault holds. */
    maxSecrets: number;
}
/**
 * Draw a uniformly random string; rejection sampling avoids modulo bias.
 * @param options - length and alphabet.
 * @returns the random value.
 */
export declare function randomSecret(options: GenerateOptions): string;
/**
 * Read one vault record in either stored form.
 * @param record - the stored credential record.
 * @returns the value and origin, or undefined when the record holds no value.
 */
export declare function readEntry(record: CredentialRecord | undefined): {
    value: string;
    origin: SecretOrigin;
} | undefined;
/** The local vault service. */
export default class LocalVault extends SecretVault {
    private readonly config;
    static Config: z<Config>;
    private entries;
    private generation;
    constructor(ctx: Context, config: Config);
    list(): Promise<readonly SecretInfo[]>;
    set(name: SecretName, value: string): Promise<void>;
    unset(name: SecretName): Promise<void>;
    generate(name: SecretName, options: GenerateOptions): Promise<void>;
    resolveForExecution(names: readonly SecretName[]): Promise<ReadonlyMap<SecretName, string>>;
    redactionEntries(): readonly {
        readonly name: SecretName;
        readonly value: string;
    }[];
    private store;
    private checkValue;
    /** Write one record; `create` refuses to replace an existing value. */
    private write;
    private reload;
    private reloadNow;
}
