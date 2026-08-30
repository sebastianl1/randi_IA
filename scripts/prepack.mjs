/* RANDI — prepack: construye la web (web/dist) para que el paquete npm
   incluya la interfaz lista (`randi web` funciona sin build). */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const web = join(root, 'web');

console.log('  [prepack] instalando deps de web...');
let r = spawnSync('npm', ['--prefix', web, 'ci', '--no-audit', '--no-fund'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (r.status !== 0) process.exit(r.status ?? 1);

console.log('  [prepack] construyendo web/dist...');
r = spawnSync('node', ['node_modules/astro/astro.js', 'build'], { stdio: 'inherit', cwd: web });
process.exit(r.status ?? 1);