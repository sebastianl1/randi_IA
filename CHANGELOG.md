# Changelog

Todas las versiones notables de RANDI se documentan aqui. Formato basado en [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Fixed
- Instalador: log en `$RANDI_DIR/install.log` (antes `/install.log`, read-only en Android, que silenciaba `pkg install`). Con fallback a `$HOME/randi-install.log` si el directorio no es escribible.
- Instalador: fallback de `timeout` en macOS (GNU coreutils no incluido); los pasos corren sin limite de tiempo.
- Instalador: `pull.py` ya no crashea si `ollama` no esta en el PATH (Windows nativo).
- Repo: nuevo `.gitattributes` fuerza finales de linea LF en Windows/Git Bash (evita `syntax error` por CRLF).
- Web UI movil: fallback `100vh` para `100dvh` (evita el layout roto en navegadores/WebViews sin soporte `dvh`).
- Web UI movil: `word-break`/`overflow-wrap` en mensajes y tablas con scroll interno (evita desbordes horizontales).
- CI: `ruff.toml` con reglas curadas (`E4,E9,F,I,W`) y errores de lint resueltos (imports, f-strings, globals innecesarios).
- CI: subidas `actions/checkout@v5` y `actions/setup-node@v5` (deprecacion de Node 20).
- Repo: `.opencode/` y `*.log` anadidos a `.gitignore`; ***REMOVED*** locales de `.opencode` fuera del tracking.
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
