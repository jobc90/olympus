import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const PROJECT_MARKERS = [
  '.git',
  'package.json',
  'pnpm-workspace.yaml',
  'pyproject.toml',
  'go.mod',
  'Cargo.toml',
] as const;

const SKIP_CHILD_DIRS = new Set([
  'node_modules',
  '.git',
  '.idea',
  '.vscode',
  '.next',
  'dist',
  'build',
  '.turbo',
  '.cache',
  'coverage',
]);

export interface WorkspaceProject {
  name: string;
  path: string;
}

export function isProjectDirectory(dirPath: string): boolean {
  return PROJECT_MARKERS.some((marker) => existsSync(join(dirPath, marker)));
}

function looksLikeOlympusRepo(dirPath: string): boolean {
  return existsSync(join(dirPath, 'pnpm-workspace.yaml'))
    && existsSync(join(dirPath, 'packages'))
    && existsSync(join(dirPath, 'AGENTS.md'));
}

/**
 * Resolve workspace root.
 * Priority: explicit env var -> smart parent heuristic (Olympus repo) -> cwd.
 */
export function resolveWorkspaceRoot(cwd: string = process.cwd()): string {
  const envRoot = process.env.OLYMPUS_WORKSPACE_ROOT;
  if (envRoot) {
    const resolvedEnv = resolve(envRoot);
    if (existsSync(resolvedEnv)) {
      return resolvedEnv;
    }
  }

  const resolvedCwd = resolve(cwd);

  // If running inside olympus repo, prefer parent when it contains sibling projects.
  if (looksLikeOlympusRepo(resolvedCwd) || basename(resolvedCwd).toLowerCase() === 'olympus') {
    const parent = dirname(resolvedCwd);
    try {
      const siblings = readdirSync(parent, { withFileTypes: true, encoding: 'utf8' })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => !name.startsWith('.') && name !== basename(resolvedCwd));

      const hasSiblingProject = siblings.some((name) => isProjectDirectory(join(parent, name)));
      if (hasSiblingProject) {
        return parent;
      }
    } catch {
      // Fall back to cwd
    }
  }

  return resolvedCwd;
}

/**
 * Discover direct child projects under workspace root.
 * Keeps startup fast while covering the common /dev/* layout.
 */
export function listWorkspaceProjects(workspaceRoot: string): WorkspaceProject[] {
  const root = resolve(workspaceRoot);

  let entries: Array<import('node:fs').Dirent>;
  try {
    entries = readdirSync(root, { withFileTypes: true, encoding: 'utf8' });
  } catch {
    return [];
  }

  const projects: WorkspaceProject[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (SKIP_CHILD_DIRS.has(entry.name)) continue;

    const projectPath = join(root, entry.name);
    if (!isProjectDirectory(projectPath)) continue;

    projects.push({ name: entry.name, path: projectPath });
  }

  // Stable order for deterministic logs/tests
  projects.sort((a, b) => a.name.localeCompare(b.name));
  return projects;
}
