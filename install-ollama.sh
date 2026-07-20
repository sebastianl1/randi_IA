#!/data/data/com.termux/files/usr/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# RANDI - Local AI Terminal Installer
# Asistente IA local para Termux con Ollama
# Creado por Sebastian Laguna
# Uso: source install-ollama.sh  (recomendado)
#      bash install-ollama.sh
# ═══════════════════════════════════════════════════════════════════════════

R='\033[0m'; B='\033[1m'; D='\033[2m'
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; BLU='\033[0;34m'
CYN='\033[0;36m'; MGN='\033[0;35m'

info()  { echo -e "${BLU}${B}[*]${R} $1"; }
ok()    { echo -e "${GRN}${B}[+]${R} $1"; }
warn()  { echo -e "${YLW}${B}[!]${R} $1"; }
err()   { echo -e "${RED}${B}[x]${R} $1"; }
dim()   { echo -e "${D}$1${R}"; }
title() { echo -e "\n${BLU}${B}== $1 ==${R}\n"; }
hr()    { echo -e "${D}----------------------------------------${R}"; }

# ─── Config ───────────────────────────────────────────────────────────────
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RANDI_DIR="$HOME/.local/share/randi"
BIN_DIR="$HOME/bin"
OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"
RANDI_REPO="${RANDI_REPO:-https://github.com/TU_USUARIO/randi.git}"

# ─── Detect Shell ─────────────────────────────────────────────────────────
detect_shell() {
    local shell_name
    # Detectar el shell REAL del proceso actual
    shell_name=$(basename "$(ps -p $$ -o comm= 2>/dev/null)" 2>/dev/null)
    [ -z "$shell_name" ] && shell_name=$(basename "${SHELL:-bash}")
    case "$shell_name" in
        zsh)  echo "zsh" ;;
        fish) echo "fish" ;;
        bash|sh) echo "bash" ;;
        *)    echo "bash" ;;
    esac
}

get_profile() {
    case "$(detect_shell)" in
        zsh)  echo "$HOME/.zshrc" ;;
        fish) echo "$HOME/.config/fish/config.fish" ;;
        bash) echo "$HOME/.bashrc" ;;
    esac
}

# ─── Check Termux ────────────────────────────────────────────────────────
check_termux() {
    if [ ! -d "/data/data/com.termux" ] && [ ! -f "/data/data/com.termux/files/usr/bin/pkg" ]; then
        err "Este instalador esta disenado para Termux en Android."
        err "No se detecta un entorno Termux."
        return 2>/dev/null || exit 1
    fi
    ok "Entorno Termux detectado"
}

# ─── Install Dependencies ─────────────────────────────────────────────────
install_deps() {
    title "Instalando dependencias del sistema"

    info "Actualizando paquetes..."
    pkg update -y && pkg upgrade -y

    info "Instalando paquetes necesarios..."
    pkg install -y \
        nodejs-lts \
        python3 \
        python-pip \
        curl \
        wget \
        git \
        jq

    ok "Dependencias del sistema instaladas"

    info "Verificando requests para Python..."
    pip install requests -q 2>/dev/null || {
        pkg install python-requests -y 2>/dev/null || {
            warn "No se pudo instalar requests via pip, se intentara en tiempo de ejecucion"
        }
    }
}

# ─── Install Ollama ──────────────────────────────────────────────────────
install_ollama() {
    title "Instalando Ollama para Termux"

    if command -v ollama &>/dev/null; then
        ok "Ollama ya esta instalado: $(ollama --version 2>/dev/null || echo '?')"
        return 0
    fi

    info "Instalando ollama-termux via npm..."
    npm install -g @mmmbuto/ollama-termux@latest

    info "Ejecutando instalador de ollama-termux..."
    ollama-termux

    if command -v ollama &>/dev/null; then
        ok "Ollama instalado correctamente"
    else
        err "La instalacion de Ollama fallo"
        return 2>/dev/null || exit 1
    fi
}

