// Linhas das casas. Cada casa tem um leitor próprio rodando no navegador do usuário (como o da 99play na NBA) que
// manda uma "foto" das linhas para a função "linhas" do Supabase. Aqui a coleta busca a última foto de cada casa e
// encaixa cada linha no jogo, jogador/time e mercado do modelo. Formato da foto: ver tools/navegador/README.md.
import { getJSON } from './http.js';

// nome de cada casa como aparece no bot e no app
export const HOUSE_NAME = { '99play': '99play', farra: 'Farra', betano: 'Betano', bet365: 'Bet365', superbet: 'Superbet' };
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
/* nomes de jogador: a API-Football usa "B. Saka" ou o apelido ("Dudu", "Neto Moura"); as casas, o nome completo em
   qualquer ordem ("Henrique Gustavo Scarpa", "Scarpa Gustavo", "Eduardo Dudu"). Regra: TODAS as palavras do nome da
   API precisam aparecer no nome da casa (prefixo vale: "Léo" = "Leonardo", "Puma" = "Pumita"); inicial tem de bater.
   Nome da casa com uma palavra só ("Cuello", "Wallisson") vale se for igual a uma das palavras do nome da API.
   Só entre os jogadores do time dele; empate ou dois nomes da casa no mesmo jogador = fica de fora. */
const PSTOP = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'van', 'von', 'der', 'den', 'di', 'del', 'la', 'le']);
const ptok = s => norm(s).split(' ').filter(t => t && !PSTOP.has(t));
const tokEq = (a, b) => a === b || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)));
export function playerScore(house, api) {
  if (norm(house) === norm(api)) return 1;
  const h = ptok(house), a = ptok(api); if (!h.length || !a.length) return 0;
  const aFull = a.filter(t => t.length > 1), aInit = a.filter(t => t.length === 1);
  if (!aFull.length) return 0;
  if (aInit.length && !aInit.every(i => h.some(t => t[0] === i))) return 0;
  if (aFull.every(t => h.some(u => tokEq(t, u)))) return 0.8 + 0.2 * Math.min(1, aFull.length / h.length);
  if (h.length === 1 && aFull.includes(h[0])) return 0.65; // palavra única: só igual ("Riquelme" não é "Rique")
  return 0;
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
  const out = new Map(), miss = [], claims = {}, keyHouse = [];
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
      // só entre os jogadores do time dele (quando a casa diz o time); empate no topo = ambíguo, fica de fora
      const sh = x.team ? teamScore(x.team, g.home.name) : 0, sa = x.team ? teamScore(x.team, g.away.name) : 0;
      const side = Math.max(sh, sa) >= 0.5 ? (sh >= sa ? g.home.id : g.away.id) : null;
      let bp = 0, tie = false;
      for (const [pid, p] of byGame[g.id] ?? []) {
        if (side != null && String(p.t) !== String(side)) continue;
        const s = playerScore(x.player, p.n);
        if (s > bp) { bp = s; target = pid; tie = false; } else if (s === bp && s > 0) tie = true;
      }
      if (bp < 0.6 || (tie && bp < 1)) target = null;
      if (target) (claims[`${h.house}|${g.id}|${target}`] ??= new Set()).add(norm(x.player));
    }
    if (!target) { miss.push({ house: h.house, why: x.type === 'player' ? 'jogador' : 'time', x }); continue; }
    const key = `${g.id}|${target}|${x.mk}|${line}`;
    if (x.type === 'player') keyHouse.push([key, h.house, `${h.house}|${g.id}|${target}`, x]);
    const arr = out.get(key) ?? out.set(key, []).get(key);
    const prev = arr.find(a => a.house === h.house);
    if (prev) prev.odd = Math.max(prev.odd, odd); else arr.push({ house: HOUSE_NAME[h.house] ?? h.house, odd });
  }
  // dois nomes diferentes da mesma casa caindo no mesmo jogador (ex.: dois "Carlos Eduardo"): não dá para saber qual é
  for (const [key, house, ck, x] of keyHouse) {
    if ((claims[ck]?.size ?? 0) < 2) continue;
    miss.push({ house, why: 'jogador ambíguo', x });
    const arr = out.get(key); if (!arr) continue;
    const i = arr.findIndex(a => a.house === house); if (i >= 0) arr.splice(i, 1);
    if (!arr.length) out.delete(key);
  }
  for (const arr of out.values()) arr.sort((a, b) => b.odd - a.odd);
  return { lines: out, miss };
}
