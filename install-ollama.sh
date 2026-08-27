#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════════
#  RANDI — Instalador multiplataforma
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
    # run_step [-s] <label> <timeout> <cmd...>
    #   -s = soft: en fallo avisa (warn) y no muestra log; para pasos opcionales
    local soft=0
    [ "$1" = "-s" ] && { soft=1; shift; }
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
    if [ "$soft" -eq 1 ]; then
        warn "$label: no disponible (se continua)"
    else
        err "Fallo: $label"
        if [ "$rc" -eq 124 ]; then
            warn "  Se agoto el tiempo limite (${tmo}s). Revisa tu conexion y reintenta."
        fi
        if [ -s "$RANDI_LOG" ]; then
            warn "  Ultimas lineas de $RANDI_LOG:"
            tail -n 8 "$RANDI_LOG" | sed 's/^/    /'
        fi
    fi
    return 1
}

# ensure_dep <cmd> <paquete>: salta la instalacion si el comando ya existe
ensure_dep() {
    local cmd="$1" pkg="$2"
    if command -v "$cmd" >/dev/null 2>&1; then
        ok "$cmd ya instalado"
        return 0
    fi
    run_step -s "Instalando $pkg ($cmd)" 300 pkg install -y "$pkg"
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
            # Deteccion: salta lo que ya esta instalado. Sin pkg update/upgrade
            # para no tocar el lock de dpkg ni actualizar paquetes sin pedir.
            ensure_dep python python || deps_ok=1
            ensure_dep pip python-pip || deps_ok=1
            ensure_dep git git || deps_ok=1
            ensure_dep curl curl || deps_ok=1
            ensure_dep wget wget || deps_ok=1
            ensure_dep jq jq || deps_ok=1
            # termux-exec: hace que los shebangs `#!/usr/bin/env` funcionen
            # (sin él, `randi` directo falla al ejecutarse en Termux).
            if [ ! -x /usr/bin/env ]; then
                run_step -s "Instalando termux-exec (shebangs)" 120 pkg install -y termux-exec || true
            fi
            if python3 -c "import requests, rich, textual, httpx" >/dev/null 2>&1; then
                ok "Librerias Python (requests, rich, textual, httpx) ya instaladas"
            else
                run_step -s "Instalando librerias Python" 300 pip install requests rich textual httpx -q || true
            fi
            ;;
        macos)
            if ! command -v brew >/dev/null 2>&1; then
                warn "Homebrew no encontrado. Instalalo en https://brew.sh"
            else
                run_step "Instalando dependencias (brew)" 600 brew install python git curl jq || deps_ok=1
            fi
            ;;
        windows)
            # Windows nativo (sin WSL): Python y Git via winget si faltan.
            if ! command -v python3 >/dev/null 2>&1 && ! command -v python >/dev/null 2>&1; then
                run_step -s "Instalando Python (winget)" 600 winget install --silent Python.Python.3.12 || true
            fi
            if ! command -v bash >/dev/null 2>&1; then
                run_step -s "Instalando Git for Windows (winget)" 600 winget install --silent Git.Git || true
            fi
            command -v curl >/dev/null 2>&1 || true
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
            if run_step -s "Instalando Ollama (paquete nativo)" 600 pkg install -y ollama; then
                ok "Ollama instalado (paquete nativo de Termux)"
            else
                warn "Paquete nativo no disponible, probando npm..."
                if command -v npm >/dev/null 2>&1; then
                    run_step -s "Instalando Ollama (npm)" 600 npm install -g @mmmbuto/ollama-termux@latest || true
                    ollama-termux > /dev/null 2>&1 || true
                else
                    warn "npm no disponible; no se pudo instalar el fallback."
                fi
            fi
            ;;
        macos|linux|wsl)
            info "Descargando e instalando Ollama (script oficial)..."
            curl -fsSL https://ollama.com/install.sh | sh
            ;;
        windows)
            if command -v winget >/dev/null 2>&1; then
                run_step "Instalando Ollama (winget)" 300 winget install Ollama.Ollama --accept-source-agreements --accept-package-agreements || true
            else
                info "Descargando instalador de Ollama..."
                local installer="$HOME/ollama-installer.exe"
                if run_step "Descargando Ollama" 300 curl -fsSL -o "$installer" https://ollama.com/download/OllamaSetup.exe; then
                    run_step "Ejecutando instalador" 300 cmd.exe /c "$installer" /SILENT || true
                    rm -f "$installer" 2>/dev/null || true
                else
                    warn "No se pudo descargar Ollama. Instalalo manualmente:"
                    warn "  winget install Ollama.Ollama"
                    warn "  o https://ollama.com/download"
                    return 1
                fi
            fi
            ;;
    esac

    if command -v ollama &>/dev/null; then
        ok "Ollama instalado correctamente"
    else
        warn "Ollama no quedo instalado automaticamente."
        warn "  Instalalo luego con:  randi pull   (o manualmente en https://ollama.com)"
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
        run_step -s "Instalando backend Vulkan" 600 pkg install -y ollama-backend-vulkan || true
        case "$(getprop ro.hardware 2>/dev/null)" in
            *qcom*|*Qualcomm*|*SM*|*LGE*)
                run_step -s "Instalando driver Adreno (freedreno)" 300 pkg install -y mesa-vulkan-icd-freedreno || true
                ;;
            *mali*|*ARM*|*rk30*|*rk33*)
                run_step -s "Instalando driver Mali" 300 pkg install -y mesa-vulkan-icd-mali-t7xx || true
                ;;
        esac
        if pkg list-installed 2>/dev/null | grep -q "ollama-backend-vulkan"; then
            ok "Backend Vulkan instalado (aceleracion por GPU)"
        else
            warn "Backend Vulkan no disponible para tu dispositivo; se usa CPU (mas lento)."
            warn "  Puedes instalarlo luego manualmente si el paquete existe:"
            dim "    pkg install ollama-backend-vulkan"
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

    # Libreria Python completa (motor + paquete randi_tui)
    if [ -d "$REPO_DIR/bin/lib" ]; then
        cp -r "$REPO_DIR/bin/lib/." "$RANDI_DIR/lib/" || true
        rm -rf "$RANDI_DIR/lib/__pycache__" 2>/dev/null || true
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

    local profile_files=()

    if [ "$PLATFORM" = "windows" ]; then
        # Git Bash carga .bash_profile > .bash_login > .profile
        profile_files=("$HOME/.bash_profile" "$HOME/.profile" "$HOME/.bashrc")
    else
        profile_files=("$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.config/fish/config.fish")
    fi

    local configured=0
    for sf in "${profile_files[@]}"; do
        touch "$sf" 2>/dev/null || continue
        if grep -q 'PATH.*HOME/bin' "$sf" 2>/dev/null; then
            configured=1
            continue
        fi

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
        configured=1
        break
    done

    if [ "$configured" -eq 0 ]; then
        warn "No se pudo configurar el perfil de shell automaticamente."
        if [ "$PLATFORM" = "windows" ]; then
            warn "  Agrega manualmente a ~/.bash_profile:"
            warn '    export PATH="$HOME/bin:$PATH"'
        fi
    fi

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
    echo "  RANDI — Asistente IA local multiplataforma"
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
    info "Verificando servidor Ollama..."
    if command -v ollama >/dev/null 2>&1; then
        if [ "$PLATFORM" = "windows" ]; then
            # En Windows nativo Ollama se instala como servicio y arranca solo
            sleep 3
            if curl -sf "$OLLAMA_HOST/api/tags" >/dev/null 2>&1; then
                ok "Servidor Ollama activo (servicio de Windows)"
            else
                warn "Ollama instalado pero el servicio no responde todavia."
                warn "  Espera unos segundos o inicia manualmente desde el menu de Windows."
            fi
        else
            nohup ollama serve > /dev/null 2>&1 &
            local serve_pid=$!
            disown "$serve_pid" 2>/dev/null || true
            sleep 3
        fi
    else
        warn "Ollama no disponible; instala modelos luego con: randi pull"
    fi

    download_models

    if [ "$PLATFORM" != "windows" ]; then
        pkill -f "ollama serve" 2>/dev/null || true
        sleep 1
    fi

    show_summary

    if [ "$PLATFORM" = "windows" ]; then
        echo ""
        info "En Windows nativo, para usar 'randi' inmediatamente ejecuta:"
        echo '  source ~/.bash_profile'
        echo ""
        info "O simplemente cierra y vuelve a abrir Git Bash."
    fi
}

main "$@"
