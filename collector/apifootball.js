// Cliente da API-Football (v3.football.api-sports.io). A chave vem de APIFOOTBALL_KEY (segredo do GitHub).
// Cada execução tem um teto de pedidos (APIF_MAX_RUN) para não estourar a cota diária do plano.
import { getJSON } from './http.js';

const BASE = 'https://v3.football.api-sports.io/';
export function client({ key = process.env.APIFOOTBALL_KEY, max = +(process.env.APIF_MAX_RUN || 600), fetcher = getJSON } = {}) {
  if (!key) throw new Error('APIFOOTBALL_KEY ausente');
  const st = { used: 0, remaining: null, max };
  async function get(path, params = {}) {
    if (st.used >= st.max) throw Object.assign(new Error(`teto de ${st.max} pedidos nesta execução`), { quota: true });
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]));
    st.used++;
    const j = await fetcher(BASE + path + (qs.size ? '?' + qs : ''), { headers: { 'x-apisports-key': key } });
    if (j?.__remaining != null) st.remaining = j.__remaining;
    const errs = j?.errors && (Array.isArray(j.errors) ? j.errors : Object.values(j.errors));
    if (errs?.length) throw new Error('API-Football: ' + errs.join('; ').slice(0, 200));
    if (st.remaining != null && st.remaining < 50) throw Object.assign(new Error(`cota diária quase no fim (${st.remaining})`), { quota: true });
    return j?.response ?? [];
  }
  return {
    st, get,
    fixturesByDate: (date, tz = 'America/Sao_Paulo') => get('fixtures', { date, timezone: tz }),
    fixturesRange: (league, season, from, to, status) => get('fixtures', { league, season, from, to, status, timezone: 'UTC' }),
    fixturePlayers: fixture => get('fixtures/players', { fixture }),
    fixtureStats: (fixture, half = true) => get('fixtures/statistics', { fixture, half: half ? 'true' : undefined }),
    lineups: fixture => get('fixtures/lineups', { fixture }),
    injuriesByDate: (date, tz = 'America/Sao_Paulo') => get('injuries', { date, timezone: tz }),
    injuriesByFixture: fixture => get('injuries', { fixture }),
  };
}
