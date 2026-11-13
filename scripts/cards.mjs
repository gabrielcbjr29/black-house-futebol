// Cards em imagem para o bot do Telegram (public/data/cards/<id>-<mercado>-<linha>.jpg), no mesmo visual dos cards da NBA.
// Lê o bot.json que a coleta gerou e renderiza as linhas marcadas com cd=1 num Chromium (Playwright).
// Uso: node scripts/cards.mjs [pasta-public]   (no GitHub roda no job "publicar")
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MK = { SH: 'chutes', SOT: 'chutes ao gol', SH1: 'chutes no 1º tempo', SOT1: 'chutes ao gol no 1º tempo', FC: 'faltas cometidas', FS: 'faltas sofridas', TK: 'desarmes', SV: 'defesas' };
const LG = { 39: 'PREMIER LEAGUE', 140: 'LA LIGA', 135: 'SERIE A', 78: 'BUNDESLIGA', 61: 'LIGUE 1', 71: 'BRASILEIRÃO', 2: 'CHAMPIONS' };
const POS = { G: 'Goleiro', D: 'Defensor', M: 'Meio-campista', F: 'Atacante' };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n1 = x => (Number.isInteger(x) ? String(x) : (Math.round(x * 10) / 10).toFixed(1)).replace('.', ',');
const n2 = x => x.toFixed(2).replace('.', ',');
const pct = x => Math.round(x * 100) + '%';
const hit = h => h?.[1] ? `${h[0]}/${h[1]}` : '–';
const font = f => readFileSync(join(ROOT, 'fonts', f)).toString('base64');
const hourBR = iso => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
export const cardKey = r => `${r.id}-${r.m}-${String(r.l).replace('.', '_')}`;
// escudo genérico: iniciais do time sobre uma cor derivada do nome (sem escudos oficiais)
const initials = t => { const w = String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(x => x.length > 2 && !/^(FC|CF|AFC|SC|AC|SSC|Club|Real|Clube)$/i.test(x)); return (w.length >= 2 ? w[0][0] + w[1][0] + (w[2]?.[0] ?? '') : (w[0] ?? t).slice(0, 3)).toUpperCase(); };
const hue = t => { let h = 0; for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

const css = () => `
@font-face { font-family: BS; src: url(data:font/woff2;base64,${font('bigshoulders.woff2')}) format('woff2'); font-weight: 100 900; }
@font-face { font-family: MR; src: url(data:font/woff2;base64,${font('manrope.woff2')}) format('woff2'); font-weight: 200 800; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: 1080px; height: 1350px; background: #000; color: #F2F5F2; font-family: MR, sans-serif; }
.c { position: relative; width: 1080px; height: 1350px; padding: 56px 60px 44px; overflow: hidden;
  background: radial-gradient(900px 620px at 85% -8%, rgba(45,180,110,.30), transparent 62%), radial-gradient(700px 500px at -10% 105%, rgba(255,201,51,.10), transparent 60%), linear-gradient(180deg, #070A08, #020302); display: flex; flex-direction: column; }
.c::after { content: ''; position: absolute; inset: 18px; border: 2px solid rgba(255,255,255,.06); border-radius: 36px; pointer-events: none; }
.top { display: flex; align-items: center; justify-content: space-between; }
.brand { font-family: BS; font-weight: 900; font-size: 40px; letter-spacing: 2px; line-height: 1; }
.brand b { color: #2DB46E; font-weight: 900; }
.brand small { display: block; font-family: MR; font-weight: 700; font-size: 17px; letter-spacing: 4px; color: #8A968E; margin-top: 6px; }
.pill { font-family: MR; font-weight: 800; font-size: 20px; letter-spacing: 3px; padding: 12px 22px; border-radius: 99px; border: 2px solid #FFC933; color: #FFC933; }
.who { display: flex; align-items: center; gap: 28px; margin-top: 44px; }
.jer { flex: none; width: 128px; height: 138px; filter: drop-shadow(0 12px 24px rgba(0,0,0,.55)); }
.jer text { font-family: BS, sans-serif; }
.badge { flex: none; width: 132px; height: 132px; border-radius: 30px; display: grid; place-items: center; font-family: BS; font-weight: 900; font-size: 50px; color: #fff; letter-spacing: 1px; box-shadow: inset 0 0 0 3px rgba(255,255,255,.18), 0 12px 30px rgba(0,0,0,.5); }
.name { font-family: BS; font-weight: 800; font-size: 76px; line-height: .95; letter-spacing: .5px; }
.sub { margin-top: 10px; font-size: 26px; color: #A3AEA6; font-weight: 600; }
.grade { margin-left: auto; flex: none; display: grid; justify-items: center; gap: 6px; }
.grade .g { min-width: 110px; height: 92px; padding: 0 16px; border-radius: 22px; display: grid; place-items: center; font-family: BS; font-weight: 900; font-size: 64px; }
.g.gAp { background: #2DB46E; color: #00170B; } .g.gA { color: #2DB46E; box-shadow: inset 0 0 0 4px #2DB46E; } .g.gB { color: #E8ECE9; box-shadow: inset 0 0 0 3px #3A453E; }
.grade small { font-size: 18px; font-weight: 700; color: #8A968E; letter-spacing: 2px; }
.line { margin-top: 40px; display: flex; align-items: baseline; gap: 22px; flex-wrap: wrap; }
.side { font-family: MR; font-weight: 800; font-size: 26px; letter-spacing: 3px; padding: 10px 18px; border-radius: 12px; align-self: center; }
.side.o { background: #2DB46E; color: #00170B; } .side.u { background: #FFC933; color: #1D1500; }
.ln { font-family: BS; font-weight: 900; font-size: 112px; line-height: .9; }
.mk { font-family: BS; font-weight: 700; font-size: 54px; color: #DDE3DE; }
.kpis { margin-top: 36px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.k { background: rgba(255,255,255,.045); border: 2px solid rgba(255,255,255,.07); border-radius: 22px; padding: 20px 22px; }
.k small { display: block; font-size: 19px; font-weight: 700; color: #8A968E; letter-spacing: 1px; }
.k b { display: block; margin-top: 6px; font-family: BS; font-weight: 800; font-size: 56px; line-height: 1; }
.k span { display: block; margin-top: 6px; font-size: 17px; color: #8A968E; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.k.hl b { color: #FFC933; } .k.gr b { color: #2DB46E; }
.chart { margin-top: 30px; background: rgba(255,255,255,.035); border: 2px solid rgba(255,255,255,.06); border-radius: 26px; padding: 22px 26px 14px; }
.chart h3 { font-size: 21px; font-weight: 700; color: #C9D1CB; display: flex; justify-content: space-between; }
.chart h3 b { color: #F2F5F2; }
.bars { position: relative; height: 236px; margin-top: 46px; display: grid; grid-template-columns: repeat(10, 1fr); gap: 14px; align-items: end; }
.bar { position: relative; border-radius: 10px 10px 4px 4px; min-height: 8px; }
.bar.y { background: linear-gradient(180deg, #45CF88, #1E8E54); } .bar.n { background: #2A322D; }
.bar i { position: absolute; top: -32px; left: 0; right: 0; text-align: center; font-style: normal; font-family: BS; font-weight: 800; font-size: 26px; color: #E8ECE9; }
.bar.n i { color: #7D8A81; }
.thr { position: absolute; left: -6px; right: -6px; border-top: 3px dashed #FFC933; opacity: .9; }
.chart h3 .lg { color: #FFC933; font-weight: 800; } .chart h3 .lg::before { content: ''; display: inline-block; width: 26px; border-top: 3px dashed #FFC933; vertical-align: middle; margin-right: 8px; }
.opp { display: grid; grid-template-columns: repeat(10, 1fr); gap: 14px; margin-top: 8px; text-align: center; font-size: 16px; font-weight: 700; color: #6F7C73; }
.hits { margin-top: 22px; display: flex; gap: 14px; }
.h { flex: 1; display: flex; align-items: baseline; justify-content: space-between; padding: 14px 20px; border-radius: 16px; background: rgba(255,255,255,.04); }
.h small { font-size: 19px; color: #8A968E; font-weight: 700; } .h b { font-family: BS; font-weight: 800; font-size: 36px; }
.def { margin-top: 18px; font-size: 22px; color: #A3AEA6; font-weight: 600; }
.def b { color: #F2F5F2; } .def .fav { color: #2DB46E; font-weight: 800; } .def .bad { color: #FF6A5C; font-weight: 800; }
.why { margin-top: 18px; display: grid; gap: 10px; }
.why div { display: grid; grid-template-columns: 34px 1fr; gap: 12px; align-items: start; font-size: 23px; line-height: 1.3; font-weight: 600; color: #DDE3DE; }
.why div::before { content: '✓'; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: rgba(45,180,110,.18); color: #2DB46E; font-weight: 900; font-size: 18px; }
.why div.n::before { content: '!'; background: rgba(255,201,51,.16); color: #FFC933; }
.foot { margin-top: auto; padding-top: 20px; display: flex; justify-content: space-between; font-size: 18px; color: #6F7C73; font-weight: 600; }
.badge { background: linear-gradient(160deg, hsl(var(--h) 55% 38%), hsl(var(--h) 60% 18%)); }
.note { margin-top: 10px; font-size: 17px; font-weight: 700; color: #6F7C73; text-align: right; }
.c .bars { height: 172px; margin-top: 40px; }
.c .sub + .sub { margin-top: 4px; font-size: 23px; }
`;

function ctxLine(r) {
  if (r.cx == null || Math.abs(r.cx - 1) < 0.03) return '';
  const d = Math.round((r.cx - 1) * 100), sg = (d > 0 ? '+' : '') + d + '%', st = { SH: 'sh', SH1: 'sh', SOT: 'sot', SOT1: 'sot', FC: 'fc', FS: 'fs', TK: 'tk' }[r.m];
  const tag = r.cx >= 1.05 ? ' · <span class="fav">favorável</span>' : r.cx <= 0.95 ? ' · <span class="bad">difícil</span>' : '';
  const t = st === 'sh' || st === 'sot' ? `${esc(r.o)} cede <b>${sg}</b> ${st === 'sh' ? 'chutes' : 'chutes no gol'} que a média`
    : st === 'fs' ? `${esc(r.o)} comete <b>${sg}</b> faltas que a média` : st === 'fc' ? `Jogo com <b>${sg}</b> faltas do time dele` : st === 'tk' ? `${esc(r.o)} deve ter <b>${sg}</b> de posse que o normal` : '';
  return t ? `<p class="def">${t}${tag}</p>` : '';
}
function whyList(r) {
  const y = [], n = [];
  if (r.hit && r.hit[1] >= 5 && r.hit[0] / r.hit[1] >= .7) y.push(`Bateu em ${r.hit[0]} dos últimos ${r.hit[1]} como titular`);
  if (r.st === 'xi') y.push('Titular confirmado na escalação oficial');
  if (r.e != null && r.e >= .05) y.push(`Valor na odd da casa (EV ${(r.e >= 0 ? '+' : '') + (r.e * 100).toFixed(1).replace('.', ',')}%)`);
  if (r.st === 'provavel') n.push('Escalação ainda não saiu: confira antes de entrar');
  if (r.st === 'duvida') n.push('Jogador em dúvida');
  return [...y.slice(0, n.length ? 1 : 2).map(t => `<div>${esc(t)}</div>`), ...n.slice(0, 1).map(t => `<div class="n">${esc(t)}</div>`)].join('');
}
export function cardHTML(r, date) {
  const vs = r.home ? `${r.t} x ${r.o}` : `${r.o} x ${r.t}`;
  const v = (r.sq || []).slice(0, 10).reverse(); // mais antigo à esquerda
  const max = Math.max(r.l * 1.35, ...v, 1);
  const bars = v.map(x => `<div class="bar ${x > r.l ? 'y' : 'n'}" style="height:${Math.max(3, x / max * 100)}%"><i>${n1(x)}</i></div>`).join('');
  const nHit = v.filter(x => x > r.l).length;
  const odd = r.d ? `<div class="k hl"><small>ODD</small><b>${n2(r.d)}</b><span>${esc(r.b)}</span></div>` : `<div class="k"><small>ODD JUSTA</small><b>${n2(1 / r.p)}</b><span>sem casa</span></div>`;
  const [, mm, dd] = date.split('-');
  const st = r.st === 'xi' ? '✅ Titular confirmado' : r.st === 'provavel' ? `🕐 Provável titular (${pct(r.ps ?? 0)})` : r.st === 'duvida' ? '🟡 Em dúvida' : '';
  const h1 = /1$/.test(r.m);
  const chart = h1 || !v.length
    ? `<div class="chart"><h3><span>${h1 ? '1º tempo: sem histórico por jogador' : 'Sem jogos como titular no histórico'}</span><span class="lg">linha ${n1(r.l)}</span></h3><p class="def">${h1 ? 'A chance usa a fatia de chutes do 1º tempo da liga sobre a média dele por 90 minutos.' : ''}</p></div>`
    : `<div class="chart"><h3><span>Últimos ${v.length} como titular · bateu <b>${nHit} de ${v.length}</b></span><span class="lg">linha ${n1(r.l)}</span></h3>
    <div class="bars">${bars}<div class="thr" style="bottom:${r.l / max * 100}%"></div></div>
    <div class="note">mais antigo → mais recente</div></div>`;
  return `<div class="c">
  <div class="top"><div class="brand">BLACK <b>HOUSE</b><small>PROPS FUTEBOL · ${dd}/${mm}</small></div><div class="pill">ENTRADA DO DIA</div></div>
  <div class="who"><div class="badge" style="--h:${hue(r.t)}">${esc(initials(r.t))}</div>
    <div><div class="name">${esc(r.n)}</div><div class="sub">${esc(POS[r.pos] || '')}${r.pos ? ' · ' : ''}${esc(r.t)}</div><div class="sub">${esc(vs)} · ${hourBR(r.utc)} · ${esc(LG[r.lg] || '')}</div>${st ? `<div class="sub">${st}</div>` : ''}</div>
    <div class="grade"><div class="g g${r.gr === 'A+' ? 'Ap' : r.gr}">${esc(r.gr)}</div><small>NOTA ${r.nt ?? '–'}</small></div></div>
  <div class="line"><span class="side o">MAIS DE</span><span class="ln">${n1(r.l)}</span><span class="mk">${esc(MK[r.m] || r.m)}</span></div>
  <div class="kpis">${odd}<div class="k gr"><small>CHANCE</small><b>${pct(r.p)}</b><span>modelo</span></div>
    <div class="k"><small>MODELO BH</small><b>${n1(Math.round(r.pj * 10) / 10)}</b><span>linha ${n1(r.l)}</span></div>
    <div class="k"><small>EV</small><b>${r.e == null ? '–' : (r.e >= 0 ? '+' : '') + (r.e * 100).toFixed(1).replace('.', ',') + '%'}</b><span>${r.e == null ? 'falta odd' : 'valor esperado'}</span></div></div>
  ${chart}
  <div class="hits"><div class="h"><small>L5</small><b>${hit(r.h5)}</b></div><div class="h"><small>L10</small><b>${hit(r.hit)}</b></div><div class="h"><small>Minutos</small><b>~${r.ms ?? '–'}</b></div></div>
  ${ctxLine(r)}
  ${whyList(r) ? `<div class="why">${whyList(r)}</div>` : ''}
  <div class="foot"><span>Análise de dados, não é garantia</span><span>🔞 18+ · Aposte com responsabilidade</span></div>
</div>`;
}

export async function renderCards(root = ROOT) {
  const bot = JSON.parse(readFileSync(join(root, 'data', 'bot.json'), 'utf8'));
  const rows = bot.rows.filter(r => r.cd);
  const out = join(root, 'data', 'cards');
  rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] } : {});
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css()}</style></head><body><div id="root"></div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const t0 = Date.now(), keys = [];
  for (const r of rows) {
    const key = cardKey(r);
    await page.evaluate(h => { document.getElementById('root').innerHTML = h; }, cardHTML(r, bot.date));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(out, key + '.jpg'), type: 'jpeg', quality: 80 });
    keys.push(key);
  }
  await browser.close();
  writeFileSync(join(out, 'index.json'), JSON.stringify({ date: bot.date, gen: bot.gen, n: rows.length, keys }));
  console.log(`cards: ${rows.length} imagens em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return rows.length;
}

if (import.meta.url === `file://${process.argv[1]}`) renderCards().catch(e => { console.error(e); process.exit(1); });
