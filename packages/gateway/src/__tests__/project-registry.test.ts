import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectRegistry } from '../agent/project-registry.js';

describe('ProjectRegistry', () => {
  let registry: ProjectRegistry;

  beforeEach(() => {
    registry = new ProjectRegistry();
  });

  it('should start with no projects', () => {
    expect(registry.getProjectNames()).toEqual([]);
  });

  it('should register and resolve a project by name', () => {
    registry.register('my-project', '/home/user/my-project');
    expect(registry.resolve('my-project')).toBe('/home/user/my-project');
  });

  it('should resolve case-insensitively', () => {
    registry.register('MyProject', '/home/user/my-project');
    expect(registry.resolve('myproject')).toBe('/home/user/my-project');
    expect(registry.resolve('MYPROJECT')).toBe('/home/user/my-project');
  });

  it('should resolve by alias', () => {
    registry.register('gateway', '/home/user/gateway', ['gw', 'api-gateway']);
    expect(registry.resolve('gw')).toBe('/home/user/gateway');
    expect(registry.resolve('api-gateway')).toBe('/home/user/gateway');
  });

  it('should resolve by partial match', () => {
    registry.register('gateway', '/home/user/gateway');
    expect(registry.resolve('gate')).toBe('/home/user/gateway');
  });

  it('should return null for unknown project', () => {
    expect(registry.resolve('nonexistent')).toBeNull();
  });

  it('should return unique project names', () => {
    registry.register('alpha', '/a');
    registry.register('beta', '/b');
    registry.register('alpha', '/a', ['al']); // re-register with alias
    const names = registry.getProjectNames();
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
    // alpha should appear only once despite re-registration
    expect(names.filter(n => n === 'alpha')).toHaveLength(1);
  });

  it('should load registered projects from config', () => {
    const reg = new ProjectRegistry({
      registered: [
        { name: 'proj-a', path: '/a', aliases: ['a'] },
        { name: 'proj-b', path: '/b', aliases: [] },
      ],
    });
    expect(reg.resolve('proj-a')).toBe('/a');
    expect(reg.resolve('a')).toBe('/a');
    expect(reg.resolve('proj-b')).toBe('/b');
  });

  it('should scan workspace and discover package.json projects', () => {
    // Scan the actual Olympus packages directory
    const reg = new ProjectRegistry({
      workspacePath: '/Users/jobc/dev/olympus/packages',
    });
    const names = reg.getProjectNames();
    // Should find at least gateway and protocol packages
    expect(names.length).toBeGreaterThan(0);
  });

  it('should not duplicate already-registered projects during scan', () => {
    const reg = new ProjectRegistry({
      registered: [
        { name: '@olympus-dev/gateway', path: '/custom/path', aliases: [] },
      ],
      workspacePath: '/Users/jobc/dev/olympus/packages',
    });
    // The registered path should take precedence
    expect(reg.resolve('@olympus-dev/gateway')).toBe('/custom/path');
  });
});
