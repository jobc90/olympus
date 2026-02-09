import React from 'react';

export interface ApprovalRequestData {
  taskId: string;
  command: string;
  analysis: {
    intent: string;
    complexity: string;
    targetProject: string;
    requirements: string[];
    risks: string[];
    useOrchestration: boolean;
    estimatedDuration: string;
  };
  plan: {
    strategy: string;
    workers: Array<{ id: string; prompt: string; projectPath: string; orchestration: boolean }>;
    rollbackStrategy: string;
    totalEstimate: string;
  };
}

interface AgentApprovalDialogProps {
  request: ApprovalRequestData;
  onApprove: (taskId: string) => void;
  onReject: (taskId: string) => void;
}

export function AgentApprovalDialog({ request, onApprove, onReject }: AgentApprovalDialogProps) {
  const { analysis, plan } = request;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-warning/30 rounded-xl w-full max-w-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 p-4 border-b border-border bg-warning/5 rounded-t-xl">
          <span className="text-xl">⚠️</span>
          <div>
            <h2 className="text-sm font-semibold text-text-secondary">Approval Required</h2>
            <p className="text-xs text-text-muted">This action requires your confirmation before proceeding.</p>
          </div>
        </div>

        {/* Command */}
        <div className="p-4 border-b border-border/50">
          <div className="text-xs text-text-muted mb-1">Command</div>
          <div className="text-sm text-text-secondary font-medium">{request.command}</div>
        </div>

        {/* Analysis Summary */}
        <div className="p-4 border-b border-border/50 grid grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-text-muted">Intent</div>
            <div className="text-xs text-text-secondary font-mono">{analysis.intent}</div>
          </div>
          <div>
            <div className="text-xs text-text-muted">Complexity</div>
            <div className={`text-xs font-mono ${
              analysis.complexity === 'complex' ? 'text-error' :
              analysis.complexity === 'moderate' ? 'text-warning' : 'text-success'
            }`}>{analysis.complexity}</div>
          </div>
          <div>
            <div className="text-xs text-text-muted">Duration</div>
            <div className="text-xs text-text-secondary font-mono">{analysis.estimatedDuration || plan.totalEstimate}</div>
          </div>
        </div>

        {/* Plan Details */}
        <div className="p-4 border-b border-border/50">
          <div className="text-xs text-text-muted mb-2">
            Execution Plan — <span className="text-primary">{plan.strategy}</span> strategy, {plan.workers.length} worker{plan.workers.length > 1 ? 's' : ''}
          </div>
          <div className="space-y-1.5">
            {plan.workers.map((w, i) => (
              <div key={w.id} className="flex items-start gap-2 text-xs">
                <span className="text-text-muted flex-shrink-0">#{i + 1}</span>
                <div className="min-w-0">
                  <span className="text-text-secondary line-clamp-1">{w.prompt}</span>
                  <span className="text-text-muted ml-1">({w.projectPath})</span>
                  {w.orchestration && <span className="text-primary ml-1">[/orchestration]</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Risks */}
        {analysis.risks.length > 0 && (
          <div className="p-4 border-b border-border/50">
            <div className="text-xs text-error mb-1">Risks</div>
            <ul className="text-xs text-text-muted space-y-0.5">
              {analysis.risks.map((r, i) => (
                <li key={i}>• {r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-4">
          <button
            onClick={() => onReject(request.taskId)}
            className="px-4 py-2 text-sm text-text-muted hover:text-error border border-border rounded-lg hover:border-error/30 transition-colors"
          >
            Reject
          </button>
          <button
            onClick={() => onApprove(request.taskId)}
            className="px-4 py-2 text-sm text-white bg-primary hover:bg-primary/80 rounded-lg transition-colors"
          >
            Approve & Execute
          </button>
        </div>
      </div>
    </div>
  );
}
