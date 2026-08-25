// RANDI — API client (fetch hacia el servidor local)
// Las llamadas /api/* pasan por el proxy del servidor Python.

const TOKEN = (() => {
  const m = document.querySelector('meta[name="randi-token"]');
  return m ? m.getAttribute('content') : '';
})();

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (TOKEN) headers['X-RANDI-Token'] = TOKEN;
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { ...options, headers });
  return res;
}

export async function apiGet(path) {
  const res = await request(path);
  return res.json();
}

export async function apiPost(path, body) {
  const res = await request(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function getHardware(overrides = {}) {
  try {
    const hw = await apiGet('/api/hardware');
    return { ...hw, ...overrides };
  } catch (e) {
    return overrides;
  }
}

export async function getModels(filters = {}) {
  const qs = new URLSearchParams(filters).toString();
  const data = await apiGet(`/api/models${qs ? '?' + qs : ''}`);
  return data.models || [];
}

export async function getModelDetail(id) {
  return apiGet(`/api/models/${encodeURIComponent(id)}`);
}

export async function recommend(body) {
  return apiPost('/api/recommend', body);
}

export async function checkCompatibility(body) {
  return apiPost('/api/compatibility', body);
}
