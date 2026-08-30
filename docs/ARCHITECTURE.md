# Arquitectura de RANDI

RANDI es un asistente de IA local multiplataforma (Termux/Android, Linux, macOS, Windows
WSL2 y Git Bash) que orquesta Ollama desde tres superficies: una CLI en bash, un chat TUI
en Python (Rich) y una SPA web (bridge Ollama + WebGPU). No requiere red: todo corre en
el dispositivo.

## Vista de componentes

```mermaid
graph TD
    subgraph CLI
        R[bin/randi] --> CH[bin/ollama-chat (TUI Rich)]
        R --> ST[bin/lib/setup-wizard: randi setup]
        R --> IN[bin/lib/install.py: randi install]
        R --> C[bin/lib/catalog.py]
        R --> CM[bin/lib/compat.py]
        R --> HW[bin/lib/hardware.py]
        R --> RC[bin/lib/recommend.py]
    end
    IN -->|ollama pull| OL[Ollama]
    IN -->|auto-config| CFG[~/.config/randi/config.json]
    OC[bin/lib/randi_tui (Textual)] -->|HTTP /api/chat| OL
    subgraph Web (randi web)
        SRV[web/server.py] -->|proxy /api/*| OL
        SRV --> STJ[jobs install background]
        SRV -->|static| DIST[web/dist (Astro+Tailwind)]
        DIST --> WG[src/lib/webgpu.ts + Transformers.js]
        WG -->|WebGPU/ONNX| HF[Hugging Face CDN]
        DIST -->|fetch /api/*| SRV
        DIST --> CAT[src/lib/catalog.ts] --> MJ[web/models.json]
    end
    subgraph Landing (site/)
        LND[site/dist (Astro)] --> SP[public/llms.txt, sitemap, JSON-LD]
    end
    MJ[web/models.json] --> C
    MJ --> IN
    MJ --> CAT
```

## Modelo de datos

- `web/models.json` es la **unica fuente de verdad** del catalogo (esquema v2):
  - `ollama`: 60 LLMs instalables por Ollama (chat/code/reasoning/vision/embed/moe) con
    `ollamaId`, `installer`, `tools`, `thinking`, MoE con `activeParams`.
  - `media`: 12 modelos de generacion (imagen/video) con `installer: comfyui` y `url`.
  - `webgpu`: 13 modelos Transformers.js (backend del navegador).
  - `tools`: vision/TTS/STT/imagegen/video.
- Consumidores: `bin/lib/*.py` (CLI/TUI), `web/src/lib/catalog.ts` (SPA, import en build)
  y el API (`server.py`). No se duplica el catalogo en otro archivo.

## Flujos principales

### Onboarding e instalacion (2.0)
```
randi setup          -> detect_hardware() -> hardware_profile() -> rank por categoria
                     -> muestra compatibles vs no-compatibles (con el hardware requerido)
randi install <m>    -> pull de Ollama -> configure_model() en ~/.config/randi/config.json
Web (boton Instalar) -> POST /api/install -> job en background -> GET /api/install/status
```

### `randi` / `randi chat` (UI interactiva)
```
randi (sin args) | randi chat [m]
  -> bin/lib/randi_tui (Textual): header, chat Markdown+stream, input `/`,
     command palette (Ctrl+K), sidebar (modelos/sesiones/hardware), vistas.
  -> POST /api/chat (stream NDJSON) -> Ollama
  -> sesiones JSON en ~/.config/randi/sessions
```

### `randi web`
```
bin/randi web  ->  python3 web/server.py (127.0.0.1:8080-8099)
  -> sirve web/dist + proxy /api/* a OLLAMA_HOST
  -> el navegador elige backend: Ollama (proxy) o WebGPU (Transformers.js en GPU)
```

## Decisiones de arquitectura (ADR)

### ADR-001: SPA vanilla JS con ES modules (sin framework) — SUPERADO por ADR-004

- **Contexto**: el frontend v1 era vanilla para correr sin build step offline.
- **Decision (v1.4)**: vanilla JS + ES modules; solo `marked` y Transformers.js por CDN.
- **Estado**: superado en v2.0 por el ADR-004 (Astro). El refactor propuesto en la deuda
  (extraer render/modales) dejo de aplicar al reestructurarse la SPA completa.

### ADR-002: servidor web enlazado a localhost con origen validado

- **Contexto/Decision**: `server.py` enlaza solo en `127.0.0.1`, valida `Host` (anti DNS
  rebinding) y `Origin` (CSRF), soporta token opcional `RANDI_TOKEN` vía `X-RANDI-Token`
  inyectado como `<meta name="randi-token">` en la SPA.
- **Trade-off**: sin acceso remoto por LAN (no documentado como feature).

### ADR-003: catalogo centralizado en JSON

- Un solo `web/models.json` consumido por `catalog.py`, `pull.py`, `install.py`,
  `recommend.py` y `web/src/lib/catalog.ts`. El CI valida IDs unicos y campos obligatorios.

### ADR-004: frontend como build estatico Astro 5 + Tailwind 4

- **Contexto**: la SPA v1 exigia un mantenimiento manual del DOM y la landing duplicaba
  el catalogo; el proyecto ahora quiere onboarding web, tier/compare y multiplataforma.
- **Decision**: migrar la SPA (`web/`) y la landing (`site/`) a **Astro 5 + Tailwind 4**
  con salida puramente estatica (`web/dist`, `site/dist`). `server.py` sirve `web/dist`
  cuando existe (fallback a `web/` para dev); GitHub Pages sube `site/dist`.
  No hay framework de UI en runtime: los scripts de pagina usan TypeScript vanilla
  agrupado por Vite (sin framework), conservando el espiritu de ADR-001.
- **Trade-offs**: build step (Node + npm) en CI para web y site; el catalogo se importa
  en el bundle para funcionar sin servidor, pero en linea se usa el API como autoridad.
- **Consecuencias**: la SPA sigue siendo cacheable (service worker runtime) y servible
  offline desde el dispositivo.

## Deuda tecnica conocida

| Archivo | Lineas aprox. | Problema |
|---------|---------------|----------|
| `bin/lib/randi_tui/app.py` | ~430 | Orquesta chat+paleta+sidebar+vistas: candidato a separar servicios |
| `web/src/scripts/chat.ts` | ~330 | Orquesta backend, slash, TTS/STT: candidato a split |
| `web/server.py` | ~690 | Proxy + motor compat + jobs: candidato a router separado |

Backlog priorizado en `docs/ROADMAP.md` / `CHANGELOG.md`.