# ─── Install RANDI Scripts ───────────────────────────────────────────────
install_scripts() {
    title "Instalando scripts de RANDI"

    # Create directories
    mkdir -p "$BIN_DIR"
    mkdir -p "$RANDI_DIR/lib"
    mkdir -p "$RANDI_DIR/sessions"

    # Copy files
    info "Copiando scripts..."

    # randi
    if [ -f "$REPO_DIR/bin/randi" ]; then
        cp "$REPO_DIR/bin/randi" "$BIN_DIR/randi"
        chmod +x "$BIN_DIR/randi"
        # Symlink for backward compatibility
        ln -sf randi "$BIN_DIR/s-ollama" 2>/dev/null || true
        ok "randi instalado en ~/bin/randi"
    else
        err "No se encuentra bin/randi en el repositorio"
        return 2>/dev/null || exit 1
    fi

    # ollama-chat
    if [ -f "$REPO_DIR/bin/ollama-chat" ]; then
        cp "$REPO_DIR/bin/ollama-chat" "$BIN_DIR/ollama-chat"
        chmod +x "$BIN_DIR/ollama-chat"
        ok "ollama-chat instalado en ~/bin/ollama-chat"
    else
        err "No se encuentra bin/ollama-chat en el repositorio"
        return 2>/dev/null || exit 1
    fi

    # ollama_chat.py (Python lib)
    if [ -f "$REPO_DIR/bin/lib/ollama_chat.py" ]; then
        cp "$REPO_DIR/bin/lib/ollama_chat.py" "$RANDI_DIR/lib/ollama_chat.py"
        chmod +x "$RANDI_DIR/lib/ollama_chat.py"
        ok "ollama_chat.py instalado en $RANDI_DIR/lib/"
    else
        err "No se encuentra bin/lib/ollama_chat.py en el repositorio"
        return 2>/dev/null || exit 1
    fi
}

# ─── Shell Configuration ─────────────────────────────────────────────────
_add_to_bashrc() {
    local file="$HOME/.bashrc"
    touch "$file"
    if ! grep -q 'PATH="\$HOME/bin' "$file" 2>/dev/null; then
        echo "" >> "$file"
        echo "# RANDI - Local AI" >> "$file"
        echo 'export PATH="$HOME/bin:$PATH"' >> "$file"
        echo 'export OLLAMA_KEEP_ALIVE="-1"' >> "$file"
        echo "export OLLAMA_HOST=$OLLAMA_HOST" >> "$file"
        echo "export RANDI_REPO=$RANDI_REPO" >> "$file"
        info "PATH configurado en $file"
    else
        ok "PATH ya configurado en $file"
    fi
}

_add_to_zshrc() {
    local file="$HOME/.zshrc"
    touch "$file"
    if ! grep -q 'PATH="\$HOME/bin' "$file" 2>/dev/null; then
        echo "" >> "$file"
        echo "# RANDI - Local AI" >> "$file"
        echo 'export PATH="$HOME/bin:$PATH"' >> "$file"
        echo 'export OLLAMA_KEEP_ALIVE="-1"' >> "$file"
        echo "export OLLAMA_HOST=$OLLAMA_HOST" >> "$file"
        echo "export RANDI_REPO=$RANDI_REPO" >> "$file"
        info "PATH configurado en $file"
    else
        ok "PATH ya configurado en $file"
    fi
}

_add_to_fish() {
    local file="$HOME/.config/fish/config.fish"
    mkdir -p "$HOME/.config/fish"
    touch "$file"
    if ! grep -q 'fish_add_path.*bin' "$file" 2>/dev/null; then
        local header=""
        header+="# RANDI - Local AI\n"
        header+="fish_add_path \$HOME/bin\n"
        header+="set -gx OLLAMA_KEEP_ALIVE -1\n"
        header+="set -gx OLLAMA_HOST $OLLAMA_HOST\n"
        header+="set -gx RANDI_REPO $RANDI_REPO\n"
        if grep -q 'if status is-interactive' "$file" 2>/dev/null; then
            local content
            content=$(cat "$file")
            echo -e "$header" > "$file"
            echo "$content" >> "$file"
        else
            echo "" >> "$file"
            echo -e "$header" >> "$file"
        fi
        info "PATH configurado en $file"
    else
        ok "PATH ya configurado en $file"
    fi
}

