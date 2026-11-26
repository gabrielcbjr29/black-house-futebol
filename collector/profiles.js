// Perfis do Modelo BH a partir do histórico próprio (data/hist): parâmetros de cada liga, força de cada time,
// taxas por 90 de cada jogador, chance de ser titular, minutos e fator do árbitro.
import { P, T } from './history.js';
import { LEAGUE_PRIOR, POS_PRIOR } from '../public/engine.js';
import { CUP_IDS } from '../config/leagues.js';

const decay = (i, half) => Math.pow(0.5, i / half);
const r3 = x => Math.round(x * 1000) / 1000;

/* médias da liga por jogo (soma dos dois times), mando e fatia do 1º tempo */
export function leagueParams(fixtures) {
  const acc = {};
  for (const f of fixtures) {
    const th = f.t?.[f.h], ta = f.t?.[f.a]; if (!th || !ta) continue;
    const a = acc[f.lg] ??= { n: 0, sh: 0, sot: 0, fc: 0, hsh: 0, ash: 0, hsot: 0, asot: 0, hfc: 0, afc: 0, n1: 0, sh1: 0, sot1: 0, shT: 0, sotT: 0 };
    a.n++; a.sh += th[T.sh] + ta[T.sh]; a.sot += th[T.sot] + ta[T.sot]; a.fc += th[T.fc] + ta[T.fc];
    a.hsh += th[T.sh]; a.ash += ta[T.sh]; a.hsot += th[T.sot]; a.asot += ta[T.sot]; a.hfc += th[T.fc]; a.afc += ta[T.fc];
    const h1 = f.t1?.[f.h], a1 = f.t1?.[f.a];
    if (h1 && a1) { a.n1++; a.sh1 += h1[0] + a1[0]; a.sot1 += h1[1] + a1[1]; a.shT += th[T.sh] + ta[T.sh]; a.sotT += th[T.sot] + ta[T.sot]; }
  }
  const out = {};
  for (const [lg, a] of Object.entries(acc)) {
    // as médias da liga são a régua das razões dos times: usar a média real (misturar com outra régua cria viés);
    // com menos de 10 jogos, a régua é a média de referência. Os fatores de mando são encolhidos para a referência.
    const w = a.n / (a.n + 20), mix = (x, prior) => w * x + (1 - w) * prior, own = (x, prior) => a.n >= 10 ? x / a.n : prior;
    out[lg] = {
      n: a.n,
      sh: r3(own(a.sh, LEAGUE_PRIOR.sh)), sot: r3(own(a.sot, LEAGUE_PRIOR.sot)), fc: r3(own(a.fc, LEAGUE_PRIOR.fc)),
      hsh: r3(mix(a.hsh / Math.max(a.ash, 1), LEAGUE_PRIOR.hsh)), hsot: r3(mix(a.hsot / Math.max(a.asot, 1), LEAGUE_PRIOR.hsot)), hfc: r3(mix(a.hfc / Math.max(a.afc, 1), LEAGUE_PRIOR.hfc)),
      h1sh: a.n1 >= 30 ? r3(a.sh1 / a.shT) : LEAGUE_PRIOR.h1sh, h1sot: a.n1 >= 30 ? r3(a.sot1 / a.sotT) : LEAGUE_PRIOR.h1sot, n1: a.n1,
    };
  }
  return out;
}
export const lgOf = (LP, id) => LP[id] ?? LEAGUE_PRIOR;

/* times: razões em relação à média da liga de cada jogo (assim as copas europeias entram na mesma escala), com peso maior
   nos jogos recentes e encolhimento para 1 (média) quando há poucos jogos */
