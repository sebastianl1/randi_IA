#!/usr/bin/env bash

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

# ─── Progress (run_step: spinner + timeout + log) ─────────────────────────
_run_spinner() {
    local pid=$1 label=$2
    local chars='|/-\' i=0 start elapsed
    start=$(date +%s)
    while kill -0 "$pid" 2>/dev/null; do
        elapsed=$(( $(date +%s) - start ))
        printf "\r  %s %s ... (%ss) " "${chars:$((i % 4)):1}" "$label" "$elapsed"
        i=$((i + 1))
        sleep 0.1
    done
    printf "\r  %s ... (%ss)\n" "$label" "$(( $(date +%s) - start ))"
}

run_step() {
    local label="$1" tmo="$2"; shift 2
    local pid rc
    if ! mkdir -p "$(dirname "$RANDI_LOG")" 2>/dev/null; then
        RANDI_LOG="$HOME/randi-install.log"
        mkdir -p "$HOME" 2>/dev/null || true
    fi
    if command -v timeout >/dev/null 2>&1; then
        ( timeout "$tmo" "$@" >> "$RANDI_LOG" 2>&1 ) &
    else
        ( "$@" >> "$RANDI_LOG" 2>&1 ) &
    fi
    pid=$!
    _run_spinner "$pid" "$label"
    wait "$pid"
    rc=$?
    if [ "$rc" -eq 0 ]; then
        ok "$label"
        return 0
    fi
    err "Fallo: $label"
    if [ "$rc" -eq 124 ]; then
        warn "  Se agoto el tiempo limite (${tmo}s). Revisa tu conexion y reintenta."
    fi
    if [ -s "$RANDI_LOG" ]; then
        warn "  Ultimas lineas de $RANDI_LOG:"
        tail -n 8 "$RANDI_LOG" | sed 's/^/    /'
    fi
    return 1
}

# ─── Config ───────────────────────────────────────────────────────────────
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RANDI_DIR="$HOME/.local/share/randi"
RANDI_LOG="${RANDI_LOG:-$RANDI_DIR/install.log}"
BIN_DIR="$HOME/bin"
OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"
RANDI_REPO="${RANDI_REPO:-https://github.com/sebastianl1/randi_IA.git}"

# ─── Detect Platform ──────────────────────────────────────────────────────
detect_platform() {
    if [ -d "/data/data/com.termux" ]; then
        echo "termux"
    elif [ -n "${MSYSTEM:-}" ] || [ -n "${MINGW_PREFIX:-}" ]; then
        echo "windows"
    elif [ "$(uname -s)" = "Darwin" ]; then
        echo "macos"
    elif [ -n "${WSL_DISTRO_NAME:-}" ] || grep -qi microsoft /proc/version 2>/dev/null; then
        echo "wsl"
    else
        echo "linux"
    fi
}
PLATFORM="$(detect_platform)"

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
check_env_platform() {
    case "$PLATFORM" in
        termux)
            ok "Plataforma: Termux (Android)"
            ;;
        windows)
            ok "Plataforma: Windows (Git Bash/MSYS2)"
            ;;
        wsl)
            ok "Plataforma: Windows (WSL2)"
            ;;
        macos)
            ok "Plataforma: macOS"
            ;;
        linux)
            ok "Plataforma: Linux"
            ;;
        *)
            warn "Plataforma desconocida: $PLATFORM"
            ;;
    esac
}

check_python() {
    if command -v python3 >/dev/null 2>&1; then
        ok "Python: $(python3 --version 2>&1)"
        return 0
    fi
    err "Se requiere python3. Instalalo antes de continuar."
    return 1
}

check_env() {
    local arch
    arch=$(uname -m 2>/dev/null || echo "unknown")

    echo ""
    info "Verificando entorno..."

    case "$arch" in
        aarch64|arm64) ok "Arquitectura: $arch (ARM64)" ;;
        *) warn "Arquitectura: $arch — se recomienda ARM64 (aarch64)" ;;
    esac

    if [ -r /proc/meminfo ]; then
        local total_kb avail_kb total_gb avail_gb
        total_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
        avail_kb=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
        total_gb=$((total_kb / 1024 / 1024))
        avail_gb=$((avail_kb / 1024 / 1024))
        if [ "$total_gb" -lt 4 ]; then
            warn "RAM total: ~${total_gb}GB — se recomienda minimo 4GB"
        else
            ok "RAM total: ~${total_gb}GB (${avail_gb}GB disponibles)"
        fi
    fi

    local free_kb free_gb
    free_kb=$(df -k "$HOME" 2>/dev/null | tail -n 1 | awk '{print $4}')
    if [ -n "$free_kb" ] && [ "$free_kb" -gt 0 ] 2>/dev/null; then
        free_gb=$((free_kb / 1024 / 1024))
        if [ "$free_gb" -lt 3 ]; then
            warn "Almacenamiento libre: ~${free_gb}GB — se recomienda 3GB+ para modelos"
        else
            ok "Almacenamiento libre: ~${free_gb}GB"
        fi
    fi
}

