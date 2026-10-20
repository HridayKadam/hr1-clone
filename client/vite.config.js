import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import path from 'node:path';

const root = path.resolve(import.meta.dirname);
export default defineConfig({
  root,
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss({ config: path.join(root, 'tailwind.config.js') }), autoprefixer()] } },
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
  build: { outDir: path.join(root, 'dist'), emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
