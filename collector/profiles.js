// Perfis do Modelo BH a partir do histórico próprio (data/hist): parâmetros de cada liga, força de cada time,
// taxas por 90 de cada jogador, chance de ser titular, minutos e fator do árbitro.
import { P, T } from './history.js';
import { LEAGUE_PRIOR, POS_PRIOR } from '../public/engine.js';

const UCL = 2;
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

/* times: razões em relação à média da liga de cada jogo (assim a Champions entra na mesma escala), com peso maior
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
      if (f.lg !== UCL) lgCount[f.lg] = (lgCount[f.lg] || 0) + 1;
    });
    const sh = x => r3((x + K) / (s.w + K));
    const dom = +Object.entries(lgCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    out[id] = { n: ms.length, lg: dom, shF: sh(s.shF), shA: sh(s.shA), sotF: sh(s.sotF), sotA: sh(s.sotA), fcF: sh(s.fcF), fcA: sh(s.fcA), poss: r3((s.poss + 50 * K) / (s.w + K)),
      last: ms.slice(0, 10).map(({ f, me, op }) => [f.id, f.t[me][T.sh], f.t[me][T.sot], f.t[me][T.fc], f.t[op][T.sh], f.t[op][T.sot], f.t[op][T.fc]]) };
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
    out[pid] = {
      t: team, pos, gp: played.length, r,
      ps: r3(w ? ws / w : 0), pb: r3(wnb ? wsub / wnb : 0.3),
      ms: Math.round(msW ? msS / msW : 82), mb: Math.round(mbW ? mbS / mbW : 22),
      sr: pos === 'G' ? r3((svw + 0.69 * 20) / (svw + gcw + 20)) : undefined,
      // sequência dos últimos 10 jogos em que entrou (mais recente primeiro): minutos e cada estatística
      sq: { mn: played.slice(0, 10).map(x => x.p[P.min]), ...Object.fromEntries(STATS.map(k => [k, played.slice(0, 10).map(x => x.p[P[k]])])) },
      gap: lastTeam && lastMe < lastTeam ? tg.findIndex(f => f.d <= lastMe) : 0, // jogos do time desde a última aparição
    };
  }
  return out;
}

/* árbitro: faltas por jogo em relação à média da liga, encolhido para 1 com poucos jogos */
export function refereeFactors(fixtures, LP, K = 8) {
  const a = {};
  for (const f of fixtures) {
    if (!f.ref || !f.t?.[f.h] || !f.t?.[f.a]) continue;
    const L = lgOf(LP, f.lg), x = a[f.ref] ??= { n: 0, s: 0 };
    x.n++; x.s += (f.t[f.h][T.fc] + f.t[f.a][T.fc]) / L.fc;
  }
  return Object.fromEntries(Object.entries(a).map(([k, x]) => [k, { n: x.n, f: r3((x.s + K) / (x.n + K)) }]));
}
