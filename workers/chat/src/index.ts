// RANDI Chat — Worker de streaming (plan gratuito de Cloudflare).
// - /api/chat  : chat con streaming (SSE). Límite gratis por IP/día.
// - /api/models: manifiesto de modelos gratis que alimenta la UI.
// - /          : health.
// Contexto: vive en el navegador (localStorage), aquí nunca se guarda.
import { MODELS, modelReady, streamModel, type Env, type ChatMsg, type ModelDef } from './providers.js';

const USAGE = new Map<string, { day: string; used: number }>();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const dayKey = (): string => new Date().toISOString().slice(0, 10);

function clientIp(req: Request): string {
  return req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    const freeLimit = parseInt(env.FREE_DAILY_LIMIT || '40', 10) || 40;

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
      return json({ ok: true, service: 'randi-chat', freeDailyLimit: freeLimit, models: MODELS.map((m) => m.id) });
    }
    if (request.method === 'GET' && url.pathname === '/api/models') {
      return json({ name: 'randi-chat', freeDailyLimit: freeLimit, models: MODELS.map((m) => ({ ...m, ready: modelReady(m, env) })) });
    }
    if (request.method === 'POST' && url.pathname === '/api/chat') {
      return handleChat(request, env, freeLimit);
    }
    return json({ error: { code: 'not_found' } }, 404);
  },
};

async function handleChat(request: Request, env: Env, freeLimit: number): Promise<Response> {
  let body: { model?: string; messages?: ChatMsg[] };
  try { body = await request.json(); } catch { return json({ error: { code: 'bad_request', message: 'JSON inválido' } }, 400); }

  const model: ModelDef | undefined = MODELS.find((m) => m.id === body.model);
  if (!model) return json({ error: { code: 'unknown_model', message: 'Modelo no disponible' } }, 400);
  const messages = (body.messages || []).slice(-48).filter((m) => typeof m?.content === 'string');
  if (!messages.length) return json({ error: { code: 'bad_request', message: 'Sin mensajes' } }, 400);

  const ip = clientIp(request);
  const day = dayKey();
  const key = `${day}:${ip}`;
  let rec = USAGE.get(key);
  if (!rec || rec.day !== day) { rec = { day, used: 0 }; USAGE.set(key, rec); }
  if (rec.used >= freeLimit) {
    return json({ error: { code: 'limit', dailyLimit: freeLimit, message: 'FREE_DAILY_LIMIT' } }, 429);
  }
  rec.used += 1;

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (type: string, data: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify({ type, data })}\n\n`));
      try {
        if (model.provider === 'workers-ai') {
          const ai = env.AI;
          if (!ai) { send('error', { message: 'Workers AI no está vinculado a este Worker (binding "AI").' }); controller.close(); return; }
          const out = await ai.run(model.ref, { messages, stream: true });
          const s = out instanceof ReadableStream ? out : out?.response instanceof ReadableStream ? out.response : null;
          if (!s) { send('error', { message: 'El modelo no devolvió un stream válido.' }); controller.close(); return; }
          const reader = s.getReader();
          const dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let nl;
            while ((nl = buf.indexOf('\n')) >= 0) {
              let line = buf.slice(0, nl).trim();
              buf = buf.slice(nl + 1);
              if (line.startsWith('data:')) line = line.slice(5).trim();
              if (!line) continue;
              try {
                const j = JSON.parse(line);
                if (typeof j.response === 'string' && j.response) send('delta', j.response);
              } catch { /* fragmento parcial */ }
            }
          }
        } else {
          const it = streamModel(model, messages, env);
          for await (const chunk of it) send('delta', chunk);
        }
        send('done', {});
      } catch (e: unknown) {
        send('error', { message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', ...CORS } });
}