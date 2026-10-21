# dsh-off-the-record

> **dsh-off-the-record** keeps your sessions, secrets, and searches off DeepSeek's record.

**Status: 0.1.0.** Disable telemetry is ready; private search and the secrets vault are in progress.

A bundle for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) with three parts, each of which can be turned off on its own:

- **Disable telemetry.** Turns off the harness channels that send session logs, usage analytics, and plugin lists to DeepSeek. Conversations you send to a DeepSeek model still go to DeepSeek.
- **Private search.** Web searches go to your SearXNG instance (or Brave, if you choose it), not DeepSeek. Page fetches go directly from your computer to the website.
- **Secrets vault.** Secrets stay out of your conversation, logs, and model requests. On this machine the agent could still read the vault deliberately; run tools in an isolated box to prevent that.

The harness still keeps your session log on your machine, and the model provider you choose still receives your conversation.

## Install

Tested with DSH `0.2.1-rc.2`. The bundle also loads on later releases; when a release changes a row it manages, that override is skipped with a startup warning (`patch: entry … not found`) until the bundle is updated.

```sh
dsh plugin --profile <name> add github:Euan-M-Campbell/dsh-off-the-record#v0.1.0
```

Desktop users install with the `dsh` command that Desktop sets up (**Manage dsh Command… → Install**), into the Desktop profile:

```sh
dsh plugin --profile desktop add github:Euan-M-Campbell/dsh-off-the-record#v0.1.0
```

Watch the first start after installing or upgrading either the harness or this bundle. If the harness cannot load the bundle at all, it prints `dsh: skipping profile bundle "dsh-off-the-record"` and starts with every channel back on.

## Disable telemetry

| Channel | What it sent to DeepSeek | Row |
|---|---|---|
| Feedback session upload | Your whole session (prompts, replies, tool calls, tool output) whenever you submitted feedback, whichever model you used | `session-telemetry-otel` |
| Session log on DeepSeek requests | Recent session events in the `dsh_session_log` field of each DeepSeek API request, including events from other providers | `session-log-deepseek` |
| Plugin inventory on DeepSeek requests | Your active plugin packages in the `dsh_plugin_packages` field | `plugin-package-inventory-deepseek` |
| Desktop usage analytics | Interface events with device id, account id, OS, app version, and model name | `product-analytics` (Desktop only) |

Feedback you submit is still saved in your local session log.

In profiles without the Web app (the plain CLI, `headless`, `acp`, `sdk`), the harness has no desktop analytics row, so each start prints `patch: entry "product-analytics" not found`. That warning is expected.

**Backstop.** Starting the harness with `DSH_TELEMETRY_DISABLED=1` turns off the feedback session upload even if this bundle is not loaded.

**Still sent.** The Desktop app checks `download.deepseek.com` for updates every 10 minutes, and polls a DeepSeek update-policy service that can require an update. Neither carries your sessions or your installation id, and a bundle cannot turn them off. Signing in to a DeepSeek account, and chatting with a DeepSeek model, contact DeepSeek because you asked them to.

**Anonymous installation id.** The harness attaches a random id (`~/.dsh/.anonymous-user-id`) to DeepSeek requests. Delete that file to get a new one on the next start.

### Re-enabling a channel

Add the row to your profile's `cordis.patch.yml` (`~/.dsh/profiles/<name>/cordis.patch.yml`). A later layer always wins over this bundle.

```yaml
# Feedback session upload (shipped default)
- id: session-telemetry-otel
  config:
    mode: FEEDBACK_ONLY
    shutdownTimeoutMillis: 3000
    maxRequestBytes: 4000000
    exporter:
      url: https://dsh-otel-collector.deepseeksvc.com/v1/logs
      compression: gzip
      timeoutMillis: 1000
    processor:
      scheduledDelayMillis: 10000
      maxQueueSize: 2048
      maxExportBatchSize: 2048
      exportTimeoutMillis: 1500

# Session log on DeepSeek requests
- id: session-log-deepseek
  config:
    enabled: true

# Plugin inventory on DeepSeek requests
- id: plugin-package-inventory-deepseek
  config:
    enabled: true

# Desktop usage analytics
- id: product-analytics
  config:
    enabled: true
    appVersion: !!js process.env.DSH_CLIENT_VERSION
```

## Develop

Requires Node `^22.19.0 || >=24.0.0` and pnpm 11.

```sh
pnpm install
pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run build
```

The tests compose this bundle's patches with the published `dsh-base` and `dsh-web-app` patches, and boot the published `dsh` CLI against a local mock model server to check what the DeepSeek adapter actually sends. They talk to the mock server, never to DeepSeek.

## License

MIT
