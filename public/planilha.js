// Planilha do método (aba "Planilha" do app): todas as entradas que o sistema apontou, com todos os números.
// Lê a função estrategias?planilha=1 (placar + entradas do papel e do Top 10; sem dados de usuário).
// Mesma ideia do Placar do Black House NBA: KPIs, curva de unidades, quebras e gabarito; aqui com a tabela completa
// filtrável e o download em CSV.
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n1 = x => x == null ? '–' : (Math.round(+x * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const n2 = x => x == null || x === '' ? '–' : (+x).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pc = (x, d = 0) => x == null || !isFinite(x) ? '–' : (x * 100).toLocaleString('pt-BR', { maximumFractionDigits: d }) + '%';
const sp = x => x == null || !isFinite(x) ? '–' : (x > 0 ? '+' : x < 0 ? '−' : '') + (Math.abs(x) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const u = x => (x > 0 ? '+' : x < 0 ? '−' : '') + n2(Math.abs(x)) + 'u';
const cls = x => x > 0 ? 'pos' : x < 0 ? 'neg' : '';
const dBR = d => { const [, m, dd] = String(d).split('-'); return `${dd}/${m}`; };
const hBR = iso => iso ? new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const shift = (d, k) => new Date(Date.parse(d + 'T12:00:00Z') + k * 864e5).toISOString().slice(0, 10);
const MKN = { SH: 'Chutes', SOT: 'Chutes ao gol', SH1: 'Chutes 1º tempo', SOT1: 'No gol 1º tempo', FC: 'Faltas cometidas', FS: 'Faltas sofridas', TK: 'Desarmes', SV: 'Defesas',
  TSH: 'Chutes do time', TSOT: 'No gol do time', TFC: 'Faltas do time', JSH: 'Chutes no jogo', JSOT: 'No gol no jogo', JFC: 'Faltas no jogo' };
const ST = { aberta: 'Aberta', green: 'Green', red: 'Red', void: 'Anulada' };
const STI = { aberta: '⏳', green: '🟩', red: '🟥', void: '⬜' };

/* uma linha da planilha: entradas do papel (estratégias) e do Top 10 no mesmo formato */
export function rowsOf(P) {
  const names = Object.fromEntries((P.estrategias ?? []).map(e => [e.id, e.name]));
  const pick = x => {
    const side = x.side === 'u' ? 'u' : 'o', L = +(x.open_line ?? x.line), O = x.open_odd ?? x.odd;
    // CLV: a linha andou a favor (MAIS: subiu; MENOS: desceu) ou, na mesma linha, a odd caiu
    const clvL = x.clv_line == null ? null : side === 'u' ? +x.clv_line : -x.clv_line;
    return { ...x, side, L, O: O == null ? null : +O, Lf: x.line == null ? null : +x.line, Of: x.odd == null ? null : +x.odd, clvL, clvO: x.clv_odd == null ? null : +x.clv_odd,
      p: x.p == null ? null : +x.p, ev: x.edge != null ? +x.edge : (x.p != null && O ? +x.p * +O - 1 : null), profit: x.profit == null ? null : +x.profit };
  };
  return [
    ...(P.picks ?? []).map(x => ({ ...pick(x), src: 'est', sname: names[x.strategy_id] ?? x.strategy_id })),
    ...(P.tops ?? []).map(x => ({ ...pick(x), src: 'top', strategy_id: 'top-' + x.list, sname: `Top 10 ${x.list === 'chutes' ? 'Chutes' : 'Faltas'} (#${x.rank})`, alerted: true, fase: '' })),
  ];
}
export const PO = { per: '30', src: 'est', est: '', mk: '', st: '', al: false };
export function filtra(R, o = PO) {
  const t = today(), from = o.per === 'hoje' ? t : o.per === 'tudo' ? '0000' : shift(t, -(+o.per - 1));
  return R.filter(x => x.date >= from && (o.src === 'tudo' || x.src === o.src) && (!o.est || x.strategy_id === o.est) && (!o.mk || x.mk === o.mk) && (!o.st || x.status === o.st) && (!o.al || x.alerted));
}
/* resumo de um conjunto: só green/red contam no lucro e no ROI (1u por entrada) */
export function resumo(a) {
  const d = a.filter(x => x.status === 'green' || x.status === 'red'), g = d.filter(x => x.status === 'green').length;
  const lucro = d.reduce((s, x) => s + (x.profit ?? 0), 0), odds = d.filter(x => x.O).map(x => x.O);
  const clv = a.filter(x => x.clvL != null && x.clvL !== 0 || x.clvO != null && x.clvO !== 0);
  const clvPos = clv.filter(x => (x.clvL ?? 0) > 0 || (x.clvL == null || x.clvL === 0) && (x.clvO ?? 0) > 0).length;
  const evs = a.filter(x => x.ev != null).map(x => x.ev);
  return { n: a.length, dec: d.length, g, r: d.length - g, v: a.filter(x => x.status === 'void').length, ab: a.filter(x => x.status === 'aberta').length,
    lucro, roi: d.length ? lucro / d.length : null, hit: d.length ? g / d.length : null, odd: odds.length ? odds.reduce((s, x) => s + x, 0) / odds.length : null,
    clv: clv.length ? clvPos / clv.length : null, nclv: clv.length, ev: evs.length ? evs.reduce((s, x) => s + x, 0) / evs.length : null };
}
const grupos = (a, key) => { const m = new Map(); for (const x of a) { const k = key(x); if (k == null) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return [...m.entries()].map(([k, l]) => ({ k, ...resumo(l) })); };
const FAIXA_EV = x => x.ev == null ? null : x.ev < 0.05 ? '0–5%' : x.ev < 0.10 ? '5–10%' : x.ev < 0.20 ? '10–20%' : x.ev < 0.40 ? '20–40%' : '40%+';
const FAIXA_ODD = x => !x.O ? null : x.O < 1.6 ? '1,40–1,59' : x.O < 1.9 ? '1,60–1,89' : x.O < 2.3 ? '1,90–2,29' : x.O < 3 ? '2,30–2,99' : '3,00+';
const ORD = { '0–5%': 0, '5–10%': 1, '10–20%': 2, '20–40%': 3, '40%+': 4, '1,40–1,59': 0, '1,60–1,89': 1, '1,90–2,29': 2, '2,30–2,99': 3, '3,00+': 4 };

function curva(a) {
  const dias = grupos(a.filter(x => x.status === 'green' || x.status === 'red'), x => x.date).sort((p, q) => p.k.localeCompare(q.k));
  if (!dias.length) return '<p class="hint">A curva aparece quando o primeiro dia for conferido.</p>';
  const pts = [{ d: 'início', y: 0 }]; let acc = 0; for (const d of dias) { acc += d.lucro; pts.push({ d: dBR(d.k), y: acc, day: d.lucro, g: d.g, n: d.dec }); }
  const W = 720, H = 190, pl = 46, pr = 12, pt = 14, pb = 26, ys = pts.map(p => p.y), mn = Math.min(0, ...ys), mx = Math.max(0, ...ys), span = mx - mn || 1;
  const X = i => pl + (W - pl - pr) * (pts.length === 1 ? 0 : i / (pts.length - 1)), Y = v => pt + (H - pt - pb) * (1 - (v - mn) / span);
  const step = span > 40 ? 10 : span > 16 ? 5 : span > 6 ? 2 : 1, last = pts.at(-1).y, poly = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  let s = `<svg class="curve" viewBox="0 0 ${W} ${H}" role="img" aria-label="Unidades acumuladas por dia">`;
  for (let t = Math.ceil(mn / step) * step; t <= mx; t += step) s += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${pl - 6}" y="${Y(t) + 4}" text-anchor="end">${t > 0 ? '+' : ''}${t}u</text>`;
  s += `<polyline class="eq ${last >= 0 ? 'up' : 'down'}" points="${poly}"/>`;
  pts.forEach((p, i) => { if (i) s += `<circle class="${p.day >= 0 ? 'up' : 'down'}" cx="${X(i)}" cy="${Y(p.y)}" r="4"><title>${p.d}: ${u(p.day)} (${p.g}/${p.n})</title></circle>`; });
  pts.forEach((p, i) => { if (pts.length > 14 && i % Math.ceil(pts.length / 10)) return; s += `<text x="${X(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}">${p.d}</text>`; });
  return s + '</svg>';
}
const tabela = (title, list, lb, note = '') => `<div class="pl-box"><h3>${title}</h3>${list.length ? `<div class="tablewrap"><table><tr><th></th><th class="r">Entradas</th><th class="r">Acerto</th><th class="r">Lucro</th><th class="r">ROI</th><th class="r">Odd média</th><th class="r">EV médio</th><th class="r">CLV+</th></tr>
  ${list.map(x => `<tr><td><b>${esc(lb(x))}</b>${x.ab ? ` <small class="mut">+${x.ab} abertas</small>` : ''}</td><td class="r">${x.dec}</td><td class="r">${x.dec ? `${pc(x.hit)} <small class="mut">${x.g}G ${x.r}R</small>` : '–'}</td><td class="r ${cls(x.lucro)}"><b>${x.dec ? u(x.lucro) : '–'}</b></td><td class="r ${cls(x.roi)}">${sp(x.roi)}</td><td class="r">${n2(x.odd)}</td><td class="r">${sp(x.ev)}</td><td class="r">${x.nclv ? pc(x.clv) : '–'}</td></tr>`).join('')}</table></div>` : '<p class="hint">Sem entradas nesse filtro.</p>'}${note ? `<p class="hint">${note}</p>` : ''}</div>`;

export function planilhaHTML(P, o = PO) {
  const ALL = rowsOf(P), R = filtra(ALL, o), S = resumo(R);
  const ests = [...new Map(ALL.filter(x => o.src === 'tudo' || x.src === o.src).map(x => [x.strategy_id, x.sname.replace(/ \(#\d+\)$/, '')])).entries()];
  const mks = [...new Set(ALL.map(x => x.mk))];
  const seg = (k, opts) => `<span class="seg2" data-k="${k}">${opts.map(([v, lb]) => `<button class="${String(o[k]) === v ? 'on' : ''}" data-v="${v}">${lb}</button>`).join('')}</span>`;
  const ctl = `<div class="rx-ctl">${seg('per', [['hoje', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['tudo', 'Tudo']])}${seg('src', [['est', 'Estratégias'], ['top', 'Top 10'], ['tudo', 'Tudo']])}</div>
    <div class="rx-ctl"><select id="plEst" aria-label="Estratégia"><option value="">Todas as estratégias</option>${ests.map(([id, n]) => `<option value="${esc(id)}" ${o.est === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
    <select id="plMk" aria-label="Mercado"><option value="">Todos os mercados</option>${mks.map(k => `<option value="${k}" ${o.mk === k ? 'selected' : ''}>${esc(MKN[k] ?? k)}</option>`).join('')}</select>
    <select id="plSt" aria-label="Situação"><option value="">Todas as situações</option>${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${o.st === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <label class="chk"><input type="checkbox" id="plAl" ${o.al ? 'checked' : ''}> Só as alertadas</label>
    <button class="btn sm" id="plCsv">⬇️ Baixar CSV</button></div>`;
  const kpi = (lb, v, sub, c = '') => `<div><b class="${c}">${v}</b>${lb}${sub ? `<br><small class="mut">${sub}</small>` : ''}</div>`;
  const kpis = `<div class="facts pl-kpis">${kpi('entradas conferidas', S.dec, `${S.ab} em aberto · ${S.v} anuladas`)}${kpi('lucro', S.dec ? u(S.lucro) : '–', '1u por entrada', cls(S.lucro))}${kpi('ROI', sp(S.roi), 'lucro ÷ entradas decididas', cls(S.roi))}
    ${kpi('acerto', pc(S.hit, 1), `odd média ${n2(S.odd)} · precisa ${S.odd ? pc(1 / S.odd, 1) : '–'}`)}${kpi('EV médio', sp(S.ev), 'na odd da entrada')}${kpi('CLV positivo', S.nclv ? pc(S.clv) : '–', S.nclv ? `${S.nclv} com movimento` : 'sem fechamento ainda')}</div>`;
  // gabarito do último dia com entrada conferida
  const lastDay = [...new Set(R.filter(x => x.status !== 'aberta').map(x => x.date))].sort().at(-1);
  const gab = lastDay ? (() => { const G = R.filter(x => x.date === lastDay), s = resumo(G); return `<div class="pl-box"><h3>Gabarito de ${dBR(lastDay)} <small class="mut">${s.g}G ${s.r}R${s.v ? ' ' + s.v + ' anuladas' : ''} · ${u(s.lucro)}</small></h3>
    <ul class="trends">${G.map(x => `<li>${STI[x.status]} <b>${esc(x.name)}</b> <small class="mut">${esc(x.sname)}${x.alerted && x.src === 'est' ? ' · 📬 alertada' : ''}</small><br>${x.side === 'u' ? 'Menos' : 'Mais'} de ${n1(x.L)} ${esc((MKN[x.mk] ?? x.mk).toLowerCase())} @${n2(x.O)} · fez <b>${x.result == null ? '–' : n1(x.result)}</b>${x.status !== 'aberta' && x.profit != null ? ` · <span class="${cls(x.profit)}">${u(x.profit)}</span>` : ''}</li>`).join('')}</ul></div>`; })() : '';
  // tabela completa
  const head = '<tr><th>Data</th><th>Hora</th><th>Fonte</th><th>Alvo</th><th>Jogo</th><th>Mercado</th><th>Lado</th><th class="r">Linha</th><th class="r">Odd</th><th>Casa</th><th class="r">Chance</th><th class="r">EV</th><th class="r">Nota</th><th>Fase</th><th>📬</th><th class="r">Fecham.</th><th class="r">CLV</th><th class="r">Fez</th><th>Situação</th><th class="r">Lucro</th></tr>';
  const body = R.map(x => `<tr class="st-${x.status}"><td>${dBR(x.date)}</td><td>${hBR(x.tip_utc)}</td><td><small>${esc(x.sname)}</small></td><td><b>${esc(x.name)}</b></td><td><small>${esc(x.team ?? '')} x ${esc(x.opp ?? '')}</small></td><td>${esc(MKN[x.mk] ?? x.mk)}</td><td>${x.side === 'u' ? 'Menos' : 'Mais'}</td>
    <td class="r">${n1(x.L)}</td><td class="r">${n2(x.O)}</td><td><small>${esc(x.odd_src ?? '')}</small></td><td class="r">${pc(x.p)}</td><td class="r ${cls(x.ev)}">${sp(x.ev)}</td><td class="r">${x.nota ?? '–'}</td><td><small>${x.fase === 'escalacao' ? 'escalação' : x.fase ? 'abertura' : ''}</small></td><td>${x.alerted ? '✓' : ''}</td>
    <td class="r">${x.Lf != null && x.Lf !== x.L ? n1(x.Lf) + ' ' : ''}${x.Of != null ? '@' + n2(x.Of) : '–'}</td><td class="r ${cls(x.clvL || x.clvO)}">${x.clvL ? (x.clvL > 0 ? '+' : '−') + n1(Math.abs(x.clvL)) + ' ln' : x.clvO != null ? sp(x.clvO) : '–'}</td>
    <td class="r">${x.result == null ? '–' : n1(x.result)}</td><td>${STI[x.status]} ${ST[x.status] ?? x.status}</td><td class="r ${cls(x.profit)}">${x.status === 'aberta' || x.profit == null ? '' : u(x.profit)}</td></tr>`).join('');
  const full = `<div class="pl-box"><h3>Todas as entradas <small class="mut">${R.length} no filtro</small></h3><div class="tablewrap pl-sheet"><table>${head}${body || '<tr><td colspan="20" class="mut">Nada nesse filtro.</td></tr>'}</table></div></div>`;
  return ctl + kpis + `<div class="pl-box"><h3>Unidades acumuladas</h3>${curva(R)}</div>`
    + tabela('Por estratégia', grupos(R, x => x.sname.replace(/ \(#\d+\)$/, '')).sort((a, b) => b.lucro - a.lucro), x => x.k, 'Uma estratégia só merece stake de verdade com 50+ entradas, ROI e CLV positivos. Com menos que isso, o placar é ruído.')
    + tabela('Por mercado', grupos(R, x => MKN[x.mk] ?? x.mk).sort((a, b) => b.dec - a.dec), x => x.k)
    + tabela('Por faixa de EV', grupos(R, FAIXA_EV).sort((a, b) => ORD[a.k] - ORD[b.k]), x => 'EV ' + x.k, 'Mostra se o EV que o modelo vê vira lucro de verdade, faixa por faixa.')
    + tabela('Por faixa de odd', grupos(R, FAIXA_ODD).sort((a, b) => ORD[a.k] - ORD[b.k]), x => '@' + x.k)
    + tabela('Por lado', grupos(R, x => x.side === 'u' ? 'Menos de' : 'Mais de'), x => x.k)
    + gab + full + `<p class="hint">Papel: 1u por entrada, na linha e odd do alerta. Conferido com o resultado oficial do jogo. Atualizado ${hBR(P.gen)}. 🔞 18+ · jogue com responsabilidade.</p>`;
}
/* CSV das entradas do filtro (abre no Excel e no Google Sheets) */
export function csvOf(P, o = PO) {
  const R = filtra(rowsOf(P), o), q = x => { const t = x == null ? '' : String(x); return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const num = x => x == null || x === '' ? '' : String(Math.round(+x * 10000) / 10000).replace('.', ',');
  const head = ['data', 'hora', 'fonte', 'alvo', 'time', 'adversario', 'mercado', 'lado', 'linha', 'odd', 'casa', 'chance', 'ev', 'nota', 'fase', 'alertada', 'linha_fechamento', 'odd_fechamento', 'clv_linha', 'clv_odd', 'fez', 'situacao', 'lucro_u'];
  const rows = R.map(x => [x.date, hBR(x.tip_utc), x.sname, x.name, x.team, x.opp, MKN[x.mk] ?? x.mk, x.side === 'u' ? 'Menos' : 'Mais', num(x.L), num(x.O), x.odd_src, num(x.p), num(x.ev), x.nota, x.fase, x.alerted ? 'sim' : 'não',
    num(x.Lf), num(x.Of), num(x.clvL), num(x.clvO), num(x.result), ST[x.status] ?? x.status, x.status === 'aberta' ? '' : num(x.profit)]);
  return '﻿' + [head, ...rows].map(l => l.map(q).join(';')).join('\n');
}
