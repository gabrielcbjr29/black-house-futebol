// Cliente da API-Football (v3.football.api-sports.io). A chave vem de APIFOOTBALL_KEY (segredo do GitHub).
// Cada execução tem um teto de pedidos (APIF_MAX_RUN) para não estourar a cota diária do plano.
import { getJSON } from './http.js';

const BASE = 'https://v3.football.api-sports.io/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
export function client({ key = process.env.APIFOOTBALL_KEY, max = +(process.env.APIF_MAX_RUN || 600), fetcher = getJSON, gap = +(process.env.APIF_GAP_MS || 250) } = {}) {
  if (!key) throw new Error('APIFOOTBALL_KEY ausente');
  const st = { used: 0, remaining: null, max, limited: 0 };
  // freio: a API-Football também limita pedidos por minuto (e responde 200 com errors.rateLimit quando passa).
  // Um pedido a cada `gap` ms, mesmo com vários em paralelo.
  let nextAt = 0;
  const slot = async () => { const now = Date.now(), at = Math.max(now, nextAt); nextAt = at + gap; if (at > now) await sleep(at - now); };
  async function get(path, params = {}) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]));
    for (let attempt = 0; ; attempt++) {
      if (st.used >= st.max) throw Object.assign(new Error(`teto de ${st.max} pedidos nesta execução`), { quota: true });
      await slot();
      st.used++;
      const j = await fetcher(BASE + path + (qs.size ? '?' + qs : ''), { headers: { 'x-apisports-key': key } });
      if (j?.__remaining != null) st.remaining = j.__remaining;
      const errs = j?.errors && (Array.isArray(j.errors) ? j.errors : Object.entries(j.errors).map(([k, v]) => `${k}: ${v}`));
      if (errs?.length) {
        // limite por minuto: espera e tenta de novo (até 4 vezes); qualquer outro erro sobe
        if (/rate ?limit|too many/i.test(errs.join(' ')) && attempt < 4) { st.limited++; await sleep(6000 * (attempt + 1)); continue; }
        throw new Error('API-Football: ' + errs.join('; ').slice(0, 200));
      }
      if (st.remaining != null && st.remaining < 50) throw Object.assign(new Error(`cota diária quase no fim (${st.remaining})`), { quota: true });
      return j?.response ?? [];
    }
  }
  return {
    st, get,
    fixturesByDate: (date, tz = 'America/Sao_Paulo') => get('fixtures', { date, timezone: tz }),
    fixturesRange: (league, season, from, to, status) => get('fixtures', { league, season, from, to, status, timezone: 'UTC' }),
    fixturePlayers: fixture => get('fixtures/players', { fixture }),
    fixtureStats: (fixture, half = true) => get('fixtures/statistics', { fixture, half: half ? 'true' : undefined }),
    lineups: fixture => get('fixtures/lineups', { fixture }),
    squad: team => get('players/squads', { team }),
    injuriesByDate: (date, tz = 'America/Sao_Paulo') => get('injuries', { date, timezone: tz }),
    injuriesByFixture: fixture => get('injuries', { fixture }),
  };
}
