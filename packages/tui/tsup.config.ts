import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  platform: 'node',
  external: [/^node:/, 'react', 'ink', 'ws'],
  jsx: 'transform',
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
