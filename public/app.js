// Black House Futebol · app (PWA estático no GitHub Pages). Lê public/data/*.json gerados pela coleta.
import { MARKETS, playerOver, nbOver, ev } from './engine.js';
import { PRESETS, DEFAULT, HUNT_MK, preset, run as huntRun } from './hunter.js';

const FN = 'https://mccxlgtiulpknubdiyrz.supabase.co/functions/v1/';
const LG = { 39: ['🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Premier League'], 140: ['🇪🇸', 'La Liga'], 135: ['🇮🇹', 'Serie A'], 78: ['🇩🇪', 'Bundesliga'], 61: ['🇫🇷', 'Ligue 1'], 71: ['🇧🇷', 'Brasileirão'], 2: ['🏆', 'Champions'] };
const STL = { xi: ['xi', 'titular'], banco: ['banco', 'banco'], provavel: ['', 'provável'], duvida: ['duvida', 'dúvida'] };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n1 = x => (Number.isInteger(x) ? String(x) : x.toFixed(1)).replace('.', ',');
const n2 = x => x.toFixed(2).replace('.', ',');
const pc = x => Math.round(x * 100) + '%';
const pct = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(1).replace('.', ',') + '%';
const hour = iso => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const get = f => fetch('data/' + f + '?t=' + Math.floor(Date.now() / 60000)).then(r => r.ok ? r.json() : null).catch(() => null);
let D = null, ST = null, H = null;
const POSN = { G: 'goleiros', D: 'defensores', M: 'meio-campistas', F: 'atacantes' }, POS1 = { G: 'GOL', D: 'DEF', M: 'MEI', F: 'ATA' };
const rigor = f => f >= 1.07 ? 'rigoroso' : f <= 0.93 ? 'deixa jogar' : 'normal';
const refName = s => String(s).split(',')[0].trim();

