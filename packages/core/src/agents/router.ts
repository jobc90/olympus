import type { AgentMetadata, DelegationEntry } from '../types.js';

/** Agent metadata definitions */
export const AGENT_METADATA: Record<string, AgentMetadata> = {
  gemini: {
    name: 'Gemini',
    role: 'Frontend Advisor + Architect',
    domains: ['ui', 'component', 'styling', 'react', 'nextjs', 'css', 'tailwind', 'design', 'layout'],
    triggers: ['frontend', 'ui', 'component', 'design', 'style', 'react', 'next'],
  },
  codex: {
    name: 'Codex',
    role: 'Backend Advisor + Implementation',
    domains: ['api', 'database', 'server', 'auth', 'testing', 'infra', 'devops', 'architecture'],
    triggers: ['backend', 'api', 'database', 'server', 'test', 'infra', 'deploy'],
  },
};

// Backward compatibility for legacy agent id.
AGENT_METADATA.gpt = AGENT_METADATA.codex;

/** Domain-based delegation table */
export const DELEGATION_TABLE: DelegationEntry[] = [
  { domain: 'frontend', keywords: ['react', 'next', 'component', 'css', 'tailwind', 'ui', 'ux', 'styling', 'layout', 'responsive'], agent: 'gemini' },
  { domain: 'design', keywords: ['figma', 'design', 'mockup', 'wireframe', 'prototype', 'color', 'font', 'typography'], agent: 'gemini' },
  { domain: 'backend', keywords: ['api', 'rest', 'graphql', 'server', 'express', 'nest', 'middleware', 'controller'], agent: 'codex' },
  { domain: 'database', keywords: ['sql', 'postgres', 'mysql', 'mongo', 'prisma', 'migration', 'schema', 'query'], agent: 'codex' },
  { domain: 'testing', keywords: ['test', 'jest', 'vitest', 'playwright', 'cypress', 'coverage', 'mock'], agent: 'codex' },
  { domain: 'infra', keywords: ['docker', 'ci', 'cd', 'deploy', 'kubernetes', 'terraform', 'aws', 'gcp'], agent: 'codex' },
];

/** Detect which agent should handle a prompt based on keywords */
export function detectAgent(prompt: string): 'gemini' | 'codex' | 'both' {
  const lower = prompt.toLowerCase();
  let geminiScore = 0;
  let codexScore = 0;

  for (const entry of DELEGATION_TABLE) {
    for (const keyword of entry.keywords) {
      if (lower.includes(keyword)) {
        if (entry.agent === 'gemini') geminiScore++;
        else codexScore++;
      }
    }
  }

  if (geminiScore > 0 && codexScore === 0) return 'gemini';
  if (codexScore > 0 && geminiScore === 0) return 'codex';
  return 'both';
}
