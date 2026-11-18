// Telas do Raio-X no app: jogo (como a página de jogo do Valuestats), Tendências e Árbitros.
import { RS, BET_J, BET_T, sample, avg, hits, trendText } from './raiox-lib.js';
import { MARKETS } from './engine.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n1 = x => x == null ? '–' : (Math.round(x * 10) / 10).toFixed(1).replace('.', ',').replace(',0', '');
const nl = x => String(x).replace('.', ',');
const pc = x => x == null ? '–' : Math.round(x * 100) + '%';
const dBR = d => d.slice(8, 10) + '/' + d.slice(5, 7);
const hour = iso => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
// escala fixa por métrica (não é ranking): verde = alto, cinza = amostra pequena
const heat = (p, n) => n < 5 ? 'lo' : p >= 0.7 ? 'hi' : p >= 0.5 ? 'md' : '';

/* ---------- Raio-X de um jogo ---------- */
export const RXO = { vh: 'casa', va: 'fora', n: 10 };
export function raioxHTML(RX, g, o = RXO) {
  const T = RX.tn, sh = sample(g.tm[g.h], { venue: o.vh, n: o.n }), sa = sample(g.tm[g.a], { venue: o.va, n: o.n });
  const seg = (k, v) => `<span class="seg2" data-k="${k}">${[['', 'Todos'], ['casa', 'Casa'], ['fora', 'Fora']].map(([x, lb]) => `<button class="${v === x ? 'on' : ''}" data-v="${x}">${lb}</button>`).join('')}</span>`;
  const ctl = `<div class="rx-ctl"><label>${esc(T[g.h])} ${seg('vh', o.vh)}</label><label>${esc(T[g.a])} ${seg('va', o.va)}</label>
    <label>Amostra <span class="seg2" data-k="n">${[5, 10, 15, 20, 30].map(n => `<button class="${o.n === n ? 'on' : ''}" data-v="${n}">${n}</button>`).join('')}</span></label></div>
    <p class="hint">${sh.length} jogos do ${esc(T[g.h])} · ${sa.length} do ${esc(T[g.a])}. Número cinza = o que o adversário fez.</p>`;
  // médias pró e contra, lado a lado
  const avgRow = s => `<tr><td class="r">${n1(avg(sh, s))} <small class="mut">${n1(avg(sh, s, 'a'))}</small></td><td class="c">${RS[s].lb}</td><td>${n1(avg(sa, s))} <small class="mut">${n1(avg(sa, s, 'a'))}</small></td></tr>`;
  const avgT = `<h3>Médias por jogo</h3><table class="rx-vs"><tr><th class="r">${esc(T[g.h])}</th><th></th><th>${esc(T[g.a])}</th></tr>${Object.keys(RS).map(avgRow).join('')}</table>`;
  // estatísticas de aposta: % acima da linha nos jogos de cada um (total do jogo e só do time)
  const cell = ([h, n]) => n ? `<td class="r ${heat(h / n, n)}">${pc(h / n)} <small class="mut">${h}/${n}</small></td>` : '<td class="r">–</td>';
  const betJ = Object.entries(BET_J).flatMap(([s, L]) => L.map(l => `<tr>${cell(hits(sh, s, 'j', l))}<td class="c">Mais de ${nl(l)} ${RS[s].lb.toLowerCase()}</td>${cell(hits(sa, s, 'j', l))}</tr>`)).join('');
  const betT = Object.entries(BET_T).flatMap(([s, L]) => L.map(l => `<tr>${cell(hits(sh, s, 't', l))}<td class="c">Time com mais de ${nl(l)} ${RS[s].lb.toLowerCase()}</td>${cell(hits(sa, s, 't', l))}</tr>`)).join('');
  const bet = `<h3>Estatísticas de aposta <small>(% dos jogos)</small></h3><table class="rx-vs">${betJ}${betT}</table>`;
  // confronto direto e últimos jogos
  const line = (r, me) => `<tr><td>${dBR(r[1])}</td><td>${r[3] ? 'x' : '@'} ${esc(T[r[2]] ?? r[2])}</td><td class="c">${r[5] ?? '–'}-${r[6] ?? '–'}</td><td class="r">${r[7]}<small class="mut">/${r[8]}</small></td><td class="r">${r[9]}<small class="mut">/${r[10]}</small></td><td class="r">${r[11]}<small class="mut">/${r[12]}</small></td><td class="r">${r[13] ?? '–'}<small class="mut">/${r[14] ?? '–'}</small></td><td class="r">${r[15]}<small class="mut">/${r[16]}</small></td></tr>`;
  const hdr = '<tr><th>Data</th><th>Adversário</th><th class="c">Placar</th><th class="r">Chutes</th><th class="r">No gol</th><th class="r">Faltas</th><th class="r">Esc.</th><th class="r">Amar.</th></tr>';
  const h2h = g.h2h.length ? `<h3>Confronto direto <small>(visão do ${esc(T[g.h])})</small></h3><div class="tablewrap"><table>${hdr}${g.h2h.map(r => line(r)).join('')}</table></div>` : '';
  const last = [[g.h, sh], [g.a, sa]].map(([id, rs]) => `<h3>Últimos jogos · ${esc(T[id])}</h3><div class="tablewrap"><table>${hdr}${rs.map(r => line(r)).join('')}</table></div>`).join('');
  // tendências do jogo
  const tr = RX.tr.filter(t => t.g === g.id).sort((a, b) => b.b - a.b || b.y - a.y || b.x / b.y - a.x / a.y);
  const trH = tr.length ? `<h3>Tendências <small>(6+ acertos, no máximo 1 erro)</small></h3><ul class="trends">${tr.map(t => `<li>${t.b ? '<b class="both" title="vale também nos jogos do adversário">✅ os dois</b> ' : ''}${esc(trendText(t, T[t.t]))} <small class="mut">${t.vals.join(' · ')}</small></li>`).join('')}</ul>` : '';
  // árbitro e desfalques
  const R = g.rk ? RX.rf[g.rk] : null;
  const ref = g.ref ? `<h3>Árbitro · ${esc(g.ref)}</h3>${R ? refCard(R, RX) : '<p class="hint">Sem jogos dele no nosso histórico.</p>'}` : '';
  const inj = g.inj?.length ? `<h3>Desfalques</h3><ul class="trends">${g.inj.map(x => `<li>${x.st === 'out' ? '❌' : '🟡'} <b>${esc(x.n)}</b> <small class="mut">${esc(x.t)} · ${esc(x.why)}</small></li>`).join('')}</ul>` : '';
  return `<h2>${esc(T[g.h])} x ${esc(T[g.a])}</h2><p class="meta">${hour(g.utc)}${g.ref ? ' · 🟨 ' + esc(g.ref) : ''}</p>${ctl}${avgT}${bet}${trH}${ref}${inj}${h2h}${last}
    <p class="foot">Escanteios, amarelos e gols: só informação (o Modelo BH e as estratégias ficam nos mercados de chutes, faltas, desarmes e defesas). 🔞 18+ · jogue com responsabilidade.</p>`;
}
function refCard(R, RX, w = 'all') {
  const S = R[w] ?? R.all, L = R.lg ?? {};
  return `<div class="facts"><div><b>${n1(S.fc)}</b>faltas/jogo (liga ${n1(L.fc)})</div><div><b>${n1(S.yc)}</b>amarelos/jogo (liga ${n1(L.yc)})</div><div><b>${pc(S.o45)}</b>dos jogos com 5+ amarelos (liga ${pc(L.o45)})</div><div><b>${pc(S.b1)}</b>os dois times levam amarelo</div><div><b>${S.n}</b>jogos na amostra${S.n < 5 ? ' (pouca)' : ''}</div></div>
    <p class="meta">Últimos: ${R.last5.map(x => `${dBR(x[0])} ${esc(RX.tn[x[1]] ?? '')} ${x[3] ?? ''}-${x[4] ?? ''} ${esc(RX.tn[x[2]] ?? '')} · 🟨${x[5]} · ${x[6]} faltas`).join(' | ')}</p>`;
}

