# Changelog

Todas las versiones notables de RANDI se documentan aqui. Formato basado en [Keep a Changelog](https://keepachangelog.com/).

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
