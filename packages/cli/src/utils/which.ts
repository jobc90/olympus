/**
 * Find executable in PATH
 */

import { execSync } from 'child_process';

export async function which(command: string): Promise<string | null> {
  try {
    const result = execSync(`which ${command}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim() || null;
  } catch {
    return null;
  }
}
