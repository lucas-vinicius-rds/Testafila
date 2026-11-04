import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const config: NextConfig = {
  // Diretório alternativo para `next dev` em outra porta sem tocar no .next da porta 3000.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@testafila/core'],
  turbopack: {
    root: fileURLToPath(new URL('../', import.meta.url)),
  },
};

export default config;
