// Requisições com tempo limite, novas tentativas e limite de paralelismo.
export const USAGE = {};
export const safeURL = u => String(u).replace(/([?&](?:apiKey|api_key|key|token)=)[^&]+/gi, '$1***');

export async function getJSON(url, { headers = {}, retries = 3, timeout = 25000, quiet404 = false } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      try { const h = new URL(url).hostname; USAGE[h] = (USAGE[h] || 0) + 1; } catch { }
      const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: ctl.signal });
      clearTimeout(t);
      if (res.status === 404 && quiet404) return null;
      if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`HTTP ${res.status} ${safeURL(url)}`), { status: res.status, retry: true });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} ${safeURL(url)}`), { status: res.status });
      const json = await res.json();
      const rem = res.headers.get('x-ratelimit-requests-remaining');
      if (rem != null && json && typeof json === 'object') Object.defineProperty(json, '__remaining', { value: +rem, enumerable: false });
      return json;
    } catch (e) {
      clearTimeout(t); lastErr = e;
      if (e.status && !e.retry) throw e;
      await new Promise(r => setTimeout(r, 800 * 2 ** i + Math.random() * 400));
    }
  }
  throw lastErr;
}

// executa tarefas assíncronas com no máximo `limit` ao mesmo tempo
export async function pool(items, limit, fn) {
  const out = new Array(items.length); let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try { out[i] = await fn(items[i], i); } catch (e) { out[i] = { __error: e }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
