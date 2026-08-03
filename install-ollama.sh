#!/data/data/com.termux/files/usr/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
#  RANDI — Instalador para Termux
#  Asistente IA local con Ollama
#  Creado por Sebastian Laguna
# ═══════════════════════════════════════════════════════════════════════════

# ─── Colors ─────────────────────────────────────────────────────────────
R='\033[0m'; B='\033[1m'; D='\033[2m'
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; BLU='\033[0;34m'
CYN='\033[0;36m'; MGN='\033[0;35m'; WHT='\033[1;37m'

info()  { echo -e "  ${BLU}${B}::${R} $1"; }
ok()    { echo -e "  ${GRN}${B}::${R} $1"; }
warn()  { echo -e "  ${YLW}${B}::${R} $1"; }
err()   { echo -e "  ${RED}${B}::${R} $1"; }
dim()   { echo -e "  ${D}$1${R}"; }

# ─── Config ───────────────────────────────────────────────────────────────
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RANDI_DIR="$HOME/.local/share/randi"
BIN_DIR="$HOME/bin"
OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"
RANDI_REPO="${RANDI_REPO:-https://github.com/TU_USUARIO/randi.git}"

# ─── Detect Shell ─────────────────────────────────────────────────────────
detect_shell() {
    local shell_name
    shell_name=$(basename "$(ps -p $$ -o comm= 2>/dev/null)" 2>/dev/null)
    [ -z "$shell_name" ] && shell_name=$(basename "${SHELL:-bash}")
    case "$shell_name" in zsh|fish|bash|sh) echo "$shell_name" ;; *) echo "bash" ;; esac
}

get_profile() {
    case "$(detect_shell)" in
        zsh)  echo "$HOME/.zshrc" ;;
        fish) echo "$HOME/.config/fish/config.fish" ;;
        *)    echo "$HOME/.bashrc" ;;
    esac
}

# ─── Check ────────────────────────────────────────────────────────────────
check_termux() {
    if [ ! -d "/data/data/com.termux" ] && [ ! -f "/data/data/com.termux/files/usr/bin/pkg" ]; then
        err "Este instalador requiere Termux en Android."
        return 2>/dev/null || exit 1
    fi
    ok "Entorno Termux detectado"
}

# ─── Install Dependencies ─────────────────────────────────────────────────
install_deps() {
    echo ""
    info "Actualizando paquetes..."
    pkg update -y > /dev/null 2>&1 && pkg upgrade -y > /dev/null 2>&1

    info "Instalando dependencias..."
    pkg install -y nodejs-lts python3 python-pip curl wget git jq > /dev/null 2>&1

    pip install requests rich -q > /dev/null 2>&1 || pkg install python-requests python-rich -y > /dev/null 2>&1 || true

    ok "Dependencias instaladas"
}

# ─── Install Ollama ──────────────────────────────────────────────────────
install_ollama() {
    if command -v ollama &>/dev/null; then
        ok "Ollama ya instalado"
        return 0
    fi

    echo ""
    info "Instalando Ollama para Termux..."
    npm install -g @mmmbuto/ollama-termux@latest > /dev/null 2>&1
    ollama-termux > /dev/null 2>&1

    if command -v ollama &>/dev/null; then
        ok "Ollama instalado correctamente"
    else
        err "Falló la instalación de Ollama"
        return 2>/dev/null || exit 1
    fi
}

# ─── Install Scripts ─────────────────────────────────────────────────────
install_scripts() {
    echo ""
    info "Instalando scripts RANDI..."

    mkdir -p "$BIN_DIR" "$RANDI_DIR/lib" "$RANDI_DIR/sessions"

    if [ -f "$REPO_DIR/bin/randi" ]; then
        cp "$REPO_DIR/bin/randi" "$BIN_DIR/randi"
        chmod +x "$BIN_DIR/randi"
        ln -sf randi "$BIN_DIR/s-ollama" 2>/dev/null || true
        ok "Script principal: ~/bin/randi"
    else
        err "Falta bin/randi en el repositorio"; return 2>/dev/null || exit 1
    fi

    if [ -f "$REPO_DIR/bin/lib/ollama_chat.py" ]; then
        cp "$REPO_DIR/bin/lib/ollama_chat.py" "$RANDI_DIR/lib/ollama_chat.py"
        chmod +x "$RANDI_DIR/lib/ollama_chat.py"
    fi
}

