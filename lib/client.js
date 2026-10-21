window.__ModuleLoader__.load({
	id: "dsh-off-the-record",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		let zod = require("zod");
		//#region src/client/controller.ts
		/**
		* Page state and actions over the Host `offTheRecord` Remote. Every change is
		* made on the Host, which validates it; the page re-reads the status after a
		* change because the Host recomposes asynchronously.
		* @module dsh-off-the-record/client/controller
		*/
		const message = (error) => typeof error === "object" && error !== null && typeof error.message === "string" ? error.message : String(error);
		var PageController = class {
			remote;
			settleDelays;
			store;
			disposed = false;
			timers = /* @__PURE__ */ new Set();
			/**
			* @param remote - the mounted `offTheRecord` Remote namespace.
			* @param settleDelays - re-read delays after a change, in milliseconds.
			*/
			constructor(remote, settleDelays = [300, 1500]) {
				this.remote = remote;
				this.settleDelays = settleDelays;
				this.store = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)({
					status: void 0,
					loadError: void 0,
					notice: void 0,
					busy: void 0
				}, { flush: "sync" });
			}
			/** Read the status now. */
			async reload() {
				try {
					const result = await this.remote.pageStatus();
					if (this.disposed) return;
					if (result.ok) this.store.update((draft) => {
						draft.status = result.value;
						draft.loadError = void 0;
					});
					else this.store.update((draft) => {
						draft.loadError = result.error.message ?? "unknown error";
					});
				} catch (error) {
					if (!this.disposed) this.store.update((draft) => {
						draft.loadError = message(error);
					});
				}
			}
			/** The face for the slot registration. */
			face() {
				return {
					hooks: { otrPage: this.store },
					reload: () => {
						this.reload();
					},
					setChannel: (id, off) => {
						this.run("channel", () => this.remote.setChannel(id, off));
					},
					setSearchProvider: (provider) => {
						this.run("provider", () => this.remote.setSearchProvider(provider));
					},
					setSearxngUrl: (url) => {
						this.run("searxng", () => this.remote.setSearxngUrl(url));
					},
					setBraveKey: (key) => {
						this.run("brave", () => this.remote.setBraveKey(key));
					},
					setSecret: (name, value) => {
						this.run("secret", () => this.remote.setSecret(name, value));
					},
					resetAnonymousId: () => {
						this.run("anonymous-id", () => this.remote.resetAnonymousId(), "reset-id");
					}
				};
			}
			/** Stop timers and ignore late answers. */
			dispose() {
				this.disposed = true;
				for (const timer of this.timers) clearTimeout(timer);
				this.timers.clear();
			}
			async run(name, call, success = "saved") {
				if (this.store.getSnapshot().busy !== void 0) return;
				this.store.update((draft) => {
					draft.busy = name;
					draft.notice = void 0;
				});
				let notice;
				try {
					const result = await call();
					notice = result.ok ? { kind: success } : {
						kind: "error",
						message: result.error.message ?? "unknown error"
					};
				} catch (error) {
					notice = {
						kind: "error",
						message: message(error)
					};
				}
				if (this.disposed) return;
				this.store.update((draft) => {
					draft.busy = void 0;
					draft.notice = notice;
				});
				await this.reload();
				for (const delay of this.settleDelays) {
					const timer = setTimeout(() => {
						this.timers.delete(timer);
						this.reload();
					}, delay);
					this.timers.add(timer);
				}
			}
		};
		//#endregion
		//#region src/client/locales.ts
		/**
		* Copy for the Off the Record settings page. The three part promises are the
		* product's fixed wording; never imply that nothing is recorded anywhere, or
		* that anything is encrypted.
		* @module dsh-off-the-record/client/locales
		*/
		/** Dictionary namespace owned by this page. */
		const NS = "settings.offTheRecord";
		const en = {
			summary: "{off} of {total} telemetry channels off · search: {search}",
			tagline: "Keeps your sessions, secrets, and searches off DeepSeek's record.",
			loading: "Loading…",
			loadFailed: "Could not read the status: {error}",
			retry: "Retry",
			actionFailed: "That change did not apply: {error}",
			saved: "Saved.",
			restartNote: "Takes effect after you restart the harness.",
			telemetryTitle: "Disable telemetry",
			telemetryPromise: "Turns off the harness channels that send session logs, usage analytics, and plugin lists to DeepSeek. Conversations you send to a DeepSeek model still go to DeepSeek.",
			stateOff: "Off",
			stateOn: "On",
			stateNotPresent: "Not in this profile",
			stateMissing: "Not found",
			changedBy: "Turned on in {layer}.",
			changedByUnknown: "Turned on by something other than your own patches, such as a bundle installed later.",
			keepOff: "Keep off",
			editPatch: "To turn it off again, remove the \"{id}\" entry from {layer}, then restart.",
			backstop: "DSH_TELEMETRY_DISABLED is set, which also blocks the session upload.",
			"channel.session-telemetry-otel": "Feedback session upload",
			"channel.session-log-deepseek": "Session log on DeepSeek requests",
			"channel.plugin-package-inventory-deepseek": "Plugin inventory on DeepSeek requests",
			"channel.product-analytics": "Desktop usage analytics",
			"channel.web-search-deepseek": "DeepSeek search provider",
			"channel.web-deepseek-api": "DeepSeek Search and Fetch API providers",
			anonymousId: "Anonymous installation id",
			anonymousIdHint: "A random id the harness attaches to requests sent to DeepSeek.",
			resetId: "Reset",
			resetIdDone: "Removed. The harness creates a new id the next time it starts.",
			searchTitle: "Private search",
			searchPromise: "Web searches go to your SearXNG instance (or Brave, if you choose it), not DeepSeek. Page fetches go directly from your computer to the website.",
			provider: "Search provider",
			providerSearxng: "SearXNG",
			providerBrave: "Brave",
			notPrivate: "Search is set to \"{provider}\", which is not private. Choose SearXNG or Brave.",
			searxngUrl: "SearXNG instance",
			searxngUrlHint: "For example http://127.0.0.1:8888. Plain http works only for this machine and private networks. Turn on the json format in the instance's settings.yml.",
			save: "Save",
			clear: "Clear",
			braveKey: "Brave API key",
			braveKeyHint: "Stored in the harness credential store and sent only to api.search.brave.com.",
			braveKeySet: "A key is stored.",
			braveKeyUnset: "No key is stored.",
			remove: "Remove",
			deepseekProviders: "DeepSeek web providers",
			vaultTitle: "Secrets vault",
			vaultPromise: "Secrets stay out of your conversation, logs, and model requests. On this machine the agent could still read the vault deliberately; run tools in an isolated box to prevent that.",
			vaultEmpty: "No secrets yet.",
			vaultUnavailable: "This profile has no credential store, so secrets cannot be added here.",
			secretName: "Name",
			secretValue: "Value",
			secretValueHint: "At least 8 characters. Sent to the harness once and never shown again.",
			add: "Add",
			originUser: "added by you",
			originGenerated: "generated",
			vaultFileHint: "Secrets are stored in ~/.dsh/.credentials.yaml.",
			settingsUnavailable: "Live changes are unavailable in this profile; edit cordis.patch.yml instead."
		};
		const zh = {
			summary: "已关闭 {off}/{total} 个遥测通道 · 搜索：{search}",
			tagline: "让你的会话、密钥和搜索不进入 DeepSeek 的记录。",
			loading: "加载中…",
			loadFailed: "无法读取状态：{error}",
			retry: "重试",
			actionFailed: "更改未生效：{error}",
			saved: "已保存。",
			restartNote: "重启 harness 后生效。",
			telemetryTitle: "关闭遥测",
			telemetryPromise: "关闭 harness 向 DeepSeek 发送会话日志、使用分析和插件列表的通道。你发给 DeepSeek 模型的对话仍会发送给 DeepSeek。",
			stateOff: "已关闭",
			stateOn: "已开启",
			stateNotPresent: "此配置不包含",
			stateMissing: "未找到",
			changedBy: "在 {layer} 中被开启。",
			changedByUnknown: "被你自己的补丁以外的内容开启，例如之后安装的插件包。",
			keepOff: "保持关闭",
			editPatch: "如需重新关闭，请从 {layer} 中删除 \"{id}\" 条目，然后重启。",
			backstop: "已设置 DSH_TELEMETRY_DISABLED，它也会阻止会话上传。",
			"channel.session-telemetry-otel": "反馈时上传会话",
			"channel.session-log-deepseek": "DeepSeek 请求中附带会话日志",
			"channel.plugin-package-inventory-deepseek": "DeepSeek 请求中附带插件列表",
			"channel.product-analytics": "桌面端使用分析",
			"channel.web-search-deepseek": "DeepSeek 搜索提供方",
			"channel.web-deepseek-api": "DeepSeek 搜索与抓取 API 提供方",
			anonymousId: "匿名安装 ID",
			anonymousIdHint: "harness 附加在发往 DeepSeek 的请求上的随机 ID。",
			resetId: "重置",
			resetIdDone: "已删除。harness 下次启动时会生成新的 ID。",
			searchTitle: "私密搜索",
			searchPromise: "网页搜索发送到你的 SearXNG 实例（或你选择的 Brave），而不是 DeepSeek。网页抓取直接从你的电脑访问网站。",
			provider: "搜索提供方",
			providerSearxng: "SearXNG",
			providerBrave: "Brave",
			notPrivate: "搜索当前设为 \"{provider}\"，不是私密提供方。请选择 SearXNG 或 Brave。",
			searxngUrl: "SearXNG 实例",
			searxngUrlHint: "例如 http://127.0.0.1:8888。纯 http 仅适用于本机和私有网络。请在实例的 settings.yml 中开启 json 格式。",
			save: "保存",
			clear: "清除",
			braveKey: "Brave API 密钥",
			braveKeyHint: "保存在 harness 凭据存储中，只发送到 api.search.brave.com。",
			braveKeySet: "已保存密钥。",
			braveKeyUnset: "未保存密钥。",
			remove: "删除",
			deepseekProviders: "DeepSeek 网页提供方",
			vaultTitle: "密钥保险库",
			vaultPromise: "密钥不会出现在你的对话、日志和模型请求中。在这台机器上，智能体仍可能有意读取保险库；如需防止，请在隔离环境中运行工具。",
			vaultEmpty: "还没有密钥。",
			vaultUnavailable: "此配置没有凭据存储，无法在这里添加密钥。",
			secretName: "名称",
			secretValue: "值",
			secretValueHint: "至少 8 个字符。只会发送给 harness 一次，之后不再显示。",
			add: "添加",
			originUser: "由你添加",
			originGenerated: "自动生成",
			vaultFileHint: "密钥保存在 ~/.dsh/.credentials.yaml 中。",
			settingsUnavailable: "此配置无法实时更改，请改为编辑 cordis.patch.yml。"
		};
		//#endregion
		//#region src/client/OffTheRecordPage.tsx
		/**
		* The Off the Record page, shown on this bundle's page under Settings →
		* Plugins: each managed channel's state with its fix, the search provider and
		* its setup, and the secrets vault by name. Values typed here go to the Host
		* once and are never read back.
		*/
		const column = {
			display: "flex",
			flexDirection: "column",
			gap: 12
		};
		const row = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			flexWrap: "wrap"
		};
		const muted = {
			opacity: .7,
			fontSize: "0.9em",
			margin: 0
		};
		const section = {
			...column,
			paddingTop: 16
		};
		function Section({ title, promise, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						style: { margin: 0 },
						children: title
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: muted,
						children: promise
					}),
					children
				]
			});
		}
		function summary(t, status) {
			const telemetry = status.channels.filter((channel) => channel.part === "telemetry" && channel.state !== "not-present");
			return t("summary", {
				off: telemetry.filter((channel) => channel.state === "off").length,
				total: telemetry.length,
				search: status.search.provider || "—"
			});
		}
		function stateTag(t, channel) {
			const dot = channel.state === "off" ? "done" : channel.state === "on" ? "warning" : channel.state === "missing" ? "error" : "idle";
			const label = channel.state === "off" ? t("stateOff") : channel.state === "on" ? t("stateOn") : channel.state === "missing" ? t("stateMissing") : t("stateNotPresent");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				style: row,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: dot }), label]
			});
		}
		function ChannelRow({ t, channel, live, busy, onKeepOff, onToggle }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: column,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							...row,
							justifyContent: "space-between"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`channel.${channel.id}`) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: row,
							children: [stateTag(t, channel), live && onToggle && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
								checked: channel.state === "off",
								label: t("keepOff"),
								disabled: busy,
								onChange: (next) => {
									onKeepOff(next);
								}
							})]
						})]
					}),
					channel.state === "on" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						style: muted,
						children: [
							channel.changedBy === void 0 ? t("changedByUnknown") : t("changedBy", { layer: channel.changedBy }),
							" ",
							!live && channel.changedBy !== void 0 && t("editPatch", {
								id: channel.id,
								layer: channel.changedBy
							})
						]
					}),
					channel.state === "missing" && channel.fix !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: muted,
						children: channel.fix
					})
				]
			});
		}
		function Telemetry({ t, status, busy, face }) {
			const channels = status.channels.filter((channel) => channel.part === "telemetry");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Section, {
				title: t("telemetryTitle"),
				promise: t("telemetryPromise"),
				children: [
					channels.map((channel) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChannelRow, {
						t,
						channel,
						busy,
						live: status.settingsAvailable && status.liveChannels.includes(channel.id),
						onToggle: true,
						onKeepOff: (off) => {
							face.setChannel(channel.id, off);
						}
					}, channel.id)),
					status.telemetryEnvBackstop && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: muted,
						children: t("backstop")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							...row,
							justifyContent: "space-between"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: column,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("anonymousId") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: muted,
								children: t("anonymousIdHint")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							size: "sm",
							disabled: busy,
							onClick: () => {
								face.resetAnonymousId();
							},
							children: t("resetId")
						})]
					})
				]
			});
		}
		function Search({ t, status, busy, face }) {
			const [url, setUrl] = (0, react.useState)(status.searxng.baseURL);
			const [key, setKey] = (0, react.useState)("");
			const provider = status.search.provider;
			const deepseekRows = status.channels.filter((channel) => channel.part === "search");
			const editable = status.settingsAvailable;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Section, {
				title: t("searchTitle"),
				promise: t("searchPromise"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: row,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("provider") }), ["searxng", "brave"].map((id) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							variant: provider === id ? "primary" : "outline",
							disabled: busy || !editable || provider === id,
							onClick: () => {
								face.setSearchProvider(id);
							},
							children: t(id === "searxng" ? "providerSearxng" : "providerBrave")
						}, id))]
					}),
					!status.search.private && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: muted,
						children: t("notPrivate", { provider: provider || "—" })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: column,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("searxngUrl") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: row,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									value: url,
									placeholder: "http://127.0.0.1:8888",
									disabled: busy || !editable,
									onChange: (event) => {
										setUrl(event.target.value);
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: "outline",
									disabled: busy || !editable || url === status.searxng.baseURL,
									onClick: () => {
										face.setSearxngUrl(url);
									},
									children: t("save")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: muted,
								children: status.searxng.baseURL.length > 0 && status.searxng.problem !== void 0 ? status.searxng.problem : t("searxngUrlHint")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: column,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("braveKey") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: row,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
										type: "password",
										autoComplete: "off",
										value: key,
										disabled: busy || !status.brave.keyWritable,
										onChange: (event) => {
											setKey(event.target.value);
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "outline",
										disabled: busy || key.trim().length === 0,
										onClick: () => {
											face.setBraveKey(key);
											setKey("");
										},
										children: t("save")
									}),
									status.brave.keyConfigured && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "ghost",
										disabled: busy || !status.brave.keyWritable,
										onClick: () => {
											face.setBraveKey("");
										},
										children: t("remove")
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: muted,
								children: [
									status.brave.keyConfigured ? t("braveKeySet") : t("braveKeyUnset"),
									" ",
									t("braveKeyHint")
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: column,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("deepseekProviders") }), deepseekRows.map((channel) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								...row,
								justifyContent: "space-between"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: muted,
								children: t(`channel.${channel.id}`)
							}), stateTag(t, channel)]
						}, channel.id))]
					})
				]
			});
		}
		function Vault({ t, status, busy, face }) {
			const [name, setName] = (0, react.useState)("");
			const [value, setValue] = (0, react.useState)("");
			const { vault } = status;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Section, {
				title: t("vaultTitle"),
				promise: t("vaultPromise"),
				children: [vault.secrets.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: muted,
					children: t("vaultEmpty")
				}) : vault.secrets.map((secret) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						...row,
						justifyContent: "space-between"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: row,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: secret.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, { children: t(secret.origin === "user" ? "originUser" : "originGenerated") })]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						size: "sm",
						variant: "ghost",
						disabled: busy || !vault.writable,
						onClick: () => {
							face.setSecret(secret.name, "");
						},
						children: t("remove")
					})]
				}, secret.name)), vault.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: column,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: row,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								value: name,
								placeholder: "DB_URL",
								"aria-label": t("secretName"),
								disabled: busy,
								onChange: (event) => {
									setName(event.target.value.toUpperCase());
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								type: "password",
								autoComplete: "off",
								value,
								"aria-label": t("secretValue"),
								disabled: busy,
								onChange: (event) => {
									setValue(event.target.value);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "outline",
								disabled: busy || name.length === 0 || value.length === 0,
								onClick: () => {
									face.setSecret(name, value);
									setValue("");
								},
								children: t("add")
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: muted,
						children: [
							t("secretValueHint"),
							" ",
							t("vaultFileHint")
						]
					})]
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: muted,
					children: t("vaultUnavailable")
				})]
			});
		}
		/**
		* Render the bundle's one-line summary, or the full page.
		* @param props - view, locale, page state hook, and actions.
		* @returns the summary text or the page.
		*/
		function OffTheRecordPage(props) {
			const t = props.t;
			const state = props.useOtrPage((snapshot) => snapshot);
			const status = state.status;
			if (props.view === "summary") return status === void 0 ? t("tagline") : summary(t, status);
			if (status === void 0) return state.loadError === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: muted,
				children: t("loading")
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: row,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("loadFailed", { error: state.loadError }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					size: "sm",
					onClick: () => {
						props.reload();
					},
					children: t("retry")
				})]
			});
			const busy = state.busy !== void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: column,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						style: { margin: 0 },
						children: [
							t("tagline"),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: summary(t, status) })
						]
					}),
					!status.settingsAvailable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: muted,
						children: t("settingsUnavailable")
					}),
					state.notice !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						style: muted,
						children: state.notice.kind === "error" ? t("actionFailed", { error: state.notice.message ?? "" }) : state.notice.kind === "reset-id" ? t("resetIdDone") : t("saved")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Telemetry, {
						t,
						status,
						busy,
						face: props
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Search, {
						t,
						status,
						busy,
						face: props
					}, status.searxng.baseURL),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Vault, {
						t,
						status,
						busy,
						face: props
					})
				]
			});
		}
		//#endregion
		//#region node_modules/.pnpm/@deepseek-ai+dsh-typert-protocol@0.2.1-rc.2_@deepseek-ai+cordis@4.0.5/node_modules/@deepseek-ai/dsh-typert-protocol/lib/types/remote-info.js
		/** Lazy assembly of generated Remote definitions using caller-supplied Zod; no runtime imports. */
		/**
		* Retain one generated definition per endpoint without constructing parsers or projections.
		* The class instance builds its shared descriptor/method index on first access;
		* input schemas and JSON Schema projections are cached only when requested.
		* @param spec - compiler-produced method facts and Zod factories.
		* @param zod - the generated artifact's Zod runtime for named-input parsers.
		* @returns a lazy, mountable info instance with no registration or transport effects.
		*/
		function createTypertRemoteInfo(spec, zod) {
			return new RemoteInfo(spec, zod);
		}
		var RemoteInfo = class {
			spec;
			zod;
			index;
			constructor(spec, zod) {
				this.spec = spec;
				this.zod = zod;
			}
			get package() {
				return this.spec.package;
			}
			get descriptors() {
				return this.resolve().descriptors;
			}
			get methods() {
				return this.resolve().methods;
			}
			resolve() {
				if (this.index !== void 0) return this.index;
				const zod = this.zod;
				const descriptors = [];
				const methods = Object.create(null);
				for (const [endpoint, definition] of Object.entries(this.spec.methods)) {
					const separator = endpoint.indexOf("/");
					const namespace = endpoint.slice(0, separator);
					const method = endpoint.slice(separator + 1);
					const parameters = definition.parameters.map((parameter) => ({
						...parameter,
						wire: parameter.wire ?? parameter.name
					}));
					const descriptor = {
						...definition,
						id: `${this.spec.package}#${endpoint}`,
						namespace,
						method,
						parameters,
						result: definition.result.description === void 0 ? definition.result : new ResultValue(definition.result)
					};
					if (definition.invocation.kind === "direct") {
						const inputs = [];
						methods[endpoint] = Object.assign(descriptor, {
							input(options) {
								const strict = options?.strict === true;
								return inputs[strict ? 1 : 0] ??= new NamedInput(parameters, strict, zod);
							},
							invoke(remote, input, signal) {
								const named = input;
								const values = parameters.map((parameter) => named[parameter.wire]);
								if (definition.cancellation !== void 0) values.push(signal);
								const receiver = Reflect.get(remote, namespace);
								return Reflect.get(receiver, method).apply(receiver, values);
							}
						});
					}
					descriptors.push(descriptor);
				}
				return this.index = {
					descriptors,
					methods
				};
			}
		};
		function optional(parameter) {
			return parameter.source === "json" && parameter.acceptsUndefined === true;
		}
		var NamedInput = class {
			parameters;
			strict;
			zod;
			schema;
			projection;
			constructor(parameters, strict, zod) {
				this.parameters = parameters;
				this.strict = strict;
				this.zod = zod;
			}
			codec(parameter) {
				return this.strict ? parameter.strictCodec : parameter.codec;
			}
			create = () => this.schema ??= this.zod.strictObject(Object.fromEntries(this.parameters.map((parameter) => {
				const value = this.codec(parameter).create();
				return [parameter.wire, optional(parameter) ? value.optional() : value.nonoptional()];
			})));
			get jsonSchema() {
				return this.project().jsonSchema;
			}
			get jsonSchemaError() {
				return this.project().jsonSchemaError;
			}
			project() {
				if (this.projection !== void 0) return this.projection;
				const unavailable = this.parameters.find((parameter) => this.codec(parameter).jsonSchema === void 0);
				if (unavailable !== void 0) return this.projection = { jsonSchemaError: this.codec(unavailable).jsonSchemaError ?? `No JSON Schema for parameter ${unavailable.wire}` };
				return this.projection = { jsonSchema: {
					type: "object",
					properties: Object.fromEntries(this.parameters.map((parameter) => [parameter.wire, {
						...this.codec(parameter).jsonSchema,
						...parameter.description === void 0 ? {} : { description: parameter.description }
					}])),
					required: this.parameters.filter((parameter) => !optional(parameter)).map((parameter) => parameter.wire),
					additionalProperties: false
				} };
			}
		};
		var ResultValue = class {
			spec;
			projection;
			constructor(spec) {
				this.spec = spec;
			}
			get mode() {
				return this.spec.mode;
			}
			get typeSymbol() {
				return this.spec.typeSymbol;
			}
			get create() {
				return this.spec.create;
			}
			get decode() {
				return this.spec.decode;
			}
			get encode() {
				return this.spec.encode;
			}
			get description() {
				return this.spec.description;
			}
			get jsonSchemaError() {
				return this.spec.jsonSchemaError;
			}
			get jsonSchema() {
				if (this.projection === void 0) {
					const schema = this.spec.jsonSchema;
					this.projection = { value: schema === void 0 ? void 0 : {
						...schema,
						description: this.spec.description
					} };
				}
				return this.projection.value;
			}
		};
		//#endregion
		//#region src/client/remote.ts
		/**
		* The browser's view of the Host `offTheRecord` Remote service. The harness
		* generates this from types for its own packages; an out-of-tree bundle
		* declares it by hand. The Host serves these methods through the Gateway's
		* descriptor-free (SRC) path, which matches arguments by parameter name.
		* @module dsh-off-the-record/client/remote
		*/
		const PACKAGE$1 = "dsh-off-the-record";
		const codec = (symbol, create) => ({
			mode: "strict",
			typeSymbol: `${PACKAGE$1}#${symbol}`,
			create
		});
		const parameter = (method, name, create) => {
			const spec = codec(`offTheRecord/${method}:${name}`, create);
			return {
				name,
				source: "json",
				codec: spec,
				strictCodec: spec
			};
		};
		const method = (name, description, parameters, result) => ({
			service: "offTheRecord",
			description,
			invocation: { kind: "direct" },
			parameters: parameters.map(([parameterName, create]) => parameter(name, parameterName, create)),
			result: codec(`offTheRecord/${name}:result`, result)
		});
		const text = () => zod.z.string();
		const flag = () => zod.z.boolean();
		const nothing = () => zod.z.unknown();
		/** The contribution the page mounts with `ctx.remote.$mount()`. */
		const OFF_THE_RECORD_REMOTE = createTypertRemoteInfo({
			package: PACKAGE$1,
			methods: {
				"offTheRecord/pageStatus": method("pageStatus", "Everything the settings page shows.", [], () => zod.z.unknown()),
				"offTheRecord/setChannel": method("setChannel", "Turn a live channel off or on.", [["id", text], ["off", flag]], nothing),
				"offTheRecord/setSearchProvider": method("setSearchProvider", "Choose the private search provider.", [["provider", text]], nothing),
				"offTheRecord/setSearxngUrl": method("setSearxngUrl", "Set or clear the SearXNG instance URL.", [["url", text]], nothing),
				"offTheRecord/setBraveKey": method("setBraveKey", "Store or remove the Brave API key.", [["key", text]], nothing),
				"offTheRecord/setSecret": method("setSecret", "Add, replace, or remove a vault secret.", [["name", text], ["value", text]], nothing),
				"offTheRecord/resetAnonymousId": method("resetAnonymousId", "Delete the anonymous installation id.", [], () => zod.z.unknown())
			}
		}, zod.z);
		//#endregion
		//#region src/client/index.ts
		/** This bundle's package name, the key of its Plugins page slot. */
		const PACKAGE = "dsh-off-the-record";
		const inject = [
			"remote",
			"slots",
			"locale"
		];
		/** Host events after which the page re-reads its status. */
		const INVALIDATING_EVENTS = [
			"settings/document-updated",
			"credentials/record-updated",
			"credentials/reference-updated"
		];
		/**
		* Mount the Remote and register the page.
		* @param ctx - the browser plugin context.
		*/
		async function apply(ctx) {
			const unmount = await ctx.remote.$mount(OFF_THE_RECORD_REMOTE);
			ctx.effect(() => () => {
				unmount();
			}, "off-the-record: remote");
			ctx.inject([
				"remote.offTheRecord",
				"slots",
				"locale"
			], (page) => {
				const controller = new PageController(Reflect.get(page.remote, "offTheRecord"));
				page.effect(() => () => {
					controller.dispose();
				}, "off-the-record: controller");
				page.effect(() => page.locale.register(NS, {
					en,
					zh
				}), "off-the-record: dictionaries");
				for (const event of INVALIDATING_EVENTS) page.effect(() => page.remote.$on(event, () => {
					controller.reload();
				}), `off-the-record: ${event}`);
				controller.reload();
				page.slots.inject("plugins.bundle.config", () => page.slots.register({
					name: "plugins.bundle.config",
					key: PACKAGE,
					locale: NS,
					inject: () => controller.face()
				}, OffTheRecordPage));
			});
		}
		//#endregion
		exports.PACKAGE = PACKAGE;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
