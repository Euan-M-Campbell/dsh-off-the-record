# dsh-off-the-record

> **dsh-off-the-record** keeps your sessions, secrets, and searches off DeepSeek's record.

**Status: 0.5.1.** Disable telemetry, private search, the secrets vault, status checks, and the settings page are ready.

A bundle for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) with three parts, each of which can be turned off on its own:

- **Disable telemetry.** Turns off the harness channels that send session logs, usage analytics, and plugin lists to DeepSeek. Conversations you send to a DeepSeek model still go to DeepSeek.
- **Private search.** Web searches go to your SearXNG instance (or Brave, if you choose it), not DeepSeek. Page fetches go directly from your computer to the website.
- **Secrets vault.** Secrets stay out of your conversation, logs, and model requests. On this machine the agent could still read the vault deliberately; run tools in an isolated box to prevent that.

The harness still keeps your session log on your machine, and the model provider you choose still receives your conversation.

## Install

Tested with DSH `0.2.1-rc.2`. The bundle also loads on later releases; when a release changes a row it manages, that override is skipped with a startup warning (`patch: entry … not found`) until the bundle is updated.

```sh
dsh plugin --profile <name> add github:Euan-M-Campbell/dsh-off-the-record#v0.5.1
```

Desktop users install with the `dsh` command that Desktop sets up (**Manage dsh Command… → Install**), into the Desktop profile:

```sh
dsh plugin --profile desktop add github:Euan-M-Campbell/dsh-off-the-record#v0.5.1
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

**Anonymous installation id.** The harness attaches a random id (`~/.dsh/.anonymous-user-id`) to DeepSeek requests. By default this bundle replaces it every time the harness starts, so separate runs can't be linked by it. Your API key or account sign-in still identifies you to DeepSeek when you use a DeepSeek model. Turn this off on the settings page, or with:

```yaml
- id: otr-settings
  config:
    newIdEachStart: false
```

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

## Private search

`web_search` goes to your own SearXNG instance by default, or to Brave if you choose it. It never goes to DeepSeek: the bundle disables both DeepSeek web providers, so even a DeepSeek selection left in your settings fails with an error instead of searching. `web_fetch` keeps the harness's direct provider, which connects from your computer to the website.

Until you configure an instance, `web_search` fails with a "not set up" error, and the model tells you search is unavailable.

Your search engine sees your queries: SearXNG passes them on to the engines it uses, and Brave receives them directly.

### SearXNG

1. Run an instance. With Docker:

   ```sh
   docker run -d --name searxng -p 127.0.0.1:8888:8080 searxng/searxng
   ```

2. Turn on JSON output: in the instance's `settings.yml`, add `json` to `search.formats`, then restart it. Without it, every search fails with HTTP 403 and an error that says so.

   ```yaml
   search:
     formats:
       - html
       - json
   ```

3. Point the bundle at it in your profile's `cordis.patch.yml`:

   ```yaml
   - id: otr-web-search-searxng
     config:
       baseURL: http://127.0.0.1:8888
   ```

Plain `http` is accepted only for this machine and private networks (`localhost`, `10.x`, `192.168.x`, `*.local`, Docker service names); anything else must use `https`. The URL is read only from configuration, never from environment variables, so a project's `.env` cannot redirect your searches.

Optional settings on the same row: `engines` and `categories` (comma-separated SearXNG names), `searchTimeoutMs` (default 15000), and `userAgent`.

### Brave

Brave Search's API needs a key, and a card on file even for the free monthly credit ([pricing](https://brave.com/search/api/)).

1. Store the key under the name `BRAVE_API_KEY`, in either place:
   - `~/.dsh/.credentials.yaml`, which only your OS user can read:

     ```yaml
     refs:
       BRAVE_API_KEY: <your key>
     ```

   - your environment when you start `dsh`.

2. Select Brave in your profile's `cordis.patch.yml`:

   ```yaml
   - id: web
     config:
       searchProvider: brave
       fetchProvider: http
   ```

The key is sent only to `api.search.brave.com`; the endpoint cannot be changed.

## Secrets vault

The model uses your secrets by name; their values stay out of the conversation, the session log, and model requests.

Add a secret on the [settings page](#settings-page), or by editing the harness credential file, `~/.dsh/.credentials.yaml` (only your OS user can read it; the harness picks up changes immediately). Each secret is a record named `vault/` plus its name in lowercase, with `_` written as `-`:

```yaml
version: 1
records:
  vault/db-url:            # the secret DB_URL
    kind: api-key
    key: postgres://app:hunter2@db.internal/app
```

Names use capital letters, digits, and underscores, start with a letter, and cannot be ones that change how commands run (`PATH`, `HOME`, `LD_*`, `DSH_*`, and similar). Values must be at least 8 characters, so they can be recognized in output.

The model gets three tools:

| Tool | What it does |
|---|---|
| `list_secrets` | Lists names and whether you added the secret or it was generated. Never values. |
| `create_secret` | Generates a random secret under a new name, such as a session key. The model never sees it. |
| `run_with_secrets` | Runs a bash command with the named secrets set as environment variables (`$DB_URL`). The value is never in the command text. It runs under the same sandbox as `bash`, and asks for approval the same way to widen it. |

Every tool result, from any tool, has secret values replaced with `[secret:NAME]` before the model or the session log sees them. That covers the raw value and its base64, base64url, URL-encoded, and JSON-escaped forms. If redaction fails, the result is withheld.

**What this does not protect against.** On this machine the agent could still read the vault deliberately, for example by opening `~/.dsh/.credentials.yaml`, or transform a value (reversing it, splitting it up) or send it over the network from a command. Run tools in an isolated box to prevent that. The vault is empty in one-shot `headless` runs, which have no credential store.

## Settings page

In the Web UI and the Desktop app, open **Plugins → dsh-off-the-record**:

- **Telemetry**: a switch for each channel, with a dot that is red while the channel sends nothing to DeepSeek and green while it does. Session Logs and Desktop Usage Analytics switch live; Session Feedback and Session Plugin Inventory can only change in `cordis.patch.yml` with a restart, so their switches are locked, and the page names the file when something turned one on. **Rotate Installation ID at Start-up** is on by default.
- **Web Search Provider**: SearXNG or Brave, with the selected provider's instance address or API key, shown as **Set** or **Not set**.
- **Secrets vault**: your secrets by name, with **Add** and **Remove**. A value you type goes to the harness once and is never shown again.

The page is in English and Chinese. The harness checks every change before applying it, and refuses an insecure SearXNG address, a reserved secret name, or a short value with the reason. Settings go to your profile's `cordis.patch.yml`; keys and secrets go to the credential store.

## Status checks

At every start, and whenever the configuration changes, the bundle checks each setting it manages. If something has turned a channel back on, it prints a warning that names the file responsible and how to undo it:

```text
dsh-off-the-record: Session log on DeepSeek requests is on (set in /Users/you/.dsh/profiles/web/cordis.patch.yml). Remove the "session-log-deepseek" entry from /Users/you/.dsh/profiles/web/cordis.patch.yml to turn it off again.
```

It also warns when a harness release has renamed a setting the bundle manages, and when `web_search` points at a DeepSeek provider. When everything is as the bundle sets it, it prints nothing.

The settings page shows the same status.

## Develop

Requires Node `^22.19.0 || >=24.0.0` and pnpm 11.

```sh
pnpm install
pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run build
```

The tests compose this bundle's patches with the published `dsh-base` and `dsh-web-app` patches, and boot the published `dsh` CLI against a local mock model server to check what the DeepSeek adapter actually sends. They talk to the mock server, never to DeepSeek.

## License

MIT