# ─── Shell Config ────────────────────────────────────────────────────────
configure_shell() {
    echo ""
    info "Configurando shell..."

    for sf in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.config/fish/config.fish"; do
        touch "$sf" 2>/dev/null || continue
        grep -q 'PATH.*HOME/bin' "$sf" 2>/dev/null && continue

        case "$(basename "$sf")" in
            config.fish)
                echo "" >> "$sf"
                echo "# RANDI" >> "$sf"
                echo "fish_add_path \$HOME/bin" >> "$sf"
                echo "set -gx OLLAMA_KEEP_ALIVE -1" >> "$sf"
                echo "set -gx OLLAMA_HOST $OLLAMA_HOST" >> "$sf"
                ;;
            *)
                echo "" >> "$sf"
                echo "# RANDI" >> "$sf"
                echo 'export PATH="$HOME/bin:$PATH"' >> "$sf"
                echo 'export OLLAMA_KEEP_ALIVE="-1"' >> "$sf"
                echo "export OLLAMA_HOST=$OLLAMA_HOST" >> "$sf"
                ;;
        esac
        ok "Configurado: $(basename $sf)"
    done

    export PATH="$HOME/bin:$PATH"
    export OLLAMA_KEEP_ALIVE="-1"
}

# ─── OpenCode Config ─────────────────────────────────────────────────────
configure_opencode() {
    if ! command -v opencode &>/dev/null; then
        dim "  opencode no instalado — se omite integración"
        return
    fi

    local config_dir="$HOME/.config/opencode"
    mkdir -p "$config_dir"

    cat > "$config_dir/opencode.jsonc" << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "RANDI (Ollama Local)",
      "options": { "baseURL": "http://localhost:11434/v1", "apiKey": "ollama" },
      "models": {
        "deepseek-r1:7b":     { "name": "DeepSeek R1 7B", "limit": { "context": 32768, "output": 4096 } },
        "qwen2.5-coder:7b":   { "name": "Qwen 2.5 Coder 7B", "limit": { "context": 32768, "output": 4096 } },
        "qwen3:8b":           { "name": "Qwen3 8B", "limit": { "context": 32768, "output": 4096 } },
        "gemma4:2b":          { "name": "Gemma 4 2B", "limit": { "context": 16384, "output": 4096 } },
        "deepseek-r1:1.5b":   { "name": "DeepSeek R1 1.5B", "limit": { "context": 16384, "output": 4096 } },
        "qwen2.5-coder:1.5b": { "name": "Qwen 2.5 Coder 1.5B", "limit": { "context": 16384, "output": 4096 } },
        "qwen2.5-coder:0.5b": { "name": "Qwen 2.5 Coder 0.5B", "limit": { "context": 8192, "output": 2048 } },
        "llama3.2:3b":        { "name": "Llama 3.2 3B", "limit": { "context": 16384, "output": 4096 } },
        "qwen3:4b":           { "name": "Qwen3 4B", "limit": { "context": 16384, "output": 4096 } },
        "phi3:mini":          { "name": "Phi-3 Mini", "limit": { "context": 8192, "output": 4096 } },
        "phi3:3.8b":          { "name": "Phi-3 3.8B", "limit": { "context": 8192, "output": 4096 } },
        "mistral:7b":         { "name": "Mistral 7B", "limit": { "context": 32768, "output": 4096 } }
      }
    }
  }
}
EOF

    ok "OpenCode configurado"
    dim "  Uso: opencode -m ollama/qwen2.5-coder:7b"
}

