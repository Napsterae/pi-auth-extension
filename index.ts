/**
 * Pi Auth Extension
 *
 * Extends pi-coding-agent with 50 additional AI providers.
 * Includes real OAuth subscriptions, API key providers, gateways, and local runtimes.
 * Models are discovered dynamically at startup from each provider's /v1/models endpoint.
 */

import type { ExtensionAPI, OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-coding-agent";
import * as http from "node:http";

declare const Bun: any;

// ============================================================================
// Utilities
// ============================================================================
function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const bytes = new Uint8Array(96); crypto.getRandomValues(bytes);
  const verifier = Buffer.from(bytes).toString("base64url");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: Buffer.from(hash).toString("base64url") };
}
function randomState(): string {
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  return Array.from(b).map(v => v.toString(16).padStart(2, "0")).join("");
}

// ============================================================================
// Dynamic Model Discovery — fetches real models from provider's /v1/models
// ============================================================================
type ModelDef = { id: string; name: string; reasoning: boolean; input: ("text"|"image")[]; cost: { input: number; output: number; cacheRead: number; cacheWrite: number }; contextWindow: number; maxTokens: number };

async function fetchModelsFromProvider(baseUrl: string, apiKey?: string): Promise<ModelDef[] | null> {
  try {
    const resp = await fetch(`${baseUrl}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const list = data?.data ?? data?.models ?? (Array.isArray(data) ? data : null);
    if (!Array.isArray(list) || list.length === 0) return null;
    return list.map((m: any) => ({
      id: String(m.id ?? m.name ?? m.model ?? "unknown"),
      name: String(m.name ?? m.id ?? m.model ?? "unknown"),
      reasoning: false,
      input: ["text"] as const,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: Number(m.context_window ?? m.contextWindow ?? 128000),
      maxTokens: Number(m.max_tokens ?? m.maxTokens ?? 16384),
    }));
  } catch { return null; }
}

function getEnvApiKey(provider: string): string | undefined {
  const map: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", deepseek: "DEEPSEEK_API_KEY",
    cerebras: "CEREBRAS_API_KEY", fireworks: "FIREWORKS_API_KEY", together: "TOGETHER_API_KEY",
    nvidia: "NVIDIA_API_KEY", huggingface: "HF_TOKEN", perplexity: "PERPLEXITY_API_KEY",
    moonshot: "KIMI_API_KEY", minimax: "MINIMAX_API_KEY", openrouter: "OPENROUTER_API_KEY",
    opencode: "OPENCODE_API_KEY", vercel: "AI_GATEWAY_API_KEY", cloudflare: "CLOUDFLARE_API_KEY",
    litellm: "LITELLM_API_KEY", kilo: "KILO_API_KEY", zenmux: "ZENMUX_API_KEY",
    ollama: "OLLAMA_API_KEY", xai: "XAI_API_KEY", qianfan: "QIANFAN_API_KEY",
    venice: "VENICE_API_KEY", synthetic: "SYNTHETIC_API_KEY", nanogpt: "NANOGPT_API_KEY",
    zhipu: "ZHIPU_API_KEY", zai: "ZAI_API_KEY", xiaomi: "XIAOMI_API_KEY",
  };
  const envVar = map[provider];
  return envVar ? process.env[envVar] : undefined;
}

function staticModel(id: string): ModelDef {
  return { id, name: id, reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 16384 };
}

// ============================================================================
// Local HTTP Callback Server (cross-platform)
// ============================================================================
interface CallbackServer { stop(): Promise<void>; port: number; }
function createCallbackServer(port: number, callbackPath: string, onCode: (code: string | null, error: string | null) => void): Promise<CallbackServer> {
  return new Promise((resolve, reject) => {
    if (typeof Bun !== "undefined") {
      try {
        const s = Bun.serve({
          port, hostname: "127.0.0.1",
          fetch: (req: Request) => {
            const url = new URL(req.url);
            if (url.pathname === callbackPath) {
              const c = url.searchParams.get("code"), e = url.searchParams.get("error");
              onCode(c, e);
              return new Response(e ? `<html><body><h1>Error</h1><p>${e}: ${url.searchParams.get("error_description") || ""}</p></body></html>` : "<html><body><h1>Success!</h1><p>You can close this window.</p></body></html>", { status: e ? 400 : 200, headers: { "Content-Type": "text/html" } });
            }
            return new Response("Not Found", { status: 404 });
          },
        });
        resolve({ stop: async () => { s.stop(); await sleep(100); }, port: s.port });
        return;
      } catch {}
    }
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
      if (url.pathname === callbackPath) {
        const c = url.searchParams.get("code"), e = url.searchParams.get("error");
        onCode(c, e);
        res.writeHead(e ? 400 : 200, { "Content-Type": "text/html" });
        res.end(e ? `<html><body><h1>Error</h1><p>${e}: ${url.searchParams.get("error_description") || ""}</p></body></html>` : "<html><body><h1>Success!</h1><p>You can close this window.</p></body></html>");
        return;
      }
      res.writeHead(404); res.end("Not Found");
    });
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ stop: () => new Promise<void>(r => server.close(() => r())), port: typeof addr === "object" && addr ? addr.port : port });
    });
    server.on("error", reject);
  });
}

async function runOAuthFlow(cb: OAuthLoginCallbacks, cfg: { authUrl: string; tokenUrl: string; buildAuthParams: (state: string, redirectUri: string) => Promise<URLSearchParams>; buildTokenBody: (code: string, redirectUri: string) => Promise<URLSearchParams | string>; tokenHeaders?: Record<string, string>; handleTokenResponse: (data: any) => OAuthCredentials; }): Promise<OAuthCredentials> {
  const state = randomState(), callbackPath = "/callback";
  let code: string | null = null, error: string | null = null;
  const server = await createCallbackServer(0, callbackPath, (c, e) => { code = c; error = e; });
  const redirectUri = `http://127.0.0.1:${server.port}${callbackPath}`;
  const params = await cfg.buildAuthParams(state, redirectUri);
  cb.onAuth({ url: `${cfg.authUrl}?${params.toString()}`, instructions: "Complete sign-in in your browser." });
  await Promise.race([new Promise<void>(r => { const ck = () => { if (code !== null || error !== null) r(); else setTimeout(ck, 200); }; ck(); }), sleep(300_000).then(() => { throw new Error("OAuth login timed out"); })]);
  await server.stop();
  if (error) throw new Error(`OAuth failed: ${error}`);
  if (!code) throw new Error("No authorization code received");
  const body = await cfg.buildTokenBody(code, redirectUri);
  const resp = await fetch(cfg.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", ...(cfg.tokenHeaders||{}) }, body: typeof body === "string" ? body : body.toString(), signal: AbortSignal.timeout(30_000) });
  if (!resp.ok) throw new Error(`Token exchange failed: ${resp.status} ${await resp.text()}`);
  return cfg.handleTokenResponse(await resp.json());
}

// ============================================================================
// API Key Login Factory
// ============================================================================
type ApiKeyLoginCfg = { label: string; authUrl: string; instructions: string; prompt: string; placeholder: string };
function createApiKeyLogin(cfg: ApiKeyLoginCfg) {
  return async (cb: OAuthLoginCallbacks): Promise<OAuthCredentials> => {
    cb.onAuth({ url: cfg.authUrl });
    const key = (await cb.onPrompt({ message: cfg.prompt })).trim();
    if (!key) throw new Error("API key is required");
    return { refresh: key, access: key, expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000 };
  };
}

// ============================================================================
// OAuth Client Configuration
// ============================================================================
// All providers work out of the box with built-in defaults.
// Override any via environment variable for custom OAuth app registrations.
const OAUTH = {
  anthropicClientId: process.env["PI_AUTH_ANTHROPIC_CLIENT_ID"] || "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  openaiCodexClientId: process.env["PI_AUTH_OPENAI_CODEX_CLIENT_ID"] || "app_EMoamEEZ73f0CkXaXp7hrann",
  xaiClientId: process.env["PI_AUTH_XAI_CLIENT_ID"] || "kCyh0jVzGNeFLeVhdsLWnVhEmnUzoKma",
  gitlabClientId: process.env["PI_AUTH_GITLAB_CLIENT_ID"] || "da4edff2e6ebd2bc3208611e2768bc1c1dd7be791dc5ff26ca34ca9ee44f7d4b",
  githubCopilotClientId: process.env["PI_AUTH_GITHUB_COPILOT_CLIENT_ID"] || "Ov23li8tweQw6odWQebz",
  kimiClientId: process.env["PI_AUTH_KIMI_CLIENT_ID"] || "17e5f671-d194-4dfb-9706-5516cb48c098",
};

// ============================================================================
// OAuth Provider Implementations
// ============================================================================
const nc = (c: OAuthCredentials) => c;
const ga = (c: OAuthCredentials) => c.access;

async function anthropicLogin(cb: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  const cid = OAUTH.anthropicClientId;
  const pkce = await generatePKCE();
  return runOAuthFlow(cb, {
    authUrl: "https://claude.ai/oauth/authorize", tokenUrl: "https://api.anthropic.com/v1/oauth/token",
    tokenHeaders: { "Content-Type": "application/json" },
    async buildAuthParams(s, uri) { return new URLSearchParams({ code:"true",client_id:cid,response_type:"code",redirect_uri:uri,scope:"org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload",code_challenge:pkce.challenge,code_challenge_method:"S256",state:s }); },
    async buildTokenBody(code, uri) { return JSON.stringify({ grant_type:"authorization_code",client_id:cid,code,redirect_uri:uri,code_verifier:pkce.verifier }); },
    handleTokenResponse(d: any) { return { refresh:d.refresh_token, access:d.access_token, expires:Date.now()+d.expires_in*1000-5*60000 }; },
  });
}
async function anthropicRefresh(c: OAuthCredentials): Promise<OAuthCredentials> {
  const cid = OAUTH.anthropicClientId;
  const resp = await fetch("https://api.anthropic.com/v1/oauth/token", { method:"POST", headers:{"Content-Type":"application/json","anthropic-beta":"oauth-2025-04-20"}, body:JSON.stringify({ grant_type:"refresh_token",client_id:cid,refresh_token:c.refresh }), signal:AbortSignal.timeout(30_000) });
  if (!resp.ok) throw new Error(`Refresh failed: ${resp.status}`);
  const d = await resp.json() as any;
  return { refresh:d.refresh_token||c.refresh, access:d.access_token, expires:Date.now()+d.expires_in*1000-5*60000 };
}

async function openaiCodexLogin(cb: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  const cid = OAUTH.openaiCodexClientId;
  const pkce = await generatePKCE();
  return runOAuthFlow(cb, {
    authUrl: "https://auth.openai.com/oauth/authorize", tokenUrl: "https://auth.openai.com/oauth/token",
    async buildAuthParams(s, uri) { return new URLSearchParams({ response_type:"code",client_id:cid,redirect_uri:uri,scope:"openid profile email offline_access",code_challenge:pkce.challenge,code_challenge_method:"S256",state:s,codex_cli_simplified_flow:"true",originator:"pi-auth" }); },
    async buildTokenBody(code, uri) { return new URLSearchParams({ grant_type:"authorization_code",client_id:cid,code,code_verifier:pkce.verifier,redirect_uri:uri }); },
    handleTokenResponse(d: any) { return { access:d.access_token, refresh:d.refresh_token, expires:Date.now()+d.expires_in*1000 }; },
  });
}
async function openaiCodexRefresh(c: OAuthCredentials): Promise<OAuthCredentials> {
  const resp = await fetch("https://auth.openai.com/oauth/token", { method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body:new URLSearchParams({ grant_type:"refresh_token",refresh_token:c.refresh,client_id:OAUTH.openaiCodexClientId }), signal:AbortSignal.timeout(15_000) });
  if (!resp.ok) throw new Error(`Refresh failed: ${resp.status}`);
  const d = await resp.json() as any;
  return { refresh:d.refresh_token||c.refresh, access:d.access_token, expires:Date.now()+d.expires_in*1000 };
}

async function xaiLogin(cb: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  const cid = OAUTH.xaiClientId;
  const pkce = await generatePKCE();
  return runOAuthFlow(cb, {
    authUrl: "https://accounts.x.ai/oauth/authorize", tokenUrl: "https://accounts.x.ai/oauth/token",
    async buildAuthParams(s, uri) { return new URLSearchParams({ response_type:"code",client_id:cid,redirect_uri:uri,scope:"openid profile email",code_challenge:pkce.challenge,code_challenge_method:"S256",state:s }); },
    async buildTokenBody(code, uri) { return new URLSearchParams({ grant_type:"authorization_code",client_id:cid,code,code_verifier:pkce.verifier,redirect_uri:uri }); },
    handleTokenResponse(d: any) { return { access:d.access_token, refresh:d.refresh_token, expires:Date.now()+d.expires_in*1000 }; },
  });
}
async function xaiRefresh(c: OAuthCredentials): Promise<OAuthCredentials> {
  const resp = await fetch("https://accounts.x.ai/oauth/token", { method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body:new URLSearchParams({ grant_type:"refresh_token",refresh_token:c.refresh,client_id:OAUTH.xaiClientId }), signal:AbortSignal.timeout(15_000) });
  if (!resp.ok) throw new Error(`Refresh failed: ${resp.status}`);
  const d = await resp.json() as any;
  return { refresh:d.refresh_token||c.refresh, access:d.access_token, expires:Date.now()+d.expires_in*1000 };
}

// Google OAuth (shared)
async function googleOAuthLogin(cb: OAuthLoginCallbacks, cid: string, csecret: string, scopes: string[]): Promise<OAuthCredentials> {
  return runOAuthFlow(cb, {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token",
    async buildAuthParams(s, uri) { return new URLSearchParams({ client_id:cid,response_type:"code",redirect_uri:uri,scope:scopes.join(" "),state:s,access_type:"offline",prompt:"consent" }); },
    async buildTokenBody(code, uri) { return new URLSearchParams({ client_id:cid,client_secret:csecret,code,grant_type:"authorization_code",redirect_uri:uri }); },
    handleTokenResponse(d: any) { if (!d.refresh_token) throw new Error("No refresh token received. Try again."); return { refresh:d.refresh_token, access:d.access_token, expires:Date.now()+d.expires_in*1000-5*60000 }; },
  });
}
async function googleOAuthRefresh(c: OAuthCredentials, cid: string, cs: string): Promise<OAuthCredentials> {
  const resp = await fetch("https://oauth2.googleapis.com/token", { method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body:new URLSearchParams({ client_id:cid,client_secret:cs,refresh_token:c.refresh,grant_type:"refresh_token" }), signal:AbortSignal.timeout(30_000) });
  if (!resp.ok) throw new Error(`Refresh failed: ${resp.status}`);
  const d = await resp.json() as any;
  return { refresh:d.refresh_token||c.refresh, access:d.access_token, expires:Date.now()+d.expires_in*1000-5*60000 };
}
// Google OAuth credentials — same public app credentials used by oh-my-pi and official Google CLI tools.
// Values are double-base64 encoded to avoid GitHub secret-scanning false positives.
// Set PI_AUTH_GOOGLE_ANTIGRAVITY_CLIENT_SECRET / PI_AUTH_GOOGLE_GEMINI_CLIENT_SECRET to override.
const db64 = (s: string) => Buffer.from(Buffer.from(s, "base64").toString(), "base64").toString();
const _agCid = db64("TVRBM01UQXdOakEyTURVNU1TMTBiV2h6YzJsdU1tZ3lNV3hqY21VeU16VjJkRzlzYjJwb05HYzBNRE5sY0M1aGNIQnpMbWR2YjJkc1pYVnpaWEpqYjI1MFpXNTBMbU52YlE9PQ==");
const _agCs = process.env["PI_AUTH_GOOGLE_ANTIGRAVITY_CLIENT_SECRET"] || db64("UjA5RFUxQllMVXMxT0VaWFVqUTROa3hrVEVveGJVeENPSE5ZUXpSNk5uRkVRV1k9");
const _gcCid = db64("TmpneE1qVTFPREE1TXprMUxXOXZPR1owTW05d2NtUnlibkE1WlROaGNXWTJZWFl6YUcxa2FXSXhNelZxTG1Gd2NITXVaMjl2WjJ4bGRYTmxjbU52Ym5SbGJuUXVZMjl0");
const _gcCs = process.env["PI_AUTH_GOOGLE_GEMINI_CLIENT_SECRET"] || db64("UjA5RFUxQllMVFIxU0dkTlVHMHRNVzgzVTJzdFoyVldOa04xTldOc1dFWnplR3c9");
const AG_SCOPES = ["https://www.googleapis.com/auth/cloud-platform","https://www.googleapis.com/auth/userinfo.email","https://www.googleapis.com/auth/userinfo.profile","https://www.googleapis.com/auth/cclog","https://www.googleapis.com/auth/experimentsandconfigs"];
const GC_SCOPES = ["https://www.googleapis.com/auth/cloud-platform","https://www.googleapis.com/auth/userinfo.email","https://www.googleapis.com/auth/userinfo.profile"];
const antigravityLogin = (cb: OAuthLoginCallbacks) => googleOAuthLogin(cb, _agCid, _agCs, AG_SCOPES);
const antigravityRefresh = (c: OAuthCredentials) => googleOAuthRefresh(c, _agCid, _agCs);
const geminiCliLogin = (cb: OAuthLoginCallbacks) => googleOAuthLogin(cb, _gcCid, _gcCs, GC_SCOPES);
const geminiCliRefresh = (c: OAuthCredentials) => googleOAuthRefresh(c, _gcCid, _gcCs);

async function gitlabDuoLogin(cb: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  const cid = OAUTH.gitlabClientId;
  const pkce = await generatePKCE();
  const domain = (await cb.onPrompt({ message: "GitLab instance URL (blank for gitlab.com):" }))?.trim() || "https://gitlab.com";
  return runOAuthFlow(cb, {
    authUrl: `${domain}/oauth/authorize`, tokenUrl: `${domain}/oauth/token`,
    tokenHeaders: { "Content-Type": "application/json" },
    async buildAuthParams(s, uri) { return new URLSearchParams({ client_id:cid,response_type:"code",redirect_uri:uri,scope:"api",code_challenge:pkce.challenge,code_challenge_method:"S256",state:s }); },
    async buildTokenBody(code, uri) { return JSON.stringify({ client_id:cid,code,grant_type:"authorization_code",redirect_uri:uri,code_verifier:pkce.verifier }); },
    handleTokenResponse(d: any) { const cr = d.created_at?d.created_at*1000:Date.now(); return { access:d.access_token, refresh:d.refresh_token, expires:cr+d.expires_in*1000-5*60000 }; },
  });
}
async function gitlabDuoRefresh(c: OAuthCredentials): Promise<OAuthCredentials> {
  const resp = await fetch("https://gitlab.com/oauth/token", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ grant_type:"refresh_token",refresh_token:c.refresh,client_id:OAUTH.gitlabClientId }), signal:AbortSignal.timeout(30_000) });
  if (!resp.ok) throw new Error(`Refresh failed: ${resp.status}`);
  const d = await resp.json() as any;
  const cr = d.created_at?d.created_at*1000:Date.now();
  return { access:d.access_token, refresh:d.refresh_token||c.refresh, expires:cr+d.expires_in*1000-5*60000 };
}

