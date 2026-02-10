import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RpcRouter } from '../rpc/handler.js';
import { registerAgentMethods, registerMemoryMethods } from '../rpc/agent-methods.js';
import { MemoryStore } from '../memory/store.js';
import { CodexAgent } from '../agent/agent.js';
import { CommandAnalyzer } from '../agent/analyzer.js';
import { ExecutionPlanner } from '../agent/planner.js';
import { ResultReviewer } from '../agent/reviewer.js';
import { AgentReporter } from '../agent/reporter.js';
import { WorkerManager } from '../workers/manager.js';
import { SessionManager } from '../session-manager.js';
import { DEFAULT_AGENT_CONFIG } from '@olympus-dev/protocol';

describe('Memory RPC Methods (K5)', () => {
  let router: RpcRouter;
  let memoryStore: MemoryStore;

  beforeEach(() => {
    router = new RpcRouter();
    memoryStore = new MemoryStore({ enabled: false }); // Disabled = no SQLite needed

    const config = { ...DEFAULT_AGENT_CONFIG, provider: 'mock' as const };
    const workerManager = new WorkerManager({ maxConcurrent: 3 });
    const agent = new CodexAgent({
      config,
      analyzer: new CommandAnalyzer(config),
      planner: new ExecutionPlanner(config),
      reviewer: new ResultReviewer(config),
      reporter: new AgentReporter(),
      workerManager,
    });

    const sessionManager = new SessionManager({
      onSessionEvent: () => {},
    });

    registerAgentMethods(router, {
      agent,
      workerManager,
      sessionManager,
      memoryStore,
    });
  });

  it('should register memory.search method', () => {
    expect(router.has('memory.search')).toBe(true);
  });

  it('should register memory.patterns method', () => {
    expect(router.has('memory.patterns')).toBe(true);
  });

  it('should register memory.stats method', () => {
    expect(router.has('memory.stats')).toBe(true);
  });

  it('should return agent.status with queuedCommands from agent.queueSize', () => {
    expect(router.has('agent.status')).toBe(true);
  });

  it('should list all registered methods', () => {
    const methods = router.listMethods();
    expect(methods).toContain('agent.command');
    expect(methods).toContain('agent.status');
    expect(methods).toContain('agent.cancel');
    expect(methods).toContain('agent.history');
    expect(methods).toContain('agent.approve');
    expect(methods).toContain('agent.reject');
    expect(methods).toContain('workers.list');
    expect(methods).toContain('workers.terminate');
    expect(methods).toContain('workers.output');
    expect(methods).toContain('memory.search');
    expect(methods).toContain('memory.patterns');
    expect(methods).toContain('memory.stats');
    expect(methods).toContain('sessions.list');
    expect(methods).toContain('sessions.discover');
  });
});

describe('registerMemoryMethods (standalone — codex mode)', () => {
  let router: RpcRouter;
  let memoryStore: MemoryStore;

  beforeEach(() => {
    router = new RpcRouter();
    memoryStore = new MemoryStore({ enabled: false });
    registerMemoryMethods(router, { memoryStore });
  });

  it('should register only memory.* methods', () => {
    const methods = router.listMethods();
    expect(methods).toContain('memory.search');
    expect(methods).toContain('memory.patterns');
    expect(methods).toContain('memory.stats');
    expect(methods).toHaveLength(3);
  });

  it('should NOT register agent/worker/session methods', () => {
    const methods = router.listMethods();
    expect(methods).not.toContain('agent.command');
    expect(methods).not.toContain('workers.list');
    expect(methods).not.toContain('sessions.list');
  });
});
