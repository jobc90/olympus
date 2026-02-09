import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContextManager } from '../context-manager.js';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('ContextManager', () => {
  let cm: ContextManager;
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `olympus-test-cm-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    cm = new ContextManager({ globalDbPath: join(testDir, 'global.db') });
  });

  afterEach(() => {
    cm.close();
    try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('initialize', () => {
    it('should initialize without error', async () => {
      await cm.initialize();
      // Should not throw
    });

    it('should be idempotent', async () => {
      await cm.initialize();
      await cm.initialize(); // second call should be no-op
    });
  });

  describe('registerProject', () => {
    it('should register a project', async () => {
      await cm.initialize();
      await cm.registerProject({
        name: 'test-project',
        path: '/dev/test',
        aliases: ['테스트'],
        techStack: ['TypeScript'],
      });

      const projects = await cm.getAllProjects();
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe('test-project');
    });

    it('should register multiple projects', async () => {
      await cm.initialize();
      await cm.registerProject({ name: 'project-a', path: '/dev/a', aliases: [], techStack: [] });
      await cm.registerProject({ name: 'project-b', path: '/dev/b', aliases: [], techStack: [] });

      const projects = await cm.getAllProjects();
      expect(projects.length).toBe(2);
    });
  });

  describe('getProjectContext', () => {
    it('should return context for registered project', async () => {
      await cm.initialize();
      await cm.registerProject({
        name: 'my-proj',
        path: '/dev/my-proj',
        aliases: [],
        techStack: ['React'],
      });

      const ctx = await cm.getProjectContext('/dev/my-proj');
      expect(ctx.name).toBe('my-proj');
      expect(ctx.techStack).toEqual(['React']);
      expect(ctx.recentTasks).toEqual([]);
      expect(ctx.taskCount).toBe(0);
    });

    it('should return fallback for unknown project', async () => {
      await cm.initialize();
      const ctx = await cm.getProjectContext('/dev/unknown');
      expect(ctx.name).toBe('unknown');
      expect(ctx.recentTasks).toEqual([]);
    });
  });

  describe('saveTask + getProjectContext', () => {
    it('should persist and retrieve tasks', async () => {
      await cm.initialize();
      await cm.registerProject({ name: 'proj', path: '/dev/proj', aliases: [], techStack: [] });

      cm.saveTask('/dev/proj', {
        id: 't1',
        command: 'pnpm build',
        analysis: '',
        plan: '',
        result: 'Build succeeded',
        success: true,
        duration: 5000,
        timestamp: Date.now(),
        projectPath: '/dev/proj',
        workerCount: 1,
      });

      const ctx = await cm.getProjectContext('/dev/proj');
      expect(ctx.taskCount).toBe(1);
      expect(ctx.recentTasks.length).toBe(1);
      expect(ctx.recentTasks[0].command).toBe('pnpm build');
    });
  });

  describe('globalSearch', () => {
    it('should return empty for no matches', async () => {
      await cm.initialize();
      const results = await cm.globalSearch('nonexistent');
      expect(results).toEqual([]);
    });

    it('should find tasks by FTS or LIKE', async () => {
      await cm.initialize();
      await cm.registerProject({ name: 'proj', path: '/dev/proj', aliases: [], techStack: [] });

      cm.saveTask('/dev/proj', {
        id: 't1',
        command: 'pnpm build',
        analysis: 'building the project',
        plan: '',
        result: 'Build succeeded',
        success: true,
        duration: 5000,
        timestamp: Date.now(),
        projectPath: '/dev/proj',
        workerCount: 1,
      });

      const results = await cm.globalSearch('build');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].projectName).toBe('proj');
    });

    it('should index CLAUDE.md content', async () => {
      await cm.initialize();

      // Create a fake CLAUDE.md
      const claudeMdPath = join(testDir, 'CLAUDE.md');
      writeFileSync(claudeMdPath, '# My Project\nThis project uses NestJS and PostgreSQL');

      await cm.registerProject({
        name: 'proj',
        path: '/dev/proj',
        aliases: [],
        techStack: [],
        claudeMdPath,
      });

      const results = await cm.globalSearch('NestJS');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('close', () => {
    it('should close without error', async () => {
      await cm.initialize();
      cm.close();
      // Should not throw
    });

    it('should handle double close', async () => {
      await cm.initialize();
      cm.close();
      cm.close(); // second close should be safe
    });
  });
});
