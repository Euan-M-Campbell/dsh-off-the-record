/**
 * Secrets vault Service Definition: `ctx.vault`, secret names, and the storage
 * layout on harness credential records. `vault-local` provides it; `tool-vault`
 * consumes it. The model sees secret names and origins, never values.
 * @module dsh-off-the-record/vault
 */
import { type Context, Service } from '@deepseek-ai/cordis';
declare const secretNameBrand: unique symbol;
/** A validated secret name: a POSIX environment identifier the vault may set. */
export type SecretName = string & {
    readonly [secretNameBrand]: true;
};
/** Who put the value in the vault. */
export type SecretOrigin = 'user' | 'generated';
/** What the model and configuration surfaces may know about one secret. */
export interface SecretInfo {
    readonly name: SecretName;
    readonly origin: SecretOrigin;
}
/** Alphabets `generate` draws from. */
export type SecretAlphabet = 'hex' | 'base64url' | 'alphanumeric';
export interface GenerateOptions {
    readonly length: number;
    readonly alphabet: SecretAlphabet;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        vault: SecretVault;
    }
    interface Events {
        /** The set of stored secrets or one of their values changed. */
        'vault/changed'(): void;
    }
}
/**
 * Explain why a string cannot be a secret name.
 * @param value - candidate name.
 * @returns undefined when valid, otherwise the reason.
 */
export declare function secretNameProblem(value: string): string | undefined;
/**
 * Validate and brand a secret name.
 * @param value - candidate name.
 * @returns the branded name.
 * @throws TypeError naming the problem.
 */
export declare function secretName(value: string): SecretName;
/** Credential-record scope that holds vault entries. */
export declare const VAULT_RECORD_SCOPE = "vault";
/**
 * Credential record ids are lowercase kebab-case; names map reversibly because
 * they contain no `-`.
 * @param name - a secret name.
 * @returns the record id, such as `db-url` for `DB_URL`.
 */
export declare function recordId(name: SecretName): string;
/**
 * Map a record id back to its secret name.
 * @param id - record id within the vault scope.
 * @returns the name, or undefined when the id is not a valid vault name.
 */
export declare function nameFromRecordId(id: string): SecretName | undefined;
/**
 * The vault service. Values leave it only through {@link resolveForExecution},
 * for a command's environment, and {@link redactionEntries}, for the redaction
 * matcher; neither path reaches the model.
 */
export declare abstract class SecretVault extends Service {
    constructor(ctx: Context);
    /** Every stored secret, by name, without values. */
    abstract list(): Promise<readonly SecretInfo[]>;
    /**
     * Store a user-supplied value, replacing any existing one.
     * @param name - the secret name.
     * @param value - the value; must meet the provider's minimum length.
     */
    abstract set(name: SecretName, value: string): Promise<void>;
    /**
     * Remove a secret; removing an absent one is a no-op.
     * @param name - the secret name.
     */
    abstract unset(name: SecretName): Promise<void>;
    /**
     * Generate and store a random value under a new name.
     * @param name - a name not already stored.
     * @param options - length and alphabet.
     * @throws Error when the name already exists.
     */
    abstract generate(name: SecretName, options: GenerateOptions): Promise<void>;
    /**
     * Resolve values for one command's environment.
     * @param names - the names the command asked for.
     * @returns the values by name.
     * @throws Error naming every name that is not stored.
     */
    abstract resolveForExecution(names: readonly SecretName[]): Promise<ReadonlyMap<SecretName, string>>;
    /** Current name/value pairs for building the redaction matcher. */
    abstract redactionEntries(): readonly {
        readonly name: SecretName;
        readonly value: string;
    }[];
}
export default SecretVault;
