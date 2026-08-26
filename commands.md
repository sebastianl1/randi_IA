# RANDI - Referencia rapida de comandos

> **Windows nativo:** `npm install -g randi` (luego `randi ensure` para las
> dependencias nativas por winget). O directo sin instalar: `npx randi setup`.

## Comandos principales

```bash
randi                    # Menu interactivo
randi chat               # Chat TUI
randi chat -m <modelo>   # Chat con modelo especifico
randi run <modelo>       # Ejecutar modelo directamente
randi serve              # Iniciar servidor Ollama
randi stop               # Detener servidor
randi setup              # Onboarding: analiza tu hardware y recomienda modelos
randi install <modelo>   # Descarga + configura automaticamente
randi requirements <m>   # Hardware minimo que necesita un modelo
randi ensure             # Verifica/instala deps nativas (winget en Windows)
randi pull               # Menu para descargar modelos (desde models.json)
randi pull <modelo>      # Descargar modelo especifico
randi list               # Listar modelos instalados
randi ps                 # Ver modelos en RAM
randi models             # Catalogo recomendado (85 modelos, v2)
randi status             # Ver estado del sistema
randi config             # Ver configuracion
randi update             # Actualizar RANDI (GitHub o local)
randi web                # Interfaz web local (GPU + Ollama)
randi web 9090           # Web en puerto especifico
randi img "prompt"       # Generar imagen (requiere A1111/GPU local)
randi help               # Mostrar ayuda
```

## Chat TUI - Comandos slash

| Comando | Descripcion |
|---------|-------------|
| `/help` | Mostrar ayuda |
| `/model <nombre>` | Cambiar modelo activo |
| `/system <prompt>` | Cambiar system prompt |
| `/temp <0.0-2.0>` | Ajustar temperatura |
| `/image <ruta>` | Adjuntar imagen (modelos vision) |
| `/eco` | Modo eco: menos RAM (on/off) |
| `/code` | Modo programador |
| `/general` | Volver al modo general |
| `/tts` | Texto a voz (on/off) |
| `/clear` | Limpiar conversacion |
| `/save <nombre>` | Guardar sesion |
| `/load <nombre>` | Cargar sesion |
| `/models` | Listar modelos instalados |
| `/tokens` | Mostrar tokens aproximados |
| `/info` | Info detallada de la sesion |
| `/exit` | Salir del chat |

## Atajos de teclado

| Tecla | Accion |
|-------|--------|
| `Tab` | Autocompletar comandos |
| `Up/Down` | Historial de comandos |
| `Ctrl+C` | Cancelar respuesta / Salir |
| `Ctrl+D` | Salir del chat |

## Modelos recomendados para descargar

### Bajo consumo (< 2GB RAM)
```bash
randi pull gemma3:1b            # Rapido (1.5GB)
randi pull deepseek-r1:1.5b     # Razonamiento ligero (1.1GB)
randi pull qwen2.5-coder:1.5b   # Codigo ligero (0.9GB)
randi pull qwen2.5-coder:0.5b   # Super ligero (0.4GB)
randi pull phi3:mini            # Microsoft Phi-3 (2.0GB)
```

### Consumo medio (2-4GB RAM)
```bash
randi pull llama3.2:3b          # Meta Llama 3.2 (2.0GB)
randi pull qwen3:4b             # Chat ligero (2.5GB)
randi pull phi3:3.8b            # Microsoft Phi-3 (2.3GB)
```

### Consumo alto (4-8GB RAM)
```bash
randi pull deepseek-r1:7b       # Razonamiento (4.7GB)
randi pull qwen2.5-coder:7b     # Codigo (4.7GB)
randi pull qwen3:8b             # Chat general (4.5GB)
randi pull mistral:7b           # Mistral v0.3 (4.1GB)
```

## OpenCode

```bash
# Usar con modelo local
opencode -m ollama/qwen2.5-coder:7b
opencode -m ollama/deepseek-r1:7b
opencode -m ollama/qwen3:8b
opencode -m ollama/gemma3:1b
opencode -m ollama/llama3.2:3b
opencode -m ollama/qwen2.5-coder:1.5b
```

## Modelos por tipo y optimizacion

