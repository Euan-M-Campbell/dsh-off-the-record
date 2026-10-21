import { Service } from "@deepseek-ai/cordis";
//#region src/vault/index.ts
/**
* Secrets vault Service Definition: `ctx.vault`, secret names, and the storage
* layout on harness credential records. `vault-local` provides it; `tool-vault`
* consumes it. The model sees secret names and origins, never values.
* @module dsh-off-the-record/vault
*/
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
/** Credential-record scope that holds vault entries. */
const VAULT_RECORD_SCOPE = "vault";
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
export { SecretVault, SecretVault as default, VAULT_RECORD_SCOPE, nameFromRecordId, recordId, secretName, secretNameProblem };
