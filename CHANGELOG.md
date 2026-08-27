# Changelog

Todas las versiones notables de RANDI se documentan aqui. Formato basado en [Keep a Changelog](https://keepachangelog.com/).

## [2.0.6] - 2026-08-26

### Added

- **Nueva interfaz interactiva del CLI (TUI, Textual)** estilo opencode/Claude-Code y
  look de DeepSeek Harness. `randi` (sin argumentos) y `randi chat [modelo]` abren la
  UI; la ayuda y los subcomandos con argumentos (`randi help`, `randi --help`,
  `install`, `setup`, `doctor`, ...) siguen en texto de terminal.
  - Estructura: header/status (modelo · servidor ●/○ · sesión · eco/code/temp),
    chat con **Markdown** y streaming por lotes, input `>` con autocompletar de
    comandos `/`, **command palette** (`/` o Ctrl+K), **sidebar** (Tab) con tabs
    Modelos (catálogo con grados S–F) / Sesiones / Hardware, y vistas navegables
    (catálogo, tier list, comparador, perfil de hardware).
  - Comandos `/`: los 16 existentes + `/install`, `/recommend`, `/hardware`,
    `/catalog`, `/tier`, `/compare`, `/session`, `/theme`.
  - Atajos: `/` o Ctrl+K paleta · Tab sidebar · Ctrl+C cancela/generando · Ctrl+D sale.
  - Reutiliza el motor Python (catalog/compat/hardware/recommend/install) y el formato
    de sesiones JSON de siempre.
- **Nueva dependencia**: `textual` (+`httpx`). Instalada automáticamente por el
  instalador y por `randi ensure` (pip). Empaquetada en npm como parte de `bin/lib/randi_tui`.

### Changed

- Se elimina el TUI viejo de Rich (`bin/lib/ollama_chat.py`) y el menú ASCII de bash;
  `randi` abre la UI interactiva. `bin/ollama-chat` ahora lanza `randi_tui`.
- `randi update`/instalador copian toda `bin/lib` (incluye `randi_tui`).

## [2.0.5] - 2026-08-26

### Added

- **Deteccion de hardware al entrar en la landing** (`site/`): boton real
  "Detectar mi equipo" (y auto-deteccion a los 0.7s) 100% en el navegador,
  con chips de RAM/GPU/VRAM/nucleos/plataforma, clase de equipo y
  **sugerencias clasificadas y organizadas** por potencia (movil / basico sin
  GPU / graficos integrados / GPU dedicada / GPU potente), incluyendo la
  cuantizacion recomendada (Q2/Q4/Q6...). Sin imagenes, sin servidor.
- **Seccion "Cuantizados para equipos basicos (sin GPU)"** en la web de
  `randi`: modelos pequenos con su quant optima (qwen3:0.6b, qwen2.5-coder:0.5b/1.5b,
  gemma3:1b, llama3.2:1b, deepseek-r1:1.5b, phi3:mini, nomic-embed-text, ...).
- Deteccion rapida en toda la web: el navegador detecta primero (instantaneo)
  y el servidor se usa en segundo plano (cached) solo para enriquecer.

### Changed

- `web` y `site`: flujo client-first para que el render de hardware aparicion
  al instante (<100ms) en lugar de esperar al servidor.
- `hardware.py`: cache por proceso (30s) y timeouts de subprocesos 10s -> 3s.

## [2.0.4] - 2026-08-26

### Added

- **RANDI 100% nativo en Windows / PowerShell**: nuevo CLI en Python (`bin/randi.py`)
  con paridad de comandos con el bash (`setup`, `install`, `requirements`, `ensure`,
  `chat`, `serve`, `pull`, `web`, `doctor`, `recommend`, `tier`, `compare`, ...).
  El shim npm (`bin/randi.js`) lo ejecuta con `python.exe` en Windows: ya **no
  requiere bash ni Git for Windows**, solo Python y Ollama (ambos nativos, instalados
  por `randi ensure` / winget). En el resto de plataformas sigue usando bash.

### Fixed

- Eliminada la dependencia de Git/Git Bash del flujo npm de Windows (antes fallaba
  con errores de montaje `/c/...`). `randi ensure` ahora instala Python y Ollama nativos.
- Paquete npm: se incluye `bin/randi.py` y se mantiene el tarball limpio de `.pyc`.

## [2.0.3] - 2026-08-26

### Fixed

- **Windows nativo**: el shim npm ahora localiza y usa **explicitamente el bash de
  Git for Windows** (en vez de confiar en un `bash` cualquiera del PATH). Soluciona el
  error `No such file or directory` al ejecutar `randi` (los `/c/...` solo existen en
  el montaje de Git Bash; con WSL o bash generico no resolvian). Como fallback detecta
  si el `bash` es MSYS o WSL y usa `/c/` o `/mnt/c/`.
- Paquete npm: la salida ya no incluye `__pycache__` ni `.pyc` (`.npmignore`).

## [2.0.2] - 2026-08-26

### Fixed

- **Ejecucion en Windows nativo**: el shim npm (`bin/randi.js`) pasaba el path del CLI a
  `bash` con backslashes (`C:\Users\...`), que MSYS interpretaba como escapes y fallaba
  con `/bin/bash: C:Users... No such file or directory`. Ahora se convierte a ruta POSIX
  (`/c/Users/...`) antes de lanzar `bash`. `randi doctor`/`randi setup` vuelven a funcionar.

## [2.0.1] - 2026-08-26

### Added

- **Windows nativo con npm**: paquete `randi-ai` (npm i -g randi-ai / npx randi-ai) con
  shim `bin/randi.js` que ejecuta el CLI via bash (Git for Windows) y primer
  arranque que instala Git/Python/Ollama por **winget** (`randi ensure`). Sin WSL.
- **Landing rediseñada (base canirun.ai)**: nuevo sistema de diseño near-black
  (`#0a0a0a`), formas `rounded-2xl`, chips y grados S-F, panel de deteccion de
  hardware sin imagenes. **Sin capturas ni og-image** en todo el repo.
- **Rebrand multiplataforma**: copy, SEO (JSON-LD, llms.txt, sitemap) y mensajes
  del CLI/instalador pasan de "Termux" a "multiplataforma"; Windows nativo es la
  opción recomendada (WSL2 queda como legado).
- `randi ensure`: verifica/instala dependencias nativas (winget en Windows).
- `LICENSE` (MIT) y `prepack` de npm que incluye el build de `web/dist` en el paquete.

### Fixed

- **Deploy GitHub Pages**: faltaba `actions/deploy-pages@v5`; el workflow subia el
  artefacto pero nunca lo publicaba. Ahora la landing nueva queda en vivo tras el push.
- **CI lint**: 13 errores de `ruff` corregidos (imports desordenados y sin usar).
- Deprecada la landing legacy `docs/` (Termux-only) e imagenes del repo.

## [2.0.0] - 2026-08-26

### Added

- **Onboarding por hardware (CLI + web)**: `randi setup` y la home de la web analizan
  CPU, RAM, GPU, VRAM y bandwidth, clasifican el dispositivo (movil / iGPU / dedicada /
  workstation / Apple Silicon) y recomiendan por categoria (texto, codigo, razonamiento,
  vision), con lo que corre y lo que no.
- **Instalacion automatica de modelos**: `randi install <modelo>` y los botones de la web
  descargan (Ollama) y configuran el modelo por defecto (`~/.config/randi/config.json`).
  Nuevo endpoint `POST /api/install` con jobs en background y `GET /api/install/status`
  para progreso en la UI.
- **"Necesitas este hardware"**: los modelos no compatibles muestran el hardware minimo
  (VRAM, clase de GPU, RAM total, bandwidth) via `required_hardware()` / `randi requirements`.
- **Catalogo v2**: 85 modelos curados (60 LLMs Ollama + 12 de imagen/video + 13 WebGPU)
  con categorias `llm`/`imagen`/`video`, MoE con `activeParams`, `tools`, `thinking`,
  `installer` y `featured`. Base: portafolio canirun.ai.
- **Frontend web rediseñado (Astro 5 + Tailwind 4)**: SPA `randi web` con home/onboarding,
  browse de modelos (filtros, busqueda y atajos `/`, `j`/`k`, 3 modos de vista), detalle con
  tabla de quants + requisitos, **tier list** S-F, **compare** y **chat/playground** con
  doble backend (Ollama + WebGPU/Transformers.js re-implementado), vision, TTS, STT,
  sesiones locales, modo eco y programador. Build estatico servido por `server.py` desde
  `web/dist/` (ADR-004).
- **Landing rediseñada (Astro + Tailwind, `site/`)**: hero con deteccion, secciones por
  categoria, **instalacion paso a paso por SO** (Android/Termux, Linux, macOS, Windows WSL2
  y Git Bash), FAQ, SEO/AEO (JSON-LD, llms.txt, sitemap) y version en ES/EN.
- **`docs/ROADMAP.md`**: backlog priorizado referenciado en la arquitectura.

### Changed

- `web/models.json` es la unica fuente de verdad (esquema v2); `catalog.py`, `recommend.py`
  y `pull.py` ampliados con capa `media` y categorias.
- `hardware.py`: `hardware_profile()`, `device_class()` y deteccion client-side ampliada.
- `compat.py`: `required_hardware()`, `notes_for()` y mapeo a status canirun
  (`comfortable|tight|cpu-offload|insufficient`).
- Comandos nuevos: `randi install`, `randi setup`, `randi requirements`.
- Version interna unificada a 2.0.0 (CLI, SPA `sw.js`, manifest, landing).

### Fixed

- `catalog.py` preferia el catalogo instalado (`~/.local/share/randi/lib`) sobre el del repo;
  ahora prioriza `web/models.json` en desarrollo.
- Referencias colgantes de la SPA anterior (WebGPU sin cliente, botones/modal fantasma):
  el WebGPU se re-implemento y se limpiaron las referencias muertas.

## [Unreleased]

### Fixed
- **bin/randi**: auto-reparacion de PATH. Si el script no está en PATH, lo agrega automaticamente al ejecutarse. Corrige el problema en Windows nativo donde `randi` no se detectaba tras la instalación.
- **Instalador Termux**: deteccion de dependencias (`ensure_dep`) — salta `python`, `pip`, `git`, `curl`, `wget`, `jq` y las librerias Python si ya estan instaladas. Eliminados `pkg update`/`pkg upgrade` automaticos (evitaban el lock de dpkg y actualizaciones no pedidas).
- **Instalador**: `run_step -s` (modo soft) para pasos opcionales — en fallo avisa en amarillo y continua (Vulkan, npm, pip), sin errores rojos. Vulkan muestra mensaje amigable si el paquete no existe.
- **Instalador**: si Ollama no se instala, avisa y continua (antes abortaba con `exit 1`).
- **WebGPU**: corregido `Unsupported device: 'cpu'` — el fallback usa `wasm` en vez de `cpu` (Transformers.js v4).
- **Web UI movil**: quitado el boton `🎨` (Generar imagen) de la fila de entrada y su modal; el textarea ahora es dominante (min-height 48px, auto-crece hasta 160px) y ya no lo aprietan los botones.
- **WebGPU**: corregida la descarga de modelos — el CSP bloqueaba los dominios de Hugging Face (`cdn.huggingface.co`, redirects 307). `connect-src` ahora permite `https://*.huggingface.co` y `https://*.hf.co`; `worker-src` permite jsdelivr.
- **Servidor**: corregido deadlock en el shutdown (SIGINT/SIGTERM) — el handler llamaba a `server_instance.shutdown()` bloqueando para siempre; ahora `sys.exit(0)` limpio.
- **Instalador Windows nativo (sin WSL)**: Ollama ahora se instala automaticamente via `winget` (o descarga el instalador si winget no esta disponible). Antes solo mostraba un aviso para instalar manualmente.
- **Instalador Windows nativo**: `configure_shell` ahora configura `~/.bash_profile` (archivo que Git Bash carga realmente) en vez de `~/.bashrc`.
- **Instalador Windows nativo**: ya no intenta iniciar `ollama serve` directamente ni usar `pkill` (no aplican a Windows donde Ollama corre como servicio). Ahora verifica si el servicio responde y da instrucciones claras si no.
- `randi serve` en Windows: detecta que Ollama es un servicio de Windows y espera a que responda en lugar de intentar iniciarlo como proceso.
- `randi pull` / `pull.py` en Windows: no intenta iniciar `ollama serve` manualmente; da instrucciones para verificar el servicio de Windows.
- Instalador: log en `$RANDI_DIR/install.log` (antes `/install.log`, read-only en Android, que silenciaba `pkg install`). Con fallback a `$HOME/randi-install.log` si el directorio no es escribible.
- Instalador: fallback de `timeout` en macOS (GNU coreutils no incluido); los pasos corren sin limite de tiempo.
- Instalador: `pull.py` ya no crashea si `ollama` no esta en el PATH (Windows nativo).
- Repo: nuevo `.gitattributes` fuerza finales de linea LF en Windows/Git Bash (evita `syntax error` por CRLF).
- Web UI movil: fallback `100vh` para `100dvh` (evita el layout roto en navegadores/WebViews sin soporte `dvh`).
- Web UI movil: `word-break`/`overflow-wrap` en mensajes y tablas con scroll interno (evita desbordes horizontales).
- Web UI movil: restaurada la regla `.msg-content` (un commit previo dejo declaraciones huerfanas y un `}` extra que rompian line-height, font-size y overflow del chat). Balance de llaves del CSS verificado.
- Web UI movil: `min-width: 0` en `#chat-input` y guardas de overflow horizontal en `#app`/`#messages` (evita desbordes en pantallas <=360px).
- Web: cache del service worker a `v1.4.3` para que el navegador no sirva el CSS viejo.
- CI: `ruff.toml` con reglas curadas (`E4,E9,F,I,W`) y errores de lint resueltos (imports, f-strings, globals innecesarios).
- CI: subidas `actions/checkout@v5` y `actions/setup-node@v5` (deprecacion de Node 20).
- Repo: `.opencode/` y `*.log` anadidos a `.gitignore`; configuracion local de `.opencode` fuera del tracking.
- Web: imagen adjunta ya se muestra en el mensaje (se usaba base64 sin prefijo `data:`).
- Web: el streaming no quedaba colgado si Ollama cerraba el stream sin `done:true`.
- Web: acciones WebGPU visibles al recargar con backend webgpu guardado.
- Web: nombre de sesion por defecto sin `:` (ilegal en filesystems).
- Web: `s.model` escapado en la lista de sesiones (self-XSS).
- Web: ComfyUI deshabilitado en el modal (devolvia 501 siempre).
- Servidor: `DELETE` a rutas no-API responde 404 (antes colgaba al cliente).
- i18n: anadidas las claves `faq11`/`faq12` en de, fr, pt y zh.

### Security
- `randi web`: servidor enlazado solo en `127.0.0.1` y validacion de `Host`/`Origin` (anti CSRF/SSRF y DNS rebinding). Eliminado CORS `*`.
- Token opcional `RANDI_TOKEN` (cabecera `X-RANDI-Token`), inyectado como `<meta name="randi-token">` en la SPA.
- CSP basico en la web y viewport con zoom habilitado.
- `sanitizeHtml` endurecido (bloquea `svg`, `form`, `base`, `srcdoc`, `style`, esquemas `data:`).

### Added
- Endpoint `GET /api/health` para monitoreo.
- Tests `pytest` (`tests/`) para catalogo, servidor (seguridad) e i18n; job `test` en CI.
- Workflow de despliegue de GitHub Pages (`deploy.yml`).
- CI: shellcheck (solo errores), ruff y validacion de claves i18n.

### Docs
- Nueva `docs/ARCHITECTURE.md` con diagramas y ADRs.

## [1.4.1] - 2026-08-07

### Fixed
- Backend WebGPU: corregido `ReferenceError` en `getAvailableModels()` que rompia la lista de modelos WebGPU.
- Vision web: se envia el base64 sin el prefijo `data:` que Ollama rechazaba.
- `randi pull`: eliminados los duplicados de modelos `embed`/`moe` en el menu; validacion de IDs.
- `gemma4:2b` (no existia en Ollama) reemplazado por `gemma3:1b` en catalogo, docs y configuracion.

### Added
- Instalador: backend **Vulkan opcional** (aceleracion GPU Adreno/Mali) con deteccion de hardware.
- Perfil: `OLLAMA_FLASH_ATTENTION=1` y `OLLAMA_KV_CACHE_TYPE=q8_0`.
- WebGPU: modelo `Qwen2.5 Coder 3B`; slash commands `/eco`, `/code`, `/tts`, `/image` en la web.
- Aviso al adjuntar imagen con un modelo no-vision.

## [1.4.0] - 2026-08-07

### Added
- **Multiplataforma**: Termux, Linux, macOS, Windows (WSL2 y Git Bash). Shebangs con `env`.
- **Catalogo central** `models.json` (25+ LLMs, 13 WebGPU) consumido por TUI, web y menues bash.
- **Vision**: chat con imagenes en el TUI (`/image`) y la web (adjuntar imagen).
- **Voz**: texto a voz (espeak-ng/piper) y voz a texto (whisper.cpp).
- **Generacion de imagenes**: `randi img` y boton en la web (A1111/ComfyUI).
- **Modo eco** y **modo programador** (TUI + web).
- **UI adaptativa**: bottom sheet en movil, drawer lateral en escritorio (>=1024px).
- Ollama nativo de Termux (paquete `ollama`) con fallback npm.
- Roadmap documentado para generacion de video (no viable localmente).

## [1.3.0] - 2026-08-07

### Fixed
- URL del repositorio corregida (`sebastianl1/randi_IA`).
- Despliegue de la interfaz web tras instalar/actualizar.
- Sanitizacion XSS en el chat web.

## [1.2.0] - 2026-07

### Added
- Interfaz web con doble backend (Ollama + WebGPU/Transformers.js).
- Descarga robusta de modelos WebGPU con fallbacks de cuantizacion.
- Barra de contexto dinamica y estadisticas de tokens.

## [1.1.0] - 2026-06

### Added
- Catalogo de modelos recomendados, sesiones guardables, autocompletado con Tab.
- Integracion con OpenCode.

## [1.0.0] - 2026-06

### Added
- RANDI v1: chat TUI, servidor Ollama, gestion de modelos, instalador para Termux.
