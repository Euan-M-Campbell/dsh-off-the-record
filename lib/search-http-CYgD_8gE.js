import { WebError } from "@deepseek-ai/dsh-web";
//#region src/shared/search-http.ts
/**
* HTTP plumbing shared by the SearXNG and Brave search providers: one GET with
* a timeout layered on the caller's signal, typed `WebError` failures, and
* source de-duplication. Each plugin bundles its own copy at build time.
* @module dsh-off-the-record/shared/search-http
*/
/** Default per-search deadline, in addition to the caller's signal. */
const DEFAULT_SEARCH_TIMEOUT_MS = 15e3;
/** Default `user-agent` header; identifies the bundle, not the user. */
const DEFAULT_USER_AGENT = "dsh-off-the-record";
/**
* GET one JSON document. Redirects fail, cookies are never sent, and the
* request ends at the earlier of the caller's signal and `timeoutMs`.
* @param options - target, headers, deadline, and error naming.
* @returns the parsed JSON body, not yet shape-checked.
* @throws WebError `WEB_ABORTED` when the caller aborts, otherwise `WEB_PROVIDER_ERROR`.
*/
async function getJson(options) {
	const { label, signal } = options;
	const timeout = AbortSignal.timeout(options.timeoutMs);
	const combined = signal === void 0 ? timeout : AbortSignal.any([signal, timeout]);
	const failure = (error, what) => {
		if (signal?.aborted === true) return new WebError(`${label} search aborted`, "WEB_ABORTED", { cause: error });
		if (timeout.aborted) return new WebError(`${label} did not answer within ${String(options.timeoutMs)} ms`, "WEB_PROVIDER_ERROR", { cause: error });
		return new WebError(`${label} ${what}: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
	};
	let response;
	try {
		response = await fetch(options.url, {
			method: "GET",
			redirect: "error",
			credentials: "omit",
			headers: {
				accept: "application/json",
				...options.headers
			},
			signal: combined
		});
	} catch (error) {
		throw failure(error, "request failed");
	}
	if (!response.ok) {
		response.body?.cancel().catch(() => void 0);
		if (signal?.aborted === true) throw new WebError(`${label} search aborted`, "WEB_ABORTED");
		throw new WebError(options.describeStatus(response.status), "WEB_PROVIDER_ERROR");
	}
	try {
		return await response.json();
	} catch (error) {
		throw failure(error, "returned a body that is not JSON");
	}
}
/**
* Throw the provider error used for a well-formed body of the wrong shape.
* @param label - provider name for the message.
* @returns never.
*/
function unexpectedShape(label) {
	throw new WebError(`${label} returned an unexpected response shape`, "WEB_PROVIDER_ERROR");
}
/**
* Keep the first source for each URL, preserving order.
* @param sources - mapped sources, possibly repeating a URL across engines.
* @returns sources with unique URLs.
*/
function dedupeSources(sources) {
	const seen = /* @__PURE__ */ new Set();
	return sources.filter((source) => {
		if (seen.has(source.url)) return false;
		seen.add(source.url);
		return true;
	});
}
/**
* Read an optional non-empty string field from untrusted JSON.
* @param value - candidate field value.
* @returns the trimmed string, or undefined when absent or blank.
*/
function text(value) {
	if (typeof value !== "string") return void 0;
	const trimmed = value.trim();
	return trimmed.length === 0 ? void 0 : trimmed;
}
/**
* Narrow untrusted JSON to a plain object.
* @param value - candidate value.
* @returns the object, or undefined.
*/
function record(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
/**
* Check that a URL from a search result is safe to cite: absolute http(s) only.
* @param value - candidate URL.
* @returns the URL string, or undefined.
*/
function sourceUrl(value) {
	if (typeof value !== "string" || !URL.canParse(value)) return void 0;
	const { protocol } = new URL(value);
	return protocol === "http:" || protocol === "https:" ? value : void 0;
}
//#endregion
export { record as a, unexpectedShape as c, getJson as i, DEFAULT_USER_AGENT as n, sourceUrl as o, dedupeSources as r, text as s, DEFAULT_SEARCH_TIMEOUT_MS as t };
