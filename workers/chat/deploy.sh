#!/usr/bin/env bash
# Despliega "randi-chat" a Cloudflare usando solo curl + esbuild.
# Funciona desde Termux/Android (wrangler no corre ahí). Costo: $0.
#
# 1) Entra a https://dash.cloudflare.com (cuenta gratis; podés crear una nueva).
# 2) My Profile → API Tokens → Create Token → editar el template
#    "Edit Cloudflare Workers" (permite editar Workers). Copiá el token.
# 3) En el dashboard, tu Account ID está en Workers & Pages → Overview (sidebar).
# 4) Corré:  bash deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

FREE="${FREE_DAILY_LIMIT:-40}"
NAME="${RANDI_CHAT_NAME:-randi-chat}"

ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
TOKEN="${CLOUDFLARE_API_TOKEN:-}"
if [ -z "$ACCOUNT_ID" ]; then read -rp "Account ID (Cloudflare): " ACCOUNT_ID; fi
if [ -z "$TOKEN" ]; then read -rsp "API Token (se oculta): " TOKEN; echo; fi
if [ -z "$ACCOUNT_ID" ] || [ -z "$TOKEN" ]; then echo "Faltan Account ID o token."; exit 1; fi

API="https://api.cloudflare.com/client/v4"
STAGE="$API/accounts/$ACCOUNT_ID/workers/scripts/$NAME"

# ── 1) Empaquetar (index.ts + providers.ts -> worker.mjs) ──────────────
if [ -w /tmp ]; then OUT="${TMPDIR:-/tmp}/randi-chat-worker.mjs"; else OUT="$(pwd)/.build/worker.mjs"; mkdir -p "$(dirname "$OUT")"; fi
echo "== Salida: $OUT"
if command -v esbuild >/dev/null 2>&1; then
  ESBUILD="esbuild"
elif [ -f "../../site/node_modules/esbuild/bin/esbuild" ]; then
  ESBUILD="node ../../site/node_modules/esbuild/bin/esbuild"
elif [ -f "$(git rev-parse --show-toplevel 2>/dev/null)/site/node_modules/esbuild/bin/esbuild" ]; then
  ESBUILD="node $(git rev-parse --show-toplevel)/site/node_modules/esbuild/bin/esbuild"
else
  echo "No encontré esbuild. Instalalo con: npm i -g esbuild"; exit 1
fi
echo "== Empaquetando con esbuild..."
$ESBUILD src/index.ts --bundle --format=esm --outfile="$OUT" --log-level=warning

# ── 2) Metadata (binding de Workers AI + var de límite) ────────────────
META="{\"main_module\":\"worker.mjs\",\"compatibility_date\":\"2024-11-06\",\"compatibility_flags\":[],\"vars\":{\"FREE_DAILY_LIMIT\":\"$FREE\"}"
if [ "${RANDI_SKIP_AI_BINDING:-0}" != "1" ]; then
  META="$META,\"bindings\":[{\"name\":\"AI\",\"type\":\"ai\"}]"
fi
META="$META}"

echo "== Subiendo a Cloudflare (Workers: $NAME)..."
RESP=$(curl -s -X PUT "$STAGE?include_subdomain=true" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: multipart/form-data" \
  -F "metadata=$META;type=application/json" \
  -F "script=@$OUT;type=application/javascript+module")

if ! echo "$RESP" | python3 -c 'import json,sys; json.load(sys.stdin)["success"] or sys.exit(1)'; then
  echo "✗ Falló el deploy. Respuesta de Cloudflare:"
  echo "$RESP" | python3 -m json.tool
  echo
  echo "Sugerencias:"
  echo " - ¿El token tiene permiso 'Edit Cloudflare Workers' en tu cuenta?"
  echo " - Si el error menciona el binding (type ai), reintentá con:"
  echo "     RANDI_SKIP_AI_BINDING=1 bash deploy.sh"
  echo "   y después creás el binding en Dashboard → randi-chat → Settings → Bindings → Workers AI (nombre: AI)."
  exit 1
fi

# ── 3) URL pública ─────────────────────────────────────────────────────
SUBDOMAIN=$(curl -s -H "Authorization: Bearer $TOKEN" "$API/accounts/$ACCOUNT_ID/workers/subdomain" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result",{}).get("subdomain",""))')
URL="https://$NAME.$SUBDOMAIN.workers.dev"
echo "✓ Desplegado. Tu Worker está en:"
echo "   $URL"
echo
echo "Paso final: poné esa URL en site/public/chat-config.json como"
echo "   { \"endpoint\": \"$URL\" }"
echo "y hacé commit + push (o editalo directo en github.com → repo → site/public/chat-config.json → pen icon → Commit)."
echo "El widget de la landing se enciende solo (refrescá con Ctrl+Shift+R)."