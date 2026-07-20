# RANDI 🤖

**RANDI** — Asistente de IA local para Termux en Android.
Ejecuta modelos de lenguaje (LLMs) como DeepSeek, Qwen, Gemma y otros directamente en tu dispositivo, sin conexion a internet ni consumo de tokens.

## Requisitos

| Requisito | Minimo | Recomendado |
|-----------|--------|-------------|
| RAM | 4GB | 8GB+ |
| Almacenamiento | 3GB libres | 10GB+ |
| Android | 11+ | 13+ |
| Termux | Desde F-Droid | Ultima version |
| Arquitectura | ARM64 | ARM64 |

> **Importante:** Instala Termux desde [F-Droid](https://f-droid.org/packages/com.termux/), NO desde Google Play (version desactualizada).

## Instalacion

```bash
# 1. Actualizar paquetes
pkg update && pkg upgrade -y

# 2. Instalar git
pkg install git -y

# 3. Clonar el repositorio
git clone https://github.com/TU_USUARIO/randi.git
cd randi

# 4. Ejecutar el instalador
bash install-ollama.sh
```

El instalador guiara todo el proceso:
- Instalacion de dependencias
- Instalacion de Ollama para Termux
- Configuracion del shell
- Descarga de modelos (a eleccion del usuario)
- Integracion con OpenCode (si esta instalado)

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
| `randi status` | Estado del sistema |
| `randi config` | Ver configuracion |
| `randi update` | Actualizar RANDI desde GitHub o local |

## Modelos recomendados

### Bajo consumo (< 2GB RAM) — 4-6GB RAM
| Modelo | Tamano | RAM | Uso |
|--------|--------|-----|-----|
| `gemma4:2b` | 1.5GB | ~2.5GB | Rapido, respuestas inmediatas |
| `deepseek-r1:1.5b` | 1.1GB | ~2GB | Razonamiento ligero |
| `qwen2.5-coder:1.5b` | 0.9GB | ~1.5GB | Codigo ligero |
| `qwen2.5-coder:0.5b` | 0.4GB | ~1GB | Super ligero, codigo basico |
| `phi3:mini` | 2.0GB | ~3GB | Microsoft Phi-3 mini |

### Consumo medio (2-4GB RAM) — 6-8GB RAM
| Modelo | Tamano | RAM | Uso |
|--------|--------|-----|-----|
| `llama3.2:3b` | 2.0GB | ~3GB | Meta Llama 3.2, general |
| `qwen3:4b` | 2.5GB | ~3.5GB | Chat ligero y rapido |
| `phi3:3.8b` | 2.3GB | ~3.5GB | Microsoft Phi-3 medio |

### Consumo alto (4-8GB RAM) — 8-12GB RAM
| Modelo | Tamano | RAM | Uso |
|--------|--------|-----|-----|
| `deepseek-r1:7b` | 4.7GB | ~6GB | Razonamiento, logica, analisis |
| `qwen2.5-coder:7b` | 4.7GB | ~6GB | Codigo, programacion, debugging |
| `qwen3:8b` | 4.5GB | ~6GB | Chat general, tareas diversas |
| `mistral:7b` | 4.1GB | ~5.5GB | Mistral v0.3, general |

## Chat TUI

El chat interactivo incluye:

- **Streaming** de tokens en tiempo real
- **Comandos slash**: `/model`, `/system`, `/clear`, `/save`, `/load`, `/temp`, `/help`, `/exit`
- **Historial** de conversacion por sesion
- **Autocompletado** con Tab
- **Colores** para diferenciar roles
- **Sesiones guardables**: guarda y carga conversaciones

## Integracion con OpenCode

Si tienes OpenCode instalado, el instalador configura automaticamente el provider local:

```bash
opencode -m ollama/qwen2.5-coder:7b
```

Modelos disponibles en OpenCode:
- `ollama/deepseek-r1:7b` — Razonamiento
- `ollama/qwen2.5-coder:7b` — Codigo
- `ollama/qwen3:8b` — General
- `ollama/gemma4:2b` — Rapido
- `ollama/deepseek-r1:1.5b` — Razonamiento ligero
- `ollama/qwen2.5-coder:1.5b` — Codigo ligero
- `ollama/llama3.2:3b` — General ligero
- `ollama/qwen3:4b` — Chat ligero

## Variables de entorno

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `OLLAMA_HOST` | `http://localhost:11434` | URL del servidor Ollama |
| `OLLAMA_KEEP_ALIVE` | `-1` | Mantener modelo en RAM (-1 = siempre) |
| `RANDI_DIR` | `~/.local/share/randi` | Directorio de datos de RANDI |

## Estructura del proyecto

```
randi/
├── install-ollama.sh       # Instalador principal
├── README.md               # Este archivo
├── commands.md             # Referencia rapida de comandos
├── bin/
│   ├── randi              # Comando principal
│   ├── ollama-chat         # Wrapper para chat TUI
│   └── lib/
│       └── ollama_chat.py  # Chat TUI en Python
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
