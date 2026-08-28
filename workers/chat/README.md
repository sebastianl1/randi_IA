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

```bash
cd workers/chat
npm install          # sirve para typecheck; wrangler se ejecuta bajo demanda
npx wrangler@latest login   # una vez
npx wrangler@latest deploy
```

> En Android/Termux wrangler no corre (workerd no soporta esa plataforma):
> desplegá desde un PC, o subí `src/index.ts` directo desde el
> **dashboard de Cloudflare** (Workers → Create Worker → paste the code),
> y no olvides crear el binding de Workers AI (ver abajo).

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