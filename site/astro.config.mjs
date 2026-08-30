// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// RANDI landing (GitHub Pages). Build -> site/dist (se sube en deploy.yml).
export default defineConfig({
  site: 'https://sebastianl1.github.io/randi_IA/',
  // Project site de GitHub Pages: los assets se sirven bajo /randi_IA/.
  base: '/randi_IA/',
  outDir: './dist',
  vite: { plugins: [tailwindcss()] },
});