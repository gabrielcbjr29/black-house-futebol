// PDF do dia: lê bot.json e strategies.json e gera public/data/dia.pdf (Playwright, mesmo Chromium dos cards).
// Traz as entradas do método, as de maior chance por mercado (todos os jogadores do dia), mercados combinados
// (mesmo jogo), múltiplas (uma perna por jogo) e a hora da leitura das odds, com faixa de aviso se a leitura tiver 2 h+.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { avatarSVG } from './avatar.mjs';

const ROOT = process.argv[2] ? resolve(process.argv[2]) : join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MK = { SH: 'Chutes', SOT: 'Chutes ao gol', SH1: 'Chutes 1º tempo', SOT1: 'Chutes ao gol 1º tempo', FC: 'Faltas cometidas', FS: 'Faltas sofridas', TK: 'Desarmes', SV: 'Defesas',
  TSH: 'Chutes do time', TSOT: 'Chutes ao gol do time', TFC: 'Faltas do time', JSH: 'Chutes no jogo', JSOT: 'Chutes ao gol no jogo', JFC: 'Faltas no jogo' };
const LG = { 39: 'Premier League', 140: 'La Liga', 135: 'Serie A', 78: 'Bundesliga', 61: 'Ligue 1', 71: 'Brasileirão', 2: 'Champions' };
const STALE = 2 * 3600e3, ODD_MIN = 1.4, ODD_MAX = 3.5;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n1 = x => (Math.round(x * 10) / 10).toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(Math.round(x * 10) / 10) ? 0 : 1 });
const n2 = x => x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pc = x => Math.round(x * 100) + '%';
const evs = x => x == null ? '–' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1).replace('.', ',') + '%';
const hourBR = iso => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const whenBR = iso => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
const dateBR = d => new Date(d + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
const side = r => (r.s ?? r.side) === 'u' ? 'Menos' : 'Mais';
const vs = r => r.k === 'j' ? r.n : `${r.t} x ${r.o}`;
const who = r => r.k === 'j' ? 'Jogo' : r.n;

/* múltiplas: uma perna por jogo, só com odd de casa, nota A/A+, odd 1,40–3,50, EV entre 0 e 15% (mesmo critério do bot) */
export function multiplas(rows, now = Date.now()) {
  const cand = rows.filter(r => Date.parse(r.utc) > now && (r.gr === 'A+' || r.gr === 'A') && r.d && r.d >= ODD_MIN && r.d <= ODD_MAX && (r.e ?? 0) >= 0 && (r.e ?? 0) <= .15
    && r.st !== 'duvida' && r.st !== 'banco' && !/1$/.test(r.m));
  const build = (sorted, n) => { const out = [], g = new Set(); for (const r of sorted) { if (g.has(r.g)) continue; g.add(r.g); out.push(r); if (out.length >= n) break; } return out; };
  const byP = [...cand].sort((a, b) => b.p - a.p), byEV = [...cand].sort((a, b) => (b.e ?? 0) - (a.e ?? 0));
  const pack = legs => legs.length < 2 ? null : { legs, odd: legs.reduce((a, r) => a * r.d, 1), p: legs.reduce((a, r) => a * r.p, 1) };
  return { dupla: pack(build(byP, 2)), tripla: pack(build(byP, 3)), valor: pack(build(byEV, 3)) };
}
/* combinados no mesmo jogo (criar aposta): duas pernas de alvos diferentes, cada uma com 65%+; chance = produto
   (aproximação: no mesmo jogo as pernas andam juntas, a casa recalcula a odd) */
export function combinados(rows, now = Date.now(), n = 8) {
  const byG = {};
  for (const r of rows) if (Date.parse(r.utc) > now && r.p >= .65 && (!r.d || (r.e ?? 0) >= 0) && !/1$/.test(r.m) && r.st !== 'banco' && r.st !== 'duvida') (byG[r.g] ??= []).push(r);
  const out = [];
  for (const list of Object.values(byG)) {
    const best = []; const seen = new Set();
    for (const r of list.sort((a, b) => b.p - a.p)) { if (seen.has(r.id)) continue; seen.add(r.id); best.push(r); if (best.length >= 6) break; }
    for (let i = 0; i < best.length; i++) for (let j = i + 1; j < best.length; j++) {
      const a = best[i], b = best[j], p = a.p * b.p; if (p < .45) continue;
      out.push({ a, b, p, odd: a.d && b.d ? a.d * b.d : null });
    }
  }
  return out.sort((x, y) => y.p - x.p).slice(0, n);
}
/* as de maior chance por mercado: chance 55%+, sem valor negativo na odd de casa; sem casa, linha de referência */
export function maiorChance(rows, now = Date.now(), n = 6) {
  const out = {};
  for (const mk of Object.keys(MK)) {
    const seen = new Set(), list = [];
    for (const r of rows.filter(r => r.m === mk && Date.parse(r.utc) > now && r.p >= .55 && (!r.d || (r.e ?? 0) >= 0) && (r.k !== 'p' || (r.st !== 'banco' && r.st !== 'duvida'))).sort((a, b) => b.p - a.p)) {
      if (seen.has(r.id)) continue; seen.add(r.id); list.push(r); if (list.length >= n) break;
    }
    if (list.length) out[mk] = list;
  }
  return out;
}

const css = `
@page { size: A4; margin: 12mm 10mm 14mm; }
* { box-sizing: border-box; } body { font: 10.5px/1.35 -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #12161c; margin: 0; }
h1 { font-size: 20px; margin: 0; letter-spacing: .3px; } h1 b { color: #1f8a52; }
h2 { font-size: 13px; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 2px solid #1f8a52; text-transform: uppercase; letter-spacing: .6px; }
h3 { font-size: 11px; margin: 10px 0 4px; color: #37414d; }
.sub { color: #5b6673; } .top { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; }
.warn { background: #fff4d6; border: 1px solid #f0b400; color: #6b4b00; padding: 7px 10px; border-radius: 6px; margin: 8px 0; font-weight: 600; }
.houses { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; } .house { border: 1px solid #d8dde3; border-radius: 6px; padding: 3px 8px; }
.house.old { border-color: #f0b400; background: #fff9e8; }
table { width: 100%; border-collapse: collapse; } th { text-align: left; font-size: 9px; color: #5b6673; text-transform: uppercase; letter-spacing: .4px; border-bottom: 1px solid #c9d0d8; padding: 3px 4px; }
td { padding: 3px 4px; border-bottom: 1px solid #eef1f4; vertical-align: middle; } td.r, th.r { text-align: right; } tr { break-inside: avoid; }
.who { display: flex; align-items: center; gap: 6px; } .who svg { flex: none; } .who small { color: #5b6673; display: block; font-size: 9px; }
.pos { color: #1f8a52; font-weight: 700; } .neg { color: #b42318; } .ref { color: #8a6d00; font-size: 9px; }
.tag { font-size: 8.5px; padding: 1px 5px; border-radius: 4px; background: #eef1f4; color: #37414d; white-space: nowrap; } .tag.td { background: #e6f0ff; color: #1d4ed8; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; } .box { border: 1px solid #d8dde3; border-radius: 8px; padding: 7px 9px; margin-bottom: 8px; break-inside: avoid; }
.box b.big { font-size: 15px; } .nw { white-space: nowrap; } .foot { margin-top: 14px; color: #5b6673; font-size: 9px; border-top: 1px solid #d8dde3; padding-top: 6px; }
`;
const oddCell = (r, now) => r.d ? `@${n2(r.d)} <span class="sub">${esc(r.b ?? '')}</span>${r.at && now - Date.parse(r.at) >= STALE ? ` <span class="tag">⏱️ ${hourBR(r.at)}</span>` : ''}` : `<span class="ref">ref. @${n2(1 / r.p)}</span>`;
const whoCell = (r, bot) => `<div class="who">${avatarSVG(r, bot, 22)}<div>${esc(who(r))}<small>${esc(vs(r))} · ${hourBR(r.utc)}</small></div></div>`;

export function pdfHTML(bot, st, now = Date.now()) {
  const all = [...bot.rows, ...(bot.rowsU ?? [])];
  const houses = (bot.houses ?? []).map(h => ({ ...h, old: now - Date.parse(h.at) >= STALE }));
  const stale = houses.filter(h => h.old);
  const names = Object.fromEntries((st?.strategies ?? []).map(s => [s.id, s.name]));
  const picks = (st?.date === bot.date ? st.picks : []).map(p => ({ p, r: all.find(r => r.id === p.pid && r.m === p.mk && r.l === +p.line && (r.s ?? 'o') === (p.side ?? 'o')) })).filter(x => x.r && Date.parse(x.r.utc) > now - 5 * 6e4);
  const grp = id => /^[mtj]-/.test(id) ? 'Modelo por mercado' : id === 'tendencia' ? 'Tendência' : 'Métodos extras';
  const entradas = picks.length ? ['Modelo por mercado', 'Métodos extras', 'Tendência'].map(G => {
    const xs = picks.filter(x => grp(x.p.strategy_id) === G); if (!xs.length) return '';
    return `<h3>${G}${G === 'Tendência' ? ' <span class="sub">(sinal da sequência, não do modelo)</span>' : ''}</h3><table><tr><th>Entrada</th><th>Mercado</th><th>Estratégia</th><th class="r">Odd</th><th class="r">Modelo</th><th class="r">EV</th><th class="r">Nota</th></tr>${xs.map(({ p, r }) =>
      `<tr><td>${whoCell(r, bot)}</td><td>${side(r)} de <b>${n1(r.l)}</b> ${esc(MK[r.m])}</td><td><span class="tag${p.strategy_id === 'tendencia' ? ' td' : ''}">${esc(names[p.strategy_id] ?? p.strategy_id)}</span></td><td class="r">${oddCell(r, now)}</td><td class="r">${pc(r.p)}</td><td class="r ${(r.e ?? 0) >= 0 ? 'pos' : 'neg'}">${p.strategy_id === 'tendencia' ? '<span class="sub">–</span>' : evs(r.e)}</td><td class="r">${r.nt ?? '–'}</td></tr>`).join('')}</table>`;
  }).join('') : '<p class="sub">Nenhuma entrada de estratégia no momento (sem linhas de casa ou ninguém passou nos critérios).</p>';
  const mc = maiorChance(bot.rows, now);
  const maior = Object.entries(mc).map(([mk, list]) => `<div class="box"><h3 style="margin-top:0">${esc(MK[mk])}</h3><table>${list.map(r =>
    `<tr><td>${whoCell(r, bot)}</td><td class="nw">${side(r)} <b>${n1(r.l)}</b></td><td class="r"><b>${pc(r.p)}</b></td><td class="r nw">${oddCell(r, now)}</td></tr>`).join('')}</table></div>`).join('');
  const comb = combinados(bot.rows, now);
  const combo = comb.length ? `<table><tr><th>Jogo</th><th>Perna 1</th><th>Perna 2</th><th class="r">Chance</th><th class="r">Odd justa</th><th class="r">Odds × odds</th></tr>${comb.map(c =>
    `<tr><td>${esc(c.a.k === 'j' ? c.a.n : `${c.a.home ? c.a.t : c.a.o} x ${c.a.home ? c.a.o : c.a.t}`)}<br><span class="sub">${hourBR(c.a.utc)}</span></td><td>${esc(who(c.a))}: ${side(c.a).toLowerCase()} de ${n1(c.a.l)} ${esc(MK[c.a.m]).toLowerCase()}</td><td>${esc(who(c.b))}: ${side(c.b).toLowerCase()} de ${n1(c.b.l)} ${esc(MK[c.b.m]).toLowerCase()}</td><td class="r"><b>${pc(c.p)}</b></td><td class="r">@${n2(1 / c.p)}</td><td class="r">${c.odd ? '@' + n2(c.odd) : '–'}</td></tr>`).join('')}</table>
    <p class="sub">No "criar aposta" a casa recalcula a odd (as pernas do mesmo jogo andam juntas). Compare com a odd justa: só vale se a da casa for maior.</p>` : '<p class="sub">Sem combinações fortes no momento.</p>';
  const M = multiplas(bot.rows, now);
  const mbox = (t, m) => m ? `<div class="box"><h3 style="margin-top:0">${t}</h3>${m.legs.map((r, i) => `<div class="who" style="margin:3px 0">${avatarSVG(r, bot, 20)}<div>${i + 1}. <b>${esc(who(r))}</b> · ${side(r).toLowerCase()} de ${n1(r.l)} ${esc(MK[r.m]).toLowerCase()} · @${n2(r.d)} ${esc(r.b ?? '')}<small>${esc(vs(r))} · ${hourBR(r.utc)}</small></div></div>`).join('')}
    <div style="margin-top:5px">Odd <b class="big">${n2(m.odd)}</b> · chance ${pc(m.p)} · EV <span class="${m.p * m.odd >= 1 ? 'pos' : 'neg'}">${evs(m.p * m.odd - 1)}</span></div></div>` : `<div class="box"><h3 style="margin-top:0">${t}</h3><p class="sub">Sem pernas suficientes em jogos diferentes.</p></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div class="top"><div><h1>BLACK HOUSE <b>FUTEBOL</b> · PDF DO DIA</h1><div class="sub">${esc(dateBR(bot.date))} · ${bot.games.length} jogos · gerado às ${hourBR(bot.gen)}</div></div><div class="sub" style="text-align:right">Modelo BH · props de jogador, time e jogo</div></div>
<div class="houses">${houses.length ? houses.map(h => `<span class="house${h.old ? ' old' : ''}">🏠 ${esc(h.house)} · odds lidas ${whenBR(h.at)} · ${h.n} linhas</span>`).join('') : '<span class="house old">Sem leitura de casa: só linhas de referência do modelo</span>'}</div>
${stale.length ? `<div class="warn">⏱️ Leitura das odds com 2 h ou mais (${stale.map(h => `${esc(h.house)} às ${whenBR(h.at)}`).join(', ')}): confira linha e odd na casa antes de entrar.</div>` : ''}
<h2>Entradas do método</h2>${entradas}
<h2>Maior chance por mercado</h2><p class="sub" style="margin:0 0 6px">Chance mínima de 55%, sem valor negativo na odd da casa. Sem linha de casa, usa a linha de referência do modelo (marcada "ref.").</p><div class="grid2">${maior}</div>
<h2>Mercados combinados (mesmo jogo)</h2>${combo}
<h2>Múltiplas</h2><div class="grid2">${mbox('Dupla mais provável', M.dupla)}${mbox('Tripla mais provável', M.tripla)}${mbox('Tripla de valor', M.valor)}</div>
<p class="sub">Uma perna por jogo, nota A ou A+, só com odd de casa (1,40–3,50). Pernas tratadas como independentes: use stake menor que a de uma simples.</p>
<div class="foot">🔞 18+ · Análise de dados, não é garantia. Confira a escalação e a odd da sua casa. Apostas podem causar dependência: jogue com responsabilidade.</div>
</body></html>`;
}

export async function renderPDF(root = ROOT) {
  const bot = JSON.parse(readFileSync(join(root, 'data', 'bot.json'), 'utf8'));
  let st = null; try { st = JSON.parse(readFileSync(join(root, 'data', 'strategies.json'), 'utf8')); } catch { /* sem estratégias */ }
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] } : {});
  const page = await browser.newPage();
  await page.setContent(pdfHTML(bot, st), { waitUntil: 'load' });
  const pdf = await page.pdf({ format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#888">Black House Futebol · <span class="pageNumber"></span>/<span class="totalPages"></span></div>', margin: { top: '12mm', bottom: '14mm', left: '10mm', right: '10mm' } });
  await browser.close();
  writeFileSync(join(root, 'data', 'dia.pdf'), pdf);
  console.log(`pdf: ${(pdf.length / 1024).toFixed(0)} KB`);
}
if (import.meta.url === `file://${process.argv[1]}`) renderPDF().catch(e => { console.error(e); process.exit(1); });
