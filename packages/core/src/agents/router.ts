import type { AgentMetadata, DelegationEntry } from '../types.js';

/** Agent metadata definitions */
export const AGENT_METADATA: Record<string, AgentMetadata> = {
  gemini: {
    name: 'Gemini',
    role: 'Frontend Advisor + Architect',
    domains: ['ui', 'component', 'styling', 'react', 'nextjs', 'css', 'tailwind', 'design', 'layout'],
    triggers: ['frontend', 'ui', 'component', 'design', 'style', 'react', 'next'],
  },
  gpt: {
    name: 'GPT',
    role: 'Backend Advisor + Implementation',
    domains: ['api', 'database', 'server', 'auth', 'testing', 'infra', 'devops', 'architecture'],
    triggers: ['backend', 'api', 'database', 'server', 'test', 'infra', 'deploy'],
  },
};

/** Domain-based delegation table */
export const DELEGATION_TABLE: DelegationEntry[] = [
  { domain: 'frontend', keywords: ['react', 'next', 'component', 'css', 'tailwind', 'ui', 'ux', 'styling', 'layout', 'responsive'], agent: 'gemini' },
  { domain: 'design', keywords: ['figma', 'design', 'mockup', 'wireframe', 'prototype', 'color', 'font', 'typography'], agent: 'gemini' },
  { domain: 'backend', keywords: ['api', 'rest', 'graphql', 'server', 'express', 'nest', 'middleware', 'controller'], agent: 'gpt' },
  { domain: 'database', keywords: ['sql', 'postgres', 'mysql', 'mongo', 'prisma', 'migration', 'schema', 'query'], agent: 'gpt' },
  { domain: 'testing', keywords: ['test', 'jest', 'vitest', 'playwright', 'cypress', 'coverage', 'mock'], agent: 'gpt' },
  { domain: 'infra', keywords: ['docker', 'ci', 'cd', 'deploy', 'kubernetes', 'terraform', 'aws', 'gcp'], agent: 'gpt' },
];

/** Detect which agent should handle a prompt based on keywords */
export function detectAgent(prompt: string): 'gemini' | 'gpt' | 'both' {
  const lower = prompt.toLowerCase();
  let geminiScore = 0;
  let gptScore = 0;

  for (const entry of DELEGATION_TABLE) {
    for (const keyword of entry.keywords) {
      if (lower.includes(keyword)) {
        if (entry.agent === 'gemini') geminiScore++;
        else gptScore++;
      }
    }
  }

  if (geminiScore > 0 && gptScore === 0) return 'gemini';
  if (gptScore > 0 && geminiScore === 0) return 'gpt';
  return 'both';
}