# ─── Install Dependencies ─────────────────────────────────────────────────
install_deps() {
    echo ""
    info "Instalando dependencias..."
    local deps_ok=0

    case "$PLATFORM" in
        termux)
            run_step "Actualizando repositorios (pkg update)" 300 pkg update -y || deps_ok=1
            run_step "Actualizando paquetes (pkg upgrade)" 600 pkg upgrade -y || deps_ok=1
            run_step "Instalando python, git, curl, jq" 600 pkg install -y python python-pip curl wget git jq || deps_ok=1
            run_step "Instalando librerias Python (requests, rich)" 300 pip install requests rich -q || true
            ;;
        macos)
            if ! command -v brew >/dev/null 2>&1; then
                warn "Homebrew no encontrado. Instalalo en https://brew.sh"
            else
                run_step "Instalando dependencias (brew)" 600 brew install python git curl jq || deps_ok=1
            fi
            ;;
        windows)
            # Git Bash: python y git ya vienen con la instalacion
            ;;
        linux|wsl)
            local pm=""
            command -v apt-get >/dev/null 2>&1 && pm="apt-get"
            command -v dnf >/dev/null 2>&1 && pm="dnf"
            command -v pacman >/dev/null 2>&1 && pm="pacman"

            local sudo_cmd=""
            if [ "$(id -u)" -ne 0 ]; then
                if sudo -n true 2>/dev/null; then
                    sudo_cmd="sudo -n"
                else
                    warn "Se requiere sudo para instalar dependencias."
                    warn "  Ejecuta: sudo bash install-ollama.sh"
                    warn "  o configura sudo sin contrasena (evita bloqueos)."
                    deps_ok=1
                fi
            fi

            case "$pm" in
                apt-get)
                    run_step "Actualizando apt" 300 $sudo_cmd apt-get update -qq || deps_ok=1
                    run_step "Instalando dependencias (apt)" 600 $sudo_cmd apt-get install -y python3 python3-pip curl git jq || deps_ok=1
                    ;;
                dnf)
                    run_step "Instalando dependencias (dnf)" 600 $sudo_cmd dnf install -y python3 python3-pip curl git jq || deps_ok=1
                    ;;
                pacman)
                    run_step "Instalando dependencias (pacman)" 600 $sudo_cmd pacman -Sy --noconfirm python python-pip curl git jq || deps_ok=1
                    ;;
                *)
                    warn "No se detecto gestor de paquetes (apt/dnf/pacman)."
                    deps_ok=1
                    ;;
            esac
            run_step "Instalando librerias Python (requests, rich)" 300 pip3 install requests rich -q || true
            ;;
    esac

    if ! command -v python3 >/dev/null 2>&1; then
        err "python3 no esta instalado. Instalalo y vuelve a ejecutar."
        return 2>/dev/null || exit 1
    fi
    if [ "$deps_ok" -eq 1 ]; then
        warn "Algunas dependencias no se instalaron; revisa $RANDI_LOG"
    fi
    ok "Dependencias instaladas"
}

# ─── Install Ollama ──────────────────────────────────────────────────────
install_ollama() {
    if command -v ollama &>/dev/null; then
        ok "Ollama ya instalado ($(ollama --version 2>/dev/null | head -1))"
        return 0
    fi

    echo ""
    info "Instalando Ollama ($PLATFORM)..."

    case "$PLATFORM" in
        termux)
            if run_step "Instalando Ollama (paquete nativo)" 600 pkg install -y ollama; then
                ok "Ollama instalado (paquete nativo de Termux)"
            else
                warn "Paquete nativo no disponible, usando npm..."
                run_step "Instalando Ollama (npm)" 600 npm install -g @mmmbuto/ollama-termux@latest || true
                ollama-termux > /dev/null 2>&1 || true
            fi
            ;;
        macos|linux|wsl)
            info "Descargando e instalando Ollama (script oficial)..."
            curl -fsSL https://ollama.com/install.sh | sh
            ;;
        windows)
            warn "En Windows nativo instalalo con el instalador oficial:"
            warn "  winget install Ollama.Ollama"
            warn "  o descarga de https://ollama.com/download"
            ;;
    esac

    if command -v ollama &>/dev/null; then
        ok "Ollama instalado correctamente"
    else
        err "Falló la instalación de Ollama"
        return 2>/dev/null || exit 1
    fi
}

