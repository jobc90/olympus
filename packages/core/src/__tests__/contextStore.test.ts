/**
 * ContextStore Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';

// Check if better-sqlite3 native module is available (may fail in CI)
let hasSqlite = false;
type ContextStoreType = Awaited<typeof import('../contextStore.js')>['ContextStore'];
let ContextStore: ContextStoreType;
try {
  await import('better-sqlite3');
  const mod = await import('../contextStore.js');
  ContextStore = mod.ContextStore;
  hasSqlite = true;
} catch {
  // Native module not available — skip SQLite-dependent tests
  ContextStore = undefined as never;
}

describe.skipIf(!hasSqlite)('ContextStore', () => {
  let store: ReturnType<ContextStoreType['create']>;
  let testDir: string;
  let dbPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'olympus-test-'));
    dbPath = join(testDir, 'contexts.db');
    store = ContextStore.create(dbPath);
  });

  afterEach(() => {
    store.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('Basic CRUD', () => {
    it('should create a workspace context', () => {
      const context = store.create({
        scope: 'workspace',
        path: '/workspace',
        summary: 'Test workspace',
        content: 'Workspace content',
      });

      expect(context).toBeDefined();
      expect(context.scope).toBe('workspace');
      expect(context.path).toBe('/workspace');
      expect(context.summary).toBe('Test workspace');
      expect(context.content).toBe('Workspace content');
      expect(context.version).toBe(1);
      expect(context.status).toBe('active');
    });

    it('should get context by ID', () => {
      const created = store.create({
        scope: 'workspace',
        path: '/workspace',
        summary: 'Test workspace',
      });

      const retrieved = store.getById(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.path).toBe('/workspace');
    });

    it('should get context by path', () => {
      store.create({
        scope: 'workspace',
        path: '/workspace',
        summary: 'Test workspace',
      });

      const retrieved = store.getByPath('workspace', '/workspace');
      expect(retrieved).toBeDefined();
      expect(retrieved?.scope).toBe('workspace');
      expect(retrieved?.path).toBe('/workspace');
    });

    it('should prevent duplicate paths in same scope', () => {
      store.create({
        scope: 'workspace',
        path: '/workspace',
        summary: 'Test workspace',
      });

      expect(() => {
        store.create({
          scope: 'workspace',
          path: '/workspace',
          summary: 'Duplicate workspace',
        });
      }).toThrow('Context already exists');
    });

    it('should update context with optimistic locking', () => {
      const created = store.create({
        scope: 'workspace',
        path: '/workspace',
        content: 'Original content',
      });

      const updated = store.update(created.id, {
        content: 'Updated content',
        expectedVersion: 1,
      });

      expect(updated.content).toBe('Updated content');
      expect(updated.version).toBe(2);
    });

    it('should fail update with version mismatch', () => {
      const created = store.create({
        scope: 'workspace',
        path: '/workspace',
        content: 'Original content',
      });

      expect(() => {
        store.update(created.id, {
          content: 'Updated content',
          expectedVersion: 99,
        });
      }).toThrow('Version mismatch');
    });

    it('should soft delete context', () => {
      const created = store.create({
        scope: 'workspace',
        path: '/workspace',
      });

      store.delete(created.id);

      const retrieved = store.getById(created.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Hierarchy', () => {
    it('should create workspace → project hierarchy', () => {
      const workspace = store.create({
        scope: 'workspace',
        path: '/workspace',
        summary: 'Test workspace',
      });

      const project = store.create({
        scope: 'project',
        path: '/workspace/project-a',
        parentId: workspace.id,
        summary: 'Test project',
      });

      expect(project.parentId).toBe(workspace.id);
      expect(project.scope).toBe('project');
    });

    it('should validate scope hierarchy', () => {
      const workspace = store.create({
        scope: 'workspace',
        path: '/workspace',
      });

      const project = store.create({
        scope: 'project',
        path: '/workspace/project',
        parentId: workspace.id,
        summary: 'Test project',
      });

      // Cannot create workspace as child of project
      expect(() => {
        store.create({
          scope: 'workspace',
          path: '/invalid',
          parentId: project.id,
          summary: 'Invalid workspace',
        });
      }).toThrow('Workspace context cannot have a parent');
    });

    it('should get children contexts', () => {
      const workspace = store.create({
        scope: 'workspace',
        path: '/workspace',
      });

      store.create({
        scope: 'project',
        path: '/workspace/project-a',
        parentId: workspace.id,
      });

      store.create({
        scope: 'project',
        path: '/workspace/project-b',
        parentId: workspace.id,
      });

      const children = store.getChildren(workspace.id);
      expect(children).toHaveLength(2);
      expect(children.every((c: any) => c.parentId === workspace.id)).toBe(true);
    });

    it('should get ancestors', () => {
      const workspace = store.create({
        scope: 'workspace',
        path: '/workspace',
      });

      const project = store.create({
        scope: 'project',
        path: '/workspace/project-a',
        parentId: workspace.id,
      });

      const task = store.create({
        scope: 'task',
        path: '/workspace/project-a/task-1',
        parentId: project.id,
      });

      const ancestors = store.getAncestors(task.id);
      expect(ancestors).toHaveLength(2);
      expect(ancestors.some((a: any) => a.id === workspace.id)).toBe(true);
      expect(ancestors.some((a: any) => a.id === project.id)).toBe(true);
    });

    it('should build tree structure', () => {
      const workspace = store.create({
        scope: 'workspace',
        path: '/workspace',
      });

      const project = store.create({
        scope: 'project',
        path: '/workspace/project-a',
        parentId: workspace.id,
      });

      store.create({
        scope: 'task',
        path: '/workspace/project-a/task-1',
        parentId: project.id,
      });

      const tree = store.getTree();
      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe(workspace.id);
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].id).toBe(project.id);
      expect(tree[0].children[0].children).toHaveLength(1);
    });
  });

  describe('Edges', () => {
    it('should create parent edge automatically', () => {
      const workspace = store.create({
        scope: 'workspace',
        path: '/workspace',
      });

      const project = store.create({
        scope: 'project',
        path: '/workspace/project-a',
        parentId: workspace.id,
      });

      const edges = store.getEdges(workspace.id, 'parent');
      expect(edges).toHaveLength(1);
      expect(edges[0].sourceId).toBe(workspace.id);
      expect(edges[0].targetId).toBe(project.id);
      expect(edges[0].edgeType).toBe('parent');
    });

    it('should add custom edges', () => {
      const context1 = store.create({
        scope: 'workspace',
        path: '/workspace-1',
      });

      const context2 = store.create({
        scope: 'workspace',
        path: '/workspace-2',
      });

      store.addEdge(context1.id, context2.id, 'derived_from');

      const edges = store.getEdges(context1.id, 'derived_from');
      expect(edges).toHaveLength(1);
      expect(edges[0].edgeType).toBe('derived_from');
    });
  });

  describe('Versions', () => {
    it('should record version on creation with content', () => {
      const context = store.create({
        scope: 'workspace',
        path: '/workspace',
        content: 'Initial content',
      }, 'test-user');

      const versions = store.getVersionHistory(context.id);
      expect(versions).toHaveLength(1);
      expect(versions[0].content).toBe('Initial content');
      expect(versions[0].actor).toBe('test-user');
    });

    it('should record version on content update', () => {
      const context = store.create({
        scope: 'workspace',
        path: '/workspace',
        content: 'Initial content',
      });

      store.update(context.id, {
        content: 'Updated content',
        expectedVersion: 1,
      }, 'test-user');

      const versions = store.getVersionHistory(context.id);
      expect(versions).toHaveLength(2);
      expect(versions[0].content).toBe('Updated content');
      expect(versions[0].actor).toBe('test-user');
    });
  });

  describe('Merges', () => {
    it('should create a merge request', () => {
      const source = store.create({
        scope: 'workspace',
        path: '/workspace-source',
        content: 'Source content',
      });

      const target = store.create({
        scope: 'workspace',
        path: '/workspace-target',
        content: 'Target content',
      });

      const merge = store.createMerge(source.id, target.id);

      expect(merge).toBeDefined();
      expect(merge.sourceId).toBe(source.id);
      expect(merge.targetId).toBe(target.id);
      expect(merge.status).toBe('draft');
    });

    it('should update merge status', () => {
      const source = store.create({
        scope: 'workspace',
        path: '/workspace-source',
      });

      const target = store.create({
        scope: 'workspace',
        path: '/workspace-target',
      });

      const merge = store.createMerge(source.id, target.id);
      const updated = store.updateMergeStatus(merge.id, 'approved');

      expect(updated.status).toBe('approved');
    });

    it('should apply merge to target context', () => {
      const source = store.create({
        scope: 'workspace',
        path: '/workspace-source',
        content: 'Source content',
        summary: 'Source summary',
      });

      const target = store.create({
        scope: 'workspace',
        path: '/workspace-target',
        content: 'Target content',
        summary: 'Target summary',
      });

      const merge = store.createMerge(source.id, target.id);
      store.updateMergeStatus(merge.id, 'approved');

      const updatedTarget = store.applyMerge(merge.id);

      expect(updatedTarget.content).toBe('Source content');
      expect(updatedTarget.summary).toBe('Source summary');
      expect(updatedTarget.version).toBe(2);

      const mergeAfter = store.getMerge(merge.id);
      expect(mergeAfter?.status).toBe('applied');
    });

    it('should get merges for target', () => {
      const source = store.create({
        scope: 'workspace',
        path: '/workspace-source',
      });

      const target = store.create({
        scope: 'workspace',
        path: '/workspace-target',
      });

      store.createMerge(source.id, target.id);
      store.createMerge(source.id, target.id);

      const merges = store.getMergesForTarget(target.id);
      expect(merges).toHaveLength(2);
    });
  });

  describe('Operations', () => {
    it('should create an operation', () => {
      const context = store.create({
        scope: 'workspace',
        path: '/workspace',
      });

      const operation = store.createOperation('merge', context.id);

      expect(operation).toBeDefined();
      expect(operation.type).toBe('merge');
      expect(operation.contextId).toBe(context.id);
      expect(operation.status).toBe('queued');
    });

    it('should update operation status', () => {
      const context = store.create({
        scope: 'workspace',
        path: '/workspace',
      });

      const operation = store.createOperation('merge', context.id);
      const updated = store.updateOperationStatus(operation.id, 'succeeded', 'Merge completed');

      expect(updated.status).toBe('succeeded');
      expect(updated.result).toBe('Merge completed');
    });
  });

  describe('Seed helpers', () => {
    it('should seed workspace idempotently', () => {
      const ws1 = store.seedWorkspace('/workspace');
      const ws2 = store.seedWorkspace('/workspace');

      expect(ws1.id).toBe(ws2.id);
    });

    it('should seed project under workspace', () => {
      const project = store.seedProject('/workspace', '/workspace/project-a');

      expect(project.scope).toBe('project');
      expect(project.path).toBe('/workspace/project-a');

      const workspace = store.getById(project.parentId!);
      expect(workspace).toBeDefined();
      expect(workspace?.scope).toBe('workspace');
    });
  });
});
