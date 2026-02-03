import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  dts: false,
  clean: true,
  sourcemap: true,
  external: [/^node:/, 'readline/promises', 'child_process', 'fs/promises', 'os', 'path', 'crypto'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
