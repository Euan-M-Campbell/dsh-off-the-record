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
					setSecret: (name, value, directory) => {
						this.run("secret", () => this.remote.setSecret(name, value, directory));
					},
					setNewIdEachStart: (on) => {
						this.run("anonymous-id", () => this.remote.setNewIdEachStart(on));
					}
				};
			}
			/** Stop timers and ignore late answers. */
			dispose() {
				this.disposed = true;
				for (const timer of this.timers) clearTimeout(timer);
				this.timers.clear();
			}
			async run(name, call) {
				if (this.store.getSnapshot().busy !== void 0) return;
				this.store.update((draft) => {
					draft.busy = name;
					draft.notice = void 0;
				});
				let notice;
				try {
					const result = await call();
					notice = result.ok ? { kind: "saved" } : {
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
			telemetryTitle: "Telemetry",
			stateNotPresent: "Not in this profile",
			stateMissing: "Not found",
			changedBy: "Turned on in {layer}.",
			changedByUnknown: "Turned on by something other than your own patches, such as a bundle installed later.",
			notLive: "Change this in your profile's cordis.patch.yml; it takes effect after a restart.",
			editPatch: "To turn it off again, remove the \"{id}\" entry from {layer}, then restart.",
			backstop: "DSH_TELEMETRY_DISABLED is set, which also blocks the session upload.",
			"channel.session-telemetry-otel": "Session Feedback",
			"channel.session-log-deepseek": "Session Logs",
			"channel.plugin-package-inventory-deepseek": "Session Plugin Inventory",
			"channel.product-analytics": "Desktop Usage Analytics",
			newIdEachStart: "Rotate Installation ID at Start-up",
			searchTitle: "Web Search Provider",
			provider: "Search provider",
			providerSearxng: "SearXNG",
			providerBrave: "Brave",
			notPrivate: "Search is set to \"{provider}\", which is not private. Choose SearXNG or Brave.",
			searxngUrl: "SearXNG instance",
			save: "Save",
			braveKey: "Brave API key",
			set: "Set",
			notSet: "Not set",
			remove: "Remove",
			vaultTitle: "Secrets vault",
			vaultUnavailable: "This profile has no credential store, so secrets cannot be added here.",
			secretName: "Name",
			secretValue: "Value",
			add: "Add",
			scopeGlobal: "Global",
			secretScope: "Where the secret applies",
			workspaceRemoved: "no longer a workspace",
			originUser: "added by you",
			originGenerated: "generated",
			settingsUnavailable: "Live changes are unavailable in this profile; edit cordis.patch.yml instead."
		};
		const zh = {
			summary: "已关闭 {off}/{total} 个遥测通道 · 搜索：{search}",
			tagline: "让你的会话、密钥和搜索不进入 DeepSeek 的记录。",
			loading: "加载中…",
			loadFailed: "无法读取状态：{error}",
			retry: "重试",
			actionFailed: "更改未生效：{error}",
			telemetryTitle: "遥测",
			stateNotPresent: "此配置不包含",
			stateMissing: "未找到",
			changedBy: "在 {layer} 中被开启。",
			changedByUnknown: "被你自己的补丁以外的内容开启，例如之后安装的插件包。",
			notLive: "请在配置的 cordis.patch.yml 中更改，重启后生效。",
			editPatch: "如需重新关闭，请从 {layer} 中删除 \"{id}\" 条目，然后重启。",
			backstop: "已设置 DSH_TELEMETRY_DISABLED，它也会阻止会话上传。",
			"channel.session-telemetry-otel": "会话反馈",
			"channel.session-log-deepseek": "会话日志",
			"channel.plugin-package-inventory-deepseek": "会话插件清单",
			"channel.product-analytics": "桌面端使用分析",
			newIdEachStart: "启动时轮换安装 ID",
			searchTitle: "网页搜索提供方",
			provider: "搜索提供方",
			providerSearxng: "SearXNG",
			providerBrave: "Brave",
			notPrivate: "搜索当前设为 \"{provider}\"，不是私密提供方。请选择 SearXNG 或 Brave。",
			searxngUrl: "SearXNG 实例",
			save: "保存",
			braveKey: "Brave API 密钥",
			set: "已设置",
			notSet: "未设置",
			remove: "删除",
			vaultTitle: "密钥保险库",
			vaultUnavailable: "此配置没有凭据存储，无法在这里添加密钥。",
			secretName: "名称",
			secretValue: "值",
			add: "添加",
			scopeGlobal: "全局",
			secretScope: "密钥的适用范围",
			workspaceRemoved: "已不是工作区",
			originUser: "由你添加",
			originGenerated: "自动生成",
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
					promise !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
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
		/** A setting's control: a dot (green on, red off) that follows the switch, then the switch. */
		function Toggle({ on, label, disabled, title, onChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				style: row,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: on ? "done" : "error" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
					checked: on,
					label,
					disabled,
					title,
					onChange
				})]
			});
		}
		/** One labelled row with a toggle, and optional notes under the label. */
		function ToggleRow({ label, toggle, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: column,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						...row,
						justifyContent: "space-between"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }), toggle]
				}), children]
			});
		}
		/**
		* One channel; its switch is on while the channel sends to DeepSeek. A channel
		* that cannot change live keeps its switch, locked, and says where to change it.
		*/
		function ChannelRow({ t, channel, live, busy, onSet }) {
			const on = channel.state === "on";
			const absent = channel.state === "not-present" || channel.state === "missing";
			const label = t(`channel.${channel.id}`);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(ToggleRow, {
				label,
				toggle: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
					on,
					label,
					disabled: busy || !live || absent,
					title: live ? void 0 : t("notLive"),
					onChange: onSet
				}),
				children: [
					absent && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: muted,
						children: t(channel.state === "missing" ? "stateMissing" : "stateNotPresent")
					}),
					on && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
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
				children: [
					channels.map((channel) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChannelRow, {
						t,
						channel,
						busy,
						live: status.settingsAvailable && status.liveChannels.includes(channel.id),
						onSet: (on) => {
							face.setChannel(channel.id, !on);
						}
					}, channel.id)),
					status.telemetryEnvBackstop && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: muted,
						children: t("backstop")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
						label: t("newIdEachStart"),
						toggle: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
							on: status.newIdEachStart,
							label: t("newIdEachStart"),
							disabled: busy || !status.settingsAvailable,
							onChange: (next) => {
								face.setNewIdEachStart(next);
							}
						})
					})
				]
			});
		}
		function Search({ t, status, busy, face }) {
			const [url, setUrl] = (0, react.useState)(status.searxng.baseURL);
			const [key, setKey] = (0, react.useState)("");
			const provider = status.search.provider;
			const editable = status.settingsAvailable;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Section, {
				title: t("searchTitle"),
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
					provider !== "brave" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: row,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("searxngUrl") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								value: url,
								placeholder: "http://127.0.0.1:8888",
								disabled: busy || !editable,
								onChange: (event) => {
									setUrl(event.target.value);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "outline",
								disabled: busy || !editable || url === status.searxng.baseURL,
								onClick: () => {
									face.setSearxngUrl(url);
								},
								children: t("save")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: muted,
								children: status.searxng.baseURL.length === 0 ? t("notSet") : status.searxng.problem ?? t("set")
							}),
							status.searxng.baseURL.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "ghost",
								disabled: busy || !editable,
								onClick: () => {
									face.setSearxngUrl("");
								},
								children: t("remove")
							})
						]
					}),
					provider === "brave" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: row,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("braveKey") }),
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
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: muted,
								children: status.brave.keyConfigured ? t("set") : t("notSet")
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
					})
				]
			});
		}
		function SecretRow({ t, secret, busy, writable, face }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
					disabled: busy || !writable,
					onClick: () => {
						face.setSecret(secret.name, "", secret.directory ?? "");
					},
					children: t("remove")
				})]
			});
		}
		const selectStyle = {
			font: "inherit",
			color: "inherit",
			background: "transparent",
			border: "1px solid currentColor",
			borderRadius: 6,
			padding: "4px 6px",
			opacity: .85
		};
		function Vault({ t, status, busy, face }) {
			const [name, setName] = (0, react.useState)("");
			const [value, setValue] = (0, react.useState)("");
			const [scope, setScope] = (0, react.useState)("");
			const { vault } = status;
			const global = vault.secrets.filter((secret) => secret.directory === void 0);
			const groups = vault.workspaces.map((workspace) => ({
				workspace,
				secrets: vault.secrets.filter((secret) => secret.directory === workspace.directory)
			})).filter((group) => group.secrets.length > 0);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Section, {
				title: t("vaultTitle"),
				children: [
					global.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: muted,
						children: t("scopeGlobal")
					}),
					global.map((secret) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SecretRow, {
						t,
						secret,
						busy,
						writable: vault.writable,
						face
					}, secret.name)),
					groups.map(({ workspace, secrets }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: column,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: muted,
							title: workspace.directory,
							children: [workspace.title, workspace.registered ? "" : ` · ${t("workspaceRemoved")}`]
						}), secrets.map((secret) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SecretRow, {
							t,
							secret,
							busy,
							writable: vault.writable,
							face
						}, secret.name))]
					}, workspace.directory)),
					vault.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
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
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								"aria-label": t("secretScope"),
								value: scope,
								disabled: busy,
								style: selectStyle,
								onChange: (event) => {
									setScope(event.target.value);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: t("scopeGlobal")
								}), vault.workspaces.map((workspace) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: workspace.directory,
									children: workspace.title
								}, workspace.directory))]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "outline",
								disabled: busy || name.length === 0 || value.length === 0,
								onClick: () => {
									face.setSecret(name, value, scope);
									setValue("");
								},
								children: t("add")
							})
						]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: muted,
						children: t("vaultUnavailable")
					})
				]
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
					!status.settingsAvailable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: muted,
						children: t("settingsUnavailable")
					}),
					state.notice?.kind === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						style: muted,
						children: t("actionFailed", { error: state.notice.message ?? "" })
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
				"offTheRecord/setSecret": method("setSecret", "Add, replace, or remove a vault secret.", [
					["name", text],
					["value", text],
					["directory", text]
				], nothing),
				"offTheRecord/setNewIdEachStart": method("setNewIdEachStart", "Turn a new anonymous installation id at every start on or off.", [["on", flag]], nothing)
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
