// Resultados para a conferência (results.json): por dia (horário de Brasília) e por jogador/time, os números de
// cada mercado nos jogos encerrados dos últimos dias.
//   jogador:  stats[dia][idJogador] = [minutos, chutes, no gol, faltas cometidas, faltas sofridas, desarmes, defesas]
//   time:     stats[dia]['t'+idTime+'-'+idJogo] = [90, chutes, no gol, faltas]
//   jogo:     stats[dia]['j'+idJogo] = [90, chutes, no gol, faltas]
// O 1º tempo do jogador (SH1, SOT1) não vem na API-Football: essas entradas ficam para conferência manual.
import { P, T } from './history.js';
import { dayBR } from '../config/leagues.js';

export const RIDX = { SH: 1, SOT: 2, FC: 3, FS: 4, TK: 5, SV: 6, TSH: 1, TSOT: 2, TFC: 3, JSH: 1, JSOT: 2, JFC: 3 };
export function buildResults(H, days = 4, now = new Date()) {
  const keep = new Set(Array.from({ length: days }, (_, i) => dayBR(new Date(now.getTime() - i * 864e5))));
  const stats = {};
  for (const f of H.fixtures) {
    const d = dayBR(new Date(f.d)); if (!keep.has(d)) continue;
    const S = stats[d] ??= {};
    for (const p of f.p) S[p[P.id]] = [p[P.min], p[P.sh], p[P.sot], p[P.fc], p[P.fs], p[P.tk], p[P.sv]];
    const th = f.t?.[f.h], ta = f.t?.[f.a];
    if (th && ta) {
      S[`t${f.h}-${f.id}`] = [90, th[T.sh], th[T.sot], th[T.fc]];
      S[`t${f.a}-${f.id}`] = [90, ta[T.sh], ta[T.sot], ta[T.fc]];
      S[`j${f.id}`] = [90, th[T.sh] + ta[T.sh], th[T.sot] + ta[T.sot], th[T.fc] + ta[T.fc]];
    }
  }
  return { gen: now.toISOString(), dates: Object.keys(stats).sort(), stats };
}
