import { n as DEFAULT_USER_AGENT, t as DEFAULT_SEARCH_TIMEOUT_MS } from "../search-http-CJZNTgCx.js";
import { n as SearxngSearchProvider, r as baseUrlProblem, t as SEARXNG_PROVIDER_ID } from "../provider-dkAtLyKd.js";
import z from "@deepseek-ai/schemastery";
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
