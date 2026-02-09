import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { ProjectConfig } from '@olympus-dev/protocol';

interface RegisteredProject {
  name: string;
  path: string;
  aliases: string[];
}

/**
 * Project Registry — auto-discovers and manages project references.
 *
 * Hybrid mode: auto-scans workspace + config-registered projects.
 * Used by Analyzer to resolve project names from user commands.
 */
export class ProjectRegistry {
  private projects = new Map<string, RegisteredProject>();

  constructor(config?: Partial<ProjectConfig>) {
    // Load registered projects from config
    if (config?.registered) {
      for (const p of config.registered) {
        this.register(p.name, p.path, p.aliases);
      }
    }

    // Auto-scan workspace
    if (config?.workspacePath) {
      this.scanWorkspace(config.workspacePath);
    }
  }

  /**
   * Register a project manually.
   */
  register(name: string, path: string, aliases: string[] = []): void {
    const project = { name, path, aliases };
    this.projects.set(name.toLowerCase(), project);
    for (const alias of aliases) {
      this.projects.set(alias.toLowerCase(), project);
    }
  }

  /**
   * Resolve a project name or alias to its path.
   */
  resolve(nameOrAlias: string): string | null {
    const key = nameOrAlias.toLowerCase();

    // Direct match
    const direct = this.projects.get(key);
    if (direct) return direct.path;

    // Partial match (e.g., "gate" → "gateway")
    for (const [, project] of this.projects) {
      if (project.name.toLowerCase().includes(key)) return project.path;
      if (project.aliases.some(a => a.toLowerCase().includes(key))) return project.path;
    }

    return null;
  }

  /**
   * Get all registered project names.
   */
  getProjectNames(): string[] {
    const names = new Set<string>();
    for (const [, project] of this.projects) {
      names.add(project.name);
    }
    return [...names];
  }

  /**
   * Scan a workspace directory for projects (package.json, Cargo.toml, go.mod).
   * Scans 2 levels deep to handle monorepos.
   */
  scanWorkspace(rootPath: string, maxDepth = 2): void {
    this.scanDir(rootPath, 0, maxDepth);
  }

  private scanDir(dirPath: string, depth: number, maxDepth: number): void {
    if (depth > maxDepth) return;
    if (!existsSync(dirPath)) return;

    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });

      // Check for project markers
      const hasPackageJson = entries.some(e => e.name === 'package.json' && e.isFile());
      const hasCargoToml = entries.some(e => e.name === 'Cargo.toml' && e.isFile());
      const hasGoMod = entries.some(e => e.name === 'go.mod' && e.isFile());

      if (hasPackageJson) {
        const name = this.readPackageName(join(dirPath, 'package.json')) || basename(dirPath);
        const shortName = basename(dirPath);

        if (!this.projects.has(name.toLowerCase())) {
          const aliases = name !== shortName ? [shortName] : [];
          this.register(name, dirPath, aliases);
        }
      } else if (hasCargoToml || hasGoMod) {
        const name = basename(dirPath);
        if (!this.projects.has(name.toLowerCase())) {
          this.register(name, dirPath);
        }
      }

      // Recurse into subdirectories (skip node_modules, .git, dist, etc.)
      const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.turbo', '.next', 'target']);
      for (const entry of entries) {
        if (entry.isDirectory() && !skipDirs.has(entry.name) && !entry.name.startsWith('.')) {
          this.scanDir(join(dirPath, entry.name), depth + 1, maxDepth);
        }
      }
    } catch {
      // Permission error or similar — skip
    }
  }

  private readPackageName(pkgPath: string): string | null {
    try {
      const content = readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      return pkg.name || null;
    } catch {
      return null;
    }
  }
}