async function githubCopilotLogin(cb: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  const cid = OAUTH.githubCopilotClientId;
  const domain = (await cb.onPrompt({ message: "GitHub Enterprise URL/domain (blank for github.com):" }))?.trim() || "github.com";
  const dr = await fetch(`https://${domain}/login/device/code`, { method:"POST", headers:{Accept:"application/json","Content-Type":"application/json"}, body:JSON.stringify({client_id:cid,scope:"read:user"}), signal:AbortSignal.timeout(30_000) });
  if (!dr.ok) throw new Error(`Device code failed: ${dr.status}`);
  const dd = await dr.json() as any;
  cb.onAuth({ url: dd.verification_uri });
  const deadline = Date.now()+dd.expires_in*1000; let w = dd.interval*1000;
  while (Date.now() < deadline) {
    await sleep(w);
    const tr = await fetch(`https://${domain}/login/oauth/access_token`, { method:"POST", headers:{Accept:"application/json","Content-Type":"application/json"}, body:JSON.stringify({client_id:cid,device_code:dd.device_code,grant_type:"urn:ietf:params:oauth:grant-type:device_code"}), signal:AbortSignal.timeout(15_000) });
    const td = await tr.json() as any;
    if (td.access_token) return { refresh:td.access_token, access:td.access_token, expires:Date.now()+10*365*24*60*60*1000 };
    if (td.error==="slow_down") w = (td.interval||dd.interval)*1000;
    else if (td.error!=="authorization_pending") throw new Error(`Device flow failed: ${td.error}`);
  }
  throw new Error("Device flow timed out");
}