export function teamProfiles(fixtures, LP, { half = 12, K = 5, maxN = 38 } = {}) {
  const byTeam = {};
  for (let i = fixtures.length - 1; i >= 0; i--) {
    const f = fixtures[i]; if (!f.t?.[f.h] || !f.t?.[f.a]) continue;
    for (const [me, op] of [[f.h, f.a], [f.a, f.h]]) (byTeam[me] ??= []).push({ f, me, op });
  }
  const out = {};
  for (const [id, list] of Object.entries(byTeam)) {
    const ms = list.slice(0, maxN);
    const s = { w: 0, shF: 0, shA: 0, sotF: 0, sotA: 0, fcF: 0, fcA: 0, poss: 0 }, lgCount = {};
    ms.forEach(({ f, me, op }, i) => {
      const L = lgOf(LP, f.lg), w = decay(i, half), a = f.t[me], b = f.t[op];
      s.w += w; s.shF += w * a[T.sh] / (L.sh / 2); s.shA += w * b[T.sh] / (L.sh / 2); s.sotF += w * a[T.sot] / (L.sot / 2); s.sotA += w * b[T.sot] / (L.sot / 2);
      s.fcF += w * a[T.fc] / (L.fc / 2); s.fcA += w * b[T.fc] / (L.fc / 2); s.poss += w * (a[T.poss] || 50);
      if (!CUP_IDS.has(f.lg)) lgCount[f.lg] = (lgCount[f.lg] || 0) + 1;
    });
    const sh = x => r3((x + K) / (s.w + K));
    const dom = +Object.entries(lgCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    out[id] = { n: ms.length, lg: dom, shF: sh(s.shF), shA: sh(s.shA), sotF: sh(s.sotF), sotA: sh(s.sotA), fcF: sh(s.fcF), fcA: sh(s.fcA), poss: r3((s.poss + 50 * K) / (s.w + K)),
      // últimos 20 jogos (a Tendência usa L20; as telas usam os 10 primeiros)
      last: ms.slice(0, 20).map(({ f, me, op }) => [f.id, f.t[me][T.sh], f.t[me][T.sot], f.t[me][T.fc], f.t[op][T.sh], f.t[op][T.sot], f.t[op][T.fc]]) };
  }
  return out;
}
// média do próprio time por jogo, em números absolutos (base do contexto do jogador)
export function teamAvg(tp, L) {
  return { sh: L.sh / 2 * tp.shF, sot: L.sot / 2 * tp.sotF, fc: L.fc / 2 * tp.fcF, fcA: L.fc / 2 * tp.fcA, poss: tp.poss };
}

/* médias por 90 de cada posição no histórico (o "ponto de partida" de quem tem poucos jogos) */
export function posPriors(fixtures) {
  const a = {};
  for (const f of fixtures) for (const p of f.p) {
    if (!p[P.min] || !p[P.pos]) continue;
    const x = a[p[P.pos]] ??= { min: 0, sh: 0, sot: 0, fc: 0, fs: 0, tk: 0, sv: 0 };
    x.min += p[P.min]; x.sh += p[P.sh]; x.sot += p[P.sot]; x.fc += p[P.fc]; x.fs += p[P.fs]; x.tk += p[P.tk]; x.sv += p[P.sv];
  }
  const out = {};
  for (const pos of Object.keys(POS_PRIOR)) {
    const x = a[pos];
    out[pos] = x && x.min > 9000 ? Object.fromEntries(['sh', 'sot', 'fc', 'fs', 'tk', 'sv'].map(k => [k, r3(x[k] / x.min * 90)])) : { ...POS_PRIOR[pos] };
  }
  return out;
}

const K90 = { sh: 3, sot: 4, fc: 4, fs: 4, tk: 4, sv: 3 };
const STATS = ['sh', 'sot', 'fc', 'fs', 'tk', 'sv'];
// minutos esperados como titular: média recente puxada para 80 com peso 0,75 (um titular que saiu cedo por lesão ou
// expulsão não vira "joga 13 minutos"). Walk-forward fev→nov/2026: log loss melhor em todos os mercados
// (chutes 0,4376→0,4311 · faltas 0,5058→0,4976 · desarmes 0,5543→0,5445 · defesas 0,5074→0,4966).
const MS_K = 0.75, MS_PRIOR = 80;
/* jogadores: taxas por 90, titularidade, minutos e sequência dos últimos 10 jogos */
export function playerProfiles(fixtures, priors, { half = 15, maxN = 38, teamN = 8 } = {}) {
  const apps = {}, teamGames = {};
  for (let i = fixtures.length - 1; i >= 0; i--) {
    const f = fixtures[i];
    for (const tid of [f.h, f.a]) (teamGames[tid] ??= []).push(f);
    for (const p of f.p) (apps[p[P.id]] ??= []).push({ f, p });
  }
  const out = {};
  for (const [pid, list] of Object.entries(apps)) {
    const played = list.filter(x => x.p[P.min] > 0);
    if (!played.length) continue;
    const team = list[0].p[P.team];
    const posC = {}; for (const x of played.slice(0, 10)) if (x.p[P.pos]) posC[x.p[P.pos]] = (posC[x.p[P.pos]] || 0) + 1;
    const pos = Object.entries(posC).sort((a, b) => b[1] - a[1])[0]?.[0] || 'M';
    const pr = priors[pos] ?? POS_PRIOR[pos] ?? POS_PRIOR.M;
    const s = { w90: 0 }; for (const k of STATS) s[k] = 0;
    let svw = 0, gcw = 0;
    played.slice(0, maxN).forEach((x, i) => {
      const w = decay(i, half); s.w90 += w * x.p[P.min] / 90;
      s.sh += w * x.p[P.sh]; s.sot += w * x.p[P.sot]; s.fc += w * x.p[P.fc]; s.fs += w * x.p[P.fs]; s.tk += w * x.p[P.tk]; s.sv += w * x.p[P.sv];
      if (pos === 'G') { svw += w * x.p[P.sv]; gcw += w * x.p[P.gc]; }
    });
    const r = Object.fromEntries(STATS.map(k => [k, r3((s[k] + (pr[k] ?? 0) * K90[k]) / (s.w90 + K90[k]))]));
    // titularidade: últimos jogos do time atual (fora da lista do jogo conta como "não titular e não entrou")
    const tg = (teamGames[team] ?? []).slice(0, teamN), mine = new Map(list.filter(x => x.p[P.team] === team).map(x => [x.f.id, x.p]));
    let w = 0, ws = 0, wnb = 0, wsub = 0, msS = 0, msW = 0, mbS = 0, mbW = 0;
    tg.forEach((f, i) => {
      const q = decay(i, 4), p = mine.get(f.id); w += q;
      if (p?.[P.start]) { ws += q; msS += q * p[P.min]; msW += q; }
      else { wnb += q; if (p && p[P.min] > 0) { wsub += q; mbS += q * p[P.min]; mbW += q; } }
    });
    const lastTeam = tg[0]?.d, lastMe = list[0].f.d;
    // temporada atual do jogador (a mais recente em que ele jogou): médias como titular, por 90, casa e fora
    const curS = played[0].f.s, season = played.filter(x => x.f.s === curS), starts = season.filter(x => x.p[P.start] && x.p[P.min] >= 60);
    const avg = (arr, k) => arr.length ? r3(arr.reduce((a, x) => a + x.p[P[k]], 0) / arr.length) : null;
    const min90 = season.reduce((a, x) => a + x.p[P.min], 0) / 90;
    const isHome = x => x.f.h === x.p[P.team];
    const ss = { s: curS, n: season.length, ns: starts.length,
      st: Object.fromEntries(STATS.map(k => [k, avg(starts, k)])),
      p90: Object.fromEntries(STATS.map(k => [k, min90 >= 2 ? r3(season.reduce((a, x) => a + x.p[P[k]], 0) / min90) : null])),
      hm: { n: starts.filter(isHome).length, ...Object.fromEntries(STATS.map(k => [k, avg(starts.filter(isHome), k)])) },
      aw: { n: starts.filter(x => !isHome(x)).length, ...Object.fromEntries(STATS.map(k => [k, avg(starts.filter(x => !isHome(x)), k)])) } };
    // temporada passada (como titular 60+ min)
    const prevS = played.find(x => x.f.s < curS)?.f.s, pst = prevS ? played.filter(x => x.f.s === prevS && x.p[P.start] && x.p[P.min] >= 60) : [];
    ss.pv = prevS ? { s: prevS, ns: pst.length, st: Object.fromEntries(STATS.map(k => [k, avg(pst, k)])) } : null;
    // últimos 20 jogos em que entrou, para o Caçador: [min, titular, casa, liga, chutes, no gol, f.com., f.sofr., desarmes, defesas, adversário]
    const hx = played.slice(0, 20).map(x => [x.p[P.min], x.p[P.start], isHome(x) ? 1 : 0, x.f.lg, x.p[P.sh], x.p[P.sot], x.p[P.fc], x.p[P.fs], x.p[P.tk], x.p[P.sv], isHome(x) ? x.f.a : x.f.h]);
    out[pid] = { ss, hx,
      t: team, pos, gp: played.length, r,
      ps: r3(w ? ws / w : 0), pb: r3(wnb ? wsub / wnb : 0.3),
      ms: Math.round((msS + MS_PRIOR * MS_K) / (msW + MS_K)), mb: Math.round(mbW ? mbS / mbW : 22),
      sr: pos === 'G' ? r3((svw + 0.69 * 20) / (svw + gcw + 20)) : undefined,
      // sequência dos últimos 10 jogos em que entrou (mais recente primeiro): minutos e cada estatística
      sq: { mn: played.slice(0, 10).map(x => x.p[P.min]), ...Object.fromEntries(STATS.map(k => [k, played.slice(0, 10).map(x => x.p[P[k]])])) },
      gap: lastTeam && lastMe < lastTeam ? tg.findIndex(f => f.d <= lastMe) : 0, // jogos do time desde a última aparição
    };
  }
  return out;
}

/* nome do árbitro vem da API em formatos diferentes ("M. Oliver", "Michael Oliver", com ou sem acento):
   chave = inicial do primeiro nome + sobrenome final, sem acento */
export function refKey(name) {
  const t = String(name ?? '').split(',')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
  return t.length > 1 ? t[0][0] + ' ' + t[t.length - 1] : t[0] ?? '';
}
/* árbitro: faltas por jogo em relação à média da liga (fator encolhido para 1 com poucos jogos), faltas e cartões por jogo */
export function refereeFactors(fixtures, LP, K = 8) {
  const a = {};
  for (const f of fixtures) {
    if (!f.ref || !f.t?.[f.h] || !f.t?.[f.a]) continue;
    const L = lgOf(LP, f.lg), x = a[refKey(f.ref)] ??= { n: 0, s: 0, fc: 0, lf: 0, yc: 0, lg: {} };
    const fc = f.t[f.h][T.fc] + f.t[f.a][T.fc];
    x.n++; x.s += fc / L.fc; x.fc += fc; x.lf += L.fc; x.yc += f.p.reduce((t, p) => t + (p[P.yc] || 0), 0); x.lg[f.lg] = (x.lg[f.lg] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(a).map(([k, x]) => [k, { n: x.n, f: r3((x.s + K) / (x.n + K)), fpg: r3(x.fc / x.n), lfpg: r3(x.lf / x.n), cpg: r3(x.yc / x.n),
    lg: +Object.entries(x.lg).sort((p, q) => q[1] - p[1])[0][0] }]));
}

/* adversário por posição: quanto cada time cede a jogadores de cada posição, em relação ao que cede no geral.
   shape = (cedido à posição ÷ esperado para a posição) ÷ (cedido a todos ÷ esperado para todos), encolhido para 1.
   >1: o time cede mais que o normal àquela posição (ex.: lateral que deixa o ponta chutar). */
const OPP_STATS = ['sh', 'sot', 'fc', 'fs', 'tk'];
export function oppPosition(fixtures, { half = 12, maxN = 38, K = 40 } = {}) {
  // taxa por 90 de cada posição em cada liga (o "esperado")
  const lr = {};
  for (const f of fixtures) for (const p of f.p) {
    if (!(p[P.min] > 0) || !p[P.pos]) continue;
    const x = (lr[f.lg] ??= {})[p[P.pos]] ??= { m: 0, sh: 0, sot: 0, fc: 0, fs: 0, tk: 0 };
    x.m += p[P.min] / 90; for (const k of OPP_STATS) x[k] += p[P[k]];
  }
  const rate = (lg, pos, k) => { const x = lr[lg]?.[pos]; return x && x.m > 50 ? x[k] / x.m : null; };
  const byTeam = {};
  for (let i = fixtures.length - 1; i >= 0; i--) { const f = fixtures[i]; for (const t of [f.h, f.a]) (byTeam[t] ??= []).push(f); }
  const out = {};
  for (const [tid, list] of Object.entries(byTeam)) {
    const acc = {}; // pos → stat → [real, esperado]
    list.slice(0, maxN).forEach((f, i) => {
      const w = decay(i, half);
      for (const p of f.p) {
        if (String(p[P.team]) === tid || !(p[P.min] > 0) || !p[P.pos]) continue; // jogadores do adversário
        for (const k of OPP_STATS) {
          const r = rate(f.lg, p[P.pos], k); if (r == null) continue;
          const e = r * p[P.min] / 90, a = ((acc[p[P.pos]] ??= {})[k] ??= [0, 0]), t = ((acc.ALL ??= {})[k] ??= [0, 0]);
          a[0] += w * p[P[k]]; a[1] += w * e; t[0] += w * p[P[k]]; t[1] += w * e;
        }
      }
    });
    const res = {};
    for (const pos of ['G', 'D', 'M', 'F']) {
      const o = {};
      for (const k of OPP_STATS) {
        const a = acc[pos]?.[k], t = acc.ALL?.[k]; if (!a || !t || !t[1]) continue;
        const rp = (a[0] + K) / (a[1] + K), ra = (t[0] + K) / (t[1] + K);
        o[k] = r3(Math.max(0.7, Math.min(1.4, rp / ra)));
      }
      if (Object.keys(o).length) res[pos] = o;
    }
    out[tid] = res;
  }
  return out;
}

/* Defesa na liga (para a Tendência): o quanto cada time cede, comparado aos outros times da MESMA liga nacional.
   - por posição: estatística dos jogadores adversários daquela posição a cada 90 minutos deles (G, D, M, F);
   - time: o que os adversários fazem por jogo (chutes, no gol, faltas) e o que o próprio time sofre de falta;
   - jogo: total por jogo (os dois times somados) nos jogos dele.
   Janela: os últimos 12 jogos de liga de cada time. Ranking só entre times da temporada atual daquela liga.
   pct = posição ÷ número de times (perto de 0 = um dos que MAIS cedem; perto de 1 = um dos que MENOS cedem). */
const DEF_P = ['sh', 'sot', 'fc', 'fs', 'tk', 'sv'];
export function defenseRanks(fixtures, { win = 12 } = {}) {
  const byTeam = {}, curS = {};
  for (let i = fixtures.length - 1; i >= 0; i--) {
    const f = fixtures[i]; if (CUP_IDS.has(f.lg) || !f.t?.[f.h] || !f.t?.[f.a]) continue;
    curS[f.lg] = Math.max(curS[f.lg] ?? 0, f.s);
    for (const [me, op] of [[f.h, f.a], [f.a, f.h]]) (byTeam[me] ??= []).push({ f, me, op });
  }
  const val = {};
  for (const [tid, list] of Object.entries(byTeam)) {
    const lgC = {}; for (const { f } of list.slice(0, win)) lgC[f.lg] = (lgC[f.lg] || 0) + 1;
    const lg = +Object.entries(lgC).sort((a, b) => b[1] - a[1])[0][0];
    if (!list.some(({ f }) => f.lg === lg && f.s === curS[lg])) continue; // não está na liga nesta temporada
    const ms = list.filter(({ f }) => f.lg === lg).slice(0, win);
    if (ms.length < 4) continue;
    const pos = {};
    for (const { f, me } of ms) for (const p of f.p) {
      if (String(p[P.team]) === String(me) || !(p[P.min] > 0) || !p[P.pos]) continue;
      const a = pos[p[P.pos]] ??= { m: 0, ...Object.fromEntries(DEF_P.map(k => [k, 0])) };
      a.m += p[P.min] / 90; for (const k of DEF_P) a[k] += p[P[k]] || 0;
    }
    const per = (x, k) => x && x.m >= 3 ? r3(x[k] / x.m) : null;
    const avg = fn => r3(ms.reduce((a, x) => a + fn(x), 0) / ms.length);
    val[tid] = { lg, n: ms.length,
      pos: Object.fromEntries(['G', 'D', 'M', 'F'].map(ps => [ps, Object.fromEntries(DEF_P.map(k => [k, per(pos[ps], k)]))])),
      t: { sh: avg(({ f, op }) => f.t[op][T.sh]), sot: avg(({ f, op }) => f.t[op][T.sot]), fc: avg(({ f, me }) => f.t[me][T.fc] /* faltas que sofre = cometidas pelo outro */) , fcO: avg(({ f, op }) => f.t[op][T.fc]) },
      j: { sh: avg(({ f, me, op }) => f.t[me][T.sh] + f.t[op][T.sh]), sot: avg(({ f, me, op }) => f.t[me][T.sot] + f.t[op][T.sot]), fc: avg(({ f, me, op }) => f.t[me][T.fc] + f.t[op][T.fc]) } };
  }
  // ranking dentro de cada liga (1 = o que MAIS cede)
  const byLg = {}; for (const [tid, v] of Object.entries(val)) (byLg[v.lg] ??= []).push(tid);
  const rank = (ids, get) => { const xs = ids.map(id => [id, get(val[id])]).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]); return Object.fromEntries(xs.map(([id], i) => [id, [i + 1, xs.length]])); };
  const out = {};
  for (const ids of Object.values(byLg)) {
    const R = {};
    for (const ps of ['G', 'D', 'M', 'F']) for (const k of DEF_P) R['p' + ps + k] = rank(ids, v => v.pos[ps][k]);
    for (const k of ['sh', 'sot', 'fcO']) R['t' + k] = rank(ids, v => v.t[k]);
    for (const k of ['sh', 'sot', 'fc']) R['j' + k] = rank(ids, v => v.j[k]);
    for (const id of ids) {
      const v = val[id], g = key => R[key][id] ?? null;
      out[id] = { lg: v.lg, n: ids.length,
        pos: Object.fromEntries(['G', 'D', 'M', 'F'].map(ps => [ps, Object.fromEntries(DEF_P.map(k => [k, v.pos[ps][k] == null ? null : [v.pos[ps][k], ...g('p' + ps + k)]]))])),
        t: { sh: [v.t.sh, ...g('tsh')], sot: [v.t.sot, ...g('tsot')], fc: [v.t.fcO, ...g('tfcO')] },
        j: { sh: [v.j.sh, ...g('jsh')], sot: [v.j.sot, ...g('jsot')], fc: [v.j.fc, ...g('jfc')] } };
    }
  }
  return out; // [valor, posição, de quantos]
}
