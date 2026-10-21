/**
 * Secrets vault Service Definition: `ctx.vault`, secret names, scopes, and the
 * storage layout on harness credential records. `vault-local` provides it;
 * `tool-vault` consumes it. The model sees secret names and origins, never values.
 *
 * A secret is global, or belongs to one workspace: a project directory. A
 * session uses the global secrets plus those of the directory its root session
 * was created in; a workspace secret wins over a global one of the same name.
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
/** Where a secret applies: everywhere, or in one workspace. */
export type SecretScope = 'global' | 'workspace';
/** What the model and configuration surfaces may know about one secret. */
export interface SecretInfo {
    readonly name: SecretName;
    readonly origin: SecretOrigin;
    readonly scope: SecretScope;
    /** The workspace's canonical directory, for a workspace secret. */
    readonly directory?: string;
}
/** A canonical workspace directory, as {@link workspaceDirectory} returns it. */
export type WorkspaceDirectory = string & {
    readonly __workspaceDirectory: true;
};
/**
 * Canonicalize a workspace directory, so one folder always maps to one key:
 * symlinks resolved and, on case-insensitive file systems, the real case.
 * A directory that no longer exists keeps its absolute path.
 * @param directory - an absolute or relative directory.
 * @returns the canonical directory.
 */
export declare function workspaceDirectory(directory: string): WorkspaceDirectory;
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
/** Credential-record scope that holds global vault entries. */
export declare const VAULT_RECORD_SCOPE = "vault";
/** Credential-record scope that holds workspace vault entries. */
export declare const WORKSPACE_RECORD_SCOPE = "vault-ws";
/**
 * The record id of a workspace secret: `d` + 16 hex characters of the
 * directory's SHA-256, then the name's record id. Record ids are lowercase and
 * may not start with a digit, hence the prefix; the directory itself is stored
 * in the record.
 * @param directory - canonical workspace directory.
 * @param name - the secret name.
 * @returns the record id within {@link WORKSPACE_RECORD_SCOPE}.
 */
export declare function workspaceRecordId(directory: WorkspaceDirectory, name: SecretName): string;
/**
 * Split a workspace record id into its directory hash and secret name.
 * @param id - record id within {@link WORKSPACE_RECORD_SCOPE}.
 * @returns the name, or undefined when the id is not a workspace secret's.
 */
export declare function nameFromWorkspaceRecordId(id: string): SecretName | undefined;
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
    /**
     * The secrets a session in one workspace may use: every global secret, and
     * the workspace's own, which replace global ones of the same name.
     * @param directory - the session's canonical workspace directory, if it has one.
     */
    abstract list(directory?: WorkspaceDirectory): Promise<readonly SecretInfo[]>;
    /** Every stored secret in every scope, for configuration surfaces. */
    abstract listAll(): Promise<readonly SecretInfo[]>;
    /**
     * Store a user-supplied value, replacing any existing one.
     * @param name - the secret name.
     * @param value - the value; must meet the provider's minimum length.
     * @param directory - the workspace, or undefined for a global secret.
     */
    abstract set(name: SecretName, value: string, directory?: WorkspaceDirectory): Promise<void>;
    /**
     * Remove a secret; removing an absent one is a no-op.
     * @param name - the secret name.
     * @param directory - the workspace, or undefined for a global secret.
     */
    abstract unset(name: SecretName, directory?: WorkspaceDirectory): Promise<void>;
    /**
     * Generate and store a random value under a new name.
     * @param name - a name not already stored in that scope.
     * @param options - length and alphabet.
     * @param directory - the workspace, or undefined for a global secret.
     * @throws Error when the name already exists in that scope.
     */
    abstract generate(name: SecretName, options: GenerateOptions, directory?: WorkspaceDirectory): Promise<void>;
    /**
     * Resolve values for one command's environment, the workspace's own first.
     * @param names - the names the command asked for.
     * @param directory - the session's canonical workspace directory, if it has one.
     * @returns the values by name.
     * @throws Error naming every name that is not stored.
     */
    abstract resolveForExecution(names: readonly SecretName[], directory?: WorkspaceDirectory): Promise<ReadonlyMap<SecretName, string>>;
    /** Every stored name/value pair, in every scope, for the redaction matcher. */
    abstract redactionEntries(): readonly {
        readonly name: SecretName;
        readonly value: string;
    }[];
}
export default SecretVault;
