// Monta o modelo do dia: para cada jogo, a projeção dos dois times e, para cada jogador provável, a média de cada
// mercado nos cenários "titular" e "entra do banco", com a chance de ser titular. Fase do jogo:
//   abertura  = escalação ainda não saiu (titularidade provável, pelo histórico recente);
//   escalacao = escalação oficial publicada (cerca de 60 min antes): titular, banco ou fora.
import { MARKETS, PLAYER_MK, projectTeams, playerContext, playerMu, posShape, LEAGUE_PRIOR } from '../public/engine.js';
import { leagueParams, teamProfiles, teamAvg, posPriors, playerProfiles, refereeFactors, oppPosition, defenseRanks, refKey, lgOf } from './profiles.js';
import { P as PI, T as TI } from './history.js';

const r3 = x => Math.round(x * 1000) / 1000;
const neutralTeam = { n: 0, shF: 1, shA: 1, sotF: 1, sotA: 1, fcF: 1, fcA: 1, poss: 50, last: [] };

export function buildProfiles(H) {
  const LP = leagueParams(H.fixtures);
  return { LP, TP: teamProfiles(H.fixtures, LP), PP: playerProfiles(H.fixtures, posPriors(H.fixtures)), RF: refereeFactors(H.fixtures, LP), OP: oppPosition(H.fixtures), DEF: defenseRanks(H.fixtures) };
}

/* games: [{ id, lg, utc, home:{id,name}, away:{id,name}, ref, status, lineup?: {[teamId]: {xi:[ids], bench:[ids]}} }]
   injuries: { [fixtureId]: { [playerId]: 'out' | 'doubt' } } */