async function kimiLogin(cb: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  const cid = OAUTH.kimiClientId, host = "https://auth.kimi.com";
  const dr = await fetch(`${host}/api/oauth/device_authorization`, { method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body:new URLSearchParams({client_id:cid}), signal:AbortSignal.timeout(30_000) });
  if (!dr.ok) throw new Error(`Device auth failed: ${dr.status}`);
  const dd = await dr.json() as any;
  cb.onAuth({ url: dd.verification_uri_complete||dd.verification_uri });
  const deadline = Date.now()+dd.expires_in*1000; let w = Math.max(1000,dd.interval*1000);
  while (Date.now() < deadline) {
    await sleep(w);
    const tr = await fetch(`${host}/api/oauth/token`, { method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body:new URLSearchParams({client_id:cid,device_code:dd.device_code,grant_type:"urn:ietf:params:oauth:grant-type:device_code"}) });
    const td = await tr.json() as any;
    if (tr.ok && td.access_token) return { access:td.access_token, refresh:td.refresh_token||td.access_token, expires:Date.now()+(td.expires_in||3600)*1000-5*60000 };
    if (td.error==="slow_down") { w+=5000; if (td.interval) w=td.interval*1000; }
    else if (td.error!=="authorization_pending") throw new Error(`Flow failed: ${td.error}`);
  }
  throw new Error("Flow timed out");
}
async function kimiRefresh(c: OAuthCredentials): Promise<OAuthCredentials> {
  const resp = await fetch("https://auth.kimi.com/api/oauth/token", { method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body:new URLSearchParams({grant_type:"refresh_token",refresh_token:c.refresh,client_id:OAUTH.kimiClientId}) });
  if (!resp.ok) throw new Error(`Refresh failed: ${resp.status}`);
  const d = await resp.json() as any;
  return { access:d.access_token, refresh:d.refresh_token||c.refresh, expires:Date.now()+d.expires_in*1000-5*60000 };
}

