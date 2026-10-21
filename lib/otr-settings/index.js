import { r as baseUrlProblem } from "../provider-dkAtLyKd.js";
import { secretName, secretNameProblem } from "../vault/index.js";
import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region src/otr-settings/check.ts
const config = (row) => typeof row.config === "object" && row.config !== null ? row.config : {};
/** Every channel this bundle manages, in display order. */
const CHANNELS = [
	{
		id: "session-telemetry-otel",
		part: "telemetry",
		label: "Feedback session upload",
		isOff: (row) => config(row).mode === "DISABLED" || row.disabled === true
	},
	{
		id: "session-log-deepseek",
		part: "telemetry",
		label: "Session log on DeepSeek requests",
		isOff: (row) => config(row).enabled === false || row.disabled === true
	},
	{
		id: "plugin-package-inventory-deepseek",
		part: "telemetry",
		label: "Plugin inventory on DeepSeek requests",
		isOff: (row) => config(row).enabled === false || row.disabled === true
	},
	{
		id: "product-analytics",
		part: "telemetry",
		label: "Desktop usage analytics",
		optional: true,
		isOff: (row) => config(row).enabled === false || row.disabled === true
	},
	{
		id: "web-search-deepseek",
		part: "search",
		label: "DeepSeek search provider",
		isOff: (row) => row.disabled === true
	},
	{
		id: "web-deepseek-api",
		part: "search",
		label: "DeepSeek Search and Fetch API providers",
		isOff: (row) => row.disabled === true
	}
];
/** Search providers this bundle ships. */
const PRIVATE_SEARCH_PROVIDERS = ["searxng", "brave"];
/**
* Check the composition.
* @param rows - every Loader entry, flattened.
* @param layers - layers that apply after this bundle, highest precedence first.
* @returns one status per managed channel, and the search selection.
*/
function checkComposition(rows, layers) {
	const byId = new Map(rows.map((row) => [row.id, row]));
	const channels = CHANNELS.map((channel) => {
		const base = {
			id: channel.id,
			part: channel.part,
			label: channel.label
		};
		const row = byId.get(channel.id);
		if (row === void 0) {
			if (channel.optional === true) return {
				...base,
				state: "not-present"
			};
			return {
				...base,
				state: "missing",
				fix: `This harness release has no "${channel.id}" row; update dsh-off-the-record.`
			};
		}
		if (channel.isOff(row)) return {
			...base,
			state: "off"
		};
		const layer = layers.find((candidate) => candidate.mentions(channel.id));
		return {
			...base,
			state: "on",
			...layer === void 0 ? {} : { changedBy: layer.label },
			fix: layer === void 0 ? `Something other than your own patches changed "${channel.id}"; check bundles installed after dsh-off-the-record.` : `Remove the "${channel.id}" entry from ${layer.label} to turn it off again.`
		};
	});
	const web = byId.get("web");
	const webConfig = web === void 0 ? {} : config(web);
	const provider = typeof webConfig.searchProvider === "string" ? webConfig.searchProvider : "";
	return {
		channels,
		search: {
			provider,
			fetchProvider: typeof webConfig.fetchProvider === "string" ? webConfig.fetchProvider : "",
			private: PRIVATE_SEARCH_PROVIDERS.includes(provider)
		}
	};
}
/**
* Turn a report into log lines: one summary, and one warning per problem.
* @param report - the composition report.
* @returns the summary and warnings.
*/
function describeReport(report) {
	const telemetry = report.channels.filter((channel) => channel.part === "telemetry" && channel.state !== "not-present");
	const off = telemetry.filter((channel) => channel.state === "off").length;
	const search = report.search.private ? `search: ${report.search.provider}` : `search: ${report.search.provider || "unset"} (not private)`;
	const warnings = report.channels.filter((channel) => channel.state === "on" || channel.state === "missing").map((channel) => channel.state === "on" ? `${channel.label} is on${channel.changedBy === void 0 ? "" : ` (set in ${channel.changedBy})`}. ${channel.fix ?? ""}`.trim() : `${channel.label}: ${channel.fix ?? ""}`.trim());
	if (!report.search.private) warnings.push(report.search.provider.startsWith("deepseek") ? `web.searchProvider is "${report.search.provider}", a DeepSeek provider. Searches fail until it is reset: remove the web entry from your profile's cordis.patch.yml, or set searchProvider to searxng or brave.` : `web.searchProvider is "${report.search.provider || "unset"}", not one of this bundle's private providers (searxng, brave).`);
	if (report.search.fetchProvider !== "http") warnings.push(`web.fetchProvider is "${report.search.fetchProvider || "unset"}"; set it to http so pages are fetched directly from this machine.`);
	return {
		summary: `OTR: ${String(off)} of ${String(telemetry.length)} telemetry channels off, ${search}`,
		warnings
	};
}
//#endregion
//#region src/otr-settings/page.ts
/** Channels whose switch is live (`.volatile()`), and so can be changed from the page. */
const LIVE_CHANNELS = ["session-log-deepseek", "product-analytics"];
/** The Brave key's credential reference. */
const BRAVE_KEY_REF = "BRAVE_API_KEY";
const SEARXNG_ROW = "otr-web-search-searxng";
/**
* Assemble the page status from the composition report and the live services.
* @param ctx - the Off the Record service context.
* @param report - the composition report with launch facts.
* @param rows - Loader entries.
* @returns the page status.
*/
async function pageStatus(ctx, report, rows) {
	const rawURL = (rows.find((row) => row.id === SEARXNG_ROW)?.config)?.baseURL;
	const baseURL = typeof rawURL === "string" ? rawURL : "";
	const problem = baseUrlProblem(baseURL);
	const credentials = ctx.get("credentials");
	const brave = credentials === void 0 ? {
		keyConfigured: false,
		keyWritable: false
	} : await credentials.describe(credentialRef(BRAVE_KEY_REF)).then((info) => ({
		keyConfigured: info.configured,
		keyWritable: info.writable
	}));
	const vault = ctx.get("vault");
	return {
		...report,
		settingsAvailable: ctx.get("settings") !== void 0,
		liveChannels: LIVE_CHANNELS.filter((id) => report.channels.some((channel) => channel.id === id && channel.state !== "not-present" && channel.state !== "missing")),
		searxng: {
			baseURL,
			...problem === void 0 ? {} : { problem }
		},
		brave,
		vault: {
			available: vault !== void 0,
			writable: vault !== void 0 && credentials !== void 0,
			secrets: vault === void 0 ? [] : [...await vault.list()]
		}
	};
}
function settings(ctx) {
	const service = ctx.get("settings");
	if (service === void 0) throw new Error("the harness settings service is not running in this profile, so changes must be made in cordis.patch.yml");
	return service;
}
/**
* Turn a live channel off or on. Off removes the profile's override, so this
* bundle's setting applies again; on writes `enabled: true` into the profile.
* @param ctx - the Off the Record service context.
* @param id - a channel id from {@link LIVE_CHANNELS}.
* @param off - true to turn the channel off.
*/
async function setChannel(ctx, id, off) {
	if (!LIVE_CHANNELS.includes(id)) throw new Error(`"${id}" cannot be changed from this page; edit your profile's cordis.patch.yml and restart`);
	await settings(ctx).mutate(id, [off ? {
		op: "unset",
		path: ["enabled"]
	} : {
		op: "set",
		path: ["enabled"],
		value: true
	}]);
}
/**
* Choose the private search provider. SearXNG is this bundle's own selection,
* so choosing it removes any profile override, including a stale DeepSeek one.
* @param ctx - the Off the Record service context.
* @param provider - `searxng` or `brave`.
*/
async function setSearchProvider(ctx, provider) {
	if (provider !== "searxng" && provider !== "brave") throw new Error(`"${provider}" is not a private search provider; choose searxng or brave`);
	await settings(ctx).mutate("web", [provider === "searxng" ? {
		op: "unset",
		path: ["searchProvider"]
	} : {
		op: "set",
		path: ["searchProvider"],
		value: "brave"
	}, {
		op: "unset",
		path: ["fetchProvider"]
	}]);
}
/**
* Set or clear the SearXNG instance URL.
* @param ctx - the Off the Record service context.
* @param url - the instance root, or empty to clear it.
*/
async function setSearxngUrl(ctx, url) {
	const trimmed = url.trim();
	if (trimmed.length > 0) {
		const problem = baseUrlProblem(trimmed);
		if (problem !== void 0) throw new Error(problem);
	}
	await settings(ctx).mutate(SEARXNG_ROW, [trimmed.length === 0 ? {
		op: "unset",
		path: ["baseURL"]
	} : {
		op: "set",
		path: ["baseURL"],
		value: trimmed
	}]);
}
/**
* Store or remove the Brave API key in the harness credential store.
* @param ctx - the Off the Record service context.
* @param key - the key, or empty to remove it.
*/
async function setBraveKey(ctx, key) {
	const credentials = ctx.get("credentials");
	if (credentials === void 0) throw new Error("this profile has no credential store");
	const trimmed = key.trim();
	if (trimmed.length === 0) await credentials.unset(credentialRef(BRAVE_KEY_REF));
	else await credentials.set(credentialRef(BRAVE_KEY_REF), trimmed);
}
/**
* Add or replace a vault secret, or remove it when the value is empty.
* @param ctx - the Off the Record service context.
* @param name - the secret name.
* @param value - the value, or empty to remove the secret.
*/
async function setSecret(ctx, name, value) {
	const vault = ctx.get("vault");
	if (vault === void 0) throw new Error("the secrets vault is not running in this profile");
	const problem = secretNameProblem(name);
	if (problem !== void 0) throw new Error(problem);
	if (value.length === 0) await vault.unset(secretName(name));
	else await vault.set(secretName(name), value);
}
//#endregion
//#region src/otr-settings/index.ts
/**
* Off the Record status: checks every row this bundle manages at startup and
* after each recomposition, logs one summary line and a warning with the fix
* for each difference, and serves the same report as `ctx.offTheRecord`.
*
* Mounted from the bare package specifier (`dsh-off-the-record`), because the
* harness attaches a package's browser half only to that row.
* @module dsh-off-the-record
*/
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) {
			if (kind === "field") initializers.unshift(_);
			else descriptor[key] = _;
		}
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
const ROW_ID_PATTERN = (id) => new RegExp(`^[\\s-]*id:\\s*['"]?${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]?\\s*(#.*)?$`, "m");
let OffTheRecord = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _status_decorators;
	let _pageStatus_decorators;
	let _setChannel_decorators;
	let _setSearchProvider_decorators;
	let _setSearxngUrl_decorators;
	let _setBraveKey_decorators;
	let _setSecret_decorators;
	let _resetAnonymousId_decorators;
	return class OffTheRecord extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_status_decorators = [Remote];
			_pageStatus_decorators = [Remote];
			_setChannel_decorators = [Remote];
			_setSearchProvider_decorators = [Remote];
			_setSearxngUrl_decorators = [Remote];
			_setBraveKey_decorators = [Remote];
			_setSecret_decorators = [Remote];
			_resetAnonymousId_decorators = [Remote];
			__esDecorate(this, null, _status_decorators, {
				kind: "method",
				name: "status",
				static: false,
				private: false,
				access: {
					has: (obj) => "status" in obj,
					get: (obj) => obj.status
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _pageStatus_decorators, {
				kind: "method",
				name: "pageStatus",
				static: false,
				private: false,
				access: {
					has: (obj) => "pageStatus" in obj,
					get: (obj) => obj.pageStatus
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _setChannel_decorators, {
				kind: "method",
				name: "setChannel",
				static: false,
				private: false,
				access: {
					has: (obj) => "setChannel" in obj,
					get: (obj) => obj.setChannel
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _setSearchProvider_decorators, {
				kind: "method",
				name: "setSearchProvider",
				static: false,
				private: false,
				access: {
					has: (obj) => "setSearchProvider" in obj,
					get: (obj) => obj.setSearchProvider
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _setSearxngUrl_decorators, {
				kind: "method",
				name: "setSearxngUrl",
				static: false,
				private: false,
				access: {
					has: (obj) => "setSearxngUrl" in obj,
					get: (obj) => obj.setSearxngUrl
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _setBraveKey_decorators, {
				kind: "method",
				name: "setBraveKey",
				static: false,
				private: false,
				access: {
					has: (obj) => "setBraveKey" in obj,
					get: (obj) => obj.setBraveKey
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _setSecret_decorators, {
				kind: "method",
				name: "setSecret",
				static: false,
				private: false,
				access: {
					has: (obj) => "setSecret" in obj,
					get: (obj) => obj.setSecret
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _resetAnonymousId_decorators, {
				kind: "method",
				name: "resetAnonymousId",
				static: false,
				private: false,
				access: {
					has: (obj) => "resetAnonymousId" in obj,
					get: (obj) => obj.resetAnonymousId
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		config = __runInitializers(this, _instanceExtraInitializers);
		static inject = ["loader"];
		static Config = z.object({ recheckDelayMs: z.number().step(1).min(0).max(6e4).default(250) });
		latest;
		lastLog = "";
		constructor(ctx, config) {
			super(ctx, "offTheRecord");
			this.config = config;
			let timer;
			const schedule = () => {
				if (timer !== void 0) clearTimeout(timer);
				timer = setTimeout(() => {
					timer = void 0;
					this.refresh().catch((error) => {
						ctx.logger.warn("status check failed: %s", String(error));
					});
				}, this.config.recheckDelayMs);
			};
			ctx.effect(() => () => {
				if (timer !== void 0) clearTimeout(timer);
			});
			ctx.on("loader/config-update", schedule);
			const first = setImmediate(() => {
				this.refresh().catch((error) => {
					ctx.logger.warn("status check failed: %s", String(error));
				});
			});
			ctx.effect(() => () => {
				clearImmediate(first);
			});
		}
		/**
		* The latest report, computing it first if none exists yet.
		* @returns every managed channel's state and the search selection.
		*/
		async status() {
			return this.latest ?? await this.refresh();
		}
		/**
		* Everything the settings page shows, computed fresh.
		* @returns status, live switches, search setup, and secret names.
		*/
		async pageStatus() {
			return await pageStatus(this.ctx, await this.refresh(), this.rows());
		}
		/**
		* Turn a live channel off (restore this bundle's setting) or on.
		* @param id - channel row id.
		* @param off - true to turn it off.
		*/
		async setChannel(id, off) {
			await setChannel(this.ctx, id, off);
		}
		/**
		* Choose the private search provider.
		* @param provider - `searxng` or `brave`.
		*/
		async setSearchProvider(provider) {
			await setSearchProvider(this.ctx, provider);
		}
		/**
		* Set or clear the SearXNG instance URL.
		* @param url - the instance root, or empty to clear it.
		*/
		async setSearxngUrl(url) {
			await setSearxngUrl(this.ctx, url);
		}
		/**
		* Store or remove the Brave API key; it is written to the credential store, never to configuration.
		* @param key - the key, or empty to remove it.
		*/
		async setBraveKey(key) {
			await setBraveKey(this.ctx, key);
		}
		/**
		* Add, replace, or (with an empty value) remove a vault secret. Values travel to the Host only.
		* @param name - the secret name.
		* @param value - the value, or empty to remove it.
		*/
		async setSecret(name, value) {
			await setSecret(this.ctx, name, value);
		}
		/**
		* Delete the anonymous installation id. The harness mints a new one at the next launch.
		* @returns whether a file was removed, and that the change applies at the next launch.
		*/
		async resetAnonymousId() {
			const home = this.profile()?.home;
			if (home === void 0) throw new Error("offTheRecord: the harness home is unknown in this process");
			const path = join(home, ".anonymous-user-id");
			let removed = true;
			await rm(path).catch((error) => {
				if (error.code === "ENOENT") removed = false;
				else throw error;
			});
			return {
				removed,
				takesEffect: "next-launch"
			};
		}
		/** Recompute the report and log it when it changed. */
		rows() {
			const rows = [];
			for (const entry of this.ctx.loader.entries()) rows.push({
				id: entry.options.id,
				disabled: entry.options.disabled,
				config: entry.options.config
			});
			return rows;
		}
		async refresh() {
			const profile = this.profile();
			const report = checkComposition(this.rows(), await this.laterLayers(profile));
			const status = {
				...report,
				...profile === void 0 ? {} : { profile: profile.name },
				telemetryEnvBackstop: (profile?.telemetryDisabledEnv ?? "") !== ""
			};
			this.latest = status;
			const { summary, warnings } = describeReport(report);
			const log = [summary, ...warnings].join("\n");
			if (log !== this.lastLog) {
				this.lastLog = log;
				this.ctx.logger.info(summary);
				for (const warning of warnings) {
					this.ctx.logger.warn(warning);
					process.stderr.write(`dsh-off-the-record: ${warning}\n`);
				}
			}
			return status;
		}
		profile() {
			return this.ctx.get("profileContext");
		}
		/** Layers above every bundle, highest precedence first: overlays, the home patch, the profile patch. */
		async laterLayers(profile) {
			if (profile === void 0) return [];
			const fileLayer = async (path) => {
				const text = await readFile(path, "utf8").catch(() => void 0);
				if (text === void 0) return void 0;
				return {
					label: path,
					mentions: (id) => ROW_ID_PATTERN(id).test(text)
				};
			};
			return [
				{
					label: "a --patch overlay",
					mentions: (id) => profile.overlays.some((patch) => patch.id === id)
				},
				await fileLayer(join(profile.home, "cordis.patch.yml")),
				await fileLayer(profile.patchPath)
			].filter((layer) => layer !== void 0);
		}
	};
})();
//#endregion
export { BRAVE_KEY_REF, CHANNELS, LIVE_CHANNELS, PRIVATE_SEARCH_PROVIDERS, checkComposition, OffTheRecord as default, describeReport };
