// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// RANDI web 2.0 — SPA estatica (Astro + Tailwind 4). El build se sirve desde
// web/dist via python3 web/server.py y se publica en GitHub Pages.
export default defineConfig({
  outDir: './dist',
  vite: {
    plugins: [tailwindcss()],
    build: {
      target: 'esnext',
    },
  },
  build: {
    assets: '_astro',
  },
});