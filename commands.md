# RANDI - Referencia rapida de comandos

## Comandos principales

```bash
randi                    # Menu interactivo
randi chat               # Chat TUI
randi chat -m <modelo>   # Chat con modelo especifico
randi run <modelo>       # Ejecutar modelo directamente
randi serve              # Iniciar servidor Ollama
randi stop               # Detener servidor
randi pull               # Menu para descargar modelos
randi pull <modelo>      # Descargar modelo especifico
randi list               # Listar modelos instalados
randi ps                 # Ver modelos en RAM
randi models             # Ver catalogo recomendado
randi status             # Ver estado del sistema
randi config             # Ver configuracion
randi update             # Actualizar RANDI (GitHub o local)
randi help               # Mostrar ayuda
```

## Chat TUI - Comandos slash

| Comando | Descripcion |
|---------|-------------|
| `/help` | Mostrar ayuda |
| `/model <nombre>` | Cambiar modelo activo |
| `/system <prompt>` | Cambiar system prompt |
| `/temp <0.0-2.0>` | Ajustar temperatura |
| `/clear` | Limpiar conversacion |
| `/save <nombre>` | Guardar sesion |
| `/load <nombre>` | Cargar sesion |
| `/models` | Listar modelos instalados |
| `/tokens` | Mostrar tokens aproximados |
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
randi pull gemma4:2b            # Rapido (1.5GB)
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
opencode -m ollama/gemma4:2b
opencode -m ollama/llama3.2:3b
opencode -m ollama/qwen2.5-coder:1.5b
```

## Variables de entorno

```bash
export OLLAMA_HOST=http://localhost:11434
export OLLAMA_KEEP_ALIVE=-1
export RANDI_DIR=$HOME/.local/share/randi
```

## Mantenimiento

```bash
# Actualizar Ollama
npm update -g @mmmbuto/ollama-termux

# Ver espacio usado por modelos
du -sh ~/.ollama/models/

# Eliminar un modelo
ollama rm <modelo>

# Ver uso de RAM
free -h
```
