import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const config: NextConfig = {
  // Diretório alternativo para `next dev` em outra porta sem tocar no .next da porta 3000.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Só afeta `next dev`: permite abrir pelo túnel ngrok e por IPs extras da rede (DEV_ORIGINS=ip1,ip2).
  allowedDevOrigins: [
    '*.ngrok-free.dev',
    '*.ngrok-free.app',
    ...(process.env.DEV_ORIGINS?.split(',').filter(Boolean) ?? []),
  ],
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@testafila/core'],
  turbopack: {
    root: fileURLToPath(new URL('../', import.meta.url)),
  },
};

export default config;