function spark(r) {
  if (!r.sq?.length) return '';
  const vals = r.sq.slice(0, 10).reverse(), max = Math.max(r.l + 1, ...vals);
  const half = MARKETS[r.m]?.h1; // 1º tempo: a sequência é do jogo todo (não há dado por tempo)
  return `<div class="spark" title="Últimos ${vals.length} jogos (mais antigo → mais recente)${half ? ' · jogo todo' : ''}">${vals.map(v => `<i class="${v > r.l && !half ? 'hit' : ''}" style="height:${Math.max(6, v / max * 100)}%"><em>${v}</em></i>`).join('')}<span class="lnmark" style="bottom:${r.l / max * 100}%"></span></div>`;
}
function card(r, i) {
  const st = r.k === 'p' && r.st ? STL[r.st] : null;
  const who = r.k === 'p' ? `${esc(r.n)}` : r.k === 't' ? `${esc(r.n)} <small class="meta">time</small>` : `${esc(r.n)}`;
  const odd = r.d ? `<span class="odd">@${n2(r.d)} <small>${esc(r.b)}${r.of?.length > 1 ? ` +${r.of.length - 1}` : ''}</small></span>` : `<span class="odd"><small>justa</small> @${n2(1 / r.p)}</span>`;
  const g = r.gr === 'A+' ? 'ap' : r.gr === 'A' ? 'a' : '';
  return `<button class="card" data-i="${i}">
    <div class="who"><b>${who}</b><span class="grade ${g}">${r.gr} · ${r.nt}</span></div>
    <div class="meta">${LG[r.lg]?.[0] ?? ''} ${r.k === 'p' ? esc(r.t) + ' x ' + esc(r.o) : r.k === 't' ? 'x ' + esc(r.o) : 'jogo'} · ${hour(r.utc)}${st ? ` · <span class="chip ${st[0]}">${st[1]}${r.st === 'provavel' ? ' ' + pc(r.ps) : ''}</span>` : ''}${r.fase === 'escalacao' ? ' · escalação ✓' : ''}</div>
    <div class="bet"><span class="ln">MAIS DE ${n1(r.l)} <small>${esc(MARKETS[r.m].lb.toLowerCase())}</small></span>${odd}</div>
    <div class="nums"><span>Chance <b>${pc(r.p)}</b></span>${r.e != null ? `<span>EV <b class="${r.e >= 0 ? 'pos' : 'neg'}">${pct(r.e)}</b></span>` : ''}<span>Projeção <b>${n1(Math.round(r.pj * 10) / 10)}</b></span>${r.hit ? `<span>${r.hit[0]}/${r.hit[1]} na linha</span>` : ''}${r.sk >= 3 ? `<span class="chip hot">🔥 ${r.sk} seguidos</span>` : ''}</div>
    ${spark(r)}
  </button>`;
}
let VIEW = [];
function renderList() {
  const q = $('#q').value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const lg = $('#fLg').value, mk = $('#fMk').value, gid = $('#fGame').value, onlyOdd = $('#fOdd').checked, one = $('#fOne').checked;
  const now = Date.now(), seen = new Set();
  VIEW = D.rows.filter(r => {
    if (Date.parse(r.utc) < now - 5 * 6e4) return false;
    if (lg && String(r.lg) !== lg) return false; if (mk && r.m !== mk) return false; if (gid && String(r.g) !== gid) return false;
    if (onlyOdd && !r.d) return false;
    if (q && !(`${r.n} ${r.t} ${r.o}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q))) return false;
    return true;
  });
  const so = $('#fSort').value;
  if (so === 'e') VIEW.sort((a, b) => (b.e ?? -9) - (a.e ?? -9));
  else if (so === 'p') VIEW.sort((a, b) => b.p - a.p);
  else if (so === 'sk') VIEW.sort((a, b) => (b.sk ?? 0) - (a.sk ?? 0) || b.nt - a.nt);
  if (one) VIEW = VIEW.filter(r => !seen.has(r.id) && seen.add(r.id));
  VIEW = VIEW.slice(0, 150);
  const ORD = { nt: 'ordem pela Nota BH', e: 'ordem pelo EV', p: 'ordem pela chance', sk: 'ordem pela sequência (só informação: a sequência não entra na chance)' };
  $('#countHint').textContent = `${VIEW.length} entradas · só MAIS · ${ORD[so]}${D.rows.some(r => r.d) ? '' : ' · nenhuma casa lida ainda: odds justas do modelo'}`;
  $('#list').innerHTML = VIEW.map(card).join('') || '<p class="hint">Nada com esses filtros.</p>';
}
// números da temporada, mando, adversário e árbitro (card completo)
function facts(r) {
  const x = r.ex, F = [], st = MARKETS[r.m]?.st;
  if (x && !MARKETS[r.m]?.h1) {
    if (r.k === 'p') {
      if (x.sa != null && x.ns >= 2) F.push([n1(x.sa), `por jogo como titular na temporada (${x.ns})`]);
      if (x.p90 != null) F.push([n1(x.p90), 'por 90 minutos na temporada']);
      if (x.hm != null && x.nh >= 2) F.push([n1(x.hm), `em casa (${x.nh})${r.home ? ' · hoje' : ''}`]);
      if (x.aw != null && x.na >= 2) F.push([n1(x.aw), `fora (${x.na})${!r.home ? ' · hoje' : ''}`]);
      if (x.oa != null) F.push([n1(x.oa), `${st === 'fc' ? 'faltas que o ' + esc(r.o) + ' sofre' : st === 'fs' ? 'faltas que o ' + esc(r.o) + ' comete' : st === 'sv' ? 'chutes no gol que o ' + esc(r.o) + ' dá' : (st === 'sot' ? 'chutes no gol' : 'chutes') + ' que o ' + esc(r.o) + ' cede'} por jogo (últ. 10)`]);
      if (x.op != null && Math.abs(x.op - 1) >= 0.06 && POSN[r.pos]) F.push([pct(x.op - 1), `que o normal a ${POSN[r.pos]} contra o ${esc(r.o)} (só informação)`]);
    } else if (r.k === 't') {
      if (x.sa != null) F.push([n1(x.sa), `do ${esc(r.t)} por jogo (últ. 10)`]);
      if (x.oa != null) F.push([n1(x.oa), `que o ${esc(r.o)} cede por jogo (últ. 10)`]);
    }
  }
  const T = D.mdl.t[r.g], R = T?.ref ? D.refs?.[T.ref] : null;
  if (R && ['FC', 'FS', 'TFC', 'JFC'].includes(r.m)) F.push([n1(R.fpg), `faltas/jogo com ${esc(refName(T.ref))} (liga ${n1(R.lfpg)}) · ${n1(R.cpg)} cartões · ${rigor(R.f)}`]);
  return F.length ? `<div class="facts">${F.map(([b, t]) => `<div><b>${b}</b>${t}</div>`).join('')}</div>` : '';
}
function detail(r) {
  const k = D.ks?.[r.m] ?? MARKETS[r.m].k;
  let probAt;
  if (r.k === 'p') { const m = D.mdl.p[r.id]; const [s, b] = m.mu[r.m]; probAt = L => playerOver({ start: s, bench: b }, r.m, L, m.ps, m.pb, k); }
  else probAt = L => nbOver(r.pj, k, L);
  const lines = r.k === 'p' ? MARKETS[r.m].lines : [r.l - 2, r.l - 1, r.l, r.l + 1, r.l + 2].filter(x => x > 0);
  const others = r.k === 'p' ? D.rows.filter(x => x.id === r.id && x !== r) : [];
  $('#dlgBody').innerHTML = `<h2>${esc(r.n)}</h2><p class="meta">${esc(r.t)} x ${esc(r.o)} · ${hour(r.utc)} · ${esc(MARKETS[r.m].lb)}${r.k === 'p' ? ` · ${STL[r.st]?.[1] ?? ''}` : ''}</p>
    ${facts(r)}
    <table><tr><th>Linha</th><th class="r">Chance</th><th class="r">Odd justa</th></tr>${lines.map(L => { const p = probAt(L); return `<tr><td>Mais de ${n1(L)}</td><td class="r">${pc(p)}</td><td class="r">${p > 0 ? n2(1 / p) : '–'}</td></tr>`; }).join('')}</table>
    ${r.of?.length ? `<h2>Casas</h2><table>${r.of.map(([h, o]) => `<tr><td>${esc(h)}</td><td class="r">@${n2(o)}</td><td class="r">EV ${pct(ev(r.p, o))}</td></tr>`).join('')}</table>` : ''}
    <h2>Calcular</h2><div class="calc"><label>Linha <input id="cL" inputmode="decimal" value="${n1(r.l)}"></label><label>Odd <input id="cO" inputmode="decimal" placeholder="1,85"></label><output id="cOut"></output></div>
    ${others.length ? `<h2>Outros mercados dele hoje</h2><table>${others.map(x => `<tr><td>${esc(MARKETS[x.m].lb)}</td><td>+${n1(x.l)}</td><td class="r">${pc(x.p)}</td><td class="r">${x.d ? '@' + n2(x.d) : 'justa ' + n2(1 / x.p)}</td></tr>`).join('')}</table>` : ''}
    <p class="foot">Chance condicionada a ele entrar em campo (sem entrar, a casa costuma anular).</p>`;
  const calc = () => { const L = parseFloat($('#cL').value.replace(',', '.')), O = parseFloat($('#cO').value.replace(',', '.')); if (isNaN(L)) return; const p = probAt(L); $('#cOut').innerHTML = `${pc(p)} · justa ${n2(1 / Math.max(p, 1e-3))}${O > 1 ? ` · EV <span class="${ev(p, O) >= 0 ? 'pos' : 'neg'}">${pct(ev(p, O))}</span>` : ''}`; };
  $('#cL').oninput = $('#cO').oninput = calc; calc();
  $('#dlg').showModal();
}
function renderGames() {
  $('#games').innerHTML = D.games.map(g => {
    const rows = D.rows.filter(r => r.g === g.id && r.k !== 'p');
    const pj = D.mdl.t[g.id]?.pj;
    return `<div class="game"><div class="meta">${LG[g.lg]?.[0] ?? ''} ${LG[g.lg]?.[1] ?? ''} · ${hour(g.utc)}${g.ref ? ' · 🟨 ' + esc(refName(g.ref)) + (D.refs?.[g.ref] ? ` · ${n1(D.refs[g.ref].fpg)} faltas e ${n1(D.refs[g.ref].cpg)} cartões/jogo (${rigor(D.refs[g.ref].f)})` : '') : ''}</div><h3>${esc(g.h)} x ${esc(g.a)}</h3>
      ${pj ? `<table><tr><th>Projeção</th><th class="r">${esc(g.h)}</th><th class="r">${esc(g.a)}</th></tr>${[['sh', 'Chutes'], ['sot', 'Chutes ao gol'], ['fc', 'Faltas'], ['poss', 'Posse %']].map(([k, lb]) => `<tr><td>${lb}</td><td class="r">${n1(Math.round(pj.h[k] * 10) / 10)}</td><td class="r">${n1(Math.round(pj.a[k] * 10) / 10)}</td></tr>`).join('')}</table>` : '<p class="hint">Jogo encerrado ou sem projeção.</p>'}
      <p class="meta">${g.fase === 'escalacao' ? '✅ escalação oficial' : '🕐 antes da escalação'} · ${rows.filter(r => r.d).length} linhas de time com odd de casa</p></div>`;
  }).join('') || '<p class="hint">Sem jogos das ligas do projeto hoje.</p>';
}
async function renderStrategies() {
  const MK = Object.fromEntries(Object.entries(MARKETS).map(([k, v]) => [k, v.lb]));
  $('#picks').innerHTML = ST?.picks?.length ? `<table><tr><th>Estratégia</th><th>Alvo</th><th>Mercado</th><th class="r">Linha</th><th class="r">Odd</th><th>Casa</th><th class="r">Chance</th><th class="r">EV</th><th class="r">Hora</th></tr>${ST.picks.map(p => `<tr><td>${esc(p.strategy_id)}</td><td>${esc(p.name)}</td><td>${esc(MK[p.mk])}</td><td class="r">+${n1(p.line)}</td><td class="r">${n2(p.odd)}</td><td>${esc(p.odd_src)}</td><td class="r">${pc(p.p)}</td><td class="r ${p.edge >= 0 ? 'pos' : 'neg'}">${pct(p.edge)}</td><td class="r">${hour(p.tip_utc)}</td></tr>`).join('')}</table>` : '<p class="hint">Sem entradas hoje (as estratégias só entram com linha e odd de casa).</p>';
  const s = await fetch(FN + 'estrategias?stats=1').then(r => r.ok ? r.json() : null).catch(() => null);
  $('#stats').innerHTML = Array.isArray(s) && s.length ? `<table><tr><th>Estratégia</th><th class="r">Entradas</th><th class="r">Green</th><th class="r">Lucro</th><th class="r">ROI</th><th class="r">CLV odd</th><th class="r">EV médio</th><th class="r">Abertas</th></tr>${s.map(x => `<tr><td>${esc(x.name)}</td><td class="r">${x.n}</td><td class="r">${x.g}</td><td class="r ${x.lucro >= 0 ? 'pos' : 'neg'}">${x.lucro == null ? '–' : (x.lucro >= 0 ? '+' : '') + n2(+x.lucro) + 'u'}</td><td class="r">${x.roi == null ? '–' : pct(+x.roi)}</td><td class="r">${x.clv_odd_media == null ? '–' : pct(+x.clv_odd_media)}</td><td class="r">${x.edge_medio == null ? '–' : pct(+x.edge_medio)}</td><td class="r">${x.abertas}</td></tr>`).join('')}</table>` : '<p class="hint">Ainda sem entradas conferidas.</p>';
}
async function renderGuide() {
  $('#houses').innerHTML = D.houses?.length ? `<table>${D.houses.map(h => `<tr><td>${esc(h.house)}</td><td class="r">${h.n} linhas</td><td class="r">${new Date(h.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td></tr>`).join('')}</table>` : '<p class="hint">Nenhuma casa lida nas últimas 18 horas.</p>';
  const c = await get('calib.json');
  if (c?.mercados) $('#calib').innerHTML = `<div class="tablewrap"><table><tr><th>Mercado</th><th class="r">Amostra</th><th class="r">Chance prevista</th><th class="r">Acerto real</th><th class="r">Brier</th><th class="r">Média prevista/real</th></tr>${Object.entries(c.mercados).map(([k, x]) => `<tr><td>${esc(MARKETS[k]?.lb ?? k)}</td><td class="r">${x.n}</td><td class="r">${pc(x.previsto)}</td><td class="r">${pc(x.acertado)}</td><td class="r">${x.brier}</td><td class="r">${x.media_prevista} / ${x.media_real}</td></tr>`).join('')}</table></div><p class="hint">Validação semana a semana: o modelo só enxerga os jogos anteriores. Gerada em ${new Date(c.gen).toLocaleDateString('pt-BR')}.</p>`;
}
// ---------- Caçador ----------
let HF = { ...DEFAULT }, HP = '', HVIEW = [];
function hForm() {
  $('#hMk').value = HF.mk; hLines(); $('#hL').value = String(HF.l); $('#hW').value = String(HF.w);
  $('#hPct').value = HF.pct; $('#hPctO').textContent = HF.pct + '%';
  for (const c of document.querySelectorAll('#hPos input')) c.checked = HF.pos.includes(c.value);
  $('#hVenue').value = HF.venue; $('#hTit').value = HF.tit ? String(HF.mmin) : '1'; $('#hOdd').value = HF.odd ? n2(HF.odd) : '';
  $('#hGap').value = String(HF.gap); $('#hLiga').checked = HF.liga; $('#hConf').checked = HF.conf;
  for (const b of document.querySelectorAll('.preset')) b.classList.toggle('on', b.dataset.k === HP);
}
function hLines() { const L = MARKETS[$('#hMk').value].lines; $('#hL').innerHTML = L.map(l => `<option value="${l}">Mais de ${n1(l)}</option>`).join(''); }
function hRead() {
  const t = +$('#hTit').value, o = parseFloat($('#hOdd').value.replace(',', '.'));
  HF = { mk: $('#hMk').value, l: +$('#hL').value, w: +$('#hW').value, pct: +$('#hPct').value, pos: [...document.querySelectorAll('#hPos input:checked')].map(c => c.value),
    venue: $('#hVenue').value, tit: t > 1, mmin: t, odd: o > 1 ? o : 0, conf: $('#hConf').checked, liga: $('#hLiga').checked, gap: +$('#hGap').value };
  $('#hPctO').textContent = HF.pct + '%';
}
function dots(vals, l) { return `<div class="dots" title="Mais recente à esquerda">${vals.map(v => `<i class="${v > l ? 'hit' : ''}" title="${v}"></i>`).join('')}</div>`; }
async function renderHunt() {
  if (!H) { $('#hHint').textContent = 'Carregando o histórico dos jogadores…'; H = await get('hunt.json'); }
  if (!H) { $('#hHint').textContent = 'O histórico do caçador ainda não foi publicado.'; return; }
  HVIEW = huntRun(D, H, HF);
  const P = PRESETS[HP];
  $('#hHint').textContent = `${HVIEW.length} jogador${HVIEW.length === 1 ? '' : 'es'} · mais de ${n1(HF.l)} ${MARKETS[HF.mk].lb.toLowerCase()} em ${HF.pct}%+ dos últimos ${HF.w}${HF.tit ? ` como titular (${HF.mmin}+ min)` : ''}${P ? ' · ' + P.why : ''}`;
  $('#hList').innerHTML = HVIEW.map((x, i) => `<button class="card" data-i="${i}">
    <div class="who"><b>${esc(x.m.n)}</b><span class="grade ${x.e != null && x.e >= .05 ? 'ap' : x.p >= .6 ? 'a' : ''}">${x.hit}/${x.n}</span></div>
    <div class="meta">${LG[x.m.lg]?.[0] ?? ''} ${esc(x.m.tn)} · ${POS1[x.m.pos] ?? x.m.pos} · ${x.m.home ? 'x' : '@'} ${esc(x.m.on)} · ${hour(x.m.utc)}${x.m.st === 'xi' ? ' · <span class="chip xi">titular</span>' : ` · <span class="chip">provável ${pc(x.m.ps)}</span>`}</div>
    <div class="bet"><span class="ln">MAIS DE ${n1(HF.l)} <small>${esc(MARKETS[HF.mk].lb.toLowerCase())}</small></span>${x.house ? `<span class="odd">@${n2(x.odd)} <small>${esc(x.house)}</small></span>` : `<span class="odd"><small>justa</small> @${n2(x.odd)}</span>`}</div>
    <div class="nums"><span>Modelo <b>${pc(x.p)}</b>${x.hit / x.n - x.p >= .2 ? ' ⚠️' : ''}</span>${x.e != null ? `<span>EV <b class="${x.e >= 0 ? 'pos' : 'neg'}">${pct(x.e)}</b></span>` : ''}<span>Histórico <b>${pc(x.hit / x.n)}</b></span>${x.sk >= 3 ? `<span class="chip hot">🔥 ${x.sk} seguidos</span>` : ''}</div>
    ${dots(x.vals, HF.l)}
  </button>`).join('') || '<p class="hint">Ninguém passou no filtro hoje. Afrouxe o acerto mínimo, a janela ou a odd.</p>';
}
function initHunt() {
  $('#hPresets').innerHTML = Object.entries(PRESETS).map(([k, P]) => `<button class="preset" data-k="${k}" title="${esc(P.why)}">${P.ic} ${esc(P.name)}</button>`).join('');
  $('#hMk').innerHTML = HUNT_MK.map(k => `<option value="${k}">${MARKETS[k].lb}</option>`).join('');
  $('#hPresets').addEventListener('click', e => { const b = e.target.closest('.preset'); if (!b) return; HP = b.dataset.k; HF = preset(HP); hForm(); renderHunt(); });
  $('#hMk').addEventListener('change', () => { hLines(); });
  $('.hunt').addEventListener('input', () => { hRead(); HP = ''; for (const b of document.querySelectorAll('.preset')) b.classList.remove('on'); renderHunt(); });
  $('#hList').addEventListener('click', e => { const b = e.target.closest('.card'); if (!b) return; const x = HVIEW[+b.dataset.i];
    const r = D.rows.find(r => r.id === x.pid && r.m === HF.mk && r.l === HF.l) ?? D.rows.find(r => r.id === x.pid && r.m === HF.mk);
    if (r) detail(r.l === HF.l ? r : { ...r, l: HF.l, p: x.p, d: x.house ? x.odd : null, b: x.house, e: x.e }); });
  HP = 'classico'; HF = preset(HP); hForm();
}
function route() {
  const v = (location.hash || '#entradas').slice(1);
  for (const s of document.querySelectorAll('.view')) s.hidden = s.id !== 'v-' + v;
  for (const a of document.querySelectorAll('.tabs a')) a.classList.toggle('on', a.getAttribute('href') === '#' + v);
  if (v === 'estrategias') renderStrategies(); if (v === 'guia') renderGuide(); if (v === 'cacador') renderHunt();
}
async function main() {
  [D, ST] = await Promise.all([get('bot.json'), get('strategies.json')]);
  if (!D) { $('#list').innerHTML = '<p class="hint">Dados ainda não publicados.</p>'; $('#dataPill').textContent = 'sem dados'; return; }
  $('#dataPill').textContent = (D.demo ? 'DEMONSTRAÇÃO · ' : '') + 'atualizado ' + new Date(D.gen).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  if (D.demo) $('#dataPill').classList.add('demo');
  $('#fLg').innerHTML += [...new Set(D.games.map(g => g.lg))].map(l => `<option value="${l}">${LG[l]?.[1] ?? l}</option>`).join('');
  $('#fMk').innerHTML += Object.entries(MARKETS).map(([k, v]) => `<option value="${k}">${v.lb}</option>`).join('');
  $('#fGame').innerHTML += D.games.map(g => `<option value="${g.id}">${hour(g.utc)} ${esc(g.h)} x ${esc(g.a)}</option>`).join('');
  for (const id of ['#q', '#fLg', '#fMk', '#fGame', '#fOdd', '#fOne', '#fSort']) $(id).addEventListener('input', renderList);
  initHunt();
  $('#list').addEventListener('click', e => { const b = e.target.closest('.card'); if (b) detail(VIEW[+b.dataset.i]); });
  renderList(); renderGames();
  addEventListener('hashchange', route); route();
}
main();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => null);
