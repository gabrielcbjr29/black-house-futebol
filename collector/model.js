// Monta o modelo do dia: para cada jogo, a projeção dos dois times e, para cada jogador provável, a média de cada
// mercado nos cenários "titular" e "entra do banco", com a chance de ser titular. Fase do jogo:
//   abertura  = escalação ainda não saiu (titularidade provável, pelo histórico recente);
//   escalacao = escalação oficial publicada (cerca de 60 min antes): titular, banco ou fora.
import { MARKETS, PLAYER_MK, projectTeams, playerContext, playerMu, posShape, LEAGUE_PRIOR } from '../public/engine.js';
import { leagueParams, teamProfiles, teamAvg, posPriors, playerProfiles, refereeFactors, oppPosition, refKey, lgOf } from './profiles.js';

const r3 = x => Math.round(x * 1000) / 1000;
const neutralTeam = { n: 0, shF: 1, shA: 1, sotF: 1, sotA: 1, fcF: 1, fcA: 1, poss: 50, last: [] };

export function buildProfiles(H) {
  const LP = leagueParams(H.fixtures);
  return { LP, TP: teamProfiles(H.fixtures, LP), PP: playerProfiles(H.fixtures, posPriors(H.fixtures)), RF: refereeFactors(H.fixtures, LP), OP: oppPosition(H.fixtures) };
}

/* games: [{ id, lg, utc, home:{id,name}, away:{id,name}, ref, status, lineup?: {[teamId]: {xi:[ids], bench:[ids]}} }]
   injuries: { [fixtureId]: { [playerId]: 'out' | 'doubt' } } */
export function buildModel(games, H, prof = buildProfiles(H), injuries = {}) {
  const { LP, TP, PP, RF, OP = {} } = prof;
  // elenco provável de cada time: quem jogou pelo time e apareceu em algum dos últimos 6 jogos dele
  const squads = {};
  for (const [pid, pp] of Object.entries(PP)) if (pp.gap <= 6 && pp.gp > 0) (squads[pp.t] ??= []).push(pid);
  const players = {}, teams = {};
  for (const g of games) {
    const L = lgOf(LP, g.lg);
    const th = TP[g.home.id] ?? neutralTeam, ta = TP[g.away.id] ?? neutralTeam;
    const ref = RF[refKey(g.ref)]?.f ?? 1;
    const pj = projectTeams(th, ta, L, ref);
    teams[g.id] = { lg: g.lg, h: g.home.id, a: g.away.id, hn: g.home.name, an: g.away.name, ref: g.ref || null, rf: ref, pj: { h: rnd(pj.h), a: rnd(pj.a) },
      n: [th.n, ta.n], last: { h: th.last, a: ta.last } };
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
        players[pid] = { n: H.players[pid] ?? pid, t: team.id, o: opp.id, g: g.id, home: side === 'h', pos: pp.pos, gp: pp.gp, gap: pp.gap,
          ps: r3(ps), pb: r3(pb), st, ms: pp.ms, mb: pp.mb, r: pp.r, ctx: { sh: r3(pc.sh), sot: r3(pc.sot), fc: r3(pc.fc), fs: r3(pc.fs), tk: r3(pc.tk) }, op: OP[opp.id]?.[pp.pos] ?? null, ss: pp.ss, hx: pp.hx, mu, sq: pp.sq };
      }
    }
  }
  return { players, teams, leagues: LP };
}
const rnd = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r3(v)]));
export { MARKETS, LEAGUE_PRIOR, refKey };
