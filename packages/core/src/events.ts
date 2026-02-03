import { EventEmitter } from 'node:events';
import type { PhasePayload, AgentPayload, TaskPayload, LogPayload } from '@olympus-dev/protocol';

export interface OlympusEvents {
  'phase:change': [PhasePayload];
  'agent:start': [AgentPayload];
  'agent:chunk': [AgentPayload];
  'agent:complete': [AgentPayload];
  'agent:error': [AgentPayload];
  'task:update': [TaskPayload];
  'log': [LogPayload];
}

/**
 * OlympusBus - Event bus for Olympus orchestration
 *
 * Can be used as:
 * 1. Singleton (legacy): OlympusBus.getInstance()
 * 2. Run-scoped instance: OlympusBus.create(runId)
 */
export class OlympusBus extends EventEmitter<OlympusEvents> {
  private static instance: OlympusBus | null = null;

  /** The run ID this bus is scoped to (undefined for global singleton) */
  public readonly runId: string | undefined;

  constructor(runId?: string) {
    super();
    this.runId = runId;
  }

  /** Get or create singleton instance (for backward compatibility) */
  static getInstance(): OlympusBus {
    if (!OlympusBus.instance) {
      OlympusBus.instance = new OlympusBus();
    }
    return OlympusBus.instance;
  }

  /** Create a new run-scoped bus instance */
  static create(runId: string): OlympusBus {
    return new OlympusBus(runId);
  }

  /** Reset singleton (for testing) */
  static reset(): void {
    OlympusBus.instance?.removeAllListeners();
    OlympusBus.instance = null;
  }

  /** Dispose this bus instance */
  dispose(): void {
    this.removeAllListeners();
  }

  emitPhase(phase: number, phaseName: string, status: 'started' | 'completed' | 'failed', progress?: number): void {
    this.emit('phase:change', { runId: this.runId, phase, phaseName, status, progress });
  }

  emitAgentStart(agentId: string, taskId: string): void {
    this.emit('agent:start', { runId: this.runId, agentId, taskId });
  }

  emitAgentChunk(agentId: string, taskId: string, content: string): void {
    this.emit('agent:chunk', { runId: this.runId, agentId, taskId, content });
  }

  emitAgentComplete(agentId: string, taskId: string, content?: string): void {
    this.emit('agent:complete', { runId: this.runId, agentId, taskId, content });
  }

  emitAgentError(agentId: string, taskId: string, error: string): void {
    this.emit('agent:error', { runId: this.runId, agentId, taskId, error });
  }

  emitTaskUpdate(taskId: string, subject: string, status: 'pending' | 'in_progress' | 'completed' | 'failed', featureSet?: string): void {
    this.emit('task:update', { runId: this.runId, taskId, subject, status, featureSet });
  }

  emitLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, source?: string): void {
    this.emit('log', { runId: this.runId, level, message, source });
  }
}
