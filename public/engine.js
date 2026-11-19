/* Black House Futebol · motor do Modelo BH
   Usado na coleta (Node), no app (navegador) e nos testes. Sem dependências.

   Ideia central (blueprint, seção 9):
   - jogador: taxa por 90 minutos (com peso maior nos jogos recentes e puxada para a média da posição quando há poucos
     jogos) × minutos esperados × contexto do jogo (adversário, mando, árbitro);
   - time: média da liga × força do time × concessão do adversário × mando;
   - contagem com binomial negativa (média mu, dispersão k; variância = mu + mu²/k);
   - só mercado de MAIS (as casas não abrem o "menos"): chance = P(X > linha);
   - minutos incertos antes da escalação: mistura de "titular" e "entra do banco", condicionada a entrar em campo
     (quem não entra costuma ter a aposta anulada; confirme a regra de cada casa). */

export const MARKETS = {
  // jogador
  SH: { lb: 'Chutes', short: 'chutes', kind: 'p', st: 'sh', k: 4.5, lines: [0.5, 1.5, 2.5, 3.5, 4.5] },
  SOT: { lb: 'Chutes ao gol', short: 'no gol', kind: 'p', st: 'sot', k: 6, lines: [0.5, 1.5, 2.5, 3.5] },
  SH1: { lb: 'Chutes no 1º tempo', short: 'chutes 1ºT', kind: 'p', st: 'sh', h1: true, k: 6, lines: [0.5, 1.5, 2.5] },
  SOT1: { lb: 'Chutes ao gol no 1º tempo', short: 'no gol 1ºT', kind: 'p', st: 'sot', h1: true, k: 12, lines: [0.5, 1.5] },
  FC: { lb: 'Faltas cometidas', short: 'faltas com.', kind: 'p', st: 'fc', k: 8, lines: [0.5, 1.5, 2.5, 3.5] },
  FS: { lb: 'Faltas sofridas', short: 'faltas sofr.', kind: 'p', st: 'fs', k: 4, lines: [0.5, 1.5, 2.5, 3.5] },
  TK: { lb: 'Desarmes', short: 'desarmes', kind: 'p', st: 'tk', k: 5, lines: [0.5, 1.5, 2.5, 3.5, 4.5] },
  SV: { lb: 'Defesas do goleiro', short: 'defesas', kind: 'p', st: 'sv', k: 12, lines: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5] },
  // time (individual)
  TSH: { lb: 'Chutes do time', short: 'chutes time', kind: 't', st: 'sh', k: 10 },
  TSOT: { lb: 'Chutes ao gol do time', short: 'no gol time', kind: 't', st: 'sot', k: 9 },
  TFC: { lb: 'Faltas do time', short: 'faltas time', kind: 't', st: 'fc', k: 25 },
  // jogo (total dos dois times)
  JSH: { lb: 'Chutes no jogo', short: 'chutes jogo', kind: 'j', st: 'sh', k: 20 },
  JSOT: { lb: 'Chutes ao gol no jogo', short: 'no gol jogo', kind: 'j', st: 'sot', k: 15 },
  JFC: { lb: 'Faltas no jogo', short: 'faltas jogo', kind: 'j', st: 'fc', k: 40 },
};
/* aplica a calibração do walk-forward (calib.json) e devolve o que mudou.
   v2 (19/11/2026): por mercado, o que venceu fora da amostra: fator da média (global ou por liga), k e curva de chance. */
