# RANDI 🤖

[![Version](https://img.shields.io/github/v/release/sebastianl1/randi_IA?label=version&style=flat-square)](https://github.com/sebastianl1/randi_IA/releases)
[![Stars](https://img.shields.io/github/stars/sebastianl1/randi_IA?style=flat-square)](https://github.com/sebastianl1/randi_IA/stargazers)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Plataformas](https://img.shields.io/badge/Termux%20%E2%80%A2%20Linux%20%E2%80%A2%20macOS%20%E2%80%A2%20Windows%20%E2%80%A2%20WSL2-6c8cff?style=flat-square)]()
[![CI](https://img.shields.io/badge/CI-passing-brightgreen?style=flat-square)]()
[![Web](https://img.shields.io/badge/Web-sebastianl1.github.io/randi_IA-6c8cff?style=flat-square)](https://sebastianl1.github.io/randi_IA/)

**RANDI Workspace** — un **ecosistema de trabajo impulsado por IA**, **online u offline**. Multiplataforma: Android (Termux), Linux, macOS y **Windows nativo** (npm, sin WSL).
Ejecuta modelos de lenguaje (LLMs) como DeepSeek, Qwen, Gemma y otros directamente en tu dispositivo, sin conexion a internet ni consumo de tokens. Incluye chat TUI, interfaz web con WebGPU, deteccion de hardware con recomendacion automatica, vision, voz, texto a voz y generacion de imagenes.

> 💬 **Prueba el chat online de RANDI** desde la landing:
> [Chatear](https://sebastianl1.github.io/randi_IA/chat/) ·
> [Modelos](https://sebastianl1.github.io/randi_IA/#models) ·
> [Documentación](https://sebastianl1.github.io/randi_IA/docs/) ·
> [Donaciones](https://sebastianl1.github.io/randi_IA/donar/)

## Web

La **landing** (GitHub Pages, ES/EN) ofrece **"Chatea con nosotros"**: modelos
de IA para probar online desde el navegador, sin instalar nada, con el
**contexto guardado en tu dispositivo** (`localStorage`), exportación JSON,
cero cookies y límite diario gratuito. Incluye el **catálogo de los 72
modelos** compatibles, documentación por plataforma y una página de
donaciones.

## Requisitos

| Requisito | Minimo | Recomendado |
|-----------|--------|-------------|
| RAM | 4GB | 8GB+ |
| Almacenamiento | 3GB libres | 10GB+ |
| SO | Android 11+, Linux, macOS, Windows | Ultima version |
| Termux (Android) | Desde F-Droid | Ultima version |
| Arquitectura | ARM64 | ARM64 |

> **Importante (Android):** Instala Termux desde [F-Droid](https://f-droid.org/packages/com.termux/), NO desde Google Play (version desactualizada).

## Instalacion por plataforma

### Android (Termux)

```bash
pkg update && pkg upgrade -y
pkg install git -y
git clone https://github.com/sebastianl1/randi_IA.git
cd randi_IA
bash install-ollama.sh
```

El instalador usa el paquete nativo `ollama` de Termux (con fallback al paquete npm si no existe).

### Linux / macOS

```bash
git clone https://github.com/sebastianl1/randi_IA.git
cd randi_IA
bash install-ollama.sh
```

Ollama se instala con el script oficial (`curl -fsSL https://ollama.com/install.sh`). En macOS se requiere Homebrew.

### Windows — nativo con npm (sin WSL, sin Git Bash)

**Opcion A (recomendada) — Natal desde npm, 100% PowerShell:**

```powershell
npm install -g randi-ai
randi ensure     # instala solo Python y Ollama por winget (nativos)
randi setup      # analiza tu GPU/VRAM y recomienda modelos
```

RANDI corre **directo en PowerShell / Windows Terminal** con **Python nativo**
(no usa bash ni Git for Windows). Ollama funciona como **servicio nativo de
Windows**. También puedes correrlo sin instalarlo: `npx randi-ai setup`.

**Opcion B — Legado (WSL2):** ya no es necesaria. Solo si prefieres el flujo Linux:

```bash
# Dentro de la terminal de WSL2
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/sebastianl1/randi_IA.git
cd randi_IA
bash install-ollama.sh
```

> El instalador detecta la plataforma automaticamente (Termux, Linux, macOS, Windows nativo, WSL2).

El instalador guiara todo el proceso:
- Instalacion de dependencias
- Instalacion de Ollama para Termux
- Configuracion del shell
- Descarga de modelos
- Configuracion del shell y modelos

## Uso rapido

```bash
# Iniciar el servidor Ollama
randi serve

# Menu interactivo
randi

# Chat TUI directo
randi chat

# Chat con modelo especifico
randi chat -m deepseek-r1:7b

# Ejecutar modelo directamente
randi run qwen2.5-coder:7b

# Listar modelos instalados
randi list

# Descargar modelos
randi pull

# Onboarding: analiza tu hardware y recomienda modelos
randi setup
randi install qwen3:8b   # Descarga + configura automaticamente

# Ver catalogo recomendado
randi models

# Generar imagen (requiere A1111/GPU local)
randi img "un perro astronauta"
```

## Comandos

| Comando | Descripcion |
|---------|-------------|
| `randi` | Menu interactivo principal |
| `randi chat [modelo]` | Chat TUI con streaming |
| `randi run [modelo]` | Ejecuta modelo directamente |
| `randi serve` | Inicia servidor Ollama |
| `randi stop` | Detiene servidor Ollama |
| `randi pull [modelo]` | Descarga modelo(s) |
| `randi list` | Lista modelos instalados |
| `randi ps` | Modelos cargados en RAM |
| `randi models` | Catalogo de modelos recomendados |
| `randi img "prompt"` | Genera una imagen (A1111/GPU local) |
| `randi status` | Estado del sistema |
| `randi setup` | Onboarding: analiza tu hardware y recomienda modelos |
| `randi install <modelo>` | Descarga y configura un modelo automáticamente |
| `randi requirements <modelo>` | Hardware mínimo que necesita un modelo |
| `randi ensure` | Verifica/instala dependencias nativas (winget en Windows) |
| `randi config` | Ver configuracion |
| `randi update` | Actualizar RANDI desde GitHub o local |

## Modelos recomendados

El catalogo se centraliza en `models.json` y se consulta con
`randi models`, `randi models media`, `randi setup` o la web (**72 modelos** en el
listado online). Clasificados por tipo:
**texto/codigo/razonamiento/vision**, **imagen** y **video**. Algunos destacados:

### Bajo consumo (< 2GB RAM) — 4-6GB RAM
| Modelo | Tamano | Uso |
|--------|--------|-----|
| `gemma3:1b` | 1.5GB | Rapido, respuestas inmediatas |
| `qwen3-moe:0.6b` | 0.9GB | **MoE**: potencia alta con pocos recursos |
| `gemma3:1b` | 1.3GB | Vision + chat ligero |
| `deepseek-r1:1.5b` | 1.1GB | Razonamiento ligero |
| `qwen2.5-coder:1.5b` | 0.9GB | Codigo ligero |
| `qwen2.5-coder:0.5b` | 0.4GB | Super ligero, codigo basico |
| `qwen3:1.7b` | 1.3GB | Chat ligero y rapido |
| `nomic-embed-text` | 0.3GB | Embeddings (RAG) |

### Consumo medio (2-4GB RAM) — 6-8GB RAM
| Modelo | Tamano | Uso |
|--------|--------|-----|
| `llama3.2:3b` | 2.0GB | Meta Llama 3.2, general |
| `qwen3:4b` | 2.5GB | Chat ligero y rapido |
| `qwen2.5-coder:3b` | 1.9GB | Codigo medio |
| `phi4-mini:3.8b` | 2.3GB | Microsoft Phi-4 mini |
| `llava-phi3:3.8b` | 2.2GB | Vision ligera |

### Consumo alto (4-8GB RAM) — 8-12GB RAM
| Modelo | Tamano | Uso |
|--------|--------|-----|
| `deepseek-r1:7b` | 4.7GB | Razonamiento, logica, analisis |
| `qwen2.5-coder:7b` | 4.7GB | Codigo, programacion, debugging |
| `qwen3:8b` | 4.5GB | Chat general, tareas diversas |
| `gemma3:4b` | 4.9GB | Vision + chat potente |
| `llava:7b` | 4.7GB | Vision clasica |
| `qwen2.5vl:7b` | 6.5GB | Vision avanzada |
| `mistral:7b` | 4.1GB | Mistral v0.3, general |

### Optimizacion — Modo eco

Usa el **modo eco** para correr modelos potentes con pocos recursos:

- **TUI:** `/eco` reduce contexto y tokens segun la RAM libre.
- **Web:** toggle "Modo eco" en la configuracion.
- `optimal_context` ajusta automaticamente el contexto al modelo y a la RAM disponible.
- El perfil exporta `OLLAMA_FLASH_ATTENTION=1` y `OLLAMA_KV_CACHE_TYPE=q8_0` (menos RAM, mas rapido).

## Programar con IA en el celular (8GB RAM)

Si quieres codificar desde un telefono de 8GB, la configuracion recomendada es:

1. **Instala el backend Vulkan** durante `install-ollama.sh` (o manual: `pkg install ollama-backend-vulkan mesa-vulkan-icd-freedreno`). Usa la GPU Adreno/Mali y hace viable modelos de 7B.
2. **Usa `qwen2.5-coder:3b`** como punto dulce: rapido, ligero (~2GB) y suficiente para chat y agentes de codigo.
3. Para tareas mas grandes, **`qwen2.5-coder:7b`** (4.7GB) corre en 8GB cerrando apps, y con Vulkan es usable.
4. **Agente de codigo**: `randi chat qwen2.5-coder:3b`.
5. **En el navegador**: la web con backend WebGPU corre `Qwen2.5 Coder 1.5B`/`3B` en la GPU del Chrome (Android).

> **Nota:** el autocompletado tipo Copilot en un editor movil no es realista localmente; lo que funciona es el agente (chat/refactor) via randi chat o la web.

## Interfaz interactiva (CLI / TUI)

`randi` (sin argumentos) o `randi chat [modelo]` abren la **UI interactiva** (Texto,
estilo terminal moderno). `randi help` / `randi --help` y los subcomandos con argumentos siguen
en la terminal de texto.

- **Header/status**: modelo activo, servidor (●/○), sesion, badges eco/code/temp.
- **Chat** con streaming y **Markdown**; input `>` con autocompletar.
- **Command palette**: `/` o `Ctrl+K` (busca comandos y acciones).
- **Sidebar** (`Tab`): Modelos (catalogo con grados S–F), Sesiones, Hardware.
- **Vistas navegables**: catalogo, tier list, comparador y perfil de hardware (comandos
  `/catalog`, `/tier`, `/compare`, `/hardware` o desde la paleta).
- **Comandos slash**: `/model`, `/system`, `/image`, `/eco`, `/code`, `/general`, `/tts`,
  `/clear`, `/save`, `/load`, `/temp`, `/info`, `/help`, `/exit` + `/install`, `/recommend`,
  `/session`, `/theme`.
- **Atajos**: `/` o Ctrl+K paleta · Tab sidebar · Ctrl+C cancela la respuesta · Ctrl+D sale.
- **Sesiones guardables** en `~/.config/randi/sessions` · **Vision** `/image <ruta>` ·
  **Texto a voz** `/tts` (espeak-ng/piper).

## Interfaz web

Ejecuta `randi web` para abrir la interfaz web local (Astro + Tailwind) rediseñada con dos backends:

- **Ollama** — modelos grandes via el servidor local.
- **WebGPU** — modelos pequenos (<4B) corriendo en la GPU del navegador con Transformers.js.

Pantallas:
- **Home/onboarding**: analiza el hardware y muestra recomendaciones por categoria, los
  modelos instalables y los que necesitan más hardware (con el requisito exacto).
- **Modelos (browse)**: filtros (caso de uso, proveedor, tools, razonamiento, MoE, "solo
  lo que corre"), busqueda y atajos (`/`, `j`/`k`), y 3 modos de vista.
- **Detalle**: tabla de cuantizaciones por tu hardware + boton "Instalar" (progreso real).
- **Tier list** S–F exportable y **Compare** entre dos modelos.
- **Chat/Playground**: streaming, vision (📎), TTS (🔊), STT (🎤), sesiones, modo eco y programador.

La instalacion de un modelo desde la web usa `POST /api/install` con jobs en background y
progreso consultable (`/api/install/status`); al terminar queda configurado como modelo
por defecto.

## Otros tipos de modelos

| Tipo | Como se usa | Requisitos |
|------|-------------|------------|
| **Vision** (entender imagenes) | `randi chat` + `/image ruta`, o 📎 en la web | Modelo vision (llava, gemma3, qwen2.5vl) |
| **Codigo** | `/code` en TUI, toggle "Modo programador" en web | qwen2.5-coder, codegemma |
| **Texto a voz** | `/tts` en TUI, 🔊 en web | `pkg install espeak-ng` |
| **Voz a texto** | 🎤 en la web | whisper.cpp (build manual) |
| **Generacion de imagenes** | `randi img "prompt"`, 🎨 en la web | A1111/ComfyUI local, GPU |
| **Embeddings** (RAG) | Modelos `*-embed` | nomic-embed-text, mxbai-embed-large |

> **Video:** la generacion de video local no es viable en telefonos ni equipos sin GPU dedicada. Esta en el roadmap (ej. Wan 2.1 en Colab).

## Variables de entorno

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `OLLAMA_HOST` | `http://localhost:11434` | URL del: servidor Ollama |
| `OLLAMA_KEEP_ALIVE` | `-1` | Mantener modelo en RAM (-1 = siempre) |
| `RANDI_DIR` | `~/.local/share/randi` | Directorio de datos de RANDI |
| `RANDI_MODELS` | (auto) | Ruta alternativa al `models.json` |

## Estructura del proyecto

```
randi/
├── package.json            # Paquete npm (Windows nativo: npm i -g randi-ai)
├── install-ollama.sh       # Instalador multiplataforma (Termux/Linux/macOS/WSL)
├── README.md               # Este archivo
├── commands.md             # Referencia rapida de comandos
├── bin/
│   ├── randi.js           # Shim npm -> CLI real
│   ├── randi              # Comando principal
│   ├── ollama-chat         # Wrapper para chat TUI
│   └── lib/
│       ├── randi_tui/      # UI interactiva (Textual): chat, paleta, sidebar
│       ├── catalogo.py      # Lector del catalogo models.json
│       ├── compat.py       # Motor de compatibilidad (skills globales)
│       ├── hardware.py     # Deteccion de hardware + perfil
│       ├── recommend.py    # Ranking, tier y best picks
│       ├── install.py      # randi setup / install / requirements / ensure
│       └── pull.py         # Menu de descarga de modelos
├── web/                    # SPA `randi web` (Astro 5 + Tailwind 4)
│   ├── server.py          # Servidor web (proxy + motor compat + jobs de install)
│   ├── models.json        # Catalogo central v2 (72 modelos)
│   └── src/               # Paginas y scripts de la SPA
├── site/                   # Landing GitHub Pages (Astro, ES/EN): /chat, /docs,
│   │                       #  /donar, catalogo con carrusel, deteccion de hardware
└── docs/                   # Documentacion: ARCHITECTURE, ROADMAP
```

## Solucion de problemas

### "Ollama no esta corriendo"
```bash
randi serve
```

### "No hay modelos instalados"
```bash
randi pull
```

### "comando no encontrado"
```bash
export PATH="$HOME/bin:$PATH"
# Y agrega esta linea a ~/.zshrc o ~/.bashrc
```

### Error de memoria
Usa modelos mas pequenos. Revisa:
```bash
randi ps  # Modelos en RAM
free -h      # Memoria disponible
```

## Licencia

MIT

## Soporte

RANDI es un proyecto open source, gratuito y sin publicidad, hecho con dedicacion para la comunidad.

- ⭐ **Da una estrella** en [GitHub](https://github.com/sebastianl1/randi_IA) si te resulta util.
- 🐛 Reporta errores o sugiere mejoras en [Issues](https://github.com/sebastianl1/randi_IA/issues).
- 🌐 Comparte el proyecto en redes, comunidades de Termux/IA y listas de recursos.
- 🤝 Las contribuciones son bienvenidas (ver `CONTRIBUTING.md`).

### Apoya el desarrollo (open source)

Tu apoyo mantiene el chat online gratis, el catálogo y el desarrollo constante:

- ❤️ **GitHub Sponsors** — [sebastianl1](https://github.com/sponsors/sebastianl1)
- ☕ **Buy Me a Coffee** — [sebasbele1c](https://buymeacoffee.com/sebasbele1c)
- 💳 **Cripto y otros métodos** están en el roadmap; escribinos si preferís
  arreglar otra forma a medida.
- 

## HECHO POR SEBASTIAN LAGUNA
