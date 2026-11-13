// Linhas das casas. Cada casa tem um leitor próprio rodando no navegador do usuário (como o da 99play na NBA) que
// manda uma "foto" das linhas para a função "linhas" do Supabase. Aqui a coleta busca a última foto de cada casa e
// encaixa cada linha no jogo, jogador/time e mercado do modelo. Formato da foto: ver tools/navegador/README.md.
import { getJSON } from './http.js';

const MAX_AGE = 18 * 3600e3; // rede de segurança: sem foto nova, usa a última por até 18 horas
export const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'ssc', 'as', 'rc', 'cd', 'ec', 'se', 'club', 'de', 'do', 'da', 'the', 'and', 'calcio', 'fk', '1', 'u']);
const tokens = s => norm(s).split(' ').filter(t => t && !STOP.has(t));

/* nomes de time: "Man City" × "Manchester City", "Atlético Mineiro" × "Atletico-MG" */
const ALIAS = { 'man city': 'manchester city', 'man utd': 'manchester united', 'man united': 'manchester united', 'spurs': 'tottenham', 'wolves': 'wolverhampton', 'psg': 'paris saint germain', 'inter': 'inter milan', 'atletico mg': 'atletico mineiro', 'atletico pr': 'athletico paranaense', 'athletico pr': 'athletico paranaense', 'bayern': 'bayern munchen', 'bayern munich': 'bayern munchen', 'leverkusen': 'bayer leverkusen', 'gladbach': 'borussia monchengladbach', 'dortmund': 'borussia dortmund',
  // nomes em português usados pelas casas brasileiras
  'bayern de munique': 'bayern munchen', 'inter de milao': 'inter', 'internazionale': 'inter', 'atletico de madrid': 'atletico madrid', 'atletico madri': 'atletico madrid',
  'tottenham hotspur': 'tottenham', 'paris saint germain fc': 'paris saint germain', 'paris sg': 'paris saint germain', 'olympique de marselha': 'marseille', 'marselha': 'marseille',
  'olympique de lyon': 'lyon', 'lyon': 'lyon', 'sevilha': 'sevilla', 'napoles': 'napoli', 'roma': 'as roma', 'as roma': 'as roma', 'colonia': 'fc koln', 'koln': 'fc koln',
  'vasco': 'vasco da gama', 'sao paulo': 'sao paulo', 'gremio': 'gremio', 'bragantino': 'rb bragantino', 'red bull bragantino': 'rb bragantino' };
export function teamScore(a, b) {
  const na = ALIAS[norm(a)] ?? norm(a), nb = ALIAS[norm(b)] ?? norm(b);
  if (na === nb) return 1;
  const ta = tokens(na), tb = tokens(nb); if (!ta.length || !tb.length) return 0;
  const hit = ta.filter(t => tb.some(u => u === t || (t.length >= 4 && u.startsWith(t)) || (u.length >= 4 && t.startsWith(u)))).length;
  return hit / Math.max(ta.length, tb.length) * 0.9 + (na.includes(nb) || nb.includes(na) ? 0.1 : 0);
}
/* nomes de jogador: a API-Football usa "B. Saka"; as casas, "Bukayo Saka" */
export function playerScore(house, api) {
  const h = tokens(house), a = norm(api).split(' ').filter(Boolean); if (!h.length || !a.length) return 0;
  if (norm(house) === norm(api)) return 1;
  const aFull = a.filter(t => t.length > 1), aInit = a.filter(t => t.length === 1);
  const last = aFull[aFull.length - 1];
  if (!last) return 0;
  const lastOk = h.includes(last) || h.join(' ').endsWith(aFull.join(' '));
  if (!lastOk) return 0;
  const initOk = !aInit.length || aInit.some(i => h.some(t => t[0] === i));
  const extra = aFull.filter(t => h.includes(t)).length / aFull.length;
  return (initOk ? 0.6 : 0.3) + 0.4 * extra;
}

export async function fetchHouses(url = process.env.LINHAS_URL, now = Date.now()) {
  if (!url) return [];
  const j = await getJSON(url + (url.includes('?') ? '&' : '?') + 'latest=1', { retries: 2 });
  return (j?.houses ?? []).filter(h => h?.payload?.lines?.length && now - Date.parse(h.taken_at) <= MAX_AGE);
}

/* encaixa as linhas no modelo. Devolve Map chave → [{house, odd}] (chave = jogo|alvo|mercado|linha) e o que não encaixou */
export function mergeLines(houses, slate) {
  const games = slate.games, P = slate.model.players;
  const byGame = {}; for (const [pid, p] of Object.entries(P)) (byGame[p.g] ??= []).push([pid, p]);
  const out = new Map(), miss = [];
  for (const h of houses) for (const x of h.payload.lines) {
    const odd = +x.odd, line = +x.line; if (!(odd > 1) || !(line >= 0) || !x.mk) continue;
    // jogo: os dois nomes de time e (se vier) o horário perto do oficial
    let g = null, best = 0;
    for (const G of games) {
      if (x.utc && Math.abs(Date.parse(x.utc) - Date.parse(G.utc)) > 3 * 3600e3) continue;
      const s = Math.min(teamScore(x.home, G.home.name), teamScore(x.away, G.away.name));
      if (s > best) { best = s; g = G; }
    }
    if (!g || best < 0.5) { miss.push({ house: h.house, why: 'jogo', x }); continue; }
    let target = null;
    if (x.type === 'match') target = `j${g.id}`;
    else if (x.type === 'team') {
      const sh = teamScore(x.team, g.home.name), sa = teamScore(x.team, g.away.name);
      if (Math.max(sh, sa) >= 0.5) target = `t${sh >= sa ? g.home.id : g.away.id}-${g.id}`;
    } else {
      let bp = 0;
      for (const [pid, p] of byGame[g.id] ?? []) { const s = playerScore(x.player, p.n); if (s > bp) { bp = s; target = pid; } }
      if (bp < 0.6) target = null;
    }
    if (!target) { miss.push({ house: h.house, why: x.type === 'player' ? 'jogador' : 'time', x }); continue; }
    const key = `${g.id}|${target}|${x.mk}|${line}`;
    const arr = out.get(key) ?? out.set(key, []).get(key);
    const prev = arr.find(a => a.house === h.house);
    if (prev) prev.odd = Math.max(prev.odd, odd); else arr.push({ house: h.house, odd });
  }
  for (const arr of out.values()) arr.sort((a, b) => b.odd - a.odd);
  return { lines: out, miss };
}