_update_repo_url() {
    echo ""
    echo -n "URL del repositorio GitHub (deja vacio para saltar): "
    read -r repo_url
    if [ -n "$repo_url" ]; then
        # Update the variable for this session
        RANDI_REPO="$repo_url"
        # Save to shell configs
        for f in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.config/fish/config.fish"; do
            if [ -f "$f" ]; then
                if grep -q 'RANDI_REPO' "$f" 2>/dev/null; then
                    sed -i "s|export RANDI_REPO=.*|export RANDI_REPO=$repo_url|g" "$f" 2>/dev/null || true
                fi
            fi
        done
        # Save to randi config
        local config_file="$HOME/.config/randi/config.json"
        mkdir -p "$HOME/.config/randi"
        if [ -f "$config_file" ]; then
            python3 -c "
import json
cfg = json.load(open('$config_file'))
cfg['repo_url'] = '$repo_url'
json.dump(cfg, open('$config_file', 'w'), indent=2)
" 2>/dev/null || true
        else
            echo "{\"repo_url\": \"$repo_url\"}" > "$config_file"
        fi
        ok "URL del repositorio configurada: $repo_url"
    fi
}

configure_shell() {
    title "Configurando shell"

    # Configurar en TODOS los shells posibles
    _add_to_bashrc
    _add_to_zshrc
    _add_to_fish

    # Export for current session
    export PATH="$HOME/bin:$PATH"
    export OLLAMA_KEEP_ALIVE="-1"
}

# ─── Configure OpenCode ──────────────────────────────────────────────────
configure_opencode() {
    title "Configurando OpenCode"

    if ! command -v opencode &>/dev/null; then
        warn "OpenCode no esta instalado. Se saltara la integracion."
        warn "Si instalas OpenCode despues, ejecuta: randi config"
        return 0
    fi

    local opencode_config
    opencode_config="$HOME/.config/opencode/opencode.jsonc"

    if [ ! -f "$opencode_config" ]; then
        mkdir -p "$HOME/.config/opencode"
    fi

    # Create/replace with Ollama provider
    cat > "$opencode_config" << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "RANDI (Ollama Local)",
      "options": {
        "baseURL": "http://localhost:11434/v1",
        "apiKey": "ollama"
      },
      "models": {
        "deepseek-r1:7b": {
          "name": "DeepSeek R1 7B (Razonamiento)",
          "limit": { "context": 32768, "output": 4096 }
        },
        "qwen2.5-coder:7b": {
          "name": "Qwen 2.5 Coder 7B (Codigo)",
          "limit": { "context": 32768, "output": 4096 }
        },
        "qwen3:8b": {
          "name": "Qwen3 8B (General)",
          "limit": { "context": 32768, "output": 4096 }
        },
        "gemma4:2b": {
          "name": "Gemma 4 2B (Rapido)",
          "limit": { "context": 16384, "output": 4096 }
        },
        "deepseek-r1:1.5b": {
          "name": "DeepSeek R1 1.5B (Razonamiento ligero)",
          "limit": { "context": 16384, "output": 4096 }
        },
        "qwen2.5-coder:1.5b": {
          "name": "Qwen 2.5 Coder 1.5B (Codigo ligero)",
          "limit": { "context": 16384, "output": 4096 }
        },
        "qwen2.5-coder:0.5b": {
          "name": "Qwen 2.5 Coder 0.5B (Super ligero)",
          "limit": { "context": 8192, "output": 2048 }
        },
        "llama3.2:3b": {
          "name": "Llama 3.2 3B (General ligero)",
          "limit": { "context": 16384, "output": 4096 }
        },
        "qwen3:4b": {
          "name": "Qwen3 4B (Chat ligero)",
          "limit": { "context": 16384, "output": 4096 }
        },
        "phi3:mini": {
          "name": "Phi-3 Mini (Microsoft)",
          "limit": { "context": 8192, "output": 4096 }
        },
        "phi3:3.8b": {
          "name": "Phi-3 3.8B (Microsoft)",
          "limit": { "context": 8192, "output": 4096 }
        },
        "mistral:7b": {
          "name": "Mistral 7B v0.3",
          "limit": { "context": 32768, "output": 4096 }
        }
      }
    }
  }
}
EOF

    ok "OpenCode configurado en $opencode_config"
    dim "  Para usar: opencode -m ollama/qwen2.5-coder:7b"
}

