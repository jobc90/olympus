/** Statusline sidecar data from CLI plugin (~/.olympus/statusline.json) */
export interface StatuslineUsageData {
  timestamp: number;
  model: { id: string; displayName: string } | null;
  context: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    contextSize: number;
    percentage: number;
  } | null;
  cost: { totalCostUsd: number } | null;
  rateLimit5h: { utilization: number; resetsAt: string | null; isError?: boolean } | null;
  rateLimit7d: { utilization: number; resetsAt: string | null; isError?: boolean } | null;
  projectInfo: { dirName: string; gitBranch?: string } | null;
  burnRate: { tokensPerMinute: number } | null;
  sessionDuration: { elapsedMs: number } | null;
  todoProgress: {
    current?: { content: string; status: 'in_progress' | 'pending' };
    completed: number;
    total: number;
  } | null;
  codexUsage: {
    model: string;
    planType: string;
    primaryPercent: number | null;
    primaryResetAt: number | null;
    secondaryPercent: number | null;
    secondaryResetAt: number | null;
    isError?: boolean;
  } | null;
  geminiUsage: {
    model: string;
    usedPercent: number | null;
    resetAt: string | null;
    isError?: boolean;
  } | null;
}
