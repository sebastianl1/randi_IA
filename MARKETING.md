# RANDI - Plan y materiales de marketing

Materiales listos para publicar. **Elige tus cuentas y publica desde ahi** (RANDI no publica por ti).

## Posicionamiento (mensaje principal)

> RANDI: IA 100% local en tu celular. Sin nube, sin tokens, sin internet.
> Chat TUI, interfaz web con WebGPU, vision, voz e imagenes. Multiplataforma: Termux, Linux, macOS y Windows.

**Puntos fuertes a destacar:**
- 100% local y offline (privacidad total).
- Corre en un celular de 8GB (qwen2.5-coder:3b + Vulkan).
- Gratis y open source (MIT).
- Vision + voz + generacion de imagenes.
- Interfaz adaptativa (movil vs escritorio).

## Anuncio de release (X/Twitter, es)

> 🚀 RANDI v1.4 — IA 100% local en tu celular 🧠📱
>
> Corre DeepSeek, Qwen, Gemma y Mistral SIN internet ni consumo de tokens.
> ✅ Chat TUI + Web con WebGPU
> ✅ Vision (imagenes), voz e IA generativa
> ✅ Multiplataforma: Termux, Linux, macOS, Windows
> ✅ Codifica con qwen2.5-coder en un 8GB
>
> Gratis y open source (MIT): github.com/sebastianl1/randi_IA
> #LocalAI #Termux #Ollama #Privacy #OpenSource

## Anuncio de release (X/Twitter, en)

> 🚀 RANDI v1.4 — 100% local AI on your phone 🧠📱
>
> Run DeepSeek, Qwen, Gemma & Mistral with NO internet and NO token costs.
> ✅ TUI chat + Web UI with WebGPU
> ✅ Vision, voice & image generation
> ✅ Multiplatform: Termux, Linux, macOS, Windows
> ✅ Code locally with qwen2.5-coder on 8GB RAM
>
> Free & open source (MIT): github.com/sebastianl1/randi_IA
> #LocalAI #Termux #Ollama #Privacy #OpenSource

## Reddit

**r/termux:**
> Hice RANDI: un asistente de IA 100% local para Termux. Chat TUI con streaming, interfaz web con WebGPU (modelos que corren en la GPU del navegador), vision (subir imagenes), voz y generacion de imagenes. Corre DeepSeek/Qwen/Gemma/Mistral sin internet. Multiplataforma. Todo gratis y MIT. ¿Opiniones?

**r/LocalLLaMA:**
> Show HN-ish: RANDI v1.4 — local LLM toolkit for phones. Runs qwen2.5-coder:3b/7b on an 8GB phone via Ollama + optional Vulkan backend on Termux. Includes TUI chat, a WebGPU browser backend (Transformers.js), vision (llava/gemma3), TTS/STT, and imagegen (A1111). Fully offline, MIT. Would love feedback on the WebGPU quantization fallback logic.

**r/ollama:**
> Post sharing RANDI — a multiplatform wrapper/toolkit for Ollama with a nice TUI, a web UI with a WebGPU backend, vision support, and a central models catalog (models.json). Works on Termux, Linux, macOS, Windows.

## ProductHunt

**Titulo:** RANDI — IA local en tu celular, sin internet ni tokens
**Tagline:** Asistente de IA 100% local para Termux, Linux, macOS y Windows. Chat TUI, WebGPU, vision y voz.
**Descripcion:** RANDI instala Ollama en tu dispositivo y ejecuta DeepSeek, Qwen, Gemma y Mistral sin conexion ni consumo de tokens. Incluye chat TUI con streaming, interfaz web con backend WebGPU (modelos en la GPU del navegador), vision (imagenes), texto a voz, voz a texto y generacion de imagenes. Multiplataforma y open source.
**Primer comentario:** "Hola Product Hunt! Soy el creador. RANDI nacio para que la IA no dependa de la nube: tus datos quedan en tu telefono. Probe desde un Android de 8GB y corre modelos de codigo (qwen2.5-coder:3b) con el backend Vulkan. Feliz de responder preguntas."

## Show HN

**Titulo:** Show HN: RANDI – 100% local AI assistant for phones (Ollama + WebGPU)
**Texto:** He been building RANDI: a local-only AI assistant for Termux/Android and desktop (Linux/macOS/Windows). No cloud, no tokens. Features: TUI chat with streaming, web UI with a WebGPU backend (runs models in the browser GPU via Transformers.js, with q4/q8/fp16/32 fallbacks), vision (attach images to llava/gemma3), TTS/STT, imagegen via A1111. A single models.json drives the whole catalog. MIT. Feedback welcome, especially on the WebGPU quantization strategy.

## Guion demo (YouTube 2-3 min)

1. Intro (0-10s): "¿Que pasaria si tu IA corriera dentro de tu celular, sin internet?" + captura.
2. Instalacion (10-35s): `pkg install git && git clone ... && bash install-ollama.sh` (acelerado).
3. Chat (35-70s): `randi chat -m qwen2.5-coder:3b` — hacer una pregunta de codigo.
4. Web (70-110s): `randi web` — mostrar interfaz, backend WebGPU, subir una imagen (vision).
5. Voz/imagenes (110-140s): 🔊 TTS, 🎤 STT, 🎨 generar imagen.
6. Cierre (140-170s): "Todo local, gratis y open source. Enlace abajo. Dale like si quieres una parte 2."

## Shorts / Reels (vertical, 30-45s)

- "IA en tu celular sin internet (0 a 30s)" — instalar + chat.
- "Codifica con IA en tu Android 8GB" — qwen2.5-coder:3b + Vulkan.
- "Tu privacidad: esta IA no sale de tu telefono".
- "Vision + voz + imagenes, todo local".

## Articulos (blog/SEO)

1. "IA local en tu celular con Termux (guia completa)" — target: termux + ia local.
2. "Modelos de codigo en un Android de 8GB: guia real" — target: qwen coder, 8gb.
3. "WebGPU en el navegador: corre LLMs en la GPU del celular".
4. "Privacidad en la era de la IA: por que local > nube".
5. "Ollama en Termux: instalacion nativa y Vulkan".
   Publica en: Medium, dev.to, Hashnode (en/es) y tu blog si tienes.

## Awesome lists (PRs)

- awesome-ollama (ollama ecosystem tools)
- awesome-termux (tools for Termux)
- awesome-local-ai / awesome-llm-apps
- awesome-privacy (privacy tools)
- awesome-ai-on-device

## Comunidad

- Crea un canal de **Telegram** y un servidor de **Discord** "RANDI users".
- Colabora con creadores de contenido de Termux/Android (tutoriales).
- Considera F-Droid / XDA como vias de distribucion Android.

## Medibles (tracking)

- La landing ya usa Cloudflare Web Analytics.
- Configura Google Search Console y Bing Webmaster Tools (verifica `sebastianl1.github.io`).
- Anade UTMs en los enlaces de cada publicacion.
