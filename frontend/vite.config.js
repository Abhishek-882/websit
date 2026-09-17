import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  define: {
    'process.env': {},
    global: 'globalThis',
    __BUILD_TIMESTAMP__: Date.now(),
  },
  resolve: {
    alias: {
      '@solana/kit': path.resolve(__dirname, 'src/stubs/solana-kit.js'),
      '@solana/wallet-standard-wallet-adapter-base': path.resolve(__dirname, 'src/stubs/wallet-standard-base.js'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
});
