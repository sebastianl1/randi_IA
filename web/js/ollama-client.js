const OLLAMA_HOST = (() => {
  const base = `${window.location.protocol}//${window.location.host}`;
  return base;
})();

let abortController = null;

export async function checkServer() {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listModels() {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map(m => ({
      name: m.name,
      size: m.size,
      modified: m.modified_at,
    }));
  } catch {
    return [];
  }
}

export async function chat(model, messages, onToken, onDone, onError) {
  abortController = new AbortController();

  const payload = {
    model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    stream: true,
  };

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: abortController.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      onError?.(`Error ${res.status}: ${text}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const data = JSON.parse(trimmed);
          const content = data.message?.content || '';
          if (content) onToken?.(content);
          if (data.done) onDone?.(data);
        } catch {
          // partial line, skip
        }
      }
    }

    // process remaining buffer
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer.trim());
        const content = data.message?.content || '';
        if (content) onToken?.(content);
        if (data.done) onDone?.(data);
      } catch {}
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      onDone?.({ aborted: true });
    } else {
      onError?.(err.message || 'Error de conexion con Ollama');
    }
  }
}

export function abort() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}
