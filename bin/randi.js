#!/usr/bin/env node
/* RANDI — shim npm (bin `randi`).
   Ejecuta el CLI real (bash `bin/randi`) sin depender de montajes de PATH:
   - En Windows usa EXPLICITAMENTE el bash de Git for Windows (path real), con
     la ruta del script en formato MSYS (/c/Users/...), que es el que entiende.
   - Fallback: si no hay Git Bash, detecta si el `bash` del PATH es MSYS o WSL
     y usa el mapeo correspondiente (/c/... o /mnt/c/...).
   Dependencias nativas (Git, Python, Ollama) se instalan por winget: `randi ensure`. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, 'randi');
const args = process.argv.slice(2);
const isWin = process.platform === 'win32';

// Git for Windows: bash.exe real para no depender del `bash` del PATH.
function findGitBash() {
  const roots = [];
  if (process.env.ProgramFiles) roots.push(join(process.env.ProgramFiles, 'Git'));
  if (process.env.LOCALAPPDATA) roots.push(join(process.env.LOCALAPPDATA, 'Programs', 'Git'));
  roots.push('C:\\Program Files\\Git');
  for (const root of roots) {
    for (const rel of ['bin\\bash.exe', 'usr\\bin\\bash.exe']) {
      const p = join(root, rel);
      if (existsSync(p)) return p;
    }
  }
  return '';
}

function msysPath(p) {          // C:\x -> /c/x
  let s = p.replace(/\\/g, '/');
  return s.replace(/^([A-Za-z]):/, (_m, d) => '/' + d.toLowerCase());
}
function wslPath(p) {           // C:\x -> /mnt/c/x
  let s = p.replace(/\\/g, '/');
  return s.replace(/^([A-Za-z]):/, (_m, d) => '/mnt/' + d.toLowerCase());
}

function run(bashBin, scriptArg) {
  const child = spawn(bashBin, [scriptArg, ...args], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (err) => {
    if (err.code === 'ENOENT') {
      console.error('\n  No se encontro el bash.');
      if (isWin) {
        console.error('  En Windows nativo instala Git for Windows (incluye bash):');
        console.error('    winget install Git.Git\n  Luego cierra y abre la terminal y ejecuta: randi');
      } else {
        console.error('  Instala bash (tu gestor de paquetes: apt/brew/pacman).');
      }
      process.exit(1);
    }
    console.error('  Error al lanzar RANDI:', err.message);
    process.exit(1);
  });
}

function main() {
  if (!existsSync(CLI)) {
    console.error('\n  No se encuentra bin/randi en el paquete instalado.');
    console.error('  Reinstala el paquete:  npm install -g randi-ai@latest');
    process.exit(1);
  }
  if (!isWin) { run('bash', CLI); return; }

  const gitBash = findGitBash();
  if (gitBash) { run(gitBash, msysPath(CLI)); return; }

  // Sin Git Bash: detectar el tipo de `bash` del PATH.
  const probe = spawnSync('bash', ['-c', 'printf %s "$MSYSTEM"'], { encoding: 'utf8' });
  const isMsys = probe.status === 0 && /MINGW|MSYS/i.test(probe.stdout || '');
  if (isMsys) { run('bash', msysPath(CLI)); return; }
  run('bash', wslPath(CLI)); // WSL o similar (montaje /mnt/c)
}

main();