/* ---------- Tendências do dia (times, jogo e jogadores) ---------- */
export const TRO = { min: 6, tipo: 't', cat: '', both: false };
const CAT = { '': 'Tudo', sh: 'Chutes', sot: 'No gol', fc: 'Faltas', cor: 'Escanteios', yc: 'Cartões', g: 'Gols', tk: 'Desarmes', sv: 'Defesas', fs: 'Sofridas' };
const MKCAT = { SH: 'sh', SOT: 'sot', FC: 'fc', FS: 'fs', TK: 'tk', SV: 'sv' };
export function trendsHTML(RX, D, o = TRO) {
  const games = Object.fromEntries(RX.g.map(g => [g.id, g])), T = RX.tn, now = Date.now();
  const live = id => games[id] && Date.parse(games[id].utc) > now - 5 * 6e4;
  const segs = `<div class="rx-ctl"><span class="seg2" data-k="tipo"><button class="${o.tipo === 't' ? 'on' : ''}" data-v="t">Times e jogo</button><button class="${o.tipo === 'p' ? 'on' : ''}" data-v="p">Jogadores</button></span>
    <label>Mínimo <span class="seg2" data-k="min">${[6, 8, 10, 12].map(n => `<button class="${o.min === n ? 'on' : ''}" data-v="${n}">${n}+</button>`).join('')}</span></label>
    <span class="seg2" data-k="cat">${Object.entries(CAT).filter(([k]) => o.tipo === 'p' ? !['cor', 'yc', 'g'].includes(k) : !['tk', 'sv', 'fs'].includes(k)).map(([k, lb]) => `<button class="${o.cat === k ? 'on' : ''}" data-v="${k}">${lb}</button>`).join('')}</span>
    ${o.tipo === 't' ? `<label class="chk"><input type="checkbox" id="trBoth" ${o.both ? 'checked' : ''}> Só quando vale para os dois times</label>` : ''}</div>`;
  let body;
  if (o.tipo === 't') {
    const list = RX.tr.filter(t => live(t.g) && t.x >= o.min && (!o.cat || (o.cat === 'sh' ? t.s === 'sh' || t.s === 'sh1' : t.s === o.cat)) && (!o.both || t.b));
    body = RX.g.filter(g => live(g.id)).map(g => {
      const L = list.filter(t => t.g === g.id).sort((a, b) => b.b - a.b || b.y - a.y); if (!L.length) return '';
      return `<div class="game"><div class="meta">${hour(g.utc)}</div><h3>${esc(T[g.h])} x ${esc(T[g.a])}</h3><ul class="trends">${L.map(t => `<li>${t.b ? '<b class="both">✅ os dois</b> ' : ''}${esc(trendText(t, T[t.t]))} <small class="mut">${t.vals.join(' · ')}</small></li>`).join('')}</ul></div>`;
    }).join('');
  } else {
    const list = RX.pt.filter(x => live(x.g) && x.x >= o.min && (!o.cat || MKCAT[x.mk] === o.cat));
    body = list.map(x => { const m = D.mdl?.p?.[x.pid], g = games[x.g]; return m ? `<div class="game"><div class="meta">${hour(g.utc)} · ${esc(T[g.h])} x ${esc(T[g.a])}</div>
      <h3>${esc(m.n)} <small class="mut">${esc(T[m.t] ?? '')}</small></h3><p><b>Mais de ${nl(x.l)} ${esc(MARKETS[x.mk].lb.toLowerCase())}</b> · ${x.x}/${x.y} como titular${x.p90 != null ? ` · ${n1(x.p90)} por 90` : ''}</p><p class="mut">${x.vals.join(' · ')}</p></div>` : ''; }).join('');
  }
  return segs + (body || '<p class="hint">Nada com esses filtros hoje.</p>') + '<p class="hint">⚠️ Tendência é informação, não motivo: a casa também vê e põe no preço. O que decide é a chance do modelo contra a odd (EV).</p>';
}