# ─── Model Download ──────────────────────────────────────────────────────
download_models() {
    title "Descarga de modelos"

    echo "Selecciona los modelos que deseas descargar:"
    echo ""
    echo -e "${GRN}Bajo consumo (< 2GB RAM):${R}"
    echo "  1) gemma4:2b            (1.5GB) - Rapido y ligero"
    echo "  2) deepseek-r1:1.5b     (1.1GB) - Razonamiento ligero"
    echo "  3) qwen2.5-coder:1.5b   (0.9GB) - Codigo ligero"
    echo "  4) qwen2.5-coder:0.5b   (0.4GB) - Super ligero"
    echo "  5) phi3:mini            (2.0GB) - Microsoft Phi-3"
    echo ""
    echo -e "${YLW}Consumo medio (2-4GB RAM):${R}"
    echo "  6) llama3.2:3b          (2.0GB) - Meta Llama 3.2"
    echo "  7) qwen3:4b             (2.5GB) - Chat ligero"
    echo "  8) phi3:3.8b            (2.3GB) - Microsoft Phi-3"
    echo ""
    echo -e "${RED}Consumo alto (4-8GB RAM):${R}"
    echo "  9)  deepseek-r1:7b       (4.7GB) - Razonamiento y logica"
    echo "  10) qwen2.5-coder:7b     (4.7GB) - Codigo y programacion"
    echo "  11) qwen3:8b             (4.5GB) - Chat general"
    echo "  12) mistral:7b           (4.1GB) - Mistral v0.3"
    echo "  0)  Ninguno (lo hare despues)"
    echo ""
    echo "Ejemplo: 1 2 3 (separados por espacio)"
    echo -n "Selecciona: "
    read -r -a selections

    local first_model=""
    local has_valid=0
    local skip=0
    for opt in "${selections[@]}"; do
        case "$opt" in
            1) model="gemma4:2b" ;;
            2) model="deepseek-r1:1.5b" ;;
            3) model="qwen2.5-coder:1.5b" ;;
            4) model="qwen2.5-coder:0.5b" ;;
            5) model="phi3:mini" ;;
            6) model="llama3.2:3b" ;;
            7) model="qwen3:4b" ;;
            8) model="phi3:3.8b" ;;
            9) model="deepseek-r1:7b" ;;
            10) model="qwen2.5-coder:7b" ;;
            11) model="qwen3:8b" ;;
            12) model="mistral:7b" ;;
            0|13) skip=1; continue ;;
            *) warn "Opcion invalida: $opt, ignorada"; continue ;;
        esac
        has_valid=1
        info "Descargando $model (esto puede tomar varios minutos)..."
        ollama pull "$model"
        ok "Modelo $model descargado"
        [ -z "$first_model" ] && first_model="$model"
    done

    if [ "$has_valid" = "0" ] && [ "$skip" = "0" ] && [ ${#selections[@]} -gt 0 ]; then
        err "No seleccionaste ninguna opcion valida"
        download_models
        return
    fi

    # Set first downloaded model as default
    if [ -n "$first_model" ]; then
        local config_file="$HOME/.config/randi/config.json"
        mkdir -p "$HOME/.config/randi"
        if [ -f "$config_file" ]; then
            python3 -c "
import json
cfg = json.load(open('$config_file'))
cfg['model'] = '$first_model'
json.dump(cfg, open('$config_file', 'w'), indent=2)
" 2>/dev/null || true
        else
            echo "{\"model\": \"$first_model\", \"temperature\": 0.7, \"last_session\": \"\"}" > "$config_file"
        fi
    fi

    if [ "$has_valid" = "1" ]; then
        echo ""
        echo -n "Descargar mas modelos? (s/N): "
        read -r more
        if [ "$more" = "s" ] || [ "$more" = "S" ]; then
            download_models
        fi
    fi
}

# ─── Show Summary ────────────────────────────────────────────────────────
show_summary() {
    clear
    echo ""
    echo -e "${GRN}${B}╔══════════════════════════════════════════════╗${R}"
    echo -e "${GRN}${B}║${R}          Instalacion completada!            ${GRN}${B}║${R}"
    echo -e "${GRN}${B}╚══════════════════════════════════════════════╝${R}"
    echo ""
    ok "RANDI - Asistente IA local instalado"
    dim "  Creado por Sebastian Laguna"
    echo ""
    echo -e "${BLU}${B}Comandos disponibles:${R}"
    echo ""
    echo -e "  ${GRN}randi${R}              Menu interactivo"
    echo -e "  ${GRN}randi chat${R}         Chat TUI con IA local"
    echo -e "  ${GRN}randi serve${R}        Iniciar servidor Ollama"
    echo -e "  ${GRN}randi pull${R}         Descargar modelos"
    echo -e "  ${GRN}randi update${R}       Actualizar RANDI (GitHub)"
    echo ""
    echo -e "${BLU}${B}Integraciones:${R}"
    echo ""
    if command -v opencode &>/dev/null; then
        echo -e "  ${GRN}opencode -m ollama/qwen2.5-coder:7b${R}"
        dim "  Usar OpenCode con modelo local de codigo"
    fi
    echo ""
    echo -e "${YLW}${B}NOTA:${R} Cierra y vuelve a abrir Termux, o ejecuta:"
    echo ""
    echo -e "  ${CYN}source ~/.bashrc${R}   (bash/zsh)"
    echo -e "  ${CYN}source ~/.config/fish/config.fish${R}  (fish)"
    echo ""
    echo -e "  Para comenzar a usar RANDI ahora mismo, ejecuta:"
    echo -e "  ${CYN}randi serve${R}"
    echo -e "  ${CYN}randi chat${R}"
    echo ""
}

# ─── Main ────────────────────────────────────────────────────────────────
main() {
    clear
    echo -e "${CYN}${B}"
    echo "╔══════════════════════════════════════╗"
    echo "║                                      ║"
    echo "║     RANDI - Local AI Terminal        ║"
    echo "║     Instalador para Termux           ║"
    echo "║     por Sebastian Laguna             ║"
    echo "╚══════════════════════════════════════╝"
    echo -e "${R}"
    echo ""
    dim "Este script instalara Ollama y configurara RANDI"
    dim "para ejecutar modelos de IA localmente en Termux."
    echo ""
    dim "Modelos recomendados:"
    dim "  - gemma4:2b         (1.5GB - rapido, bajo consumo)"
    dim "  - deepseek-r1:1.5b  (1.1GB - razonamiento ligero)"
    dim "  - qwen2.5-coder:1.5b (0.9GB - codigo ligero)"
    dim "  - deepseek-r1:7b    (4.7GB - razonamiento)"
    dim "  - qwen2.5-coder:7b  (4.7GB - codigo)"
    echo ""
    echo -n "Presiona Enter para continuar o Ctrl+C para cancelar..."
    read -r

    check_termux
    install_deps
    install_ollama
    install_scripts

    # Hacer que randi esté disponible en la sesión actual inmediatamente
    export PATH="$HOME/bin:$PATH"
    ok "Comando 'randi' disponible en esta terminal"

    configure_shell

    # Start server briefly for model operations
    info "Iniciando servidor temporal..."
    nohup ollama serve > /dev/null 2>&1 &
    local serve_pid=$!
    disown "$serve_pid" 2>/dev/null || true
    sleep 3

    configure_opencode
    download_models

    # Configurar URL del repositorio para actualizaciones
    _update_repo_url

    # Stop temp server
    pkill -f "ollama serve" 2>/dev/null || true
    sleep 1

    show_summary

    # Auto-recargar perfiles del shell
    for f in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.config/fish/config.fish"; do
        [ -f "$f" ] && source "$f" 2>/dev/null || true
    done

    echo ""
    ok "RANDI listo para usar."
    echo ""
    echo -e "  ${CYN}Pruebalo:${R}"
    echo -e "  ${CYN}randi --help${R}"
    echo ""
}

main "$@"

# Detectar si el script fue sourceado o ejecutado
# Si fue sourceado, el PATH ya quedo configurado en la terminal actual
if [ "$0" = "$BASH_SOURCE" ] || [ -z "$BASH_SOURCE" ]; then
    # Ejecutado con bash install-ollama.sh
    # El PATH se configuro en el perfil, hay que recargarlo
    echo ""
    dim "NOTA: Para usar randi en esta terminal:"
    dim "  - Si usas bash/zsh:  source ~/.bashrc"
    dim "  - Si usas fish:      source ~/.config/fish/config.fish"
    dim "  - O abre una nueva terminal"
    echo -e "  ${CYN}randi serve${R}"
    dim ""
    dim "La proxima vez ejecuta con source para que sea automatico:"
    echo -e "  ${CYN}source install-ollama.sh${R}"
    echo ""
fi