| Tipo | Ejemplos | Como se usa |
|------|----------|-------------|
| Chat | qwen3:1.7b, llama3.2:1b, smollm2:1.7b | `randi chat -m <modelo>` |
| Codigo | qwen2.5-coder:0.5b/1.5b/3b/7b, codegemma:2b | `/code` o toggle web |
| Razonamiento | deepseek-r1:1.5b/7b | `randi chat -m deepseek-r1:7b` |
| Vision | gemma3:1b/4b, llava:7b, llava-phi3, qwen2.5vl:7b | `/image ruta` o 📎 en web |
| MoE (eficiente) | qwen3-moe:0.6b | Potencia alta con pocos recursos |
| Embeddings | nomic-embed-text, mxbai-embed-large | RAG |

**Modo eco** (menos RAM): `/eco` en TUI o toggle en la web. Reduce contexto y tokens segun RAM libre.

## Texto, voz e imagenes

```bash
# Texto a voz (TUI)
/tts                      # activa voz en las respuestas

# Voz a texto (web, requiere whisper.cpp manual)
# Boton 🎤 en el input

# Generacion de imagenes
randi img "un perro astronauta"
# O boton 🎨 en la web (requiere A1111 en 127.0.0.1:7860)
```

| Funcion | Backend | Instalacion |
|---------|---------|-------------|
| TTS | espeak-ng / piper | `pkg install espeak-ng` (Termux), `apt install espeak-ng` |
| STT | whisper.cpp | Build manual (no esta en repos) |
| Imagen | Automatic1111 / ComfyUI | GPU dedicada, escritorio |

> **Video:** no viable localmente en telefonos; en el roadmap (GPU dedicada / Wan 2.1 en Colab).

## Web UI

```bash
randi web                    # Puerto por defecto (8080)
randi web 3000               # Puerto especifico
```

- Abre automaticamente el navegador
- Backend **Ollama**: modelos grandes via servidor local
- Backend **WebGPU**: modelos pequenos (<2B) en GPU del navegador
- Se descargan una sola vez y se cachean en el navegador
- Descarga robusta: reintenta con distintos tipos de cuantizacion (q4/q8/fp16/fp32) y usa CPU si WebGPU falla
- Conversacion multi-turno con historial y system prompt en ambos backends
- Barra de contexto dinamica segun el modelo y estadisticas de tokens
- Proxy automatico de `/api/*` al servidor Ollama
- UI adaptativa: bottom sheet en movil, drawer lateral en escritorio
- Vision (📎), texto a voz (🔊), voz a texto (🎤) y generacion de imagenes (🎨)
- Toggles de **modo eco** y **modo programador**

## Variables de entorno

```bash
export OLLAMA_HOST=http://localhost:11434
export OLLAMA_KEEP_ALIVE=-1
export OLLAMA_FLASH_ATTENTION=1      # Mas rapido
export OLLAMA_KV_CACHE_TYPE=q8_0     # Menos RAM
export RANDI_DIR=$HOME/.local/share/randi
```

## Codificar en celular (8GB RAM)

```bash
# 1. Aceleracion por GPU (Termux/Android)
#    Qualcomm/Adreno -> mesa-vulkan-icd-freedreno
#    Mali            -> mesa-vulkan-icd-mali-t7xx
#    (el instalador elige el driver segun el SoC)
pkg install ollama-backend-vulkan

# 2. Modelo recomendado (punto dulce)
randi pull qwen2.5-coder:3b
opencode -m ollama/qwen2.5-coder:3b

# 3. Mas potente (7B, cierra apps, requiere Vulkan)
randi pull qwen2.5-coder:7b
```

Alternativa: backend **WebGPU** en `randi web` con `Qwen2.5 Coder 1.5B` o `3B` (GPU del navegador).

## Mantenimiento

```bash
# Actualizar Ollama (Termux)
pkg upgrade ollama            # paquete nativo
# o npm update -g @mmmbuto/ollama-termux   (si usas el paquete npm)

# Ver espacio usado por modelos
du -sh ~/.ollama/models/

# Eliminar un modelo
ollama rm <modelo>

# Ver uso de RAM
free -h
```
