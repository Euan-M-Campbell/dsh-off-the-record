import { a as record, c as unexpectedShape, i as getJson, n as DEFAULT_USER_AGENT, o as sourceUrl, r as dedupeSources, s as text, t as DEFAULT_SEARCH_TIMEOUT_MS } from "../search-http-CJZNTgCx.js";
import z from "@deepseek-ai/schemastery";
import { WebError } from "@deepseek-ai/dsh-web";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
//#region src/web-search-brave/provider.ts
/**
* `BraveSearchProvider`: a `WebSearchProvider` backed by the Brave Search API
* (`GET https://api.search.brave.com/res/v1/web/search`). The endpoint is
* fixed, so the API key can never be sent anywhere else.
* @module dsh-off-the-record/web-search-brave/provider
*/
/** Stable id this provider registers under; `web.searchProvider` names it. */
const BRAVE_PROVIDER_ID = "brave";
/** The only endpoint this provider contacts. */
const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const ENTITIES = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: "\"",
	apos: "'",
	nbsp: " ",
	"#39": "'"
};
/**
* Brave descriptions carry `<strong>` highlighting and HTML entities; reduce
* them to plain text.
* @param value - one description.
* @returns plain text.
*/
function plainText(value) {
	return value.replace(/<[^>]*>/g, "").replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/gi, (match, entity) => {
		const known = ENTITIES[entity.toLowerCase()];
		if (known !== void 0) return known;
		if (entity.startsWith("#x") || entity.startsWith("#X")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
		if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
		return match;
	}).replace(/\s+/g, " ").trim();
}
/**
* Map one Brave web result to a source.
* @param value - one entry of `web.results[]`.
* @returns the source, or undefined when it has no citeable URL.
*/
function mapBraveResult(value) {
	const result = record(value);
	const url = sourceUrl(result?.url);
	if (result === void 0 || url === void 0) return void 0;
	const rawTitle = text(result.title);
	const rawSnippet = text(result.description);
	const title = rawTitle === void 0 ? void 0 : plainText(rawTitle) || void 0;
	const snippet = rawSnippet === void 0 ? void 0 : plainText(rawSnippet) || void 0;
	const publishedAt = text(result.page_age);
	return {
		url,
		...title === void 0 ? {} : { title },
		...snippet === void 0 ? {} : { snippet },
		...publishedAt === void 0 ? {} : { publishedAt }
	};
}
/**
* Map a Brave response. A query with no web results omits `web` entirely.
* @param body - the parsed response.
* @returns the normalized result; the web service applies `maxResults`.
*/
function mapBraveResponse(body) {
	const response = record(body);
	if (response === void 0) unexpectedShape("Brave");
	const web = response.web === void 0 ? { results: [] } : record(response.web);
	if (web === void 0 || !Array.isArray(web.results ?? [])) unexpectedShape("Brave");
	const results = web.results ?? [];
	return {
		sources: dedupeSources(results.map(mapBraveResult).filter((source) => source !== void 0)),
		truncated: false
	};
}
/**
* Explain a non-2xx status with the fix.
* @param status - HTTP status.
* @returns the error message.
*/
function describeBraveStatus(status) {
	if (status === 401 || status === 403) return `Brave rejected the API key (HTTP ${String(status)}); check the Brave key on the Off the Record page`;
	if (status === 402) return "Brave refused the request for billing reasons (HTTP 402); check the subscription on the Brave API dashboard";
	if (status === 429) return "Brave rate limit or monthly quota reached (HTTP 429); try again later or raise the plan limit";
	return `Brave returned HTTP ${String(status)}`;
}
/** Search through the Brave Search API with the user's key. */
var BraveSearchProvider = class {
	key;
	settings;
	id = BRAVE_PROVIDER_ID;
	constructor(key, settings) {
		this.key = key;
		this.settings = settings;
	}
	available() {
		return this.key.configured();
	}
	async search(request, signal) {
		const key = await this.key.resolve();
		if (key === void 0) throw new WebError("Brave search is not set up: no Brave API key is stored. Add one on the Off the Record page.", "WEB_PROVIDER_CREDENTIAL_MISSING");
		const settings = this.settings();
		const url = new URL(BRAVE_SEARCH_ENDPOINT);
		url.searchParams.set("q", request.query);
		if (request.maxResults !== void 0) url.searchParams.set("count", String(Math.min(Math.max(1, Math.trunc(request.maxResults)), 20)));
		return mapBraveResponse(await getJson({
			label: "Brave",
			url,
			headers: {
				"x-subscription-token": key,
				"user-agent": settings.userAgent
			},
			timeoutMs: settings.searchTimeoutMs,
			signal,
			describeStatus: describeBraveStatus
		}));
	}
};
//#endregion
//#region src/web-search-brave/index.ts
/** Cordis plugin name used by loader diagnostics. */
const name = "otr-web-search-brave";
/** The web seam this provider registers into. The credential store is optional and read per use. */
const inject = ["web"];
const Config = z.object({
	apiKeyEnv: z.string().role("credential-ref").pattern(/^[A-Za-z_][A-Za-z0-9_]*$/).default("BRAVE_API_KEY").volatile(),
	searchTimeoutMs: z.number().step(1).min(1e3).max(12e4).default(DEFAULT_SEARCH_TIMEOUT_MS).volatile(),
	userAgent: z.string().pattern(/^[\x21-\x7e][\x20-\x7e]{0,255}$/).default(DEFAULT_USER_AGENT).volatile()
});
/**
* Register the Brave provider with `ctx.web`. `available()` answers from the
* last credential description, refreshed at start, on every stored-credential
* change, and after each search.
* @param ctx - plugin context with `web` injected.
* @param config - validated configuration.
*/
function apply(ctx, config) {
	const ref = () => credentialRef(config.apiKeyEnv.get());
	const resolveKey = async () => {
		const credentials = ctx.get("credentials");
		if (credentials !== void 0) return (await credentials.resolve(ref()))?.value;
		const ambient = launchEnvironmentOf(ctx).get(ref())?.value;
		return ambient === void 0 || ambient.length === 0 ? void 0 : ambient;
	};
	let configured = false;
	let generation = 0;
	const refresh = async () => {
		const current = ++generation;
		const credentials = ctx.get("credentials");
		const present = credentials === void 0 ? await resolveKey() !== void 0 : (await credentials.describe(ref())).configured;
		if (current === generation) configured = present;
	};
	const refreshQuietly = () => {
		refresh().catch((error) => {
			ctx.logger.warn("could not read the Brave API key state: %s", String(error));
		});
	};
	refreshQuietly();
	ctx.inject(["credentials"], (storeCtx) => {
		refreshQuietly();
		storeCtx.effect(() => () => {
			refreshQuietly();
		});
	});
	ctx.on("credentials/reference-updated", (ref) => {
		if (ref === config.apiKeyEnv.get()) refreshQuietly();
	});
	ctx.on("loader/volatile-update", refreshQuietly);
	ctx.web.registerSearchProvider(new BraveSearchProvider({
		configured: () => configured,
		resolve: async () => {
			const key = await resolveKey();
			configured = key !== void 0;
			return key;
		}
	}, () => ({
		searchTimeoutMs: config.searchTimeoutMs.get(),
		userAgent: config.userAgent.get()
	})));
}
//#endregion
export { BRAVE_PROVIDER_ID, BRAVE_SEARCH_ENDPOINT, BraveSearchProvider, Config, apply, inject, name };
