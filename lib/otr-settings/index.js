import z from "@deepseek-ai/schemastery";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { Service } from "@deepseek-ai/cordis";
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
const ROW_ID_PATTERN = (id) => new RegExp(`^[\\s-]*id:\\s*['"]?${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]?\\s*(#.*)?$`, "m");
/**
* The Off the Record service.
*/
var OffTheRecord = class extends Service {
	config;
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
	async refresh() {
		const rows = [];
		for (const entry of this.ctx.loader.entries()) rows.push({
			id: entry.options.id,
			disabled: entry.options.disabled,
			config: entry.options.config
		});
		const profile = this.profile();
		const report = checkComposition(rows, await this.laterLayers(profile));
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
//#endregion
export { CHANNELS, PRIVATE_SEARCH_PROVIDERS, checkComposition, OffTheRecord as default, describeReport };
