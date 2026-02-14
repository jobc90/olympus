/**
 * Project info widget - displays directory name and git branch
 */

import { execFileSync } from 'child_process';
import { basename } from 'path';
import type { Widget } from './base.js';
import type { WidgetContext, ProjectInfoData } from '../types.js';
import { COLORS, RESET, colorize } from '../utils/colors.js';

/**
 * Get current git branch with timeout
 */
function getGitBranch(cwd: string): string | undefined {
  try {
    const result = execFileSync('git', ['--no-optional-locks', 'rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      timeout: 500, // 500ms timeout to prevent blocking
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim() || undefined;
  } catch {
    // Not a git repo or git not available
    return undefined;
  }
}

/**
 * Check if git working directory has uncommitted changes
 */
function isGitDirty(cwd: string): boolean {
  try {
    const result = execFileSync('git', ['--no-optional-locks', 'status', '--porcelain'], {
      cwd,
      encoding: 'utf-8',
      timeout: 1000, // 1s timeout
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

export const projectInfoWidget: Widget<ProjectInfoData> = {
  id: 'projectInfo',
  name: 'Project Info',

  async getData(ctx: WidgetContext): Promise<ProjectInfoData | null> {
    const currentDir = ctx.stdin.workspace?.current_dir;
    if (!currentDir) {
      return null;
    }

    const dirName = basename(currentDir);
    const branch = getGitBranch(currentDir);

    // Add * suffix if there are uncommitted changes
    let gitBranch: string | undefined;
    if (branch) {
      const dirty = isGitDirty(currentDir);
      gitBranch = dirty ? `${branch}*` : branch;
    }

    return {
      dirName,
      gitBranch,
    };
  },

  render(data: ProjectInfoData): string {
    const parts: string[] = [];

    // Directory name with folder icon (pastel yellow - soft cream color)
    parts.push(colorize(`📁 ${data.dirName}`, COLORS.pastelYellow));

    // Git branch in parentheses (pastel pink)
    if (data.gitBranch) {
      parts.push(colorize(`(${data.gitBranch})`, COLORS.pastelPink));
    }

    return parts.join(' ');
  },
};
