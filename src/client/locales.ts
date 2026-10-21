/**
 * Copy for the Off the Record settings page. The three part promises are the
 * product's fixed wording; never imply that nothing is recorded anywhere, or
 * that anything is encrypted.
 * @module dsh-off-the-record/client/locales
 */

/** Dictionary namespace owned by this page. */
export const NS = 'settings.offTheRecord'

export type OffTheRecordLocaleKey =
  | 'summary' | 'tagline' | 'loading' | 'loadFailed' | 'retry' | 'actionFailed' | 'saved' | 'restartNote'
  | 'telemetryTitle' | 'telemetryPromise' | 'stateOff' | 'stateOn' | 'stateNotPresent' | 'stateMissing'
  | 'changedBy' | 'changedByUnknown' | 'keepOff' | 'editPatch' | 'backstop'
  | 'channel.session-telemetry-otel' | 'channel.session-log-deepseek' | 'channel.plugin-package-inventory-deepseek'
  | 'channel.product-analytics' | 'channel.web-search-deepseek' | 'channel.web-deepseek-api'
  | 'anonymousId' | 'anonymousIdHint' | 'resetId' | 'resetIdDone'
  | 'searchTitle' | 'searchPromise' | 'provider' | 'providerSearxng' | 'providerBrave' | 'notPrivate'
  | 'searxngUrl' | 'searxngUrlHint' | 'save' | 'clear' | 'braveKey' | 'braveKeyHint' | 'braveKeySet' | 'braveKeyUnset' | 'remove'
  | 'deepseekProviders'
  | 'vaultTitle' | 'vaultPromise' | 'vaultEmpty' | 'vaultUnavailable' | 'secretName' | 'secretValue' | 'secretValueHint'
  | 'add' | 'originUser' | 'originGenerated' | 'vaultFileHint'
  | 'settingsUnavailable'

export const en: Record<OffTheRecordLocaleKey, string> = {
  summary: '{off} of {total} telemetry channels off · search: {search}',
  tagline: 'Keeps your sessions, secrets, and searches off DeepSeek\'s record.',
  loading: 'Loading…',
  loadFailed: 'Could not read the status: {error}',
  retry: 'Retry',
  actionFailed: 'That change did not apply: {error}',
  saved: 'Saved.',
  restartNote: 'Takes effect after you restart the harness.',
  telemetryTitle: 'Disable telemetry',
  telemetryPromise: 'Turns off the harness channels that send session logs, usage analytics, and plugin lists to DeepSeek. Conversations you send to a DeepSeek model still go to DeepSeek.',
  stateOff: 'Off',
  stateOn: 'On',
  stateNotPresent: 'Not in this profile',
  stateMissing: 'Not found',
  changedBy: 'Turned on in {layer}.',
  changedByUnknown: 'Turned on by something other than your own patches, such as a bundle installed later.',
  keepOff: 'Keep off',
  editPatch: 'To turn it off again, remove the "{id}" entry from {layer}, then restart.',
  backstop: 'DSH_TELEMETRY_DISABLED is set, which also blocks the session upload.',
  'channel.session-telemetry-otel': 'Feedback session upload',
  'channel.session-log-deepseek': 'Session log on DeepSeek requests',
  'channel.plugin-package-inventory-deepseek': 'Plugin inventory on DeepSeek requests',
  'channel.product-analytics': 'Desktop usage analytics',
  'channel.web-search-deepseek': 'DeepSeek search provider',
  'channel.web-deepseek-api': 'DeepSeek Search and Fetch API providers',
  anonymousId: 'Anonymous installation id',
  anonymousIdHint: 'A random id the harness attaches to requests sent to DeepSeek.',
  resetId: 'Reset',
  resetIdDone: 'Removed. The harness creates a new id the next time it starts.',
  searchTitle: 'Private search',
  searchPromise: 'Web searches go to your SearXNG instance (or Brave, if you choose it), not DeepSeek. Page fetches go directly from your computer to the website.',
  provider: 'Search provider',
  providerSearxng: 'SearXNG',
  providerBrave: 'Brave',
  notPrivate: 'Search is set to "{provider}", which is not private. Choose SearXNG or Brave.',
  searxngUrl: 'SearXNG instance',
  searxngUrlHint: 'For example http://127.0.0.1:8888. Plain http works only for this machine and private networks. Turn on the json format in the instance\'s settings.yml.',
  save: 'Save',
  clear: 'Clear',
  braveKey: 'Brave API key',
  braveKeyHint: 'Stored in the harness credential store and sent only to api.search.brave.com.',
  braveKeySet: 'A key is stored.',
  braveKeyUnset: 'No key is stored.',
  remove: 'Remove',
  deepseekProviders: 'DeepSeek web providers',
  vaultTitle: 'Secrets vault',
  vaultPromise: 'Secrets stay out of your conversation, logs, and model requests. On this machine the agent could still read the vault deliberately; run tools in an isolated box to prevent that.',
  vaultEmpty: 'No secrets yet.',
  vaultUnavailable: 'This profile has no credential store, so secrets cannot be added here.',
  secretName: 'Name',
  secretValue: 'Value',
  secretValueHint: 'At least 8 characters. Sent to the harness once and never shown again.',
  add: 'Add',
  originUser: 'added by you',
  originGenerated: 'generated',
  vaultFileHint: 'Secrets are stored in ~/.dsh/.credentials.yaml.',
  settingsUnavailable: 'Live changes are unavailable in this profile; edit cordis.patch.yml instead.',
}

