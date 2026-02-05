import React from 'react';
import { SparkyMascot } from './SparkyMascot';
import { Card } from './Card';

interface Props {
  config: { host: string; port: number };
  hasRuns: boolean;
  hasSessions?: boolean;
}

export function EmptyState({ config, hasRuns, hasSessions }: Props) {
  const hasAnySessions = hasRuns || hasSessions;

  return (
    <Card className="text-center py-12">
      <div className="flex justify-center mb-4">
        <SparkyMascot size="lg" animated={false} />
      </div>

      <h2 className="text-xl font-semibold text-text mb-2">
        {hasAnySessions ? 'Select a Session' : 'Ready to Roll!'}
      </h2>

      <p className="text-text-secondary mb-6 max-w-md mx-auto">
        {hasAnySessions
          ? hasRuns
            ? 'Click on an orchestration run from the list to view its progress.'
            : 'Claude CLI sessions are active. Start an orchestration run to track progress here.'
          : 'No active sessions yet. Start one using the CLI to begin orchestrating your AI agents.'}
      </p>

      <div className="bg-background rounded-lg p-4 text-left max-w-md mx-auto border border-border">
        <p className="text-xs text-text-muted mb-2 font-semibold">Quick Start</p>
        <code className="text-sm text-primary font-mono block">
          olympus run "your prompt"
        </code>
        <p className="text-xs text-text-muted mt-3 mb-2 font-semibold">With Gateway</p>
        <code className="text-xs text-text-secondary font-mono block leading-relaxed">
          olympus run "your prompt" \<br />
          {'  '}--gateway http://{config.host}:{config.port}
        </code>
      </div>
    </Card>
  );
}
