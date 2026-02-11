import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  dts: false,
  clean: true,
  sourcemap: true,
  // Keep react and ink external (they're dependencies, not bundled)
  external: [/^node:/, 'readline/promises', 'child_process', 'fs/promises', 'os', 'path', 'crypto', 'ws', 'react', 'ink', 'react-devtools-core', 'node-pty'],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
  banner: {
    js: '#!/usr/bin/env node',
  },
});
