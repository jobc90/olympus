import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { listWorkspaceProjects, resolveWorkspaceRoot } from '../workspace-root.js';

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  delete process.env.OLYMPUS_WORKSPACE_ROOT;
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('workspace-root utilities', () => {
  it('prefers OLYMPUS_WORKSPACE_ROOT when set', () => {
    const envRoot = makeTempDir('oly-env-');
    const cwd = makeTempDir('oly-cwd-');

    process.env.OLYMPUS_WORKSPACE_ROOT = envRoot;

    expect(resolveWorkspaceRoot(cwd)).toBe(envRoot);
  });

  it('resolves to parent when cwd looks like olympus repo and parent has sibling projects', () => {
    const parent = makeTempDir('oly-parent-');
    const olympus = join(parent, 'olympus');
    const siblingProject = join(parent, 'project-a');

    mkdirSync(olympus, { recursive: true });
    mkdirSync(join(olympus, 'packages'), { recursive: true });
    writeFileSync(join(olympus, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
    writeFileSync(join(olympus, 'AGENTS.md'), '# agents\n');

    mkdirSync(siblingProject, { recursive: true });
    writeFileSync(join(siblingProject, 'package.json'), '{}\n');

    expect(resolveWorkspaceRoot(olympus)).toBe(parent);
  });

  it('keeps cwd when no sibling projects are discoverable', () => {
    const root = makeTempDir('oly-root-');
    const olympus = join(root, 'olympus');

    mkdirSync(join(olympus, 'packages'), { recursive: true });
    writeFileSync(join(olympus, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
    writeFileSync(join(olympus, 'AGENTS.md'), '# agents\n');

    expect(resolveWorkspaceRoot(olympus)).toBe(olympus);
  });

  it('lists direct child projects with markers and skips hidden/system dirs', () => {
    const workspace = makeTempDir('oly-workspace-');
    const projectA = join(workspace, 'project-a');
    const projectB = join(workspace, 'project-b');

    mkdirSync(projectA, { recursive: true });
    writeFileSync(join(projectA, 'package.json'), '{}\n');

    mkdirSync(projectB, { recursive: true });
    writeFileSync(join(projectB, '.git'), '');

    mkdirSync(join(workspace, 'node_modules', 'x'), { recursive: true });
    writeFileSync(join(workspace, 'node_modules', 'x', 'package.json'), '{}\n');
    mkdirSync(join(workspace, '.hidden-project'), { recursive: true });
    writeFileSync(join(workspace, '.hidden-project', 'package.json'), '{}\n');

    const projects = listWorkspaceProjects(workspace);
    expect(projects.map((p) => p.name)).toEqual(['project-a', 'project-b']);
  });
});