# ─── Model Download ──────────────────────────────────────────────────────
download_models() {
    echo ""
    echo "  ─── Selección de modelos ───"
    echo ""

    echo "  Bajo consumo (< 2GB RAM):"
    echo "    1)  gemma4:2b            (1.5 GB)"
    echo "    2)  deepseek-r1:1.5b     (1.1 GB)"
    echo "    3)  qwen2.5-coder:1.5b   (0.9 GB)"
    echo "    4)  qwen2.5-coder:0.5b   (0.4 GB)"
    echo "    5)  phi3:mini            (2.0 GB)"
    echo ""
    echo "  Consumo medio (2-4 GB RAM):"
    echo "    6)  llama3.2:3b          (2.0 GB)"
    echo "    7)  qwen3:4b             (2.5 GB)"
    echo "    8)  phi3:3.8b            (2.3 GB)"
    echo ""
    echo "  Consumo alto (4-8 GB RAM):"
    echo "    9)  deepseek-r1:7b       (4.7 GB)"
    echo "    10) qwen2.5-coder:7b     (4.7 GB)"
    echo "    11) qwen3:8b             (4.5 GB)"
    echo "    12) mistral:7b           (4.1 GB)"
    echo ""
    echo "  0)  Ninguno"
    echo ""
    echo -n "  Opción (ej: 1 3 6): "
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
            *) warn "Opción inválida: $opt"; continue ;;
        esac
        has_valid=1
        echo ""
        info "Descargando $model..."
        ollama pull "$model"
        ok "$model descargado"
        [ -z "$first_model" ] && first_model="$model"
    done

    if [ "$has_valid" = "0" ] && [ "$skip" = "0" ] && [ ${#selections[@]} -gt 0 ]; then
        err "No seleccionaste opciones válidas"
        download_models
        return
    fi

    if [ -n "$first_model" ]; then
        mkdir -p "$HOME/.config/randi"
        local cfg="$HOME/.config/randi/config.json"
        if [ -f "$cfg" ]; then
            python3 -c "
import json
c=json.load(open('$cfg'))
c['model']='$first_model'
json.dump(c,open('$cfg','w'),indent=2)
" 2>/dev/null || true
        else
            echo "{\"model\":\"$first_model\",\"temperature\":0.7,\"last_session\":\"\"}" > "$cfg"
        fi
    fi

    if [ "$has_valid" = "1" ]; then
        echo ""
        echo -n "  ¿Descargar más modelos? (s/N): "
        read -r more
        [ "$more" = "s" ] || [ "$more" = "S" ] && download_models
    fi
}

# ─── Summary ──────────────────────────────────────────────────────────────
show_summary() {
    clear
    echo ""
    echo "  ──────────────────────────────────────────────"
    echo "    RANDI — Instalación completada"
    echo "  ──────────────────────────────────────────────"
    echo ""
    ok "RANDI instalado correctamente"
    echo ""
    echo "  Comandos:"
    echo "    randi              Menú interactivo"
    echo "    randi chat         Chat con IA local"
    echo "    randi serve        Iniciar servidor Ollama"
    echo "    randi pull         Descargar modelos"
    echo "    randi update       Actualizar RANDI"
    echo ""
    echo "  Para empezar:"
    echo "    randi serve"
    echo "    randi chat"
    echo ""
    echo "  Recargar PATH: source $(get_profile)"
    echo ""
}

# ─── Uninstall ────────────────────────────────────────────────────────────
cmd_uninstall() {
    clear
    echo ""
    echo "  ──────────────────────────────────────────────"
    echo "    Desinstalar RANDI"
    echo "  ──────────────────────────────────────────────"
    echo ""
    warn "Se eliminarán los componentes de RANDI."
    echo "  Los modelos de Ollama se conservan (~1-8 GB)."
    echo ""
    echo -n "  ¿Eliminar también Ollama? (s/N): "
    read -r remove_ollama
    echo -n "  ¿Confirmar desinstalación? (s/N): "
    read -r confirm
    [ "$confirm" != "s" ] && [ "$confirm" != "S" ] && { echo ""; ok "Cancelado."; return; }

    echo ""
    rm -f "$HOME/bin/randi" "$HOME/bin/ollama-chat" 2>/dev/null || true
    rm -rf "$RANDI_DIR" "$HOME/.config/randi" 2>/dev/null || true
    rm -f "$HOME/.config/opencode/opencode.jsonc" 2>/dev/null || true

    for f in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.config/fish/config.fish"; do
        [ -f "$f" ] && sed -i '/# RANDI/d' "$f" 2>/dev/null || true
        [ -f "$f" ] && sed -i '/RANDI_REPO/d' "$f" 2>/dev/null || true
        [ -f "$f" ] && sed -i '/OLLAMA/d' "$f" 2>/dev/null || true
        [ -f "$f" ] && sed -i 's|export PATH="$HOME/bin:\$PATH"||g' "$f" 2>/dev/null || true
    done

    [ "$remove_ollama" = "s" ] || [ "$remove_ollama" = "S" ] && {
        npm uninstall -g @mmmbuto/ollama-termux 2>/dev/null || true
        rm -f "$(command -v ollama 2>/dev/null)" 2>/dev/null || true
    }

    echo ""
    ok "RANDI desinstalado"
}

# ─── Main ─────────────────────────────────────────────────────────────────
main() {
    clear
    echo ""
    echo "  RANDI — Asistente IA local para Termux"
    echo "  por Sebastian Laguna"
    echo ""
    echo "  1) Instalar"
    echo "  2) Desinstalar"
    echo "  0) Salir"
    echo ""
    echo -n "  Opción: "
    read -r main_opt
    case "$main_opt" in
        1) ;;
        2) cmd_uninstall; exit 0 ;;
        0|*) echo ""; ok "Hasta luego"; exit 0 ;;
    esac

    clear
    echo ""
    echo "  ──────────────────────────────────────────────"
    echo "    Instalando RANDI"
    echo "  ──────────────────────────────────────────────"

    check_termux
    install_deps
    install_ollama
    install_scripts
    configure_shell
    configure_opencode

    echo ""
    info "Iniciando servidor Ollama..."
    nohup ollama serve > /dev/null 2>&1 &
    local serve_pid=$!
    disown "$serve_pid" 2>/dev/null || true
    sleep 3

    download_models

    pkill -f "ollama serve" 2>/dev/null || true
    sleep 1

    show_summary
}

main "$@"
