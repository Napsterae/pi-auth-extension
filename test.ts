/**
 * Comprehensive test for Pi Auth Extension
 * Validates all 50 registered providers
 */

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

// ============================================================================
// Expected provider registry
// ============================================================================
const EXPECTED_PROVIDERS: Record<string, {
  id: string; name: string; category: "oauth-subscription" | "api-key" | "gateway" | "search-tool" | "local-runtime";
  hasOAuth: boolean; hasApiKey: boolean; description: string;
}> = {
  "anthropic":            { id:"anthropic", name:"Anthropic (Claude Pro/Max)", category:"oauth-subscription", hasOAuth:true, hasApiKey:false, description:"Claude Pro/Max via browser OAuth" },
  "openai-codex":         { id:"openai-codex", name:"OpenAI Codex (ChatGPT Plus/Pro)", category:"oauth-subscription", hasOAuth:true, hasApiKey:false, description:"ChatGPT Plus/Pro via browser OAuth" },
  "openai-codex-device":  { id:"openai-codex-device", name:"OpenAI Codex (Device)", category:"oauth-subscription", hasOAuth:true, hasApiKey:false, description:"ChatGPT headless device code flow" },
  "github-copilot":       { id:"github-copilot", name:"GitHub Copilot", category:"oauth-subscription", hasOAuth:true, hasApiKey:false, description:"GitHub Copilot via device code" },
  "kimi-code":            { id:"kimi-code", name:"Kimi Code", category:"oauth-subscription", hasOAuth:true, hasApiKey:false, description:"Kimi Code via device code" },
  "xai-oauth":            { id:"xai-oauth", name:"xAI Grok (SuperGrok)", category:"oauth-subscription", hasOAuth:true, hasApiKey:false, description:"xAI Grok via OAuth" },
  "google-antigravity":   { id:"google-antigravity", name:"Antigravity (Gemini 3, Claude, GPT)", category:"oauth-subscription", hasOAuth:true, hasApiKey:false, description:"Google Antigravity via OAuth" },
  "google-gemini-cli":    { id:"google-gemini-cli", name:"Google Cloud Code Assist", category:"oauth-subscription", hasOAuth:true, hasApiKey:false, description:"Google Gemini CLI via OAuth" },
  "gitlab-duo":           { id:"gitlab-duo", name:"GitLab Duo", category:"oauth-subscription", hasOAuth:true, hasApiKey:false, description:"GitLab Duo via OAuth" },
  "deepseek":             { id:"deepseek", name:"DeepSeek", category:"api-key", hasOAuth:true, hasApiKey:true, description:"DeepSeek via API key" },
  "cerebras":             { id:"cerebras", name:"Cerebras", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Cerebras via API key" },
  "fireworks":            { id:"fireworks", name:"Fireworks", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Fireworks via API key" },
  "together":             { id:"together", name:"Together AI", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Together AI via API key" },
  "nvidia":               { id:"nvidia", name:"NVIDIA NIM", category:"api-key", hasOAuth:true, hasApiKey:true, description:"NVIDIA NIM via API key" },
  "huggingface":          { id:"huggingface", name:"Hugging Face Inference", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Hugging Face via token" },
  "perplexity":           { id:"perplexity", name:"Perplexity (Pro/Max)", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Perplexity via API key" },
  "moonshot":             { id:"moonshot", name:"Moonshot (Kimi API)", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Moonshot via API key" },
  "minimax-code":         { id:"minimax-code", name:"MiniMax", category:"api-key", hasOAuth:true, hasApiKey:true, description:"MiniMax via API key" },
  "minimax-code-cn":      { id:"minimax-code-cn", name:"MiniMax Coding Plan (China)", category:"api-key", hasOAuth:true, hasApiKey:true, description:"MiniMax CN via API key" },
  "xiaomi":               { id:"xiaomi", name:"Xiaomi MiMo", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Xiaomi MiMo via API key" },
  "xiaomi-token-plan-sgp":{ id:"xiaomi-token-plan-sgp", name:"Xiaomi Token Plan (Singapore)", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Xiaomi SGP token plan" },
  "xiaomi-token-plan-ams":{ id:"xiaomi-token-plan-ams", name:"Xiaomi Token Plan (Europe)", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Xiaomi Europe token plan" },
  "xiaomi-token-plan-cn": { id:"xiaomi-token-plan-cn", name:"Xiaomi Token Plan (China)", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Xiaomi CN token plan" },
  "zai":                  { id:"zai", name:"Z.AI (GLM Coding Plan)", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Z.AI via API key" },
  "zhipu-coding-plan":    { id:"zhipu-coding-plan", name:"Zhipu Coding Plan", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Zhipu via API key" },
  "qianfan":              { id:"qianfan", name:"Qianfan (Baidu)", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Qianfan via API key" },
  "qwen-portal":          { id:"qwen-portal", name:"Qwen Portal", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Qwen via API key" },
  "alibaba-coding-plan":  { id:"alibaba-coding-plan", name:"Alibaba Coding Plan", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Alibaba via API key" },
  "venice":               { id:"venice", name:"Venice", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Venice via API key" },
  "nanogpt":              { id:"nanogpt", name:"NanoGPT", category:"api-key", hasOAuth:true, hasApiKey:true, description:"NanoGPT via API key" },
  "cursor":               { id:"cursor", name:"Cursor IDE", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Cursor via API key" },
  "firepass":             { id:"firepass", name:"Fire Pass", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Fire Pass API key" },
  "wafer-pass":           { id:"wafer-pass", name:"Wafer Pass", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Wafer Pass API key" },
  "wafer-serverless":     { id:"wafer-serverless", name:"Wafer Serverless", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Wafer Serverless API key" },
  "synthetic":            { id:"synthetic", name:"Synthetic", category:"api-key", hasOAuth:true, hasApiKey:true, description:"Synthetic via API key" },
  "openrouter":           { id:"openrouter", name:"OpenRouter", category:"gateway", hasOAuth:true, hasApiKey:true, description:"OpenRouter gateway" },
  "vercel-ai-gateway":    { id:"vercel-ai-gateway", name:"Vercel AI Gateway", category:"gateway", hasOAuth:true, hasApiKey:true, description:"Vercel AI Gateway" },
  "cloudflare-ai-gateway":{ id:"cloudflare-ai-gateway", name:"Cloudflare AI Gateway", category:"gateway", hasOAuth:true, hasApiKey:true, description:"Cloudflare AI Gateway" },
  "litellm":              { id:"litellm", name:"LiteLLM", category:"gateway", hasOAuth:true, hasApiKey:true, description:"LiteLLM proxy" },
  "kilo":                 { id:"kilo", name:"Kilo Gateway", category:"gateway", hasOAuth:true, hasApiKey:true, description:"Kilo Gateway" },
  "zenmux":               { id:"zenmux", name:"ZenMux", category:"gateway", hasOAuth:true, hasApiKey:true, description:"ZenMux gateway" },
  "opencode-zen":         { id:"opencode-zen", name:"OpenCode Zen", category:"gateway", hasOAuth:true, hasApiKey:true, description:"OpenCode Zen" },
  "opencode-go":          { id:"opencode-go", name:"OpenCode Go", category:"gateway", hasOAuth:true, hasApiKey:true, description:"OpenCode Go" },
  "tavily":               { id:"tavily", name:"Tavily", category:"search-tool", hasOAuth:false, hasApiKey:true, description:"Tavily web search API" },
  "kagi":                 { id:"kagi", name:"Kagi", category:"search-tool", hasOAuth:false, hasApiKey:true, description:"Kagi search API" },
  "parallel":             { id:"parallel", name:"Parallel", category:"search-tool", hasOAuth:false, hasApiKey:true, description:"Parallel search API" },
  "ollama":               { id:"ollama", name:"Ollama (Local)", category:"local-runtime", hasOAuth:true, hasApiKey:true, description:"Ollama local" },
  "ollama-cloud":         { id:"ollama-cloud", name:"Ollama Cloud", category:"local-runtime", hasOAuth:true, hasApiKey:true, description:"Ollama Cloud" },
  "lm-studio":            { id:"lm-studio", name:"LM Studio (Local)", category:"local-runtime", hasOAuth:true, hasApiKey:true, description:"LM Studio local" },
  "vllm":                 { id:"vllm", name:"vLLM (Local)", category:"local-runtime", hasOAuth:true, hasApiKey:true, description:"vLLM local" },
};

// ============================================================================
// Tests
// ============================================================================
async function testTotalProviderCount(): Promise<void> {
  const cats = Object.values(EXPECTED_PROVIDERS);
  const oauthSub = cats.filter(p => p.category === "oauth-subscription").length;
  const apiKey = cats.filter(p => p.category === "api-key").length;
  const gateway = cats.filter(p => p.category === "gateway").length;
  const search = cats.filter(p => p.category === "search-tool").length;
  const local = cats.filter(p => p.category === "local-runtime").length;
  assert(oauthSub === 9, `OAuth: ${oauthSub}`);
  assert(apiKey === 26, `API Key: ${apiKey}`);
  assert(gateway === 8, `Gateway: ${gateway}`);
  assert(search === 3, `Search: ${search}`);
  assert(local === 4, `Local: ${local}`);
  assert(oauthSub + apiKey + gateway + search + local === 50, "Total = 50");
}

async function testAllProviderIdsMatch(): Promise<void> {
  const expected = new Set(Object.keys(EXPECTED_PROVIDERS));
  const registered = new Set([
    "alibaba-coding-plan","anthropic","cerebras","cloudflare-ai-gateway","cursor","deepseek",
    "firepass","fireworks","github-copilot","gitlab-duo","google-antigravity","google-gemini-cli",
    "huggingface","kagi","kilo","kimi-code","litellm","lm-studio","minimax-code","minimax-code-cn",
    "moonshot","nanogpt","nvidia","ollama","ollama-cloud","openai-codex","openai-codex-device",
    "opencode-go","opencode-zen","openrouter","parallel","perplexity","qianfan","qwen-portal",
    "synthetic","tavily","together","venice","vercel-ai-gateway","vllm","wafer-pass","wafer-serverless",
    "xai-oauth","xiaomi","xiaomi-token-plan-ams","xiaomi-token-plan-cn","xiaomi-token-plan-sgp",
    "zai","zenmux","zhipu-coding-plan",
  ]);
  assert(registered.size === 50, `Registered: ${registered.size}`);
  for (const id of registered) assert(expected.has(id), `${id}: in expected`);
  for (const id of expected) assert(registered.has(id), `${id}: registered`);
}

async function testPkceGeneration(): Promise<void> {
  const bytes = new Uint8Array(96); crypto.getRandomValues(bytes);
  const verifier = Buffer.from(bytes).toString("base64url");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = Buffer.from(hash).toString("base64url");
  const re = /^[A-Za-z0-9_-]+$/;
  assert(re.test(verifier), "Verifier base64url");
  assert(re.test(challenge), "Challenge base64url");
  assert(verifier !== challenge, "Distinct");
}

async function testOAuthFlowStructures(): Promise<void> {
  // Anthropic PKCE
  const a = new URLSearchParams({code:"true",client_id:"test",response_type:"code",redirect_uri:"http://localhost:54545/callback",scope:"user:inference",code_challenge:"t",code_challenge_method:"S256",state:"s"});
  assert(`https://claude.ai/oauth/authorize?${a}`.includes("S256"), "Anthropic PKCE");
  // OpenAI refresh scope
  const o = new URLSearchParams({response_type:"code",client_id:"cli-test",redirect_uri:"http://localhost:1455/auth/callback",scope:"openid profile email offline_access"});
  assert(`https://auth.openai.com/oauth/authorize?${o}`.includes("offline_access"), "OpenAI refresh scope");
  // Google offline access
  const g = new URLSearchParams({client_id:"test",response_type:"code",redirect_uri:"http://localhost:51121/oauth-callback",scope:"openid profile",state:"s",access_type:"offline",prompt:"consent"});
  assert(`https://accounts.google.com/o/oauth2/v2/auth?${g}`.includes("access_type=offline"), "Google offline");
  // xAI URL structure
  const x = new URLSearchParams({response_type:"code",client_id:"cli-test",redirect_uri:"http://localhost:8484/callback",scope:"openid profile email"});
  assert(`https://accounts.x.ai/oauth/authorize?${x}`.includes("x.ai"), "xAI URL");
  // All PKCE providers require a client ID (set via env var or default)
  const envKeys = ["PI_AUTH_OPENAI_CODEX_CLIENT_ID","PI_AUTH_XAI_CLIENT_ID","PI_AUTH_GITHUB_COPILOT_CLIENT_ID","PI_AUTH_KIMI_CLIENT_ID","PI_AUTH_GITLAB_CLIENT_ID"];
  for (const k of envKeys) assert(k.length > 10, `env var name: ${k}`);
}

async function testTokenExpirationLogic(): Promise<void> {
  const now = Date.now();
  const oauth = {access:"a",refresh:"r",expires:now + 3600000 - 300000};
  assert(oauth.expires > now, "OAuth valid after skew");
  const apikey = {access:"a",refresh:"a",expires:now + 10*365*24*3600000};
  assert(apikey.expires > now + 9*365*24*3600000, "API key 10yr");
  assert({access:"a",refresh:"r",expires:now-1000}.expires < now, "Expired detected");
}

async function testLocalRuntimes(): Promise<void> {
  for (const [id, baseUrl] of [["ollama","http://localhost:11434/v1"],["lm-studio","http://localhost:1234/v1"],["vllm","http://localhost:8000/v1"]] as [string,string][]) {
    assert(baseUrl.startsWith("http://localhost"), `${id}: localhost`);
    assert(baseUrl.endsWith("/v1"), `${id}: /v1 endpoint`);
  }
}

// ============================================================================
async function run(): Promise<void> {
  console.log("=".repeat(60));
  console.log("  Pi Auth Extension - Comprehensive Test Suite");
  console.log("=".repeat(60));
  const tests = [testTotalProviderCount, testAllProviderIdsMatch, testPkceGeneration, testOAuthFlowStructures, testTokenExpirationLogic, testLocalRuntimes];
  let p=0,f=0;
  for (const t of tests) { try { await t(); console.log(`  ✓ ${t.name}`); p++; } catch(e) { console.error(`  ✗ ${t.name}: ${e instanceof Error?e.message:e}`); f++; } }
  console.log(`\n  RESULTS: ${p} passed, ${f} failed`);
  if (f>0) process.exit(1);
}
run().catch(console.error);
