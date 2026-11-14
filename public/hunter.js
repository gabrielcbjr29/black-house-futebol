// Caçador de props (app): filtra os jogadores do dia pelo histórico recente e põe ao lado a chance do Modelo BH e o EV.
// hunt.json: p[pid] = últimos 20 jogos em que entrou, do mais recente: [min, titular, casa, liga, chutes, no gol, f.com., f.sofr., desarmes, defesas]
import { MARKETS, playerOver, nbOver } from './engine.js';

export const HX = { SH: 4, SOT: 5, FC: 6, FS: 7, TK: 8, SV: 9 };
export const HUNT_MK = Object.keys(HX);
export const DEFAULT = { mk: 'SH', l: 0.5, w: 10, pct: 70, pos: [], venue: '', tit: true, mmin: 60, odd: 0, conf: false, liga: false, gap: 0 };
export const PRESETS = {
  classico: { name: 'Clássico', ic: '🎯', why: 'Chutou em quase todo jogo como titular.', f: { mk: 'SH', l: 0.5, w: 10, pct: 80 } },
  zagueiro: { name: 'Zagueiro que chuta', ic: '🧱', why: 'Defensor com chute frequente: a odd costuma ser alta.', f: { mk: 'SH', l: 0.5, w: 20, pct: 50, pos: ['D'], odd: 2.2 } },
  quente: { name: 'Fase quente', ic: '🔥', why: 'Acertou o gol em 4 dos últimos 5.', f: { mk: 'SOT', l: 0.5, w: 5, pct: 80, pos: ['M', 'F'], odd: 1.8 } },
  centroavante: { name: 'Volume de chute', ic: '💥', why: 'Atacante com 2+ chutes em 70% dos jogos.', f: { mk: 'SH', l: 1.5, w: 15, pct: 70, pos: ['F'], odd: 1.6 } },
  volante: { name: 'Volante faltoso', ic: '🟨', why: 'Meio-campista que faz falta quase todo jogo.', f: { mk: 'FC', l: 0.5, w: 15, pct: 80, pos: ['M'], odd: 1.5 } },
  ima: { name: 'Ímã de falta', ic: '🧲', why: 'Sofre 2+ faltas em 60% dos jogos.', f: { mk: 'FS', l: 1.5, w: 10, pct: 60, pos: ['M', 'F'], odd: 1.9 } },
  desarme: { name: 'Máquina de desarme', ic: '🦶', why: '2+ desarmes em 60% dos jogos.', f: { mk: 'TK', l: 1.5, w: 15, pct: 60, pos: ['D', 'M'], odd: 1.8 } },
  goleiro: { name: 'Goleiro ocupado', ic: '🧤', why: '3+ defesas em 60% dos jogos.', f: { mk: 'SV', l: 2.5, w: 10, pct: 60, pos: ['G'] } },
};
export const preset = k => ({ ...DEFAULT, ...PRESETS[k].f, pos: [...(PRESETS[k].f.pos ?? [])] });

// chance do modelo na linha (condicionada a entrar em campo), como no bot
export function modelP(D, pid, mk, L) {
  const m = D.mdl?.p?.[pid], mu = m?.mu?.[mk]; if (!mu) return null;
  return playerOver({ start: mu[0], bench: mu[1] }, mk, L, m.ps, m.pb, D.ks?.[mk] ?? MARKETS[mk].k);
}

export function run(D, H, f, now = Date.now()) {
  const out = [], c = HX[f.mk];
  for (const [pid, m] of Object.entries(D.mdl?.p ?? {})) {
    if (!m.mu?.[f.mk] || Date.parse(m.utc) < now - 5 * 6e4) continue;
    if (f.pos.length && !f.pos.includes(m.pos)) continue;
    // hoje: titular confirmado (conf) ou, sem escalação, provável titular (60%+); banco fica de fora
    if (f.conf ? m.st !== 'xi' : (m.st === 'banco' || (m.st !== 'xi' && m.ps < 0.6))) continue;
    if (f.venue && (f.venue === 'casa') !== m.home) continue;
    if (f.gap && (m.gap ?? 0) > f.gap) continue;
    const hx = H?.p?.[pid]; if (!hx) continue;
    const mmin = f.tit ? f.mmin : Math.max(1, f.mmin);
    const g = hx.filter(h => h[0] >= mmin && (!f.tit || h[1]) && (!f.venue || (f.venue === 'casa') === !!h[2]) && (!f.liga || h[3] === m.lg)).slice(0, f.w);
    if (g.length < 3 || g.length < Math.ceil(f.w * 0.6)) continue; // amostra mínima: 60% da janela
    const vals = g.map(h => h[c]), hit = vals.filter(v => v > f.l).length;
    if (hit / g.length * 100 < f.pct - 1e-9) continue;
    const p = modelP(D, pid, f.mk, f.l); if (p == null) continue;
    const row = D.rows.find(r => r.id === pid && r.m === f.mk && r.l === f.l && r.d);
    const odd = row?.d ?? 1 / Math.max(p, 0.01);
    if (f.odd && odd < f.odd - 1e-9) continue;
    let sk = 0; for (const v of vals) { if (v > f.l) sk++; else break; }
    out.push({ pid, m, hit, n: g.length, vals, p, odd, house: row?.b ?? null, e: row?.d ? p * row.d - 1 : null, sk });
  }
  // com odd de casa, pelo EV; sem odd, pela chance do modelo (o histórico já passou no filtro)
  return out.sort((a, b) => ((b.e ?? -9) - (a.e ?? -9)) || (b.p - a.p) || (b.hit / b.n - a.hit / a.n));
}
export { nbOver };
