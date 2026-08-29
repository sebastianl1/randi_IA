// workers/chat/src/providers.ts
var MODELS = [
  { id: "qwen2.5-7b", label: "Qwen 2.5 7B", provider: "workers-ai", ref: "@cf/qwen/qwen2.5-7b-instruct", note: "R\xE1pido y muy bueno en espa\xF1ol" },
  { id: "llama-3.1-8b", label: "Llama 3.1 8B", provider: "workers-ai", ref: "@cf/meta/llama-3.1-8b-instruct", note: "Generalista y equilibrado" },
  { id: "deepseek-r1-14b", label: "DeepSeek R1 \xB7 14B", provider: "workers-ai", ref: "@cf/deepseek-ai/deepseek-r1-distill-qwen-14b", note: "Razonamiento paso a paso" },
  { id: "mistral-7b", label: "Mistral 7B", provider: "workers-ai", ref: "@cf/mistral/mistral-7b-instruct-v0.1", note: "Directo y veloz" }
];
async function* openAICompat(provider, model, messages, env) {
  const apiKey = provider === "openrouter" ? env.OPENROUTER_API_KEY : env.HF_API_KEY;
  if (!apiKey) throw new Error(`${provider}: falta la API key`);
  const url = provider === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions" : `${env.HF_BASE || "https://api-inference.huggingface.co"}/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...provider === "openrouter" ? { "HTTP-Referer": "https://github.com/sebastianl1/randi_IA", "X-Title": "RANDI Chat" } : {}
    },
    body: JSON.stringify({ model: model.ref, messages, stream: true, max_tokens: 720 })
  });
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${provider}: HTTP ${res.status} ${txt.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const j = JSON.parse(payload);
        const delta = j?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) yield delta;
      } catch {
      }
    }
  }
}
async function* streamModel(model, messages, env) {
  if (model.provider === "openrouter" || model.provider === "huggingface") {
    yield* openAICompat(model.provider, model, messages, env);
    return;
  }
  throw new Error(`proveedor no soportado: ${model.provider}`);
}

// workers/chat/src/index.ts
var USAGE = /* @__PURE__ */ new Map();
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
var dayKey = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
function clientIp(req) {
  return req.headers.get("CF-Connecting-IP") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}
var index_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    const freeLimit = parseInt(env.FREE_DAILY_LIMIT || "40", 10) || 40;
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "")) {
      return json({ ok: true, service: "randi-chat", freeDailyLimit: freeLimit, models: MODELS.map((m) => m.id) });
    }
    if (request.method === "GET" && url.pathname === "/api/models") {
      return json({ name: "randi-chat", freeDailyLimit: freeLimit, models: MODELS });
    }
    if (request.method === "POST" && url.pathname === "/api/chat") {
      return handleChat(request, env, freeLimit);
    }
    return json({ error: { code: "not_found" } }, 404);
  }
};
async function handleChat(request, env, freeLimit) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: { code: "bad_request", message: "JSON inv\xE1lido" } }, 400);
  }
  const model = MODELS.find((m) => m.id === body.model);
  if (!model) return json({ error: { code: "unknown_model", message: "Modelo no disponible" } }, 400);
  const messages = (body.messages || []).slice(-48).filter((m) => typeof m?.content === "string");
  if (!messages.length) return json({ error: { code: "bad_request", message: "Sin mensajes" } }, 400);
  const ip = clientIp(request);
  const day = dayKey();
  const key = `${day}:${ip}`;
  let rec = USAGE.get(key);
  if (!rec || rec.day !== day) {
    rec = { day, used: 0 };
    USAGE.set(key, rec);
  }
  if (rec.used >= freeLimit) {
    return json({ error: { code: "limit", dailyLimit: freeLimit, message: "FREE_DAILY_LIMIT" } }, 429);
  }
  rec.used += 1;
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type, data) => controller.enqueue(enc.encode(`data: ${JSON.stringify({ type, data })}

`));
      try {
        if (model.provider === "workers-ai") {
          const ai = env.AI;
          if (!ai) {
            send("error", { message: 'Workers AI no est\xE1 vinculado a este Worker (binding "AI").' });
            controller.close();
            return;
          }
          const out = await ai.run(model.ref, { messages, stream: true });
          const s = out instanceof ReadableStream ? out : out?.response instanceof ReadableStream ? out.response : null;
          if (!s) {
            send("error", { message: "El modelo no devolvi\xF3 un stream v\xE1lido." });
            controller.close();
            return;
          }
          const reader = s.getReader();
          const dec = new TextDecoder();
          for (; ; ) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const line of dec.decode(value).split("\n")) {
              if (!line.trim()) continue;
              try {
                const j = JSON.parse(line);
                if (typeof j.response === "string" && j.response) send("delta", j.response);
              } catch {
              }
            }
          }
        } else {
          const it = streamModel(model, messages, env);
          for await (const chunk of it) send("delta", chunk);
        }
        send("done", {});
      } catch (e) {
        send("error", { message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    }
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", ...CORS } });
}
export {
  index_default as default
};
