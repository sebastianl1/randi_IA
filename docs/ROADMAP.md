# Roadmap de RANDI

Backlog priorizado. Los items marcados `[x]` estan implementados en la version indicada.
Se referencia desde `docs/ARCHITECTURE.md`.

## v2.0.0 — Hecho

- [x] `randi setup`: onboarding por hardware (CLI) con recomendaciones por categoria.
- [x] `randi install <modelo>`: descarga + configuracion automatica (Ollama).
- [x] `randi requirements <modelo>`: hardware minimo requerido.
- [x] Catalogo v2 (85 modelos): categoria llm/image/video, MoE activeParams, tools/thinking.
- [x] SPA `randi web` rediseñada en Astro + Tailwind (home/onboarding, browse, detalle,
      tier list, compare, chat con backend Ollama + WebGPU).
- [x] WebGPU (Transformers.js) re-implementado en la web.
- [x] Landing GitHub Pages rediseñada (`site/`) con instalacion paso a paso por SO (ES/EN).
- [x] API: `/api/setup`, `/api/install` (jobs) + `/api/install/status`, `/api/requirements`.

## v2.1 — En curso (prioridad alta)

- [ ] **RAG local**: indexar documentos (`nomic-embed-text` ya en catalogo) y chatear
      contra ellos en TUI y web. Endpoint `/api/rag`.
- [ ] **Agentes**: modo agente con herramientas (buscar archivo, ejecutar comando, leer
      web) usando modelos con `tools: true`.
- [ ] **Install de imagen/video 1-click vía ComfyUI**: detectar/levantar ComfyUI y cargar
      workflow para los modelos `media` del catalogo.
- [ ] **`randi web` publicado en GitHub Pages** (demo estatica en `/web/`) con `base`.
- [ ] **Sesiones del TUI compartidas con la web** (formato comun JSON).
- [ ] **Deteccion de VRAM real en Windows** (DXGI/NVAPI en vez de DB+heuristica).

## v2.2 — Roadmap medio

- [ ] Benchmark ligero de CPU/GPU para calibrar `tokensPerSecond` por maquina.
- [ ] Modo multiusuario / perfiles de hardware guardados.
- [ ] Plugin de streaming de voz (lerp / minimal TTS neural) para TTS natural.
- [ ] Soporte experimental de video con audio (Wan 2.2 audio / LTX 2.3) en ComfyUI.
- [ ] Estimador de tiempo de descarga y gestion de espacio en disco.

## Vision largo plazo

- [ ] Tienda de "skills" (prompts y recetas) instalables con `randi install`.
- [ ] Coordinador entre varias maquinas (Edge + Workstation) via WebRTC/local.
- [ ] Interfaz basada en agentes para codigo local.

---

**Contribucion**: abre un issue o PR con propuestas claras (ver `CONTRIBUTING.md`).
Los nuevos modelos se anaden SOLO a `web/models.json` (fuente unica de verdad).