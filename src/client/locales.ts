/**
 * Copy for the Off the Record settings page. The three part promises are the
 * product's fixed wording; never imply that nothing is recorded anywhere, or
 * that anything is encrypted.
 * @module dsh-off-the-record/client/locales
 */

/** Dictionary namespace owned by this page. */
export const NS = 'settings.offTheRecord'

export type OffTheRecordLocaleKey =
  | 'summary' | 'tagline' | 'loading' | 'loadFailed' | 'retry' | 'actionFailed'
  | 'telemetryTitle' | 'stateNotPresent' | 'stateMissing'
  | 'changedBy' | 'changedByUnknown' | 'notLive' | 'editPatch' | 'backstop'
  | 'channel.session-telemetry-otel' | 'channel.session-log-deepseek' | 'channel.plugin-package-inventory-deepseek'
  | 'channel.product-analytics'
  | 'newIdEachStart'
  | 'searchTitle' | 'provider' | 'providerSearxng' | 'providerBrave' | 'notPrivate'
  | 'searxngUrl' | 'save' | 'braveKey' | 'set' | 'notSet' | 'remove'
 
  | 'vaultTitle' | 'vaultUnavailable' | 'secretName' | 'secretValue'
  | 'add' | 'originUser' | 'originGenerated' | 'scopeGlobal' | 'secretScope' | 'workspaceRemoved'
  | 'settingsUnavailable'

export const en: Record<OffTheRecordLocaleKey, string> = {
  summary: '{off} of {total} telemetry channels off · search: {search}',
  tagline: 'Keeps your sessions, secrets, and searches off DeepSeek\'s record.',
  loading: 'Loading…',
  loadFailed: 'Could not read the status: {error}',
  retry: 'Retry',
  actionFailed: 'That change did not apply: {error}',
  telemetryTitle: 'Telemetry',
  stateNotPresent: 'Not in this profile',
  stateMissing: 'Not found',
  changedBy: 'Turned on in {layer}.',
  changedByUnknown: 'Turned on by something other than your own patches, such as a bundle installed later.',
  notLive: 'Change this in your profile\'s cordis.patch.yml; it takes effect after a restart.',
  editPatch: 'To turn it off again, remove the "{id}" entry from {layer}, then restart.',
  backstop: 'DSH_TELEMETRY_DISABLED is set, which also blocks the session upload.',
  'channel.session-telemetry-otel': 'Session Feedback',
  'channel.session-log-deepseek': 'Session Logs',
  'channel.plugin-package-inventory-deepseek': 'Session Plugin Inventory',
  'channel.product-analytics': 'Desktop Usage Analytics',
  newIdEachStart: 'Rotate Installation ID at Start-up',
  searchTitle: 'Web Search Provider',
  provider: 'Search provider',
  providerSearxng: 'SearXNG',
  providerBrave: 'Brave',
  notPrivate: 'Search is set to "{provider}", which is not private. Choose SearXNG or Brave.',
  searxngUrl: 'SearXNG instance',
  save: 'Save',
  braveKey: 'Brave API key',
  set: 'Set',
  notSet: 'Not set',
  remove: 'Remove',
  vaultTitle: 'Secrets vault',
  vaultUnavailable: 'This profile has no credential store, so secrets cannot be added here.',
  secretName: 'Name',
  secretValue: 'Value',
  add: 'Add',
  scopeGlobal: 'Global',
  secretScope: 'Where the secret applies',
  workspaceRemoved: 'no longer a workspace',
  originUser: 'added by you',
  originGenerated: 'generated',
  settingsUnavailable: 'Live changes are unavailable in this profile; edit cordis.patch.yml instead.',
}

export const zh: Record<OffTheRecordLocaleKey, string> = {
  summary: '已关闭 {off}/{total} 个遥测通道 · 搜索：{search}',
  tagline: '让你的会话、密钥和搜索不进入 DeepSeek 的记录。',
  loading: '加载中…',
  loadFailed: '无法读取状态：{error}',
  retry: '重试',
  actionFailed: '更改未生效：{error}',
  telemetryTitle: '遥测',
  stateNotPresent: '此配置不包含',
  stateMissing: '未找到',
  changedBy: '在 {layer} 中被开启。',
  changedByUnknown: '被你自己的补丁以外的内容开启，例如之后安装的插件包。',
  notLive: '请在配置的 cordis.patch.yml 中更改，重启后生效。',
  editPatch: '如需重新关闭，请从 {layer} 中删除 "{id}" 条目，然后重启。',
  backstop: '已设置 DSH_TELEMETRY_DISABLED，它也会阻止会话上传。',
  'channel.session-telemetry-otel': '会话反馈',
  'channel.session-log-deepseek': '会话日志',
  'channel.plugin-package-inventory-deepseek': '会话插件清单',
  'channel.product-analytics': '桌面端使用分析',
  newIdEachStart: '启动时轮换安装 ID',
  searchTitle: '网页搜索提供方',
  provider: '搜索提供方',
  providerSearxng: 'SearXNG',
  providerBrave: 'Brave',
  notPrivate: '搜索当前设为 "{provider}"，不是私密提供方。请选择 SearXNG 或 Brave。',
  searxngUrl: 'SearXNG 实例',
  save: '保存',
  braveKey: 'Brave API 密钥',
  set: '已设置',
  notSet: '未设置',
  remove: '删除',
  vaultTitle: '密钥保险库',
  vaultUnavailable: '此配置没有凭据存储，无法在这里添加密钥。',
  secretName: '名称',
  secretValue: '值',
  add: '添加',
  scopeGlobal: '全局',
  secretScope: '密钥的适用范围',
  workspaceRemoved: '已不是工作区',
  originUser: '由你添加',
  originGenerated: '自动生成',
  settingsUnavailable: '此配置无法实时更改，请改为编辑 cordis.patch.yml。',
}