export function applyCalib(calib, minN = 2000) {
  const used = [];
  if (calib?.v === 2) {
    for (const [mk, x] of Object.entries(calib.mercados ?? {})) {
      if (!MARKETS[mk] || x.n < 300) continue;
      const M = MARKETS[mk];
      if (x.k_sugerido > 0.5) M.k = Math.min(x.k_sugerido, 400);
      if (x.fator && x.fator !== 1) M.cf = clamp(x.fator, 0.75, 1.25); else delete M.cf;
      if (x.fator_liga) M.cfl = Object.fromEntries(Object.entries(x.fator_liga).map(([lg, f]) => [lg, clamp(f, 0.75, 1.25)])); else delete M.cfl;
      if (x.curva && Math.abs(x.curva.b) > 0.3 && Math.abs(x.curva.b) < 3) M.pl = x.curva; else delete M.pl;
      used.push(`${mk} ${x.escolhido} (k ${M.k})`);
    }
    if (MARKETS.SH.cf) MARKETS.SH1.cf = MARKETS.SH.cf; if (MARKETS.SH.cfl) MARKETS.SH1.cfl = MARKETS.SH.cfl;
    if (MARKETS.SOT.cf) MARKETS.SOT1.cf = MARKETS.SOT.cf; if (MARKETS.SOT.cfl) MARKETS.SOT1.cfl = MARKETS.SOT.cfl;
    return used;
  }
  for (const [mk, x] of Object.entries(calib?.mercados ?? {})) {
    if (!MARKETS[mk] || x.n < minN) continue;
    if (x.k_sugerido > 0.5) MARKETS[mk].k = Math.min(x.k_sugerido, 400);
    // fator de calibração da média (real ÷ previsto na validação), limitado a ±25%
    if (x.fator > 0) MARKETS[mk].cf = clamp(x.fator, 0.75, 1.25);
    used.push(`${mk} k ${MARKETS[mk].k} × ${(MARKETS[mk].cf ?? 1).toFixed(3)}`);
  }
  // o 1º tempo herda o fator do jogo todo (não há dado por jogador para validar)
  if (MARKETS.SH.cf) MARKETS.SH1.cf = MARKETS.SH.cf;
  if (MARKETS.SOT.cf) MARKETS.SOT1.cf = MARKETS.SOT.cf;
  return used;
}
/* fator da média do mercado na liga (calibração v2) e curva de chance (Platt) */
export const facOf = (mk, lg) => MARKETS[mk]?.cfl?.[lg] ?? MARKETS[mk]?.cf ?? 1;
export function calP(mk, p) {
  const c = MARKETS[mk]?.pl; if (!c || !(p > 0 && p < 1)) return p;
  const q = Math.min(Math.max(p, 1e-4), 1 - 1e-4);
  return 1 / (1 + Math.exp(-(c.a + c.b * Math.log(q / (1 - q)))));
}
/* parâmetros que o app e o bot precisam para repetir a conta (bot.json → cal) */
export const calOut = () => Object.fromEntries(Object.entries(MARKETS).map(([k, v]) => [k, { k: v.k, ...(v.pl ? { pl: v.pl } : {}) }]));
export function calIn(cal) { for (const [k, v] of Object.entries(cal ?? {})) if (MARKETS[k]) { if (v.k) MARKETS[k].k = v.k; if (v.pl) MARKETS[k].pl = v.pl; else delete MARKETS[k].pl; } }
export const PLAYER_MK = Object.keys(MARKETS).filter(k => MARKETS[k].kind === 'p');
export const TEAM_MK = Object.keys(MARKETS).filter(k => MARKETS[k].kind !== 'p');

