/** Agent execution result */
export interface AgentResult {
  success: boolean;
  output: string;
  error?: string;
  agent: 'gemini' | 'gpt';
  model: string;
  durationMs?: number;
}

/** Merged result from parallel execution */
export interface MergedResult {
  gemini: AgentResult | null;
  gpt: AgentResult | null;
  durationMs: number;
}

/** Options for orchestrator */
export interface OrchestratorOptions {
  prompt: string;
  usePro?: boolean;
  agents?: ('gemini' | 'gpt')[];
  context?: string;
  timeout?: number;
}

/** Agent executor interface */
export interface AgentExecutor {
  readonly name: 'gemini' | 'gpt';
  execute(prompt: string, options?: ExecuteOptions): Promise<AgentResult>;
  checkAuth(): Promise<boolean>;
}

/** Execute options for individual agent */
export interface ExecuteOptions {
  model?: string;
  usePro?: boolean;
  timeout?: number;
  signal?: AbortSignal;                    // For cancellation support
  onChunk?: (chunk: string) => void;       // Streaming callback
}

/** Agent metadata */
export interface AgentMetadata {
  name: string;
  role: string;
  domains: string[];
  triggers: string[];
}

/** Delegation table entry */
export interface DelegationEntry {
  domain: string;
  keywords: string[];
  agent: 'gemini' | 'gpt';
}

/** Olympus configuration */
export interface OlympusConfig {
  configDir: string;
  defaultAgents: ('gemini' | 'gpt')[];
  gemini: {
    defaultModel: string;
    proModel: string;
    fallbackModel: string;
    fallbackProModel: string;
  };
  gpt: {
    defaultModel: string;
    apiBaseUrl: string;
  };
  webPort: number;
}

/** Credentials stored in ~/.olympus/ */
export interface Credentials {
  gemini?: {
    oauthToken?: string;
    refreshToken?: string;
  };
  openai?: {
    apiKey: string;
  };
}

/** Wisdom entry */
export interface WisdomEntry {
  id: string;
  type: 'pattern' | 'lesson';
  content: string;
  timestamp: string;
}

/** Run history entry */
export interface HistoryEntry {
  id: string;
  prompt: string;
  result: MergedResult;
  timestamp: string;
}
