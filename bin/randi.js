#!/usr/bin/env node
/* RANDI — shim npm (bin `randi`).
   Ejecuta el CLI real (bash) via `bash` (Git for Windows en Windows nativo).
   La instalacion npm/npx permite usar RANDI desde cualquier terminal de
   Windows sin WSL; las dependencias (Git, Python, Ollama) se instalan nativo
   por winget si faltan (ver `randi ensure`). */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, 'randi');
const args = process.argv.slice(2);

function bashAvailable() {
  return new Promise((resolve) => {
    const c = spawn('bash', ['-c', 'exit 0'], { stdio: 'ignore' });
    c.on('error', () => resolve(false));
    c.on('exit', () => resolve(true));
  });
}

function runBash() {
  const child = spawn('bash', [CLI, ...args], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (err) => {
    if (err.code === 'ENOENT') {
      console.error('\n  bash no esta en el PATH.');
      if (process.platform === 'win32') {
        console.error('  En Windows nativo necesitas Git for Windows (incluye bash):');
        console.error('    winget install Git.Git\n  Luego cierra y abre la terminal y ejecuta: randi doctor');
      } else {
        console.error('  Instala bash (tu gestor de paquetes: apt/brew/pacman).');
      }
      process.exit(1);
    }
    console.error('  Error al lanzar RANDI:', err.message);
    process.exit(1);
  });
}

const isWin = process.platform === 'win32';
const ok = isWin && args[0] !== 'ensure' ? await bashAvailable() : true;

if (!ok) {
  console.error('');
  console.error('  RANDI necesita bash (Git for Windows) en Windows nativo.');
  console.error('  Instalamos Git y volvemos a intentar? (s/N)');
  process.stdin.once('data', (d) => {
    if (!/^s/i.test(String(d).trim())) {
      console.error('  Ejecuta: winget install Git.Git\n  y luego de nuevo: randi');
      process.exit(1);
    }
    const w = spawn('winget', ['install', '--silent', 'Git.Git'], { stdio: 'inherit' });
    w.on('exit', (code) => {
      if (code === 0) {
        console.error('\n  Git instalado. Cierra y abre la terminal y ejecuta: randi');
      } else {
        console.error('  No se pudo instalar Git automaticamente. Corre: winget install Git.Git');
      }
      process.exit(code ?? 1);
    });
  });
} else {
  runBash();
}