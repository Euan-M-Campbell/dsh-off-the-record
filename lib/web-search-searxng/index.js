import { a as record, c as unexpectedShape, i as getJson, n as DEFAULT_USER_AGENT, o as sourceUrl, r as dedupeSources, s as text, t as DEFAULT_SEARCH_TIMEOUT_MS } from "../search-http-CYgD_8gE.js";
import z from "@deepseek-ai/schemastery";
import { WebError } from "@deepseek-ai/dsh-web";
//#region src/web-search-searxng/provider.ts
/**
* `SearxngSearchProvider`: a `WebSearchProvider` backed by the user's own
* SearXNG instance (`GET {baseURL}/search?q=…&format=json`).
* @module dsh-off-the-record/web-search-searxng/provider
*/
/** Stable id this provider registers under; `web.searchProvider` names it. */
const SEARXNG_PROVIDER_ID = "searxng";
const LOCAL_SUFFIXES = [
	".localhost",
	".local",
	".internal",
	".lan",
	".home.arpa"
];
/**
* Whether a hostname names this machine or a private network, where plain
* `http:` is acceptable. Single-label names (Docker and Compose service names)
* count as private.
* @param hostname - `URL.hostname`, with IPv6 brackets.
* @returns whether the host is loopback, link-local, or private.
*/
function isPrivateHost(hostname) {
	const host = hostname.toLowerCase();
	if (host === "localhost" || LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
	if (host.startsWith("[")) {
		const v6 = host.slice(1, -1);
		return v6 === "::1" || /^f[cd][0-9a-f]{2}:/.test(v6) || /^fe[89ab][0-9a-f]:/.test(v6);
	}
	const octets = host.split(".");
	if (octets.length === 4 && octets.every((part) => /^\d{1,3}$/.test(part))) {
		const [a = 0, b = 0] = octets.map(Number);
		return a === 127 || a === 10 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 169 && b === 254;
	}
	return !host.includes(".");
}
/**
* Validate an instance root.
* @param baseURL - configured value.
* @returns undefined when usable, otherwise the reason it is not.
*/
function baseUrlProblem(baseURL) {
	if (baseURL.length === 0) return "no SearXNG instance is configured";
	if (!URL.canParse(baseURL)) return `"${baseURL}" is not a URL`;
	const url = new URL(baseURL);
	if (url.username !== "" || url.password !== "") return "the SearXNG URL must not contain credentials";
	if (url.search !== "" || url.hash !== "") return "the SearXNG URL must not contain a query or fragment";
	if (url.protocol === "https:") return void 0;
	if (url.protocol === "http:") return isPrivateHost(url.hostname) ? void 0 : "plain http is allowed only for this machine or a private network; use https";
	return `unsupported protocol ${url.protocol}`;
}
/**
* Build the search URL beneath the instance root, keeping any path prefix.
* @param settings - live settings with a valid `baseURL`.
* @param query - the search text.
* @returns the request URL.
*/
function searchUrl(settings, query) {
	const root = new URL(settings.baseURL);
	if (!root.pathname.endsWith("/")) root.pathname += "/";
	const url = new URL("search", root);
	url.searchParams.set("q", query);
	url.searchParams.set("format", "json");
	if (settings.engines.length > 0) url.searchParams.set("engines", settings.engines);
	if (settings.categories.length > 0) url.searchParams.set("categories", settings.categories);
	return url;
}
/**
* Map one SearXNG result to a source.
* @param value - one entry of `results[]`.
* @returns the source, or undefined when it has no citeable URL.
*/
function mapSearxngResult(value) {
	const result = record(value);
	const url = sourceUrl(result?.url);
	if (result === void 0 || url === void 0) return void 0;
	const title = text(result.title);
	const snippet = text(result.content);
	const publishedAt = text(result.publishedDate);
	return {
		url,
		...title === void 0 ? {} : { title },
		...snippet === void 0 ? {} : { snippet },
		...publishedAt === void 0 ? {} : { publishedAt }
	};
}
/**
* Map a SearXNG JSON response. Direct answers become `content`; older
* instances send them as strings, newer ones as `{ answer }` objects.
* @param body - the parsed response.
* @returns the normalized result; the web service applies `maxResults`.
*/
function mapSearxngResponse(body) {
	const response = record(body);
	if (response === void 0 || !Array.isArray(response.results)) unexpectedShape("SearXNG");
	const sources = dedupeSources(response.results.map(mapSearxngResult).filter((source) => source !== void 0));
	const answers = (Array.isArray(response.answers) ? response.answers : []).map((answer) => text(answer) ?? text(record(answer)?.answer)).filter((answer) => answer !== void 0);
	return {
		...answers.length === 0 ? {} : { content: answers.join("\n") },
		sources,
		truncated: false
	};
}
/**
* Explain a non-2xx status with the fix.
* @param status - HTTP status.
* @returns the error message.
*/
function describeSearxngStatus(status) {
	if (status === 403) return "SearXNG returned HTTP 403; enable the json format under search.formats in the instance's settings.yml";
	if (status === 429) return "SearXNG rate-limited this request (HTTP 429); turn off the limiter, or allow this machine, in the instance's settings";
	return `SearXNG returned HTTP ${String(status)}`;
}
/** Search through the configured SearXNG instance. */
var SearxngSearchProvider = class {
	settings;
	id = SEARXNG_PROVIDER_ID;
	constructor(settings) {
		this.settings = settings;
	}
	available() {
		return baseUrlProblem(this.settings().baseURL) === void 0;
	}
	async search(request, signal) {
		const settings = this.settings();
		const problem = baseUrlProblem(settings.baseURL);
		if (problem !== void 0) throw new WebError(`SearXNG search is not set up: ${problem}. Set the instance URL on the Off the Record page.`, "WEB_PROVIDER_NOT_CONFIGURED");
		return mapSearxngResponse(await getJson({
			label: "SearXNG",
			url: searchUrl(settings, request.query),
			headers: { "user-agent": settings.userAgent },
			timeoutMs: settings.searchTimeoutMs,
			signal,
			describeStatus: describeSearxngStatus
		}));
	}
};
//#endregion
//#region src/web-search-searxng/index.ts
/** Cordis plugin name used by loader diagnostics. */
const name = "otr-web-search-searxng";
/** The web seam this provider registers into. */
const inject = ["web"];
const Config = z.object({
	baseURL: z.string().default("").volatile(),
	engines: z.string().pattern(/^[\w ,.-]*$/).default("").volatile(),
	categories: z.string().pattern(/^[\w ,.-]*$/).default("").volatile(),
	searchTimeoutMs: z.number().step(1).min(1e3).max(12e4).default(DEFAULT_SEARCH_TIMEOUT_MS).volatile(),
	userAgent: z.string().pattern(/^[\x21-\x7e][\x20-\x7e]{0,255}$/).default(DEFAULT_USER_AGENT).volatile()
});
/**
* Register the SearXNG provider with `ctx.web`. A malformed instance URL fails
* the plugin at load; an empty one leaves the provider registered but unavailable.
* @param ctx - plugin context with `web` injected.
* @param config - validated configuration.
*/
function apply(ctx, config) {
	const initial = config.baseURL.get();
	const problem = initial.length === 0 ? void 0 : baseUrlProblem(initial);
	if (problem !== void 0) throw new Error(`otr-web-search-searxng: baseURL: ${problem}`);
	ctx.web.registerSearchProvider(new SearxngSearchProvider(() => ({
		baseURL: config.baseURL.get(),
		engines: config.engines.get(),
		categories: config.categories.get(),
		searchTimeoutMs: config.searchTimeoutMs.get(),
		userAgent: config.userAgent.get()
	})));
}
//#endregion
export { Config, SEARXNG_PROVIDER_ID, SearxngSearchProvider, apply, inject, name };
