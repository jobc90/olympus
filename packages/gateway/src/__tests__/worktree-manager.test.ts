import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorktreeManager } from '../worktree-manager.js';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execFile = promisify(execFileCb);

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFile('git', args, { cwd });
  return stdout.trim();
}

describe('WorktreeManager', () => {
  let tempDir: string;
  let manager: WorktreeManager;

  beforeEach(async () => {
    // Create temp dir with git repo
    tempDir = await mkdtemp(join(tmpdir(), 'wt-test-'));
    await git(['init', '-b', 'main'], tempDir);
    await git(['config', 'user.email', 'test@test.com'], tempDir);
    await git(['config', 'user.name', 'Test'], tempDir);

    // Initial commit
    await writeFile(join(tempDir, 'README.md'), '# Test\n');
    await git(['add', '.'], tempDir);
    await git(['commit', '-m', 'initial'], tempDir);

    manager = new WorktreeManager(tempDir, 'test-session');
  });

  afterEach(async () => {
    try {
      await manager.cleanup();
    } catch {
      // Best-effort
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should initialize and detect base branch', async () => {
    await manager.initialize();
    expect(manager.getBaseBranch()).toBe('main');
  });

  it('should stash dirty changes on initialize', async () => {
    // Modify a tracked file (git stash only stashes tracked files by default)
    await writeFile(join(tempDir, 'README.md'), '# Modified\n');
    await manager.initialize();

    // README.md changes should be stashed
    const status = await git(['status', '--porcelain'], tempDir);
    expect(status).not.toContain('README.md');
  });

  it('should create worktree with branch', async () => {
    await manager.initialize();
    const info = await manager.createWorktree('wi-1');

    expect(info.wiId).toBe('wi-1');
    expect(info.branch).toBe('team/test-session/wi-1');
    expect(info.path).toContain('.team/wt/wi-1');

    // Verify worktree exists
    const s = await stat(info.path);
    expect(s.isDirectory()).toBe(true);

    // Verify branch exists
    const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], info.path);
    expect(branch).toBe('team/test-session/wi-1');
  });

  it('should commit changes in worktree', async () => {
    await manager.initialize();
    const info = await manager.createWorktree('wi-1');

    // Make changes in worktree
    await writeFile(join(info.path, 'new-file.ts'), 'export const x = 1;');
    const committed = await manager.commitWorktree('wi-1', 'add new file');
    expect(committed).toBe(true);

    // Verify commit
    const log = await git(['log', '--oneline', '-1'], info.path);
    expect(log).toContain('add new file');
  });

  it('should return false when committing with no changes', async () => {
    await manager.initialize();
    await manager.createWorktree('wi-1');

    const committed = await manager.commitWorktree('wi-1', 'empty');
    expect(committed).toBe(false);
  });

  it('should merge worktree branches', async () => {
    await manager.initialize();

    // Create two worktrees
    const info1 = await manager.createWorktree('wi-1');
    const info2 = await manager.createWorktree('wi-2');

    // Make different changes
    await writeFile(join(info1.path, 'file1.ts'), 'export const a = 1;');
    await manager.commitWorktree('wi-1', 'add file1');

    await writeFile(join(info2.path, 'file2.ts'), 'export const b = 2;');
    await manager.commitWorktree('wi-2', 'add file2');

    // Create merge branch and merge
    await manager.createMergeBranch();
    const result1 = await manager.mergeWorkItem('wi-1');
    expect(result1.success).toBe(true);

    const result2 = await manager.mergeWorkItem('wi-2');
    expect(result2.success).toBe(true);

    // Verify both files exist on merge branch
    const files = await git(['ls-files'], tempDir);
    expect(files).toContain('file1.ts');
    expect(files).toContain('file2.ts');
  });

  it('should detect merge conflicts', async () => {
    await manager.initialize();

    const info1 = await manager.createWorktree('wi-1');
    const info2 = await manager.createWorktree('wi-2');

    // Both modify the same file
    await writeFile(join(info1.path, 'README.md'), '# Modified by wi-1\n');
    await manager.commitWorktree('wi-1', 'modify readme wi-1');

    await writeFile(join(info2.path, 'README.md'), '# Modified by wi-2\n');
    await manager.commitWorktree('wi-2', 'modify readme wi-2');

    await manager.createMergeBranch();

    // First merge succeeds
    const result1 = await manager.mergeWorkItem('wi-1');
    expect(result1.success).toBe(true);

    // Second merge should detect conflict
    const result2 = await manager.mergeWorkItem('wi-2');
    expect(result2.success).toBe(false);
    expect(result2.conflictFiles).toBeDefined();
    expect(result2.conflictFiles!.length).toBeGreaterThan(0);
  });

  it('should resolve conflicts with theirs strategy', async () => {
    await manager.initialize();

    const info1 = await manager.createWorktree('wi-1');
    const info2 = await manager.createWorktree('wi-2');

    await writeFile(join(info1.path, 'README.md'), '# Modified by wi-1\n');
    await manager.commitWorktree('wi-1', 'modify readme wi-1');

    await writeFile(join(info2.path, 'README.md'), '# Modified by wi-2\n');
    await manager.commitWorktree('wi-2', 'modify readme wi-2');

    await manager.createMergeBranch();
    await manager.mergeWorkItem('wi-1');

    const result2 = await manager.mergeWorkItem('wi-2');
    expect(result2.success).toBe(false);

    // Resolve with theirs
    await manager.resolveConflicts(result2.conflictFiles!);

    // Should now contain wi-2's version
    const content = await readFile(join(tempDir, 'README.md'), 'utf-8');
    expect(content).toBe('# Modified by wi-2\n');
  });

  it('should finalize merge to base branch', async () => {
    await manager.initialize();
    const info = await manager.createWorktree('wi-1');

    await writeFile(join(info.path, 'feature.ts'), 'export const feature = true;');
    await manager.commitWorktree('wi-1', 'add feature');

    await manager.createMergeBranch();
    await manager.mergeWorkItem('wi-1');
    await manager.finalize();

    // Should be back on main with the changes
    const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], tempDir);
    expect(branch).toBe('main');

    const files = await git(['ls-files'], tempDir);
    expect(files).toContain('feature.ts');
  });

  it('should cleanup worktrees and branches', async () => {
    await manager.initialize();
    await manager.createWorktree('wi-1');
    await manager.createWorktree('wi-2');

    await manager.cleanup();

    // Worktree directories should not exist
    try {
      await stat(join(tempDir, '.team'));
      expect.fail('.team directory should not exist after cleanup');
    } catch (err) {
      expect((err as NodeJS.ErrnoException).code).toBe('ENOENT');
    }

    // Branches should be deleted
    const branches = await git(['branch', '--list', 'team/*'], tempDir);
    expect(branches).toBe('');
  });

  it('should restore stash on cleanup', async () => {
    // Modify a tracked file to trigger stash
    await writeFile(join(tempDir, 'README.md'), '# Stashed changes\n');
    await manager.initialize();

    // The modification should be stashed
    const statusBefore = await git(['diff', '--name-only'], tempDir);
    expect(statusBefore).not.toContain('README.md');

    await manager.cleanup();

    // After cleanup, stash should be restored
    const content = await readFile(join(tempDir, 'README.md'), 'utf-8');
    expect(content).toBe('# Stashed changes\n');
  });

  it('should throw for unknown worktree on commit', async () => {
    await manager.initialize();
    await expect(manager.commitWorktree('nonexistent', 'msg'))
      .rejects.toThrow('Worktree not found: nonexistent');
  });

  it('should append .team/ to .gitignore', async () => {
    await manager.initialize();
    const gitignore = await readFile(join(tempDir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.team/');
  });
});
