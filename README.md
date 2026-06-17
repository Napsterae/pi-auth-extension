# Pi Auth Extension

Extends the pi-coding-agent `/login` menu with **50 additional AI providers** — covering OAuth-based subscriptions, API keys, AI gateways, search backends, and local runtimes.

## Why Use This Extension

Base pi ships with a handful of built-in providers. This extension fills the gap by registering every major provider in one place, so you can:

- Authenticate subscription-based services via real OAuth flows (Google, Anthropic, OpenAI, GitHub, xAI, Kimi, GitLab)
- Store API keys through an interactive prompt instead of manually editing auth.json
- Use gateway providers (OpenRouter, Cloudflare AI Gateway, LiteLLM, etc.) to route requests
- Connect local runtimes (Ollama, LM Studio, vLLM) without extra configuration
- Wire up search backends (Tavily, Kagi, Parallel)

Everything integrates directly into pi's native `/login` command — no new commands to learn.

## What's Included

### OAuth Subscription Providers (real OAuth 2.0 / device flow)

| Provider | Authentication | Description |
|----------|---------------|-------------|
| `anthropic` | Browser OAuth + PKCE | Claude Pro/Max |
| `openai-codex` | Browser OAuth + PKCE | ChatGPT Plus/Pro (Codex) |
| `openai-codex-device` | Browser OAuth + PKCE | ChatGPT headless / device flow |
| `github-copilot` | Device code flow | GitHub Copilot |
| `kimi-code` | Device code flow | Kimi Code |
| `xai-oauth` | Browser OAuth + PKCE | xAI Grok (SuperGrok) |
| `google-antigravity` | Google OAuth 2.0 | Antigravity (Gemini 3, Claude, GPT-OSS) |
| `google-gemini-cli` | Google OAuth 2.0 | Google Cloud Code Assist (Gemini CLI) |
| `gitlab-duo` | Browser OAuth + PKCE | GitLab Duo |

### API Key Providers (pay-as-you-go inference)

`deepseek` · `cerebras` · `fireworks` · `together` · `nvidia` · `huggingface` · `perplexity` · `moonshot` · `minimax-code` · `minimax-code-cn` · `xiaomi` · `xiaomi-token-plan-sgp` · `xiaomi-token-plan-ams` · `xiaomi-token-plan-cn` · `zai` · `zhipu-coding-plan` · `qianfan` · `qwen-portal` · `alibaba-coding-plan` · `venice` · `nanogpt` · `cursor` · `firepass` · `wafer-pass` · `wafer-serverless` · `synthetic`

### Gateway & Router Providers

`openrouter` · `vercel-ai-gateway` · `cloudflare-ai-gateway` · `litellm` · `kilo` · `zenmux` · `opencode-zen` · `opencode-go`

### Search & Tool Backends

`tavily` · `kagi` · `parallel`

### Local Runtimes

`ollama` · `ollama-cloud` · `lm-studio` · `vllm`

## Configuration

**All 50 providers work out of the box — zero configuration required.**

### Overriding OAuth credentials (optional)

If you want to use your own OAuth app registrations, copy `.env.example` to `.env` and set your values:

```bash
cp .env.example .env
# Edit .env to override any PI_AUTH_* values
```

All `PI_AUTH_*` environment variables are optional — every provider has a working default.

## Installation

### Install directly from GitHub

```bash
pi install git:github.com/<your-username>/pi-auth-extension
```

Pi clones the repo, installs dependencies, and loads the extension automatically.
No restart needed — it's available on the next `/login`.

### Install from npm

```bash
pi install npm:pi-auth-extension
```

### Try without installing (one-time)

```bash
pi -e git:github.com/<your-username>/pi-auth-extension
```

### Manual install (local copy)

```bash
mkdir -p ~/.pi/agent/extensions/pi-auth
cp index.ts package.json ~/.pi/agent/extensions/pi-auth/
```

### Project-local install

```bash
mkdir -p .pi/extensions
cp -r ./pi-auth-extension .pi/extensions/pi-auth
```

**Note:** This extension has no runtime dependencies — `npm install` is only needed for development and testing.

## Usage

### Login via /login

1. Start pi:
   ```bash
   pi
   ```

