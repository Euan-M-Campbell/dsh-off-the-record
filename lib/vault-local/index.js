import { SecretVault, VAULT_RECORD_SCOPE, WORKSPACE_RECORD_SCOPE, nameFromRecordId, nameFromWorkspaceRecordId, recordId, workspaceRecordId } from "../vault/index.js";
import z from "@deepseek-ai/schemastery";
import { credentialKey, credentialKeyId, credentialKeyScope } from "@deepseek-ai/dsh-credentials";
//#region src/vault-local/index.ts
/** The credential key of one secret in its scope. */
function keyOf(name, directory) {
	return directory === void 0 ? credentialKey(VAULT_RECORD_SCOPE, recordId(name)) : credentialKey(WORKSPACE_RECORD_SCOPE, workspaceRecordId(directory, name));
}
/** The info a listing shows for one entry. */
function info({ name, origin, directory }) {
	return directory === void 0 ? {
		name,
		origin,
		scope: "global"
	} : {
		name,
		origin,
		scope: "workspace",
		directory
	};
}
const ALPHABETS = {
	hex: "0123456789abcdef",
	base64url: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
	alphanumeric: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
};
/**
* Draw a uniformly random string; rejection sampling avoids modulo bias.
* @param options - length and alphabet.
* @returns the random value.
*/
function randomSecret(options) {
	const alphabet = ALPHABETS[options.alphabet];
	const limit = 256 - 256 % alphabet.length;
	let out = "";
	while (out.length < options.length) for (const byte of crypto.getRandomValues(new Uint8Array(options.length * 2))) {
		if (byte < limit) out += alphabet[byte % alphabet.length];
		if (out.length === options.length) break;
	}
	return out;
}
/**
* Read one vault record in either stored form.
* @param record - the stored credential record.
* @returns the value and origin, or undefined when the record holds no value.
*/
function readEntry(record) {
	if (record === void 0) return void 0;
	if (record.kind === "api-key") return record.key === void 0 || record.key.length === 0 ? void 0 : {
		value: record.key,
		origin: "user"
	};
	const payload = record.payload;
	if (typeof payload?.value !== "string" || payload.value.length === 0) return void 0;
	return {
		value: payload.value,
		origin: payload.origin === "generated" ? "generated" : "user",
		...typeof payload.directory === "string" ? { directory: payload.directory } : {}
	};
}
/** The local vault service. */
var LocalVault = class extends SecretVault {
	config;
	static Config = z.object({
		minValueLength: z.number().step(1).min(8).max(4096).default(8),
		maxSecrets: z.number().step(1).min(1).max(4096).default(256)
	});
	entries = [];
	generation = 0;
	constructor(ctx, config) {
		super(ctx);
		this.config = config;
		ctx.on("credentials/record-updated", (key) => {
			const scope = credentialKeyScope(key);
			if (scope === "vault" || scope === "vault-ws") this.reload();
		});
		ctx.inject(["credentials"], (storeCtx) => {
			this.reload();
			storeCtx.effect(() => () => {
				this.reload();
			});
		});
		this.reload();
	}
	list(directory) {
		const visible = /* @__PURE__ */ new Map();
		for (const entry of this.entries) if (entry.directory === void 0) visible.set(entry.name, entry);
		if (directory !== void 0) {
			for (const entry of this.entries) if (entry.directory === directory) visible.set(entry.name, entry);
		}
		return Promise.resolve([...visible.values()].sort((a, b) => a.name.localeCompare(b.name)).map(info));
	}
	listAll() {
		return Promise.resolve(this.entries.map(info));
	}
	async set(name, value, directory) {
		this.checkValue(value);
		await this.write(name, directory, directory === void 0 ? {
			kind: "api-key",
			key: value
		} : {
			kind: "grant",
			payload: {
				value,
				origin: "user",
				createdAt: (/* @__PURE__ */ new Date()).toISOString(),
				directory
			}
		}, false);
	}
	async unset(name, directory) {
		await this.store().deleteRecord(keyOf(name, directory));
		await this.reloadNow();
	}
	async generate(name, options, directory) {
		if (options.length < this.config.minValueLength) throw new Error(`a generated secret must be at least ${String(this.config.minValueLength)} characters`);
		const value = randomSecret(options);
		await this.write(name, directory, {
			kind: "grant",
			payload: {
				value,
				origin: "generated",
				createdAt: (/* @__PURE__ */ new Date()).toISOString(),
				...directory === void 0 ? {} : { directory }
			}
		}, true);
	}
	async resolveForExecution(names, directory) {
		const credentials = this.ctx.get("credentials");
		const resolved = /* @__PURE__ */ new Map();
		const missing = [];
		const usable = (entry) => entry !== void 0 && entry.value.length >= this.config.minValueLength ? entry : void 0;
		for (const name of names) {
			const entry = (credentials === void 0 || directory === void 0 ? void 0 : usable(readEntry(await credentials.readRecord(keyOf(name, directory))))) ?? (credentials === void 0 ? void 0 : usable(readEntry(await credentials.readRecord(keyOf(name, void 0)))));
			if (entry === void 0) missing.push(name);
			else resolved.set(name, entry.value);
		}
		if (missing.length > 0) throw new Error(`not in the vault: ${missing.join(", ")}`);
		return resolved;
	}
	redactionEntries() {
		return this.entries;
	}
	store() {
		const credentials = this.ctx.get("credentials");
		if (credentials === void 0) throw new Error("this profile has no credential store, so the vault is read-only");
		return credentials;
	}
	checkValue(value) {
		if (value.length < this.config.minValueLength) throw new Error(`a secret must be at least ${String(this.config.minValueLength)} characters, so it can be found and hidden in output`);
	}
	/** Write one record; `create` refuses to replace an existing value in that scope. */
	async write(name, directory, record, create) {
		const credentials = this.store();
		if (!this.entries.some((entry) => entry.name === name && entry.directory === directory) && this.entries.length >= this.config.maxSecrets) throw new Error(`the vault already holds ${String(this.config.maxSecrets)} secrets`);
		let existed = false;
		await credentials.modifyRecord(keyOf(name, directory), (current) => {
			existed = readEntry(current) !== void 0;
			return Promise.resolve(create && existed ? void 0 : record);
		});
		if (create && existed) throw new Error(`${name} already exists${directory === void 0 ? "" : " in this workspace"}; choose another name`);
		await this.reloadNow();
	}
	reload() {
		this.reloadNow().catch((error) => {
			this.ctx.logger.warn("could not read the vault: %s", String(error));
		});
	}
	async reloadNow() {
		const current = ++this.generation;
		const credentials = this.ctx.get("credentials");
		const entries = [];
		if (credentials !== void 0) for (const { key } of await credentials.listRecords()) {
			const scope = credentialKeyScope(key);
			if (scope !== "vault" && scope !== "vault-ws") continue;
			const workspace = scope === WORKSPACE_RECORD_SCOPE;
			const id = credentialKeyId(key);
			const name = workspace ? nameFromWorkspaceRecordId(id) : nameFromRecordId(id);
			const entry = name === void 0 ? void 0 : readEntry(await credentials.readRecord(key));
			if (name === void 0 || entry === void 0) {
				this.ctx.logger.warn("ignoring vault record %s: it has no usable name or value", key);
				continue;
			}
			if (entry.value.length < this.config.minValueLength) {
				this.ctx.logger.warn("ignoring vault record %s: its value is shorter than %d characters", key, this.config.minValueLength);
				continue;
			}
			if (!workspace) {
				entries.push({
					name,
					value: entry.value,
					origin: entry.origin
				});
				continue;
			}
			const directory = entry.directory;
			if (directory === void 0 || workspaceRecordId(directory, name) !== id) {
				this.ctx.logger.warn("ignoring vault record %s: its directory does not match its name", key);
				continue;
			}
			entries.push({
				name,
				value: entry.value,
				origin: entry.origin,
				directory
			});
		}
		if (current !== this.generation) return;
		entries.sort((a, b) => (a.directory ?? "").localeCompare(b.directory ?? "") || a.name.localeCompare(b.name));
		this.entries = entries;
		this.ctx.emit("vault/changed");
	}
};
//#endregion
export { LocalVault as default, randomSecret, readEntry };
