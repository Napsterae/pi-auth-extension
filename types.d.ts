/**
 * Type declarations for pi-coding-agent
 * These are simplified types for development purposes.
 * The actual types come from @earendil-works/pi-coding-agent at runtime.
 */

declare module "@earendil-works/pi-coding-agent" {
  export interface ExtensionAPI {
    registerProvider(name: string, config: ProviderConfig): void;
    unregisterProvider(name: string): void;
    registerTool(tool: ToolDefinition): void;
    registerCommand(name: string, command: CommandDefinition): void;
    on(event: string, handler: (...args: any[]) => any): void;
    sendUserMessage(content: string | any[], options?: any): void;
    sendMessage(message: any, options?: any): void;
    setSessionName(name: string): void;
    getSessionName(): string | undefined;
    setLabel(entryId: string, label: string | undefined): void;
    appendEntry(customType: string, data?: any): void;
    getAllTools(): any[];
    setActiveTools(tools: string[]): void;
    setThinkingLevel(level: string): void;
    getThinkingLevel(): string;
  }

  export interface ProviderConfig {
    name?: string;
    baseUrl?: string;
    apiKey?: string;
    api?: string;
    headers?: Record<string, string>;
    authHeader?: boolean;
    models?: any[];
    oauth?: OAuthConfig;
    streamSimple?: any;
  }

  export interface OAuthConfig {
    name: string;
    login: (callbacks: OAuthLoginCallbacks) => Promise<OAuthCredentials>;
    refreshToken: (credentials: OAuthCredentials) => OAuthCredentials | Promise<OAuthCredentials>;
    getApiKey: (credentials: OAuthCredentials) => string;
    modifyModels?: (models: any[], credentials: OAuthCredentials) => any[];
  }

  export interface OAuthLoginCallbacks {
    onAuth: (params: { url: string; instructions?: string }) => void;
    onDeviceCode: (params: {
      userCode: string;
      verificationUri: string;
      intervalSeconds?: number;
      expiresInSeconds?: number;
    }) => void;
    onPrompt: (params: { message: string; placeholder?: string }) => Promise<string>;
    onSelect: (params: {
      message: string;
      options: { id: string; label: string }[];
    }) => Promise<string | undefined>;
  }

  export interface OAuthCredentials {
    refresh: string;
    access: string;
    expires: number;
    enterpriseUrl?: string;
    projectId?: string;
    email?: string;
    accountId?: string;
  }

  export interface ToolDefinition {
    name: string;
    label: string;
    description: string;
    parameters: any;
    execute: (
      toolCallId: string,
      params: any,
      signal: AbortSignal | undefined,
      onUpdate: ((update: any) => void) | undefined,
      ctx: any
    ) => Promise<any>;
  }

  export interface CommandDefinition {
    description?: string;
    getArgumentCompletions?: (prefix: string) => any[];
    handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
  }

  export interface ExtensionCommandContext {
    ui: {
      notify(message: string, type: "info" | "success" | "error" | "warning"): void;
      input(message: string, options?: { placeholder?: string }): Promise<string>;
      setStatus(id: string, message: string): void;
      setWidget(id: string, lines: string[]): void;
    };
    sessionManager: any;
    model?: { provider: string; id: string };
    signal?: AbortSignal;
    cwd: string;
    mode: string;
    hasUI: boolean;
    sendUserMessage(content: string | any[], options?: any): Promise<void>;
    newSession(options?: any): Promise<any>;
    fork(entryId: string, options?: any): Promise<any>;
    reload(): Promise<void>;
    shutdown(): void;
    waitForIdle(): Promise<void>;
    compact(options?: any): void;
    getContextUsage(): any;
    getSystemPrompt(): string;
    getSystemPromptOptions(): any;
  }
}