// médias por 90 minutos por posição (reserva quando a liga ainda não tem dados; a coleta recalcula com o histórico)
export const POS_PRIOR = {
  F: { sh: 2.5, sot: 0.95, fc: 1.1, fs: 1.3, tk: 0.55, sv: 0 },
  M: { sh: 1.2, sot: 0.38, fc: 1.15, fs: 1.25, tk: 1.55, sv: 0 },
  D: { sh: 0.55, sot: 0.15, fc: 1.05, fs: 0.75, tk: 1.75, sv: 0 },
  G: { sh: 0.01, sot: 0, fc: 0.05, fs: 0.25, tk: 0.02, sv: 2.9 },
};
// médias por jogo, somando os dois times (referência das grandes ligas europeias)
export const LEAGUE_PRIOR = { sh: 25, sot: 8.6, fc: 23.5, h1sh: 0.455, h1sot: 0.45, hsh: 1.1, hsot: 1.1, hfc: 0.96 };

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* P(X > linha), X ~ binomial negativa (k grande = Poisson). */
export function nbOver(mu, k, line) {
  mu = Math.max(mu, 1e-4); const thr = Math.floor(line + 1e-9);
  if (thr < 0) return 1;
  let p, c = 0;
  if (!k || k > 400) { p = Math.exp(-mu); for (let x = 0; x <= thr; x++) { c += p; p *= mu / (x + 1); } }
  else { const q = mu / (k + mu); p = Math.pow(k / (k + mu), k); for (let x = 0; x <= thr; x++) { c += p; p *= (x + k) / (x + 1) * q; } }
  return clamp(1 - c, 0, 1);
}
// dispersão de uma soma de dois termos independentes (total do jogo)
export function sumK(m1, k1, m2, k2) { const mu = m1 + m2, v = m1 + m1 * m1 / k1 + m2 + m2 * m2 / k2; return v > mu ? mu * mu / (v - mu) : 500; }

/* ---------- times ---------- */
/* Projeção dos dois times num jogo.
   tp = perfil do time: razões em relação à média da liga (1 = média) com encolhimento já aplicado:
        shF, shA (chutes feitos e sofridos), sotF, sotA, fcF (faltas cometidas), fcA (faltas que o adversário comete), poss
   L = parâmetros da liga do jogo. ref = fator do árbitro para faltas (1 = média). */
export function projectTeams(home, away, L = LEAGUE_PRIOR, ref = 1) {
  const hs = Math.sqrt(L.hsh ?? 1.1), hso = Math.sqrt(L.hsot ?? 1.1), hf = Math.sqrt(L.hfc ?? 0.96);
  const side = (T, O, isHome) => ({
    sh: L.sh / 2 * T.shF * O.shA * (isHome ? hs : 1 / hs),
    sot: L.sot / 2 * T.sotF * O.sotA * (isHome ? hso : 1 / hso),
    fc: L.fc / 2 * T.fcF * O.fcA * (isHome ? hf : 1 / hf) * ref,
    poss: clamp((T.poss + (100 - O.poss)) / 2, 25, 75),
  });
  return { h: side(home, away, true), a: side(away, home, false) };
}

/* ---------- jogadores ---------- */
/* Contexto do jogo para cada estatística do jogador: quanto o jogo de hoje foge da média do time dele.
   mine/theirs = projeção do time do jogador e do adversário hoje; tAvg = média do próprio time por jogo (feitos e sofridos). */
/* peso do ajuste "adversário por posição" em cada estatística (0 = desligado). Só liga onde o walk-forward mostrou ganho.
   Teste de nov/2026 (fev→nov, ~106 mil linhas por mercado, K 12/40/120, peso 0,5 e 1): nenhum ganho de log loss em
   chutes, no gol, faltas ou desarmes; com peso 1 piorou todos. Fica desligado; o número aparece no card só como informação. */
export const POS_ALPHA = { sh: 0, sot: 0, fc: 0, fs: 0, tk: 0 };
export function posShape(op, pos, alpha = POS_ALPHA) {
  const o = op?.[pos] ?? {}, out = {};
  for (const k of Object.keys(alpha)) out[k] = alpha[k] && o[k] ? Math.pow(o[k], alpha[k]) : 1;
  return out;
}
export function playerContext(mine, theirs, tAvg) {
  const r = (a, b) => b > 0 ? clamp(a / b, 0.6, 1.6) : 1;
  return {
    sh: r(mine.sh, tAvg.sh), sot: r(mine.sot, tAvg.sot), fc: r(mine.fc, tAvg.fc), fs: r(theirs.fc, tAvg.fcA),
    tk: r(theirs.poss, 100 - tAvg.poss), sv: 1, oppSot: theirs.sot,
  };
}