export function buildModel(games, H, prof = buildProfiles(H), injuries = {}) {
  const { LP, TP, PP, RF, OP = {}, DEF = {} } = prof;
  // confrontos: jogos de cada adversário de hoje (para achar quem já jogou contra ele)
  const oppIds = new Set(games.flatMap(g => [String(g.home.id), String(g.away.id)])), fxOf = {};
  for (const f of H.fixtures) for (const t of [f.h, f.a]) if (oppIds.has(String(t))) (fxOf[t] ??= []).push(f);
  for (const t of Object.keys(fxOf)) fxOf[t].sort((a, b) => b.d.localeCompare(a.d));
  // elenco provável de cada time: quem jogou pelo time e apareceu em algum dos últimos 6 jogos dele
  const squads = {};
  for (const [pid, pp] of Object.entries(PP)) if (pp.gap <= 6 && pp.gp > 0) (squads[pp.t] ??= []).push(pid);
  const players = {}, teams = {};
  for (const g of games) {
    const L = lgOf(LP, g.lg);
    const th = TP[g.home.id] ?? neutralTeam, ta = TP[g.away.id] ?? neutralTeam;
    const ref = RF[refKey(g.ref)]?.f ?? 1;
    const pj = projectTeams(th, ta, L, ref);
    // confrontos diretos (os dois times, nos dois mandos): [chutes casa, no gol casa, faltas casa, chutes fora, no gol fora, faltas fora] do ponto de vista de hoje
    const h2h = (fxOf[g.home.id] ?? []).filter(f => (f.h === g.home.id && f.a === g.away.id) || (f.h === g.away.id && f.a === g.home.id)).filter(f => f.t?.[f.h] && f.t?.[f.a]).slice(0, 6)
      .map(f => { const a = f.t[g.home.id], b = f.t[g.away.id]; return [f.d.slice(0, 10), a[TI.sh], a[TI.sot], a[TI.fc], b[TI.sh], b[TI.sot], b[TI.fc]]; });
    teams[g.id] = { lg: g.lg, h: g.home.id, a: g.away.id, hn: g.home.name, an: g.away.name, ref: g.ref || null, rf: ref, pj: { h: rnd(pj.h), a: rnd(pj.a) },
      n: [th.n, ta.n], last: { h: th.last, a: ta.last }, h2h, def: { h: DEF[g.home.id] ?? null, a: DEF[g.away.id] ?? null },
      // titulares importantes: os 5 com mais titularidade × minutos no elenco recente (o monitor avisa se um deles cair)
      reg: Object.fromEntries([['h', g.home.id], ['a', g.away.id]].map(([s, tid]) => [s, (squads[tid] ?? []).map(pid => [pid, PP[pid]]).filter(([, p]) => p && p.ps >= 0.8)
        .sort((a, b) => b[1].ps * b[1].ms - a[1].ps * a[1].ms).slice(0, 5).map(([pid]) => [pid, H.players[pid] ?? pid])])) };
    for (const [side, team, opp, mine, theirs, tp] of [['h', g.home, g.away, pj.h, pj.a, th], ['a', g.away, g.home, pj.a, pj.h, ta]]) {
      const tAvg = teamAvg(tp, lgOf(LP, tp.lg ?? g.lg));
      const ctx = playerContext(mine, theirs, tAvg);
      const lu = g.lineup?.[team.id];
      const ids = lu ? [...lu.xi, ...lu.bench].map(String) : (squads[team.id] ?? []);
      for (const pid of ids) {
        const pp = PP[pid]; if (!pp) continue; // estreante sem histórico: fica de fora (sem base)
        const inj = injuries[g.id]?.[pid];
        if (inj === 'out') continue;
        let ps = pp.ps, pb = pp.pb, st = 'provavel';
        if (lu) { const xi = lu.xi.map(String).includes(pid); ps = xi ? 1 : 0; pb = xi ? 0 : Math.max(pp.pb, 0.25); st = xi ? 'xi' : 'banco'; }
        else if (inj === 'doubt') { ps *= 0.5; pb *= 0.5; st = 'duvida'; }
        if (!lu && ps < 0.15 && pb < 0.3) continue; // nem titular nem reserva frequente: fora do radar
        const mu = {}, sh = posShape(OP[opp.id], pp.pos), pc = { ...ctx };
        for (const k of Object.keys(sh)) pc[k] = ctx[k] * sh[k]; // adversário por posição (quando ligado)
        for (const mk of PLAYER_MK) {
          if ((mk === 'SV') !== (pp.pos === 'G')) continue; // goleiro só no mercado de defesas
          const m = playerMu(pp, mk, pc, L); mu[mk] = [r3(m.start), r3(m.bench)];
        }
        // jogos dele contra o adversário de hoje (por qualquer time, 45+ min): [data, min, chutes, no gol, f.com., f.sofr., desarmes, defesas]
        const vs = [];
        for (const f of fxOf[opp.id] ?? []) {
          const p = f.p.find(x => String(x[PI.id]) === pid); if (!p || !(p[PI.min] >= 45) || String(p[PI.team]) === String(opp.id)) continue;
          vs.push([f.d.slice(0, 10), p[PI.min], p[PI.sh], p[PI.sot], p[PI.fc], p[PI.fs], p[PI.tk], p[PI.sv]]); if (vs.length >= 6) break;
        }
        players[pid] = { vs, n: H.players[pid] ?? pid, t: team.id, o: opp.id, g: g.id, home: side === 'h', pos: pp.pos, gp: pp.gp, gap: pp.gap,
          ps: r3(ps), pb: r3(pb), st, ms: pp.ms, mb: pp.mb, r: pp.r, ctx: { sh: r3(pc.sh), sot: r3(pc.sot), fc: r3(pc.fc), fs: r3(pc.fs), tk: r3(pc.tk) }, op: OP[opp.id]?.[pp.pos] ?? null, ss: pp.ss, hx: pp.hx, mu, sq: pp.sq };
      }
    }
  }
  return { players, teams, leagues: LP };
}
const rnd = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r3(v)]));
export { MARKETS, LEAGUE_PRIOR, refKey };
