import test from 'node:test';
import assert from 'node:assert/strict';
import { client } from '../collector/apifootball.js';

test('API-Football: limite por minuto espera e tenta de novo; outros erros sobem', async () => {
  let n = 0;
  const fetcher = async () => (++n === 1 ? { errors: { rateLimit: 'Too many requests. Your rate limit is 300 requests per minute.' }, response: [] } : { errors: [], response: [1, 2] });
  const api = client({ key: 'x', fetcher, gap: 1 });
  const t0 = Date.now(); const r = await api.get('fixtures');
  assert.deepEqual(r, [1, 2]); assert.equal(api.st.limited, 1); assert.equal(api.st.used, 2); assert.ok(Date.now() - t0 >= 5000);
  const bad = client({ key: 'x', fetcher: async () => ({ errors: { token: 'Error/Missing application key.' } }), gap: 1 });
  await assert.rejects(bad.get('fixtures'), /application key/);
});
test('API-Football: freio entre pedidos em paralelo', async () => {
  const api = client({ key: 'x', fetcher: async () => ({ errors: [], response: [] }), gap: 40 });
  const t0 = Date.now(); await Promise.all([1, 2, 3, 4].map(() => api.get('x')));
  assert.ok(Date.now() - t0 >= 110);
});
