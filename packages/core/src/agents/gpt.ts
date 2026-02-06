import { CodexExecutor } from './codex.js';

/**
 * @deprecated Use CodexExecutor. Kept for backward compatibility.
 */
export class GptExecutor extends CodexExecutor {
  readonly name = 'codex' as const;
}
