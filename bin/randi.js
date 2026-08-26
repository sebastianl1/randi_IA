#!/usr/bin/env node
/* RANDI — shim npm (bin `randi`).
   - Windows nativo: ejecuta el CLI en Python (bin/randi.py) directamente con
     python.exe. NO requiere bash ni Git for Windows. Si falta Python se
     ofrece instalarlo por winget (Python.Python.3.12).
   - Resto de plataformas (Linux/macOS/Termux): usa bash con bin/randi. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const CLI_BASH = join(here, 'randi');       // CLI bash (no-Windows)
const CLI_PY = join(here, 'randi.py');      // CLI nativo Python (Windows)
const args = process.argv.slice(2);
const isWin = process.platform === 'win32';

function findPython() {
  for (const c of ['py', 'python', 'python3']) {
    const r = spawnSync(c, ['-c', 'import sys; print(1)'], { stdio: 'ignore' });
    if (r.status === 0) return c;
  }
  return '';
}

function run(cmd, script) {
  const child = spawn(cmd, [script, ...args], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (err) => {
    console.error('\n  Error al lanzar RANDI:', err.message);
    process.exit(1);
  });
}

function ensurePython() {
  let python = findPython();
  if (python) return python;
  if (!isWin) {
    console.error('\n  RANDI necesita Python 3. Instalalo (apt/brew/pacman) y reintenta.');
    process.exit(1);
  }
  return new Promise((resolve) => {
    console.error('\n  RANDI necesita Python 3 en Windows nativo.');
    console.error('  Instalamos Python por winget? (s/N)');
    process.stdin.once('data', (d) => {
      if (!/^s/i.test(String(d).trim())) {
        console.error('  Ejecuta: winget install Python.Python.3.12\n  y luego de nuevo: randi');
        process.exit(1);
      }
      const w = spawn('winget', ['install', '--silent', 'Python.Python.3.12'], { stdio: 'inherit' });
      w.on('exit', (code) => {
        if (code === 0 && findPython()) {
          console.error('\n  Python instalado.');
          resolve(findPython());
        } else {
          console.error('  No se pudo instalar Python. Cierra y abre la terminal y reintenta.');
          process.exit(code ?? 1);
        }
      });
    });
  });
}

async function main() {
  if (!isWin) {
    if (!existsSync(CLI_BASH)) {
      console.error('\n  No se encuentra bin/randi en el paquete instalado.');
      console.error('  Reinstala: npm install -g randi-ai@latest');
      process.exit(1);
    }
    run('bash', CLI_BASH);
    return;
  }
  const python = await ensurePython();
  run(python, CLI_PY);
}

main();