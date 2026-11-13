// Black House Futebol · app (PWA estático no GitHub Pages). Lê public/data/*.json gerados pela coleta.
import { MARKETS, playerOver, nbOver, ev } from './engine.js';

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
let D = null, ST = null;

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
    <div class="nums"><span>Chance <b>${pc(r.p)}</b></span>${r.e != null ? `<span>EV <b class="${r.e >= 0 ? 'pos' : 'neg'}">${pct(r.e)}</b></span>` : ''}<span>Projeção <b>${n1(Math.round(r.pj * 10) / 10)}</b></span>${r.hit ? `<span>${r.hit[0]}/${r.hit[1]} na linha</span>` : ''}</div>
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
    if (one) { if (seen.has(r.id)) return false; seen.add(r.id); }
    return true;
  }).slice(0, 150);
  $('#countHint').textContent = `${VIEW.length} entradas · só MAIS · ordem pela Nota BH${D.rows.some(r => r.d) ? '' : ' · nenhuma casa lida ainda: odds justas do modelo'}`;
  $('#list').innerHTML = VIEW.map(card).join('') || '<p class="hint">Nada com esses filtros.</p>';
}
function detail(r) {
  const k = D.ks?.[r.m] ?? MARKETS[r.m].k;
  let probAt;
  if (r.k === 'p') { const m = D.mdl.p[r.id]; const [s, b] = m.mu[r.m]; probAt = L => playerOver({ start: s, bench: b }, r.m, L, m.ps, m.pb, k); }
  else probAt = L => nbOver(r.pj, k, L);
  const lines = r.k === 'p' ? MARKETS[r.m].lines : [r.l - 2, r.l - 1, r.l, r.l + 1, r.l + 2].filter(x => x > 0);
  const others = r.k === 'p' ? D.rows.filter(x => x.id === r.id && x !== r) : [];
  $('#dlgBody').innerHTML = `<h2>${esc(r.n)}</h2><p class="meta">${esc(r.t)} x ${esc(r.o)} · ${hour(r.utc)} · ${esc(MARKETS[r.m].lb)}${r.k === 'p' ? ` · ${STL[r.st]?.[1] ?? ''}` : ''}</p>
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
    return `<div class="game"><div class="meta">${LG[g.lg]?.[0] ?? ''} ${LG[g.lg]?.[1] ?? ''} · ${hour(g.utc)}${g.ref ? ' · árbitro ' + esc(g.ref) : ''}</div><h3>${esc(g.h)} x ${esc(g.a)}</h3>
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
function route() {
  const v = (location.hash || '#entradas').slice(1);
  for (const s of document.querySelectorAll('.view')) s.hidden = s.id !== 'v-' + v;
  for (const a of document.querySelectorAll('.tabs a')) a.classList.toggle('on', a.getAttribute('href') === '#' + v);
  if (v === 'estrategias') renderStrategies(); if (v === 'guia') renderGuide();
}
async function main() {
  [D, ST] = await Promise.all([get('bot.json'), get('strategies.json')]);
  if (!D) { $('#list').innerHTML = '<p class="hint">Dados ainda não publicados.</p>'; $('#dataPill').textContent = 'sem dados'; return; }
  $('#dataPill').textContent = (D.demo ? 'DEMONSTRAÇÃO · ' : '') + 'atualizado ' + new Date(D.gen).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  if (D.demo) $('#dataPill').classList.add('demo');
  $('#fLg').innerHTML += [...new Set(D.games.map(g => g.lg))].map(l => `<option value="${l}">${LG[l]?.[1] ?? l}</option>`).join('');
  $('#fMk').innerHTML += Object.entries(MARKETS).map(([k, v]) => `<option value="${k}">${v.lb}</option>`).join('');
  $('#fGame').innerHTML += D.games.map(g => `<option value="${g.id}">${hour(g.utc)} ${esc(g.h)} x ${esc(g.a)}</option>`).join('');
  for (const id of ['#q', '#fLg', '#fMk', '#fGame', '#fOdd', '#fOne']) $(id).addEventListener('input', renderList);
  $('#list').addEventListener('click', e => { const b = e.target.closest('.card'); if (b) detail(VIEW[+b.dataset.i]); });
  renderList(); renderGames();
  addEventListener('hashchange', route); route();
}
main();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => null);