# ─── Vulkan Backend (opcional) ───────────────────────────────────────────
install_vulkan() {
    if [ "$PLATFORM" != "termux" ]; then
        return 0
    fi
    if pkg list-installed 2>/dev/null | grep -q "ollama-backend-vulkan"; then
        ok "Backend Vulkan ya instalado"
        return 0
    fi
    echo ""
    warn "Para correr modelos potentes (ej. qwen2.5-coder:7b) mas rapido,"
    warn "puedes instalar el backend Vulkan que usa la GPU del telefono."
    echo -n "  Instalar backend Vulkan (recomendado)? (s/N): "
    read -r vulkan_opt
    if [ "$vulkan_opt" = "s" ] || [ "$vulkan_opt" = "S" ]; then
        run_step "Instalando backend Vulkan" 600 pkg install -y ollama-backend-vulkan || true
        case "$(getprop ro.hardware 2>/dev/null)" in
            *qcom*|*Qualcomm*|*SM*|*LGE*)
                run_step "Instalando driver Adreno (freedreno)" 300 pkg install -y mesa-vulkan-icd-freedreno || true
                ;;
            *mali*|*ARM*|*rk30*|*rk33*)
                run_step "Instalando driver Mali" 300 pkg install -y mesa-vulkan-icd-mali-t7xx || true
                ;;
        esac
        if pkg list-installed 2>/dev/null | grep -q "ollama-backend-vulkan"; then
            ok "Backend Vulkan instalado (aceleracion por GPU)"
        else
            warn "No se pudo instalar el backend Vulkan; se usa CPU."
        fi
    fi
}

# ─── Install Scripts ─────────────────────────────────────────────────────
install_scripts() {
    echo ""
    info "Instalando scripts RANDI..."

    mkdir -p "$BIN_DIR" "$RANDI_DIR/lib" "$RANDI_DIR/sessions" "$RANDI_DIR/web"

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

    if [ -f "$REPO_DIR/bin/lib/catalog.py" ]; then
        cp "$REPO_DIR/bin/lib/catalog.py" "$RANDI_DIR/lib/catalog.py"
    fi

    if [ -f "$REPO_DIR/bin/lib/pull.py" ]; then
        cp "$REPO_DIR/bin/lib/pull.py" "$RANDI_DIR/lib/pull.py"
        chmod +x "$RANDI_DIR/lib/pull.py"
    fi

    if [ -d "$REPO_DIR/web" ]; then
        cp -r "$REPO_DIR/web/." "$RANDI_DIR/web/"
        ok "Interfaz web: $RANDI_DIR/web"
    fi

    if [ -f "$REPO_DIR/web/models.json" ]; then
        cp "$REPO_DIR/web/models.json" "$RANDI_DIR/lib/models.json"
        ok "Catalogo de modelos: $RANDI_DIR/lib/models.json"
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
                echo "set -gx OLLAMA_FLASH_ATTENTION 1" >> "$sf"
                echo "set -gx OLLAMA_KV_CACHE_TYPE q8_0" >> "$sf"
                ;;
            *)
                echo "" >> "$sf"
                echo "# RANDI" >> "$sf"
                echo 'export PATH="$HOME/bin:$PATH"' >> "$sf"
                echo 'export OLLAMA_KEEP_ALIVE="-1"' >> "$sf"
                echo "export OLLAMA_HOST=$OLLAMA_HOST" >> "$sf"
                echo 'export OLLAMA_FLASH_ATTENTION="1"' >> "$sf"
                echo 'export OLLAMA_KV_CACHE_TYPE="q8_0"' >> "$sf"
                ;;
        esac
        ok "Configurado: $(basename $sf)"
    done

    export PATH="$HOME/bin:$PATH"
    export OLLAMA_KEEP_ALIVE="-1"
    export OLLAMA_FLASH_ATTENTION="1"
    export OLLAMA_KV_CACHE_TYPE="q8_0"
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
        "qwen2.5-coder:3b":   { "name": "Qwen 2.5 Coder 3B", "limit": { "context": 32768, "output": 4096 } },
        "qwen3:8b":           { "name": "Qwen3 8B", "limit": { "context": 32768, "output": 4096 } },
        "gemma3:1b":          { "name": "Gemma 3 1B", "limit": { "context": 16384, "output": 4096 } },
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

    if [ -f "$REPO_DIR/bin/lib/pull.py" ]; then
        python3 "$REPO_DIR/bin/lib/pull.py"
    else
        warn "No se encuentra pull.py; usa luego: randi pull"
    fi

    mkdir -p "$HOME/.config/randi"
    local cfg="$HOME/.config/randi/config.json"
    if [ ! -f "$cfg" ]; then
        echo "{\"model\":\"qwen2.5-coder:1.5b\",\"temperature\":0.7,\"last_session\":\"\"}" > "$cfg"
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
    dim "  Log de instalacion: $RANDI_LOG"
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

    check_env_platform
    check_python
    check_env
    install_deps
    install_ollama
    install_vulkan
    install_scripts
    configure_shell
    configure_opencode

    echo ""
    info "Iniciando servidor Ollama..."
    if command -v ollama >/dev/null 2>&1; then
        nohup ollama serve > /dev/null 2>&1 &
        local serve_pid=$!
        disown "$serve_pid" 2>/dev/null || true
        sleep 3
    else
        warn "Ollama no disponible; instala modelos luego con: randi pull"
    fi

    download_models

    pkill -f "ollama serve" 2>/dev/null || true
    sleep 1

    show_summary
}

main "$@"