export const zh: Record<OffTheRecordLocaleKey, string> = {
  summary: '已关闭 {off}/{total} 个遥测通道 · 搜索：{search}',
  tagline: '让你的会话、密钥和搜索不进入 DeepSeek 的记录。',
  loading: '加载中…',
  loadFailed: '无法读取状态：{error}',
  retry: '重试',
  actionFailed: '更改未生效：{error}',
  saved: '已保存。',
  restartNote: '重启 harness 后生效。',
  telemetryTitle: '关闭遥测',
  telemetryPromise: '关闭 harness 向 DeepSeek 发送会话日志、使用分析和插件列表的通道。你发给 DeepSeek 模型的对话仍会发送给 DeepSeek。',
  stateOff: '已关闭',
  stateOn: '已开启',
  stateNotPresent: '此配置不包含',
  stateMissing: '未找到',
  changedBy: '在 {layer} 中被开启。',
  changedByUnknown: '被你自己的补丁以外的内容开启，例如之后安装的插件包。',
  keepOff: '保持关闭',
  editPatch: '如需重新关闭，请从 {layer} 中删除 "{id}" 条目，然后重启。',
  backstop: '已设置 DSH_TELEMETRY_DISABLED，它也会阻止会话上传。',
  'channel.session-telemetry-otel': '反馈时上传会话',
  'channel.session-log-deepseek': 'DeepSeek 请求中附带会话日志',
  'channel.plugin-package-inventory-deepseek': 'DeepSeek 请求中附带插件列表',
  'channel.product-analytics': '桌面端使用分析',
  'channel.web-search-deepseek': 'DeepSeek 搜索提供方',
  'channel.web-deepseek-api': 'DeepSeek 搜索与抓取 API 提供方',
  anonymousId: '匿名安装 ID',
  anonymousIdHint: 'harness 附加在发往 DeepSeek 的请求上的随机 ID。',
  resetId: '重置',
  resetIdDone: '已删除。harness 下次启动时会生成新的 ID。',
  searchTitle: '私密搜索',
  searchPromise: '网页搜索发送到你的 SearXNG 实例（或你选择的 Brave），而不是 DeepSeek。网页抓取直接从你的电脑访问网站。',
  provider: '搜索提供方',
  providerSearxng: 'SearXNG',
  providerBrave: 'Brave',
  notPrivate: '搜索当前设为 "{provider}"，不是私密提供方。请选择 SearXNG 或 Brave。',
  searxngUrl: 'SearXNG 实例',
  searxngUrlHint: '例如 http://127.0.0.1:8888。纯 http 仅适用于本机和私有网络。请在实例的 settings.yml 中开启 json 格式。',
  save: '保存',
  clear: '清除',
  braveKey: 'Brave API 密钥',
  braveKeyHint: '保存在 harness 凭据存储中，只发送到 api.search.brave.com。',
  braveKeySet: '已保存密钥。',
  braveKeyUnset: '未保存密钥。',
  remove: '删除',
  deepseekProviders: 'DeepSeek 网页提供方',
  vaultTitle: '密钥保险库',
  vaultPromise: '密钥不会出现在你的对话、日志和模型请求中。在这台机器上，智能体仍可能有意读取保险库；如需防止，请在隔离环境中运行工具。',
  vaultEmpty: '还没有密钥。',
  vaultUnavailable: '此配置没有凭据存储，无法在这里添加密钥。',
  secretName: '名称',
  secretValue: '值',
  secretValueHint: '至少 8 个字符。只会发送给 harness 一次，之后不再显示。',
  add: '添加',
  originUser: '由你添加',
  originGenerated: '自动生成',
  vaultFileHint: '密钥保存在 ~/.dsh/.credentials.yaml 中。',
  settingsUnavailable: '此配置无法实时更改，请改为编辑 cordis.patch.yml。',
}
