import React, { useRef, useEffect } from 'react';
import type { WorkerInfo } from '../hooks/useOlympus';

interface WorkerDetailModalProps {
  worker: WorkerInfo;
  onClose: () => void;
  onTerminate?: (workerId: string) => void;
}

const STATUS_ICON: Record<string, string> = {
  running: '⚡',
  completed: '✅',
  failed: '❌',
};

export function WorkerDetailModal({ worker, onClose, onTerminate }: WorkerDetailModalProps) {
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [worker.output]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-lg">{STATUS_ICON[worker.status] ?? '⚡'}</span>
            <span className="font-mono text-sm text-text-secondary">{worker.workerId}</span>
            <span className={`text-xs px-2 py-0.5 rounded ${
              worker.status === 'running' ? 'bg-success/10 text-success' :
              worker.status === 'completed' ? 'bg-primary/10 text-primary' :
              'bg-error/10 text-error'
            }`}>
              {worker.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {worker.status === 'running' && onTerminate && (
              <button
                onClick={() => onTerminate(worker.workerId)}
                className="text-xs px-3 py-1 bg-error/10 text-error rounded hover:bg-error/20 transition-colors"
              >
                Terminate
              </button>
            )}
            <button onClick={onClose} className="text-text-muted hover:text-text-secondary transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Metadata */}
        <div className="px-4 py-2 border-b border-border/50 text-xs text-text-muted">
          <span>Project: <span className="text-text-secondary">{worker.projectPath || 'N/A'}</span></span>
        </div>

        {/* Output */}
        <pre
          ref={outputRef}
          className="flex-1 p-4 font-mono text-xs text-text-secondary overflow-y-auto custom-scrollbar whitespace-pre-wrap leading-relaxed"
        >
          {worker.output || '(No output yet)'}
        </pre>
      </div>
    </div>
  );
}