/* Média esperada de um mercado do jogador em cada cenário de minutos.
   pp = perfil do jogador: r (taxas por 90), ms (minutos quando titular), mb (minutos quando entra do banco), sr (taxa de defesa do goleiro)
   Devolve { start, bench } = média se for titular / se entrar do banco. */
export function playerMu(pp, mk, ctx, L = LEAGUE_PRIOR, lg = null) {
  const cf = facOf(mk, lg), r = playerMuRaw(pp, mk, ctx, L);
  return { start: r.start * cf, bench: r.bench * cf };
}
function playerMuRaw(pp, mk, ctx, L) {
  const M = MARKETS[mk], st = M.st;
  if (mk === 'SV') {
    // goleiro: chutes no gol do adversário hoje × taxa de defesa dele (goleiro só joga de titular)
    const mu = (ctx.oppSot ?? L.sot / 2) * (pp.sr ?? 0.7) * (pp.ms ?? 90) / 90;
    return { start: mu, bench: mu * (pp.mb ?? 20) / 90 };
  }
  const rate = (pp.r?.[st] ?? 0) * (ctx[st] ?? 1);
  if (M.h1) {
    // 1º tempo: o titular joga o 1º tempo inteiro; quem sai do banco quase nunca entra antes do intervalo
    const share = st === 'sh' ? (L.h1sh ?? .455) : (L.h1sot ?? .45);
    return { start: rate * share * 2 * Math.min(pp.ms ?? 85, 45) / 90, bench: 0 };
  }
  return { start: rate * (pp.ms ?? 85) / 90, bench: rate * (pp.mb ?? 20) / 90 };
}

/* Chance de MAIS que a linha, condicionada a entrar em campo (sem entrar, a aposta costuma ser anulada).
   ps = chance de ser titular; pb = chance de entrar do banco se não for titular. */
export function playerOver(mu, mk, line, ps = 1, pb = 0.5, k = MARKETS[mk].k) {
  const pS = clamp(ps, 0, 1), pB = (1 - pS) * clamp(pb, 0, 1), tot = pS + pB;
  if (tot <= 0) return 0;
  return calP(mk, (pS * nbOver(mu.start, k, line) + pB * (mu.bench > 0 ? nbOver(mu.bench, k, line) : 0)) / tot);
}

/* ---------- valor e nota ---------- */
export const ev = (p, odd) => odd ? p * odd - 1 : null;
export const fair = p => p > 0 ? 1 / p : null;
/* Nota BH (0 a 100): ordena as entradas. Junta chance, valor esperado (quando há odd de casa), acertos recentes na
   mesma linha, contexto do jogo e certeza de que ele joga. */
export function notaBH({ p, e = null, hit = null, ctx = 1, cert = 1 }) {
  const sP = clamp((p - 0.5) / 0.35, 0, 1);
  const sE = e == null ? 0.4 : clamp((e + 0.05) / 0.2, 0, 1);
  const sH = hit == null ? 0.5 : clamp(hit, 0, 1);
  const sC = clamp((ctx - 0.8) / 0.4, 0, 1);
  return Math.round(100 * (0.4 * sP + 0.25 * sE + 0.15 * sH + 0.1 * sC + 0.1 * clamp(cert, 0, 1)));
}
export function grade(n) { return n >= 75 ? 'A+' : n >= 62 ? 'A' : n >= 50 ? 'B' : 'C'; }

/* linha de referência quando nenhuma casa abriu o mercado: a linha padrão com chance mais perto de 62% (entre 50% e 85%) */
export function refLine(probAt, lines) {
  let best = null;
  for (const l of lines) { const p = probAt(l); if (p < 0.5 || p > 0.85) continue; if (!best || Math.abs(p - 0.62) < Math.abs(best.p - 0.62)) best = { l, p }; }
  return best;
}
export function teamLines(mu) { const b = Math.floor(mu); return [b - 2.5, b - 1.5, b - 0.5, b + 0.5, b + 1.5].filter(x => x > 0); }