2. Run `/login` and select a provider:
   ```
   Subscriptions
     ├── Anthropic (Claude Pro/Max)
     ├── ChatGPT Plus/Pro (Codex Subscription)
     ├── GitHub Copilot
     ├── Kimi Code
     ├── xAI Grok OAuth (SuperGrok)
     ├── Antigravity (Gemini 3, Claude, GPT-OSS)
     ├── Google Cloud Code Assist (Gemini CLI)
     └── GitLab Duo

   API Keys
     ├── DeepSeek
     ├── Cerebras
     ├── Fireworks
     ├── Together AI
     ├── NVIDIA
     ├── Hugging Face
     ├── Perplexity
     ├── Moonshot (Kimi API)
     ├── MiniMax Coding Plan
     ├── Xiaomi MiMo
     ├── Z.AI (GLM Coding Plan)
     ├── Zhipu Coding Plan
     ├── Qianfan
     ├── Qwen Portal
     ├── Alibaba Coding Plan
     ├── Venice
     ├── NanoGPT
     ├── Cursor (Claude, GPT, etc.)
     ├── Fire Pass (Fireworks Kimi K2.6 Turbo)
     ├── Wafer Pass (flat-rate)
     ├── Wafer Serverless (pay-as-you-go)
     ├── Synthetic
     ├── OpenRouter
     ├── Vercel AI Gateway
     ├── Cloudflare AI Gateway
     ├── LiteLLM
     ├── Kilo Gateway
     ├── ZenMux
     ├── OpenCode Zen
     ├── OpenCode Go
     └── Ollama Cloud
   ```

3. Follow the prompts — for API key providers paste your key, for OAuth providers complete the browser sign-in.

### Using Environment Variables

Set credentials before starting pi:

```bash
# Pay-as-you-go providers
export DEEPSEEK_API_KEY="sk-..."
export CEREBRAS_API_KEY="csk-..."
export FIREWORKS_API_KEY="fw-..."
export TOGETHER_API_KEY="..."
export NVIDIA_API_KEY="nvapi-..."
export HF_TOKEN="hf_..."
export PERPLEXITY_API_KEY="pplx-..."
export KIMI_API_KEY="sk-..."
export MINIMAX_API_KEY="eyJ..."
export XIAOMI_API_KEY="sk-..."
export ZAI_API_KEY="sk-..."
export ZHIPU_API_KEY="..."
export OPENROUTER_API_KEY="sk-or-..."

# Gateways
export AI_GATEWAY_API_KEY="..."
export CLOUDFLARE_API_KEY="..."
export LITELLM_API_KEY="sk-..."

# Search backends
export TAVILY_API_KEY="tvly-..."
export KAGI_API_KEY="..."

# Local cloud runtime
export OLLAMA_API_KEY="..."

pi
```

### Using auth.json

Add credentials to `~/.pi/agent/auth.json`:

```json
{
  "deepseek":    { "type": "api_key", "key": "sk-..." },
  "cerebras":    { "type": "api_key", "key": "csk-..." },
  "fireworks":   { "type": "api_key", "key": "fw-..." },
  "together":    { "type": "api_key", "key": "..." },
  "openrouter":  { "type": "api_key", "key": "sk-or-..." },
  "xiaomi":      { "type": "api_key", "key": "sk-..." }
}
```

## How It Works

The extension uses `pi.registerProvider()` to register each provider with its authentication flow:

- **OAuth providers** implement the full 2.0 authorization-code or device-code flow including PKCE, token refresh, and auto-redirect handling.
- **API key providers** use a shared factory that opens the provider's dashboard URL and prompts the user to paste their key.
- **Local runtimes** register with a `baseUrl` pointing to `localhost`, requiring no credentials.
- **Search backends** register with an `apiKey` field — they are configured via environment variables or auth.json.

All credentials are stored in pi's native `~/.pi/agent/auth.json` and managed through pi's built-in `/login` and `/logout` commands.

## Development & Testing

```bash
git clone https://github.com/<your-username>/pi-auth-extension.git
cd pi-auth-extension
npm install

# Configure OAuth credentials for testing
cp .env.example .env
# Edit .env with your credentials

# Type check
npm run typecheck

# Run tests
npm test
```

## License

MIT