/* ---------- Árbitros do dia ---------- */
export const ARO = { w: 'all' };
export function refsHTML(RX, o = ARO) {
  const T = RX.tn, rows = RX.g.filter(g => g.rk && RX.rf[g.rk]).map(g => ({ g, R: RX.rf[g.rk] }));
  const sem = RX.g.filter(g => !g.ref).length;
  const ctl = `<div class="rx-ctl"><span class="seg2" data-k="w"><button class="${o.w === 'all' ? 'on' : ''}" data-v="all">Tudo (2 temporadas)</button><button class="${o.w === 'l20' ? 'on' : ''}" data-v="l20">Últimos 20</button></span></div>`;
  if (!rows.length) return ctl + `<p class="hint">Os árbitros de hoje ainda não foram anunciados${sem ? ` (${sem} jogos sem árbitro)` : ''}.</p>`;
  const td = (p, n) => `<td class="r ${heat(p, n)}">${pc(p)}</td>`;
  return ctl + `<div class="tablewrap"><table><tr><th>Árbitro</th><th>Jogo</th><th class="r">J</th><th class="r">Faltas/J</th><th class="r">Amar./J</th><th class="r">+3,5</th><th class="r">+4,5</th><th class="r">+5,5</th><th class="r">Ambos 1+</th><th class="r">Ambos 2+</th><th class="r">Esc./J</th></tr>
    ${rows.map(({ g, R }) => { const S = R[o.w] ?? R.all, L = R.lg ?? {}; return `<tr class="${S.n < 5 ? 'lo' : ''}"><td><b>${esc(g.ref)}</b></td><td>${hour(g.utc)} ${esc(T[g.h])} x ${esc(T[g.a])}</td><td class="r">${S.n}</td>
      <td class="r">${n1(S.fc)} <small class="mut">${n1(L.fc)}</small></td><td class="r">${n1(S.yc)} <small class="mut">${n1(L.yc)}</small></td>${td(S.o35, S.n)}${td(S.o45, S.n)}${td(S.o55, S.n)}${td(S.b1, S.n)}${td(S.b2, S.n)}<td class="r">${n1(S.cor)}</td></tr>`; }).join('')}</table></div>
    <p class="hint">Número cinza = média das mesmas ligas no mesmo período. Cor por faixa fixa (não é ranking); linha apagada = menos de 5 jogos na amostra. Amarelos somados dos jogadores (a API não separa o vermelho direto).${sem ? ` ${sem} jogo${sem > 1 ? 's' : ''} ainda sem árbitro.` : ''}</p>
    ${rows.map(({ g, R }) => `<details class="more"><summary>${esc(g.ref)} · últimos 5 jogos</summary>${refCard(R, RX, o.w)}</details>`).join('')}`;
}
