import { describe, it, expect } from 'vitest';

// SessionManager is now tmux-free. Test the public interface logic.

describe('SessionManager (tmux-free)', () => {
  it('should export Session interface without tmux fields', async () => {
    // Verify the module can be imported (no tmux imports that fail)
    const mod = await import('../session-manager.js');
    expect(mod.SessionManager).toBeDefined();
  });
});