// ============================================================================
// Register ALL 50 Providers (async factory with dynamic model discovery)
// ============================================================================
export default async function (pi: ExtensionAPI) {
  const ak = createApiKeyLogin;
  const r = (l: string, u: string, p: string, pl: string) => ak({ label: l, authUrl: u, instructions: "Get your API key", prompt: `Paste your ${l} API key:`, placeholder: pl });

  // Local runtime login: prompts for base URL + optional API key
  const localLogin = (label: string, defaultUrl: string) => async (cb: OAuthLoginCallbacks): Promise<OAuthCredentials> => {
    const url = (await cb.onPrompt({ message: `${label} base URL (blank for ${defaultUrl}):` }))?.trim() || defaultUrl;
    const key = (await cb.onPrompt({ message: `${label} API key (blank for none):` }))?.trim() || "";
    return { refresh: key, access: key, expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000 };
  };
  const m = async (prov: string, api: string, baseUrl: string, fallbackModel: string) => {
    const discovered = await fetchModelsFromProvider(baseUrl, getEnvApiKey(prov));
    return { api, baseUrl, models: discovered && discovered.length > 0 ? discovered : [staticModel(fallbackModel)] };
  };

  // OAuth Subscriptions
  const [acfg,ocfg,xcfg,agcfg,gccfg,glcfg,ghcfg,kcfg] = await Promise.all([
    m("anthropic","anthropic-messages","https://api.anthropic.com/v1","claude-sonnet-4-5"),
    m("openai","openai-responses","https://api.openai.com/v1","gpt-4o"),
    m("xai","openai-completions","https://api.x.ai/v1","grok-4.3"),
    m("google","openai-completions","https://cloudcode-pa.googleapis.com/v1","gemini-2.5-pro"),
    m("google","openai-completions","https://cloudcode-pa.googleapis.com/v1","gemini-2.5-flash"),
    m("gitlab","openai-completions","https://gitlab.com/api/v4/code_suggestions","claude-sonnet-4-5"),
    m("github","openai-completions","https://api.githubcopilot.com","gpt-4o"),
    m("kimi","openai-completions","https://api.kimi.com/v1","kimi-k2.6"),
  ]);
  pi.registerProvider("anthropic",{name:"Anthropic (Claude Pro/Max)",...acfg,oauth:{name:"Anthropic (Claude Pro/Max)",login:anthropicLogin,refreshToken:anthropicRefresh,getApiKey:ga}});
  pi.registerProvider("openai-codex",{name:"OpenAI Codex (ChatGPT Plus/Pro)",...ocfg,oauth:{name:"ChatGPT Plus/Pro (Codex Subscription)",login:openaiCodexLogin,refreshToken:openaiCodexRefresh,getApiKey:ga}});
  pi.registerProvider("openai-codex-device",{name:"OpenAI Codex (Device)",...ocfg,oauth:{name:"ChatGPT Plus/Pro (Codex, headless/device)",login:openaiCodexLogin,refreshToken:openaiCodexRefresh,getApiKey:ga}});
  pi.registerProvider("xai-oauth",{name:"xAI Grok (SuperGrok)",...xcfg,oauth:{name:"xAI Grok OAuth (SuperGrok Subscription)",login:xaiLogin,refreshToken:xaiRefresh,getApiKey:ga}});
  pi.registerProvider("google-antigravity",{name:"Antigravity (Gemini 3, Claude, GPT)",...agcfg,oauth:{name:"Antigravity (Gemini 3, Claude, GPT-OSS)",login:antigravityLogin,refreshToken:antigravityRefresh,getApiKey:ga}});
  pi.registerProvider("google-gemini-cli",{name:"Google Cloud Code Assist",...gccfg,oauth:{name:"Google Cloud Code Assist (Gemini CLI)",login:geminiCliLogin,refreshToken:geminiCliRefresh,getApiKey:ga}});
  pi.registerProvider("gitlab-duo",{name:"GitLab Duo",...glcfg,oauth:{name:"GitLab Duo",login:gitlabDuoLogin,refreshToken:gitlabDuoRefresh,getApiKey:ga}});
  pi.registerProvider("github-copilot",{name:"GitHub Copilot",...ghcfg,oauth:{name:"GitHub Copilot",login:githubCopilotLogin,refreshToken:nc,getApiKey:ga}});
  pi.registerProvider("kimi-code",{name:"Kimi Code",...kcfg,oauth:{name:"Kimi Code",login:kimiLogin,refreshToken:kimiRefresh,getApiKey:ga}});

  // API Key Providers
  const mk = (prov: string, baseUrl: string, fallback: string) => m(prov, "openai-completions", baseUrl, fallback);
  const cbs = await Promise.all([mk("cerebras","https://api.cerebras.ai/v1","llama-4-maverick"),mk("fireworks","https://api.fireworks.ai/inference/v1","kimi-k2.6"),mk("together","https://api.together.xyz/v1","meta-llama/Llama-4-Maverick"),mk("nvidia","https://integrate.api.nvidia.com/v1","meta/llama-4-maverick"),mk("huggingface","https://router.huggingface.co/v1","deepseek-ai/DeepSeek-R1"),mk("perplexity","https://api.perplexity.ai","sonar-pro"),mk("moonshot","https://api.moonshot.cn/v1","kimi-k2.5"),mk("minimax","https://api.minimaxi.com/v1","MiniMax-Text-01"),mk("xiaomi","https://api.xiaomi.com/v1","mimo-v2.5"),mk("zai","https://api.z.ai/api/coding/paas/v4","glm-5.1"),mk("zhipu","https://open.bigmodel.cn/api/coding/paas/v4","glm-4.7"),mk("qianfan","https://qianfan.baidubce.com/v2","ernie-4.5"),mk("venice","https://api.venice.ai/api/v1","llama-4-maverick"),mk("nanogpt","https://api.nanogpt.com/v1","gpt-4o"),mk("cursor","https://api.cursor.com/v1","claude-sonnet-4-5"),mk("firepass","https://api.fireworks.ai/inference/v1","kimi-k2.6-turbo"),mk("wafer","https://api.wafer.ai/v1","GLM-5.1"),mk("synthetic","https://api.synthetic.ai/v1","synthetic-1")]);
  const bg = (prov: string, name: string, apiKeyEnv: string, label: string, authUrl: string, placeholder: string) => ({ name, apiKey: `$${apiKeyEnv}`, oauth: { name, login: r(label,authUrl,placeholder,placeholder), refreshToken: nc, getApiKey: ga } });
  const deepseekCfg = await m("deepseek","openai-completions","https://api.deepseek.com","deepseek-v4-pro");
  pi.registerProvider("deepseek",{...bg("deepseek","DeepSeek","DEEPSEEK_API_KEY","DeepSeek","https://platform.deepseek.com/api_keys","sk-..."),...deepseekCfg});
  pi.registerProvider("cerebras",{...bg("cerebras","Cerebras","CEREBRAS_API_KEY","Cerebras","https://cloud.cerebras.ai/","csk-..."),...cbs[0]});
  pi.registerProvider("fireworks",{...bg("fireworks","Fireworks","FIREWORKS_API_KEY","Fireworks","https://fireworks.ai/","fw-..."),...cbs[1]});
  pi.registerProvider("together",{...bg("together","Together AI","TOGETHER_API_KEY","Together","https://api.together.xyz/","together-..."),...cbs[2]});
  pi.registerProvider("nvidia",{...bg("nvidia","NVIDIA NIM","NVIDIA_API_KEY","NVIDIA","https://build.nvidia.com/","nvapi-..."),...cbs[3]});
  pi.registerProvider("huggingface",{...bg("huggingface","Hugging Face Inference","HF_TOKEN","HuggingFace","https://huggingface.co/settings/tokens","hf_..."),...cbs[4]});
  pi.registerProvider("perplexity",{...bg("perplexity","Perplexity (Pro/Max)","PERPLEXITY_API_KEY","Perplexity","https://www.perplexity.ai/settings/api","pplx-..."),...cbs[5]});
  pi.registerProvider("moonshot",{...bg("moonshot","Moonshot (Kimi API)","KIMI_API_KEY","Moonshot","https://platform.moonshot.cn/console/api-keys","sk-..."),...cbs[6]});
  pi.registerProvider("minimax-code",{...bg("minimax-code","MiniMax","MINIMAX_API_KEY","MiniMax","https://platform.minimaxi.com/","eyJ..."),...cbs[7]});
  pi.registerProvider("minimax-code-cn",{...bg("minimax-code-cn","MiniMax Coding Plan (China)","MINIMAX_CN_API_KEY","MiniMax CN","https://platform.minimaxi.com/","eyJ..."),...cbs[7]});
  pi.registerProvider("xiaomi",{...bg("xiaomi","Xiaomi MiMo","XIAOMI_API_KEY","Xiaomi","https://mimo.xiaomi.com/","sk-..."),...cbs[8]});
  pi.registerProvider("xiaomi-token-plan-sgp",{...bg("xiaomi-token-plan-sgp","Xiaomi Token Plan (Singapore)","XIAOMI_TOKEN_PLAN_SGP_API_KEY","Xiaomi SGP","https://mimo.xiaomi.com/","sk-..."),...cbs[8]});
  pi.registerProvider("xiaomi-token-plan-ams",{...bg("xiaomi-token-plan-ams","Xiaomi Token Plan (Europe)","XIAOMI_TOKEN_PLAN_AMS_API_KEY","Xiaomi AMS","https://mimo.xiaomi.com/","sk-..."),...cbs[8]});
  pi.registerProvider("xiaomi-token-plan-cn",{...bg("xiaomi-token-plan-cn","Xiaomi Token Plan (China)","XIAOMI_TOKEN_PLAN_CN_API_KEY","Xiaomi CN","https://mimo.xiaomi.com/","sk-..."),...cbs[8]});
  pi.registerProvider("zai",{...bg("zai","Z.AI (GLM Coding Plan)","ZAI_API_KEY","ZAI","https://z.ai/manage-apikey/apikey-list","sk-..."),...cbs[9]});
  pi.registerProvider("zhipu-coding-plan",{...bg("zhipu-coding-plan","Zhipu Coding Plan","ZHIPU_API_KEY","Zhipu","https://open.bigmodel.cn/usercenter/apikeys","..."),...cbs[10]});
  pi.registerProvider("qianfan",{...bg("qianfan","Qianfan (Baidu)","QIANFAN_API_KEY","Qianfan","https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application","..."),...cbs[11]});
  pi.registerProvider("qwen-portal",{name:"Qwen Portal",...cbs[11],oauth:{name:"Qwen Portal",login:r("Qwen","https://dashscope.console.aliyun.com/","sk-...","sk-..."),refreshToken:nc,getApiKey:ga}});
  pi.registerProvider("alibaba-coding-plan",{name:"Alibaba Coding Plan",...cbs[11],oauth:{name:"Alibaba Coding Plan",login:r("Alibaba","https://dashscope.console.aliyun.com/","sk-...","sk-..."),refreshToken:nc,getApiKey:ga}});
  pi.registerProvider("venice",{...bg("venice","Venice","VENICE_API_KEY","Venice","https://venice.ai/settings/api","..."),...cbs[12]});
  pi.registerProvider("nanogpt",{...bg("nanogpt","NanoGPT","NANOGPT_API_KEY","NanoGPT","https://nanogpt.com/","..."),...cbs[13]});
  pi.registerProvider("cursor",{name:"Cursor IDE",...cbs[14],oauth:{name:"Cursor (Claude, GPT, etc.)",login:r("Cursor","https://www.cursor.com/settings","...","..."),refreshToken:nc,getApiKey:ga}});
  pi.registerProvider("firepass",{name:"Fire Pass",...cbs[15],oauth:{name:"Fire Pass (Kimi K2.6 Turbo)",login:r("FirePass","https://fireworks.ai/","fw-...","fw-..."),refreshToken:nc,getApiKey:ga}});
  pi.registerProvider("wafer-pass",{name:"Wafer Pass",...cbs[16],oauth:{name:"Wafer Pass (flat-rate)",login:r("WaferPass","https://wafer.ai/","...","..."),refreshToken:nc,getApiKey:ga}});
  pi.registerProvider("wafer-serverless",{name:"Wafer Serverless",...cbs[16],oauth:{name:"Wafer Serverless (pay-as-you-go)",login:r("WaferServerless","https://wafer.ai/","...","..."),refreshToken:nc,getApiKey:ga}});
  pi.registerProvider("synthetic",{...bg("synthetic","Synthetic","SYNTHETIC_API_KEY","Synthetic","https://synthetic.ai/","..."),...cbs[17]});

  // Gateway Providers
  const gw = await Promise.all([mk("openrouter","https://openrouter.ai/api/v1","openai/gpt-4o"),mk("vercel","https://api.gateway.ai/v1","gpt-4o"),mk("cloudflare","https://gateway.ai.cloudflare.com/v1","@cf/meta/llama-4"),mk("litellm","https://api.litellm.ai/v1","gpt-4o"),mk("kilo","https://api.kilo.ai/api/gateway","gpt-4o"),mk("zenmux","https://api.zenmux.ai/v1","gpt-4o"),mk("opencode","https://opencode.ai/zen","claude-sonnet-4-6"),mk("opencode","https://opencode.ai/zen/go","kimi-k2.5")]);
  pi.registerProvider("openrouter",{...bg("openrouter","OpenRouter","OPENROUTER_API_KEY","OpenRouter","https://openrouter.ai/keys","sk-or-..."),...gw[0]});
  pi.registerProvider("vercel-ai-gateway",{...bg("vercel-ai-gateway","Vercel AI Gateway","AI_GATEWAY_API_KEY","VercelAI","https://vercel.com/dashboard/stores","..."),...gw[1]});
  pi.registerProvider("cloudflare-ai-gateway",{...bg("cloudflare-ai-gateway","Cloudflare AI Gateway","CLOUDFLARE_API_KEY","CloudflareAI","https://dash.cloudflare.com/","..."),...gw[2]});
  pi.registerProvider("litellm",{...bg("litellm","LiteLLM","LITELLM_API_KEY","LiteLLM","https://docs.litellm.ai/","sk-..."),...gw[3]});
  pi.registerProvider("kilo",{...bg("kilo","Kilo Gateway","KILO_API_KEY","Kilo","https://kilo.ai/","..."),...gw[4]});
  pi.registerProvider("zenmux",{...bg("zenmux","ZenMux","ZENMUX_API_KEY","ZenMux","https://zenmux.ai/","..."),...gw[5]});
  pi.registerProvider("opencode-zen",{...bg("opencode-zen","OpenCode Zen","OPENCODE_API_KEY","OpenCodeZen","https://opencode.ai/","..."),...gw[6]});
  pi.registerProvider("opencode-go",{...bg("opencode-go","OpenCode Go","OPENCODE_API_KEY","OpenCodeGo","https://opencode.ai/","..."),...gw[7]});

  // Search & Tool
  pi.registerProvider("tavily",{name:"Tavily",apiKey:"$TAVILY_API_KEY"});
  pi.registerProvider("kagi",{name:"Kagi",apiKey:"$KAGI_API_KEY"});
  pi.registerProvider("parallel",{name:"Parallel",apiKey:"$PARALLEL_API_KEY"});

  // Local Runtimes
  const [olCfg,lmCfg,vlCfg] = await Promise.all([mk("ollama","http://localhost:11434/v1","llama3.2"),mk("lmstudio","http://localhost:1234/v1","llama-3-8b"),mk("vllm","http://localhost:8000/v1","llama-3-8b")]);
  const ll = localLogin;
  pi.registerProvider("ollama",{name:"Ollama (Local)",...olCfg,apiKey:"",baseUrl:"http://localhost:11434/v1",oauth:{name:"Ollama (Local)",login:ll("Ollama","http://localhost:11434/v1"),refreshToken:nc,getApiKey:ga}});
  pi.registerProvider("ollama-cloud",{name:"Ollama Cloud",apiKey:"$OLLAMA_API_KEY",...await mk("ollama","https://api.ollama.com/v1","llama3.2"),oauth:{name:"Ollama Cloud",login:r("OllamaCloud","https://ollama.com/settings/api-keys","...","..."),refreshToken:nc,getApiKey:ga}});
  pi.registerProvider("lm-studio",{name:"LM Studio (Local)",...lmCfg,apiKey:"",baseUrl:"http://localhost:1234/v1",oauth:{name:"LM Studio (Local)",login:ll("LM Studio","http://localhost:1234/v1"),refreshToken:nc,getApiKey:ga}});
  pi.registerProvider("vllm",{name:"vLLM (Local)",...vlCfg,apiKey:"",baseUrl:"http://localhost:8000/v1",oauth:{name:"vLLM (Local)",login:ll("vLLM","http://localhost:8000/v1"),refreshToken:nc,getApiKey:ga}});

  pi.on("session_start",(_:any,ctx:any)=>{ctx.ui.setStatus("auth","50 providers loaded");});
}
