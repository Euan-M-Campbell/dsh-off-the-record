import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { Service } from "@deepseek-ai/cordis";
//#region src/vault/index.ts
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
/**
* Canonicalize a workspace directory, so one folder always maps to one key:
* symlinks resolved and, on case-insensitive file systems, the real case.
* A directory that no longer exists keeps its absolute path.
* @param directory - an absolute or relative directory.
* @returns the canonical directory.
*/
function workspaceDirectory(directory) {
	const absolute = resolve(directory);
	try {
		return realpathSync.native(absolute);
	} catch {
		return absolute;
	}
}
const NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
/** Names that would change how a command runs rather than pass it a secret. */
const RESERVED_NAMES = /* @__PURE__ */ new Set([
	"PATH",
	"HOME",
	"SHELL",
	"USER",
	"LOGNAME",
	"PWD",
	"OLDPWD",
	"TMPDIR",
	"TERM",
	"LANG",
	"IFS",
	"CDPATH",
	"ENV",
	"BASH_ENV",
	"PS1",
	"PS2",
	"PS4",
	"PROMPT_COMMAND",
	"NODE_OPTIONS",
	"NODE_PATH",
	"PYTHONPATH",
	"PYTHONSTARTUP",
	"PERL5OPT",
	"PERL5LIB",
	"RUBYOPT",
	"RUBYLIB",
	"SSL_CERT_FILE",
	"SSL_CERT_DIR",
	"HTTP_PROXY",
	"HTTPS_PROXY",
	"ALL_PROXY",
	"NO_PROXY"
]);
const RESERVED_PREFIXES = [
	"LD_",
	"DYLD_",
	"DSH_",
	"BASH_FUNC_",
	"LC_",
	"GIT_"
];
/**
* Explain why a string cannot be a secret name.
* @param value - candidate name.
* @returns undefined when valid, otherwise the reason.
*/
function secretNameProblem(value) {
	if (!NAME_PATTERN.test(value)) return `"${value}" is not a valid secret name: use capital letters, digits, and underscores, starting with a letter`;
	if (value.length > 128) return `"${value.slice(0, 16)}…" is longer than 128 characters`;
	if (RESERVED_NAMES.has(value) || RESERVED_PREFIXES.some((prefix) => value.startsWith(prefix))) return `"${value}" is reserved: it would change how commands run`;
}
/**
* Validate and brand a secret name.
* @param value - candidate name.
* @returns the branded name.
* @throws TypeError naming the problem.
*/
function secretName(value) {
	const problem = secretNameProblem(value);
	if (problem !== void 0) throw new TypeError(problem);
	return value;
}
/** Credential-record scope that holds global vault entries. */
const VAULT_RECORD_SCOPE = "vault";
/** Credential-record scope that holds workspace vault entries. */
const WORKSPACE_RECORD_SCOPE = "vault-ws";
/**
* The record id of a workspace secret: `d` + 16 hex characters of the
* directory's SHA-256, then the name's record id. Record ids are lowercase and
* may not start with a digit, hence the prefix; the directory itself is stored
* in the record.
* @param directory - canonical workspace directory.
* @param name - the secret name.
* @returns the record id within {@link WORKSPACE_RECORD_SCOPE}.
*/
function workspaceRecordId(directory, name) {
	return `d${createHash("sha256").update(directory).digest("hex").slice(0, 16)}-${recordId(name)}`;
}
/**
* Split a workspace record id into its directory hash and secret name.
* @param id - record id within {@link WORKSPACE_RECORD_SCOPE}.
* @returns the name, or undefined when the id is not a workspace secret's.
*/
function nameFromWorkspaceRecordId(id) {
	const match = /^d[0-9a-f]{16}-(.+)$/.exec(id);
	return match?.[1] === void 0 ? void 0 : nameFromRecordId(match[1]);
}
/**
* Credential record ids are lowercase kebab-case; names map reversibly because
* they contain no `-`.
* @param name - a secret name.
* @returns the record id, such as `db-url` for `DB_URL`.
*/
function recordId(name) {
	return name.toLowerCase().replaceAll("_", "-");
}
/**
* Map a record id back to its secret name.
* @param id - record id within the vault scope.
* @returns the name, or undefined when the id is not a valid vault name.
*/
function nameFromRecordId(id) {
	const candidate = id.toUpperCase().replaceAll("-", "_");
	return secretNameProblem(candidate) === void 0 ? candidate : void 0;
}
/**
* The vault service. Values leave it only through {@link resolveForExecution},
* for a command's environment, and {@link redactionEntries}, for the redaction
* matcher; neither path reaches the model.
*/
var SecretVault = class extends Service {
	constructor(ctx) {
		super(ctx, "vault");
	}
};
//#endregion
export { SecretVault, SecretVault as default, VAULT_RECORD_SCOPE, WORKSPACE_RECORD_SCOPE, nameFromRecordId, nameFromWorkspaceRecordId, recordId, secretName, secretNameProblem, workspaceDirectory, workspaceRecordId };
