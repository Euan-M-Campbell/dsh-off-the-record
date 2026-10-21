import { secretName, secretNameProblem, workspaceDirectory } from "../vault/index.js";
import z from "@deepseek-ai/schemastery";
import { isAbsolute, sep } from "node:path";
import { ESCALATION_TARGETS, approveEscalation, escalationHintMarker, sandboxDenialMarker, sandboxPermissionsDescription, validateEscalationArgs } from "@deepseek-ai/dsh-sandbox";
import { defineTool } from "@deepseek-ai/dsh-tools";
//#region src/tool-vault/scope.ts
/**
* Which workspace a tool call's secrets come from: the directory the root
* session was created in, never the current working directory. The model can
* change its working directory and start a subagent in any directory; neither
* moves a session into another workspace's secrets.
* @module dsh-off-the-record/tool-vault/scope
*/
/**
* Resolve the workspace directory for a session: follow live parents to the
* root (subagents and forks), then take its recorded creation directory.
* Child sessions record their parent's directory, so an unloaded parent falls
* back to the session's own.
* @param session - the calling session, if any.
* @param sessions - live sessions, when the store is mounted.
* @returns the canonical workspace directory, or undefined for global-only.
*/
function sessionWorkspace(session, sessions) {
	let current = session;
	const seen = /* @__PURE__ */ new Set();
	while (current !== void 0 && current.header.parentSession !== void 0 && !seen.has(current.header.id)) {
		seen.add(current.header.id);
		const parent = sessions?.get(current.header.parentSession);
		if (parent === void 0) break;
		current = parent;
	}
	const cwd = current?.header.cwd;
	return cwd === void 0 ? void 0 : workspaceDirectory(cwd);
}
//#endregion
//#region src/tool-vault/redact.ts
const ALL_ENCODINGS = [
	"raw",
	"base64",
	"base64url",
	"url",
	"json"
];
/**
* The part of a value's base64 encoding that does not depend on the bytes
* around it, for each of the three alignments it can start at inside a longer
* encoded stream.
* @param value - the secret.
* @param url - base64url alphabet instead of standard base64.
* @returns the stable encoded runs.
*/
function base64Cores(value, url) {
	const bytes = Buffer.from(value, "utf8");
	const cores = [];
	for (let offset = 0; offset < 3; offset++) {
		const padded = Buffer.concat([Buffer.alloc(offset), bytes]);
		const encoded = padded.toString(url ? "base64url" : "base64");
		const start = Math.ceil(offset * 8 / 6);
		const end = Math.floor(padded.length * 8 / 6);
		cores.push(encoded.slice(start, end));
	}
	return cores;
}
/**
* Every searchable form of one value.
* @param value - the secret.
* @param encodings - which encodings to include.
* @returns distinct forms.
*/
function forms(value, encodings) {
	const out = /* @__PURE__ */ new Set();
	for (const encoding of encodings) switch (encoding) {
		case "raw":
			out.add(value);
			break;
		case "json":
			out.add(JSON.stringify(value).slice(1, -1));
			break;
		case "url":
			out.add(encodeURIComponent(value));
			break;
		case "base64":
			for (const core of base64Cores(value, false)) out.add(core);
			break;
		case "base64url": for (const core of base64Cores(value, true)) out.add(core);
	}
	return [...out];
}
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
* Build a matcher over the current vault contents.
* @param entries - name/value pairs.
* @param encodings - encodings to search.
* @param minLength - forms shorter than this are skipped, so short encoded runs never match ordinary text.
* @returns the matcher.
*/
function buildMatcher(entries, encodings, minLength) {
	const owner = /* @__PURE__ */ new Map();
	for (const { name, value } of entries) for (const form of forms(value, encodings)) if (form.length >= minLength && !owner.has(form)) owner.set(form, name);
	if (owner.size === 0) return {
		empty: true,
		matches: () => false,
		redact: (text) => text
	};
	const source = [...owner.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
	const test = new RegExp(source);
	const replace = new RegExp(source, "g");
	return {
		empty: false,
		matches: (text) => test.test(text),
		redact: (text) => text.replace(replace, (form) => `[secret:${owner.get(form) ?? "unknown"}]`)
	};
}
/**
* Redact every string in a JSON value, keys included.
* @param value - any JSON value.
* @param matcher - the matcher.
* @returns a redacted copy.
*/
function redactJson(value, matcher) {
	if (typeof value === "string") return matcher.redact(value);
	if (Array.isArray(value)) return value.map((item) => redactJson(item, matcher));
	if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value).map(([key, item]) => [matcher.redact(key), redactJson(item, matcher)]));
	return value;
}
/**
* Whether any string inside a JSON value matches.
* @param value - any JSON value.
* @param matcher - the matcher.
* @returns true on the first match.
*/
function jsonMatches(value, matcher) {
	if (typeof value === "string") return matcher.matches(value);
	if (Array.isArray(value)) return value.some((item) => jsonMatches(item, matcher));
	if (typeof value === "object" && value !== null) return Object.entries(value).some(([key, item]) => matcher.matches(key) || jsonMatches(item, matcher));
	return false;
}
//#endregion
//#region src/tool-vault/decision.ts
/** Feedback used when redaction itself fails: the result is withheld, never passed through. */
const WITHHELD = [{
	type: "text",
	text: "[tool result withheld: it may contain a stored secret, and redaction failed]"
}];
/**
* Redact one post-execute decision.
* @param decision - the decision from the listeners inside this one.
* @param result - the dispatch outcome they decided on.
* @param matcher - current vault matcher.
* @returns the decision to pass outward, unchanged when nothing matched.
*/
function redactDecision(decision, result, matcher) {
	if (matcher.empty) return decision;
	const contexts = decision.additionalContexts;
	const redactedContexts = contexts === void 0 ? {} : { additionalContexts: redactJson(contexts, matcher) };
	if (decision.kind === "block") {
		if (!jsonMatches(decision.feedback, matcher) && !jsonMatches(contexts, matcher)) return decision;
		return {
			kind: "block",
			feedback: redactJson(decision.feedback, matcher),
			...redactedContexts
		};
	}
	const replacesValue = Object.hasOwn(decision, "value");
	const replacesContent = !replacesValue && decision.content !== void 0;
	const content = replacesContent ? decision.content ?? [] : result.content;
	const value = replacesValue ? decision.value : result.isError ? void 0 : result.value;
	const bodyContexts = result.additionalContexts;
	const leaks = {
		content: jsonMatches(content, matcher),
		value: jsonMatches(value, matcher),
		meta: !replacesValue && jsonMatches(result.meta, matcher),
		contexts: jsonMatches(contexts, matcher),
		body: jsonMatches(bodyContexts, matcher)
	};
	if (!leaks.content && !leaks.value && !leaks.meta && !leaks.contexts && !leaks.body) return decision;
	if (leaks.body || result.isError || replacesContent && leaks.meta) {
		const carried = [...bodyContexts ?? [], ...contexts ?? []];
		return {
			kind: "block",
			feedback: redactJson(content, matcher),
			...carried.length > 0 ? { additionalContexts: redactJson(carried, matcher) } : {}
		};
	}
	if (replacesContent) return {
		kind: "accept",
		content: redactJson(content, matcher),
		...redactedContexts
	};
	return {
		kind: "accept",
		value: redactJson(value ?? null, matcher),
		...redactedContexts
	};
}
//#endregion
//#region src/tool-vault/index.ts
/**
* Secrets vault tools and redaction. The model lists secret names, generates
* new secrets, and runs commands that receive secrets as environment
* variables; every tool result, from any tool, has stored values replaced with
* `[secret:NAME]` before it reaches the model or the session log.
* @module dsh-off-the-record/tool-vault
*/
/** Cordis plugin name used by loader diagnostics. */
const name = "otr-tool-vault";
/** The tool registry and the vault. Shell services are optional and enable run_with_secrets. */
const inject = ["tools", "vault"];
const Config = z.object({
	generateLength: z.number().step(1).min(16).max(256).default(32),
	redactEncodings: z.array(z.union([
		"raw",
		"base64",
		"base64url",
		"url",
		"json"
	])).default([...ALL_ENCODINGS]),
	minRedactLength: z.number().step(1).min(6).max(4096).default(8)
});
/** Tool descriptions, written for the model. Tests pin them verbatim. */
const DESCRIPTIONS = {
	list_secrets: "List the secrets you can use here, by name: global ones, and this workspace's own, which replace global ones of the same name. Values are never shown. Use a listed name with run_with_secrets to pass its value to a command.",
	create_secret: "Generate a new random secret and store it in the vault under a new name, for example a session key or a password for a local service. It belongs to this workspace unless you set scope to global. You never see the value. You cannot store a value you supply: ask the user to add secrets they already have.",
	run_with_secrets: "Run a bash command with vault secrets set as environment variables. Name the secrets in `secrets`; refer to them in the command as $NAME, never by value. Runs like bash, in a fresh shell under the same sandbox. Any secret value that appears in the output is replaced with [secret:NAME]. Do not try to reveal, transform, or send a secret value.",
	run_with_secrets_powershell: "Run a PowerShell command with vault secrets set as environment variables. Name the secrets in `secrets`; refer to them in the command as $env:NAME, never by value. Runs like pwsh, in a fresh shell under the same sandbox. Any secret value that appears in the output is replaced with [secret:NAME]. Do not try to reveal, transform, or send a secret value."
};
/** The harness composes PowerShell instead of bash on Windows, and the shell executor does not say which it is. */
const POWERSHELL = process.platform === "win32";
const SECRET_INFO_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: {
		name: {
			type: "string",
			required: true
		},
		origin: {
			type: "string",
			enum: ["user", "generated"],
			required: true
		},
		scope: {
			type: "string",
			enum: ["global", "workspace"],
			required: true
		}
	}
};
const STREAM_SCHEMA = {
	type: "object",
	additionalProperties: false,
	required: true,
	properties: {
		text: {
			type: "string",
			required: true
		},
		truncated: {
			type: "boolean",
			required: true
		}
	}
};
/** Resolve a relative per-call working directory against the session's current one. */
function resolveWorkdir(requested, sessionCwd) {
	if (requested === void 0) return sessionCwd;
	if (sessionCwd !== void 0 && !isAbsolute(requested)) return `${sessionCwd}${sep}${requested}`;
	return requested;
}
/**
* The text the model reads for one command, in the bash tool's format.
* @param outcome - the redacted command outcome.
* @param escalation - whether escalation fields are offered.
* @returns the model-facing text.
*/
function renderCommand(outcome, escalation) {
	const stream = (part) => part.truncated ? `[output truncated]\n${part.text}` : part.text;
	let body = stream(outcome.stdout);
	const err = stream(outcome.stderr);
	if (err.length > 0) {
		if (body.length > 0 && !body.endsWith("\n")) body += "\n";
		body += `[stderr]\n${err}`;
	}
	if (body.length === 0) body = "(no output)";
	const markers = [];
	if (outcome.sandbox?.denied === true) {
		markers.push(sandboxDenialMarker(outcome.sandbox.mode));
		if (escalation) markers.push(escalationHintMarker("command"));
	}
	if (outcome.timedOut) markers.push(`[timed out after ${String(outcome.timeoutMs)}ms]`);
	if (outcome.signal !== null) markers.push(`[killed by signal: ${outcome.signal}]`);
	else if (outcome.exitCode !== 0) markers.push(`[exit code: ${String(outcome.exitCode)}]`);
	if (markers.length === 0) return body;
	return `${body.endsWith("\n") ? body : `${body}\n`}${markers.join("\n")}`;
}
/**
* Register the vault tools and the redaction listeners.
* @param ctx - plugin context with `tools` and `vault` injected.
* @param config - validated configuration.
*/
function apply(ctx, config) {
	/** The calling session's workspace; undefined means global secrets only. */
	const workspaceOf = (exec) => sessionWorkspace(exec.agent?.session, ctx.get("sessions"));
	let matcher = buildMatcher([], config.redactEncodings, config.minRedactLength);
	const rebuild = () => {
		matcher = buildMatcher(ctx.vault.redactionEntries(), config.redactEncodings, config.minRedactLength);
	};
	rebuild();
	ctx.on("vault/changed", rebuild);
	ctx.on("tools/post-execute", async (_exec, result, next) => {
		const decision = await next();
		try {
			return redactDecision(decision, result, matcher);
		} catch (error) {
			ctx.logger.warn("secret redaction failed; withholding the result: %s", String(error));
			return {
				kind: "block",
				feedback: WITHHELD
			};
		}
	});
	ctx.on("tools/ptc-dispatch-log", async (_dispatch, next) => {
		const content = await next();
		try {
			return redactJson(content, matcher);
		} catch (error) {
			ctx.logger.warn("secret redaction failed; withholding the logged run_code result: %s", String(error));
			return WITHHELD;
		}
	});
	ctx.tools.register(defineTool({
		name: "list_secrets",
		description: DESCRIPTIONS.list_secrets,
		parameters: {},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { secrets: {
					type: "array",
					items: SECRET_INFO_SCHEMA,
					required: true
				} }
			},
			render: (_args, value) => [{
				type: "text",
				text: value.secrets.length === 0 ? "The vault is empty. The user adds secrets outside the conversation." : value.secrets.map((secret) => `${secret.name} (${secret.scope}, ${secret.origin})`).join("\n")
			}]
		},
		execute: async (_args, exec) => ({ secrets: (await ctx.vault.list(workspaceOf(exec))).map(({ name: secret, origin, scope }) => ({
			name: secret,
			origin,
			scope
		})) })
	}));
	ctx.tools.register(defineTool({
		name: "create_secret",
		description: DESCRIPTIONS.create_secret,
		parameters: {
			name: {
				type: "string",
				required: true,
				description: "The new secret's name: capital letters, digits, and underscores, starting with a letter, such as SESSION_KEY."
			},
			length: {
				type: "integer",
				description: `Number of characters, from 16 to 256. Defaults to ${String(config.generateLength)}.`
			},
			alphabet: {
				type: "string",
				enum: [
					"hex",
					"base64url",
					"alphanumeric"
				],
				description: "Characters to draw from. Defaults to alphanumeric."
			},
			scope: {
				type: "string",
				enum: ["workspace", "global"],
				description: "workspace (the default) keeps it to this project; global makes it available everywhere."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					name: {
						type: "string",
						required: true
					},
					length: {
						type: "integer",
						required: true
					},
					alphabet: {
						type: "string",
						required: true
					},
					scope: {
						type: "string",
						enum: ["global", "workspace"],
						required: true
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Created ${value.name} (${value.scope}, ${String(value.length)} ${value.alphabet} characters). Pass it to a command with run_with_secrets as $${value.name}.`
			}]
		},
		execute: async (args, exec) => {
			const problem = secretNameProblem(args.name);
			if (problem !== void 0) throw new Error(problem);
			const length = args.length ?? config.generateLength;
			if (length < 16 || length > 256) throw new Error(`length must be from 16 to 256, got ${String(length)}`);
			const alphabet = args.alphabet ?? "alphanumeric";
			const workspace = workspaceOf(exec);
			const scope = args.scope ?? (workspace === void 0 ? "global" : "workspace");
			if (scope === "workspace" && workspace === void 0) throw new Error("this session has no workspace directory; create a global secret instead");
			await ctx.vault.generate(secretName(args.name), {
				length,
				alphabet
			}, scope === "workspace" ? workspace : void 0);
			return {
				name: args.name,
				length,
				alphabet,
				scope
			};
		}
	}));
	ctx.inject([
		"shell",
		"shellEnv",
		"workingDirectory"
	], (shellCtx) => {
		const defaultMode = shellCtx.shell.sandboxMode;
		const escalationModes = defaultMode === void 0 ? [] : ESCALATION_TARGETS;
		const policyService = defaultMode === void 0 ? void 0 : shellCtx.get("sandboxPolicy");
		if (defaultMode !== void 0 && policyService === void 0) throw new Error("otr-tool-vault: the mounted bash executor confines but ctx.sandboxPolicy is missing");
		const standingPolicy = (exec) => policyService?.resolve(exec.agent === void 0 ? {} : { session: exec.agent.session });
		shellCtx.tools.register(defineTool({
			name: "run_with_secrets",
			description: POWERSHELL ? DESCRIPTIONS.run_with_secrets_powershell : DESCRIPTIONS.run_with_secrets,
			parameters: {
				description: {
					type: "string",
					required: true,
					description: "What this command does, in 5-10 words (shown in the UI)."
				},
				command: {
					type: "string",
					required: true,
					description: POWERSHELL ? "The PowerShell command. Refer to each secret as $env:NAME." : "The bash command. Refer to each secret as $NAME."
				},
				secrets: {
					type: "array",
					items: { type: "string" },
					required: true,
					description: "Names of the vault secrets to set as environment variables, as listed by list_secrets."
				},
				timeoutMs: {
					type: "number",
					description: "Timeout in milliseconds. The executor applies its default and cap, and kills the command on expiry."
				},
				workdir: {
					type: "string",
					description: "Working directory. Defaults to the session workspace; a relative path is resolved against it."
				},
				...escalationModes.length > 0 ? {
					sandbox_permissions: {
						type: "string",
						enum: [...escalationModes],
						description: sandboxPermissionsDescription("command")
					},
					justification: {
						type: "string",
						description: "Required with sandbox_permissions: one sentence for the user explaining why this exact command needs the wider access."
					}
				} : {}
			},
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: {
						cwd: {
							type: "string",
							required: true
						},
						secrets: {
							type: "array",
							items: { type: "string" },
							required: true
						},
						exitCode: {
							required: true,
							oneOf: [{ type: "integer" }, { type: "null" }]
						},
						signal: {
							required: true,
							oneOf: [{ type: "string" }, { type: "null" }]
						},
						timedOut: {
							type: "boolean",
							required: true
						},
						timeoutMs: {
							type: "number",
							required: true
						},
						stdout: STREAM_SCHEMA,
						stderr: STREAM_SCHEMA,
						sandbox: {
							type: "object",
							additionalProperties: false,
							properties: {
								mode: {
									type: "string",
									required: true
								},
								denied: {
									type: "boolean",
									required: true
								}
							}
						}
					}
				},
				render: (_args, value) => [{
					type: "text",
					text: renderCommand(value, escalationModes.length > 0)
				}],
				presentationMeta: (_args, value) => ({ cwd: value.cwd })
			},
			execute: async (args, exec) => {
				if (args.command.trim().length === 0) throw new Error("invalid command: expected a non-empty string");
				const names = [...new Set(args.secrets)];
				if (names.length === 0) throw new Error(`name at least one secret in \`secrets\`; use ${POWERSHELL ? "pwsh" : "bash"} for commands that need none`);
				const invalid = names.map(secretNameProblem).filter((problem) => problem !== void 0);
				if (invalid.length > 0) throw new Error(invalid.join("; "));
				const values = await ctx.vault.resolveForExecution(names.map((entry) => entry), workspaceOf(exec));
				const standing = standingPolicy(exec);
				const permissions = args.sandbox_permissions;
				const justification = args.justification;
				if (permissions !== void 0 && permissions !== standing?.mode) validateEscalationArgs(permissions, justification);
				let policy = standing;
				if (permissions !== void 0 && justification !== void 0 && permissions !== standing?.mode) {
					if (escalationModes.length === 0 || standing === void 0) throw new Error("sandbox_permissions is not available in this composition (no sandboxing executor to escalate)");
					const mode = await approveEscalation({
						requestedMode: permissions,
						justification,
						effectiveMode: standing.mode,
						subject: "command"
					}, {
						approver: shellCtx.get("approval"),
						agent: exec.agent,
						callId: exec.callId,
						toolName: "run_with_secrets",
						signal: exec.signal
					});
					policy = {
						...standing,
						mode
					};
				}
				const cwd = exec.agent === void 0 ? void 0 : await shellCtx.workingDirectory.ensure(exec.agent, exec.signal);
				const workdir = resolveWorkdir(args.workdir, cwd);
				const request = {
					command: args.command,
					...workdir === void 0 ? {} : { workdir },
					...args.timeoutMs === void 0 ? {} : { timeoutMs: args.timeoutMs },
					env: Object.fromEntries(values),
					dshEnv: shellCtx.shellEnv.collect(exec),
					...policy === void 0 ? {} : { sandboxPolicy: policy },
					signal: exec.signal
				};
				const spec = shellCtx.shell.resolve(request);
				const result = await (await shellCtx.shell.execute(spec)).result();
				if (result.aborted) throw new Error("tool call aborted");
				const local = buildMatcher([...ctx.vault.redactionEntries(), ...[...values].map(([secret, value]) => ({
					name: secret,
					value
				}))], config.redactEncodings, config.minRedactLength);
				const stream = (part) => ({
					text: local.redact(part.text),
					truncated: part.truncated
				});
				return {
					cwd: spec.workdir,
					secrets: names,
					exitCode: result.exitCode,
					signal: result.signal,
					timedOut: result.timedOut,
					timeoutMs: result.timeoutMs,
					stdout: stream(result.stdout),
					stderr: stream(result.stderr),
					...result.sandbox === void 0 ? {} : { sandbox: {
						mode: result.sandbox.mode,
						denied: result.sandbox.denied
					} }
				};
			},
			presentCall: (args) => ({
				card: "generic",
				title: args.command,
				kind: "execute",
				rawInput: args.command,
				content: [{
					type: "text",
					text: `${args.description}\nSecrets: ${args.secrets.join(", ")}`
				}]
			})
		}));
	});
}
//#endregion
export { Config, DESCRIPTIONS, apply, base64Cores, buildMatcher, forms, inject, jsonMatches, name, redactDecision, redactJson, renderCommand, sessionWorkspace };
