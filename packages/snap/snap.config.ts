import type { SnapConfig } from '@metamask/snaps-cli';
import { resolve } from 'path';

const config: SnapConfig = {
  bundler: 'webpack',
  input: resolve(__dirname, 'src/index.ts'),
  evaluate: false,
  server: {
    port: 8080,
  },
  polyfills: {
    buffer: true,
  },
  stats: {
    builtIns: false,
  },
};

export default config;
