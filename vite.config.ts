import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { outDir: 'dist', sourcemap: false, target: 'es2022' },
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  test: { environment: 'jsdom' }
});
