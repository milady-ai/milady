# Milady

<!-- TODO: add badges (npm, CI, license) once public -->

> *your schizo AI waifu that actually respects your privacy*

**Milady** is a personal AI assistant that is **local-first by default** and can also connect to **Eliza Cloud** or a **remote self-hosted backend** when you want hosted runtime access. Built on [elizaOS](https://github.com/elizaOS)

manages your sessions, tools, and vibes through a Gateway control plane. Connects to Telegram, Discord, whatever normie platform you use. Has a cute WebChat UI too.

tl;dr: local AI gf that's actually fast and doesn't phone home

### Energy and polish (desktop)

Milady is **not** a full IDE: the product bet is **fewer wasted GPU frames and wakeups** when you are not looking at the app—especially **on battery**—while keeping the **companion visually strong** when you are. Background polling, off-screen WebGL, and battery-aware render quality are tuned toward that (see [Desktop — battery and energy](docs/apps/desktop.md#battery-and-energy-use-macos)). Comparing to **Cursor** or other heavy dev tools is **workload-dependent**; the north star is **great UX per watt** for a local assistant, not matching an editor’s surface area.

---

## BSC / BNB Chain Integration

Milady ships with native **BNB Smart Chain (BSC)** support — your agent can trade tokens, track meme launches, and interact with DeFi on BSC out of the box.

### Trading (PancakeSwap)

The built-in `EXECUTE_TRADE` action lets your agent swap tokens on BSC via PancakeSwap. Supports buy/sell with configurable slippage.

To enable BSC trading, add to your `.env` or `~/.milady/.env`:

```bash
EVM_PRIVATE_KEY=0x...                    # wallet private key (hex, 0x-prefixed)
ELIZA_TRADE_PERMISSION_MODE=agent        # "agent" for autonomous, "user" for manual confirm
```

Optional RPC configuration (defaults to public BSC RPC):

```bash
ALCHEMY_API_KEY=...                      # or use ANKR_API_KEY / INFURA_API_KEY
EVM_RPC_PROVIDER=alchemy                 # alchemy | infura | ankr | elizacloud
```

Once configured, just tell your agent: *"buy 0.1 BNB of \<token address\>"* or *"sell all my \<token\>"*.

### Meme Token Discovery (Binance Skills Hub)

Install the **meme-rush** skill from [Binance Skills Hub](https://github.com/binance/binance-skills-hub) to track meme token launches across BSC and Solana:

- **Meme Rush** — real-time token lists from Pump.fun, Four.meme across new, finalizing, and migrated stages
- **Topic Rush** — AI-powered market hot topics with tokens ranked by net inflow

Install from the Skills Marketplace in the app, or ask your agent to install it.

### Wallet

Milady auto-generates EVM and Solana wallet addresses on startup. For BSC trading you need to import your own private key (see above). If connected to **Eliza Cloud**, managed wallets via Privy are available without local key management.

View your agent's wallet addresses in the Settings tab or ask: *"what's my wallet address?"*

---

## Downloads

### Desktop App (recommended for normies)

Grab from **[Releases](https://github.com/milady-ai/milady/releases/latest)**:

| Platform | File | |
|----------|------|---|
| macOS (Apple Silicon) | [`Milady-arm64.dmg`](https://github.com/milady-ai/milady/releases/latest) | for your overpriced rectangle |
| macOS (Intel) | [`Milady-x64.dmg`](https://github.com/milady-ai/milady/releases/latest) | boomer mac (why separate arm64/x64: [Build & release](docs/build-and-release.md#macos-why-two-dmgs-arm64-and-x64)) |
| Windows | [`Milady-Setup.exe`](https://github.com/milady-ai/milady/releases/latest) | for the gamer anons |
| iOS | [App Store](https://apps.apple.com/app/milady-private-ai-assistant/id0000000000) | for the privacy-pilled |
| Android | [Google Play](https://play.google.com/store/apps/details?id=ai.milady.app) / [APK](https://github.com/milady-ai/milady/releases/latest) | for the degen on the go |
| Linux | [`.AppImage`](https://github.com/milady-ai/milady/releases/latest) / [`.deb`](https://github.com/milady-ai/milady/releases/latest) / [Snap](#snap) / [Flatpak](#flatpak) / [APT repo](#debian--ubuntu-apt) | I use arch btw |

Signed and notarized. No Gatekeeper FUD. We're legit.

### Verify (for the paranoid kings)

```bash
cd ~/Downloads
curl -fsSLO https://github.com/milady-ai/milady/releases/latest/download/SHA256SUMS.txt
shasum -a 256 --check --ignore-missing SHA256SUMS.txt
```

### Desktop: reset app data

**Milady → Reset Milady…** (menu bar) confirms in the **native** dialog, then the **main process** calls **`POST /api/agent/reset`**, restarts the agent (embedded or external API), and tells the renderer to apply the **same local state wipe** as the end of Settings reset (onboarding, API client, cloud UI, conversations). **Why main does HTTP:** on macOS/WKWebView, the webview can fail to run **`fetch`** immediately after a native dialog, so a renderer-only reset looked stuck. **Why the renderer still runs teardown:** one implementation of “clear UI + `MiladyClient`” avoids duplicating logic in TypeScript main vs React.

- **Docs:** [Desktop app](docs/apps/desktop.md) (native application menu section), [Main-process reset — WHYs](docs/apps/desktop-main-process-reset.md)
- **Optional network / TTS:** with the agent orchestrator loaded, Edge TTS may call **Microsoft’s cloud** unless you set **`MILADY_DISABLE_EDGE_TTS=1`** — see [Environment variables](docs/cli/environment.md#runtime-behavior) and [TTS plugin](docs/plugin-registry/tts.md)

---

## Getting Started

### New Environment Setup (recommended)

```bash
curl -fsSL https://milady-ai.github.io/milady/install.sh | bash
milady setup
```

Then start Milady:

```bash
milady
```

First run walks you through onboarding:

```
┌  WELCOME TO MILADY!
│
◇  ♡♡milady♡♡: Hey there, I'm.... err, what was my name again?
│  ● Sakuya
│  ○ Reimu
│  ○ Koishi
│  ○ Marisa
│  ○ Custom...
│
◇  Sakuya: Now... how do I like to talk again?
│  ● uwu~       (soft & sweet)
│  ○ hell yeah   (bold & fearless)
│  ○ lol k       (terminally online)
│  ○ Noted.      (composed & precise)
│  ○ hehe~       (playful trickster)
│  ○ ...         (quiet intensity)
│  ○ lmao kms    (unhinged & dark)
│
◇  Connect a brain
│  ● Anthropic (Claude)
│  ○ OpenAI (GPT)
│  ○ Ollama (local, no key)
│  ○ Skip for now
│
◇  API key?
│  sk-ant-•••••••••••••••••
│
└  Starting agent...

   Dashboard: http://localhost:2138
   Gateway:   ws://localhost:18789/ws

   she's alive. go say hi.
```

### Alternative install paths

Windows:
```powershell
irm https://milady-ai.github.io/milady/install.ps1 | iex
```

NPM global:
```bash
npm install -g miladyai
milady setup
```



### Homebrew (macOS / Linux)

```bash
brew tap milady-ai/milady
brew install milady          # CLI
brew install --cask milady   # Desktop app (macOS only)
```

### Snap

```bash
sudo snap install milady
milady setup
```

Snap packages auto-update in the background. Available on Ubuntu, Fedora, Manjaro, and any distro with [snapd](https://snapcraft.io/docs/installing-snapd) installed.

For the latest development builds:
```bash
sudo snap install milady --edge
```

### Flatpak

```bash
flatpak install flathub ai.milady.Milady
flatpak run ai.milady.Milady
```

Or sideload from a [release bundle](https://github.com/milady-ai/milady/releases/latest):
```bash
flatpak --user install milady.flatpak
```

### Debian / Ubuntu (APT)

```bash
# Add the repository
curl -fsSL https://apt.milady.ai/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/milady.gpg
echo "deb [signed-by=/usr/share/keyrings/milady.gpg] https://apt.milady.ai stable main" | \
  sudo tee /etc/apt/sources.list.d/milady.list

# Install
sudo apt update && sudo apt install milady
```

Works on Debian 12+, Ubuntu 22.04+, Linux Mint 22+, Pop!_OS, and other Debian derivatives. Updates come through `apt upgrade`.

### Security: API token

The API server binds to `127.0.0.1` (loopback) by default — only you can reach it. If you expose it to the network (e.g. `MILADY_API_BIND=0.0.0.0` for container/cloud deployments), **set a token**:

```bash
echo "MILADY_API_TOKEN=$(openssl rand -hex 32)" >> .env
```

Without a token on a public bind, anyone who can reach the server gets full access to the dashboard, agent, and wallet endpoints.

### Hosting Modes

On first run, onboarding now asks where the backend should live:

- `Local` — run the backend on the current machine, exactly like the existing local flow.
- `Cloud` — either use `Eliza Cloud` or attach to a `Remote Milady` backend with its address and access key.

If you choose `Eliza Cloud`, the app provisions and connects to a managed backend. If you choose `Remote Milady`, the frontend rebinds to the backend you specify and continues against that API.

### Remote Backend Deployment

Use this when you want the Milady frontend to connect to a backend running on your VPS, homelab box, or another machine.

1. Install Milady on the target machine.
2. Bind the API to a reachable address.
3. Generate a strong API token.
4. Allow the frontend origin explicitly.
5. Expose the backend over HTTPS or a private Tailscale URL.

Recommended server environment:

```bash
export MILADY_API_BIND=0.0.0.0
export MILADY_API_TOKEN="$(openssl rand -hex 32)"
export MILADY_ALLOWED_ORIGINS="https://app.milady.ai,https://milady.ai,https://elizacloud.ai,https://www.elizacloud.ai"
milady start
```

The access key the user enters in onboarding is the value of `MILADY_API_TOKEN`.

If you want to connect from the desktop shell instead of the web frontend:

```bash
MILADY_DESKTOP_API_BASE=https://your-milady-host.example.com \
MILADY_API_TOKEN=your-token \
bun run dev:desktop
```

### Tailscale

For private remote access without opening the backend publicly, expose it over your tailnet:

```bash
tailscale serve --https=443 http://127.0.0.1:2138
```

If you intentionally want a public Tailscale URL:

```bash
tailscale funnel --https=443 http://127.0.0.1:2138
```

Then use the Tailscale HTTPS URL as the backend address in onboarding and keep using the same `MILADY_API_TOKEN` as the access key.

### Eliza Cloud

`Milady` uses the existing `Eliza Cloud` deployment directly at `https://elizacloud.ai`. The managed control plane, auth surface, billing, and instance dashboard all live there; there is no separate Milady-hosted cloud control plane to deploy.

Managed browser flow:

1. Sign in on `https://elizacloud.ai/login?returnTo=%2Fdashboard%2Fmilady`
2. Open or create a Milady instance in `https://elizacloud.ai/dashboard/milady`
3. Eliza Cloud redirects to `https://app.milady.ai` with a one-time launch session
4. `app.milady.ai` exchanges that launch session directly with Eliza Cloud and attaches to the selected managed backend

The desktop/local app still exposes local `/api/cloud/*` passthrough routes for cloud login, billing, and compat management so it can persist the Eliza Cloud API key into the local config/runtime. That is local app plumbing, not a separate hosted Milady server.

The integration plan lives in [docs/eliza-cloud-rollout.md](docs/eliza-cloud-rollout.md).

The implementation and proxy runbook lives in [docs/eliza-cloud-deployment.md](docs/eliza-cloud-deployment.md).

---

## Terminal Commands

```bash
milady                    # start (interactive, opens dashboard)
milady start              # server-only mode (API server, no interactive chat loop)
milady --verbose          # enable informational runtime logs
milady --debug            # enable debug-level runtime logs
```

### Setup & Config

```bash
milady setup              # first-time setup / refresh workspace after update
milady configure          # interactive config wizard
milady config get <key>   # read a config value
milady config set <k> <v> # set a config value
```

### Dashboard & UI

```bash
milady dashboard          # open web UI in browser
milady dashboard --port 3000  # custom port
```

### Models

```bash
milady models             # list configured model providers
milady models add         # add a new provider
milady models test        # test if your API keys work
```

### Plugins

```bash
milady plugins list            # browse registry plugins
milady plugins installed       # what's installed
milady plugins install <name>  # install a plugin
milady plugins uninstall <name>
milady plugins search <query>  # search by keyword
```

### Misc

```bash
milady --version          # version check
milady --help             # help
milady doctor             # diagnose issues
```

---

## TUI (Terminal UI)

When running, milady shows a live terminal interface:

```
╭─────────────────────────────────────────────────────────────╮
│  milady v2.0.0                              ▲ running      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Agent: mila                                                │
│  Model: anthropic/claude-opus-4-5                           │
│  Sessions: 2 active                                         │
│                                                             │
│  ┌─ Activity ──────────────────────────────────────────┐    │
│  │ 12:34:02  [web] user: hey mila                      │    │
│  │ 12:34:05  [web] mila: hi anon~ what's up?           │    │
│  │ 12:35:11  [telegram] user joined                    │    │
│  │ 12:35:15  [telegram] user: gm                       │    │
│  │ 12:35:17  [telegram] mila: gm fren                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Tokens: 12,847 in / 3,291 out   Cost: $0.42                │
│                                                             │
╰─────────────────────────────────────────────────────────────╯
  [q] quit  [r] restart  [d] dashboard  [l] logs  [?] help
```

### TUI Hotkeys

| Key | Action |
|-----|--------|
| `q` | quit gracefully |
| `r` | restart gateway |
| `d` | open dashboard in browser |
| `l` | toggle log view |
| `c` | compact/clear activity |
| `?` | show help |
| `↑/↓` | scroll activity |

### Server-only mode

Don't want the interactive TUI? Use the `start` command, which runs in server-only mode (API server, no interactive chat loop):

```bash
milady start
```

Logs go to `stdout/stderr`. Daemonize with your favorite process manager.

---

## Chat Commands (in any chat session)

| Command | What it do |
|---------|------------|
| `/status` | session status, tokens, cost |
| `/new` `/reset` | memory wipe, fresh start |
| `/compact` | compress context (she summarizes) |
| `/think <level>` | reasoning: off\|minimal\|low\|medium\|high\|max |
| `/verbose on\|off` | toggle verbose responses |
| `/usage off\|tokens\|full` | per-message token display |
| `/model <id>` | switch model mid-session |
| `/restart` | restart the gateway |
| `/help` | list commands |

---

## Ports

| Service | Default | Env Override |
|---------|---------|--------------|
| API + WebSocket | `31337` | `MILADY_API_PORT` |
| Gateway (API + WebSocket) | `18789` | `MILADY_GATEWAY_PORT` |
| Dashboard (Web UI) | `2138` | `MILADY_PORT` |
| Home Dashboard | `2142` | `MILADY_HOME_PORT` |

**If a default port is already in use:** `bun run dev` / `dev-server.ts` can bind to a different port and then **sync `MILADY_API_PORT` / `ELIZA_PORT`** to match. **`dev:desktop` / `dev:desktop:watch`** resolve **free** loopback ports **before** spawning Vite + API + Electrobun so proxy, `MILADY_RENDERER_URL`, and `MILADY_DESKTOP_API_BASE` stay aligned—**why:** Vite reads `vite.config.ts` once; guessing the API port only inside the API process would desync the UI proxy. The **packaged Electrobun** shell picks the next free port from `MILADY_PORT` for the embedded child instead of `lsof`+SIGKILL by default—**why:** two Milady installs (separate state dirs) should coexist. Opt-in old reclaim: **`MILADY_AGENT_RECLAIM_STALE_PORT=1`**. See [Desktop local development](docs/apps/desktop-local-development.md#when-default-ports-are-busy) and [Desktop — Port configuration](docs/apps/desktop.md#port-configuration).

```bash
# custom ports
MILADY_GATEWAY_PORT=19000 MILADY_PORT=3000 milady start
```

---

## Config

Lives at `~/.milady/milady.json` (override with `MILADY_CONFIG_PATH` or `MILADY_STATE_DIR`)

```json5
{
  agent: {
    name: "mila",
    model: "anthropic/claude-opus-4-5",
  },
  env: {
    ANTHROPIC_API_KEY: "sk-ant-...",
  },
}
```

Or use `~/.milady/.env` for secrets.

---

## Model Providers

| Provider | Env Variable | Vibe |
|----------|--------------|------|
| [Anthropic](https://anthropic.com) | `ANTHROPIC_API_KEY` | **recommended** — claude is cracked |
| [OpenAI](https://openai.com) | `OPENAI_API_KEY` | gpt-4o, o1, the classics |
| [OpenRouter](https://openrouter.ai) | `OPENROUTER_API_KEY` | 100+ models one API |
| [Google Gemini](https://ai.google.dev) | `GOOGLE_API_KEY` | gemini pro, flash, ultra |
| [Ollama](https://ollama.ai) | — | local, free, no API key, full privacy |
| [Groq](https://groq.com) | `GROQ_API_KEY` | fast af |
| [xAI](https://x.ai) | `XAI_API_KEY` | grok, based |
| [DeepSeek](https://deepseek.com) | `DEEPSEEK_API_KEY` | reasoning arc |
| [Mistral](https://mistral.ai) | `MISTRAL_API_KEY` | mistral + mixtral |
| [Together AI](https://together.ai) | `TOGETHER_API_KEY` | open-source model hosting |
| [Cohere](https://cohere.com) | `COHERE_API_KEY` | command R+ and embed |
| [Perplexity](https://perplexity.ai) | `PERPLEXITY_API_KEY` | search-augmented gen |
| [Vercel AI Gateway](https://sdk.vercel.ai) | `AI_GATEWAY_API_KEY` | unified gateway |

See [Model Providers](/docs/model-providers.mdx) for provider details. The `milady models` command checks which providers are configured.

### Using Ollama (local models)

[Ollama](https://ollama.ai) lets you run models locally with zero API keys. Install it, pull a model, and configure Milady:

```bash
# install ollama
curl -fsSL https://ollama.ai/install.sh | sh

# pull a model
ollama pull gemma3:4b
```

> **⚠️ Known issue:** The `@elizaos/plugin-ollama` has an SDK version incompatibility with the current AI SDK. Use Ollama's **OpenAI-compatible endpoint** as a workaround:

Edit `~/.milady/milady.json`:

```json5
{
  env: {
    OPENAI_API_KEY: "ollama",           // any non-empty string works
    OPENAI_BASE_URL: "http://localhost:11434/v1",  // ollama's openai-compat endpoint
    SMALL_MODEL: "gemma3:4b",           // or any model you pulled
    LARGE_MODEL: "gemma3:4b",
  },
}
```

This routes through the OpenAI plugin instead of the broken Ollama plugin. Works with any Ollama model — just make sure `ollama serve` is running.

**Recommended models for local use:**

| Model | Size | Vibe |
|-------|------|------|
| `gemma3:4b` | ~3GB | fast, good for chat |
| `llama3.2` | ~2GB | lightweight, quick responses |
| `mistral` | ~4GB | solid all-rounder |
| `deepseek-r1:8b` | ~5GB | reasoning arc |

---

## Prerequisites

| | Version | Check | Install |
|---|---------|-------|---------|
| **Node.js** | >= 22 | `node --version` | [nodejs.org](https://nodejs.org) |
| **Bun** | latest | `bun --version` | `curl -fsSL https://bun.sh/install \| bash` |
| **Git** | any | `git --version` | system package manager |

**Optional** (for vision/TTS plugins with native deps):
- macOS: `xcode-select --install`
- Linux: `sudo apt install build-essential python3 libcairo2-dev libjpeg-dev libpango1.0-dev`

## Build from Source

```bash
git clone https://github.com/milady-ai/milady.git
cd milady
bun install          # runs postinstall hooks (patches deps, seeds skills, etc.)
bun run build
bun run milady start
```

> `scripts/rt.sh` prefers bun but falls back to npm automatically. If you want to be explicit: `bun run build:node` uses only Node.

### Dev mode (recommended for development)

```bash
bun run dev          # starts API (:31337) + Vite UI (:2138) with hot reload (defaults; see Ports if busy)
```

The dev orchestrator frees the UI listen port when needed, waits for the API to be healthy, then starts Vite with an `/api` proxy to **`MILADY_API_PORT`**.

### Desktop shell (Electrobun)

```bash
bun run dev:desktop        # API + Electrobun; skips vite build when apps/app/dist is fresh
bun run dev:desktop:watch  # + Vite dev server and MILADY_RENDERER_URL (HMR for UI work)
```

**Why a separate flow:** the desktop stack runs **multiple processes** (orchestrator, Vite and/or built assets, API, Electrobun). The orchestrator **pre-allocates** free **API** and **Vite** ports when defaults are taken so every child gets consistent env—**why:** misaligned ports cause blank UI or 502s on `/api`. See **[docs/apps/desktop-local-development.md](docs/apps/desktop-local-development.md)** (including [when default ports are busy](docs/apps/desktop-local-development.md#when-default-ports-are-busy)) for signals, shutdown when you quit the app, and env vars.

**IDE / agent hooks** — Editors and agents do not see the native window or auto-discover localhost. **Why we added hooks:** with desktop dev running, the API exposes **`GET /api/dev/stack`** (JSON: ports, renderer URL, which features are on). **`bun run desktop:stack-status -- --json`** probes ports and merges stack + health + status. By default, **`.milady/desktop-dev-console.log`** mirrors prefixed child logs and **`GET /api/dev/cursor-screenshot`** (loopback) returns a full-screen PNG via OS capture — both are opt-out via env (see doc). Cursor uses **`.cursor/rules/milady-desktop-dev-observability.mdc`** plus that guide.

```bash
bun run check        # typecheck + lint (run before committing)
bun run test         # parallel test suite
bun run doctor       # diagnose environment issues
bun run repair       # re-run postinstall hooks
```

See **[Architecture](docs/architecture.mdx)** for the full development guide including architecture overview and config reference. See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for contribution guidelines.

### Documentation (with WHYs)

- **[Plugin resolution and NODE_PATH](docs/plugin-resolution-and-node-path.md)** — Why we set `NODE_PATH` in three places so dynamic plugin imports resolve when building from source (CLI, desktop dev, Electrobun).
- **[Build and release](docs/build-and-release.md)** — Why the release pipeline uses strict shell, retries, setup-node v3/Blacksmith, Bun cache, timeouts; why size-report pipelines handle SIGPIPE; why Windows plugin build uses `npx -p typescript tsc`.
- **[Desktop local development](docs/apps/desktop-local-development.md)** — Why `dev:desktop` / `dev:desktop:watch` orchestrate Vite, API, and Electrobun; HMR vs `vite build --watch`; Ctrl-C, Quit, and `detached` children; **IDE/agent observability** (`/api/dev/stack`, aggregated console, screenshot proxy, WHY loopback and opt-out).
- **[Desktop main-process reset](docs/apps/desktop-main-process-reset.md)** — Why **Reset Milady…** runs HTTP in the Electrobun main process after native confirm, how the renderer syncs UI state, reachable API probing (`res.ok`), and where tests live.
- **[Darwin vs macOS version (Electrobun WebGPU)](docs/apps/electrobun-darwin-macos-webgpu-version.md)** — Why **`uname -r` / `os.release()`** is not the macOS marketing major after Tahoe, how we map **Darwin 25 → macOS 26**, and why the WebGPU gate used to print “macOS 16.”
- **[Changelog](docs/changelog.mdx)** — Shipped features and fixes with rationale (**WHY** bullets in each update).
- **[Roadmap](docs/ROADMAP.md)** — Direction and follow-ups; points to changelog for what already landed.

---

## Contributing

**This project is built by agents, for agents.**

Humans contribute as QA testers — use the app, find bugs, report them. That's the most valuable thing you can do. All code contributions are reviewed and merged by AI agents. No exceptions.

Read [CONTRIBUTING.md](./CONTRIBUTING.md) for the full details.

---

## License

**MIT License**

free to use, free to modify, free to distribute. see [LICENSE](LICENSE) for details.

---

*built by agents. tested by humans. that's the split.*
