# RANDI Chat — Worker (gratis en Cloudflare)

Mini‑proxy de streaming para el "Chatea ahora" de la landing. Nada se
almacena aquí: el contexto vive en el navegador (localStorage).

- `POST /api/chat` — chat con streaming (SSE). Corte diario gratis por IP (`FREE_DAILY_LIMIT`).
- `GET /api/models` — manifiesto de modelos gratuitos (alimenta la UI).
- `GET /` — health + lista de modelos.

## Proveedores

| Proveedor | Costo | API key |
|---|---|---|
| **Cloudflare Workers AI** (por defecto) | plan gratuito (cuota diaria) | no requiere |
| OpenRouter (`:free`) | modelos gratis con límites | `OPENROUTER_API_KEY` opcional |
| Hugging Face Inference | tier gratuito | `HF_API_KEY` opcional |

## Despliegue (cuenta gratuita)

**Opción A — desde Termux/Android (recomendada, solo curl):**

```bash
bash deploy.sh          # te pide Account ID y API Token
```

1. Crea (o usa) una cuenta en `dash.cloudflare.com` — **podés crear una
   nueva** para este proyecto; Cloudflare permite varias cuentas por persona.
2. **My Profile → API Tokens → Create Token** → template *Edit Cloudflare
   Workers* → copiá el token.
3. **Account ID**: en *Workers & Pages → Overview* (barra lateral).
4. Corré `bash deploy.sh`, pegá ambos. Al final te da la URL del Worker,
   que ponés en `site/public/chat-config.json` y hacés commit + push.

**Opción B — desde un PC:**

```bash
cd workers/chat
npx wrangler@latest login   # una vez
npx wrangler@latest deploy
```

> En Android/Termux wrangler no corre (workerd no tiene binario para esa
> plataforma); por eso `deploy.sh` usa la API REST directa.
> Alternativa manual: subí el contenido de `src/index.ts` desde el
> dashboard (Workers → Create Worker → paste) y creá el binding abajo.

Luego, en el dashboard del Worker (pestaña **Settings → Bindings**), crea el
binding de **Workers AI** con nombre `AI` (Workers → Create → Workers AI). Sin
ese binding el chat responde "Workers AI no está vinculado".

> Nota: si tu cuenta es nueva (2025+) y Wrangler v4 te pide *named providers*,
> elimina el bloque `[ai]` del `wrangler.toml` y crea el binding desde el
> dashboard (nombre `AI`) — el código no cambia.

## Config

- `FREE_DAILY_LIMIT` — mensajes gratis por IP y por día (default `40`).
- Claves opcionales como *secrets*: `npx wrangler secret put OPENROUTER_API_KEY`.

## Probar en local

```bash
cp .dev.vars.example .dev.vars   # solo si vas a usar OpenRouter/HF
npx wrangler dev
curl -N -X POST localhost:8787/api/chat \
  -H 'content-type: application/json' \
  -d '{"model":"qwen2.5-7b","messages":[{"role":"user","content":"Hola"}]}'
```

## Agregar más modelos

Edita `src/providers.ts` (`MODELS`): para Workers AI usá un id `@cf/...`;
para OpenRouter un id `:free` (ej. `deepseek/deepseek-chat-v3-0324:free`).
Luego `npx wrangler deploy` otra vez.