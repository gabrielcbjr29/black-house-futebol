// ==UserScript==
// @name         Black House Futebol · leitor farra.bet
// @namespace    blackhouse-futebol
// @version      1.1
// @description  Com uma aba da farra.bet aberta no seu navegador, lê de 30 em 30 min as linhas de chutes, faltas cometidas, desarmes e defesas (jogador) e de chutes/chutes ao gol (time e jogo) das ligas do projeto e manda para o Black House Futebol.
// @match        https://farra.bet/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
// Roda dentro da página da farra.bet, no seu navegador: abre as mesmas páginas de liga e de jogo que você abriria
// (uma de cada vez, sem pressa) e lê os botões de odd. Nada de servidor, proxy ou cabeçalho falso.
(() => {
  const TOKEN = '__LINHAS_TOKEN__'; // troque pelo LINHAS_TOKEN (fica só no seu Tampermonkey, nunca no repositório)
  const POST = 'https://mccxlgtiulpknubdiyrz.supabase.co/functions/v1/linhas?token=';
  const HOUSE = 'farra', KEY = 'bh_fut_farra_ultimo', LOCK = 'bh_fut_farra_lock';
  // páginas de liga (código da farra → nome). A Champions aparece com dois códigos; o nome da liga no topo da página
  // do jogo confirma (outras ligas com nome parecido, como "Ligue 1" do Senegal, ficam de fora)
  const LIGAS = { soccer_brazil_campeonato: 'Brasileirão', soccer_epl: 'Premier League', soccer_spain_la_liga: 'La Liga', soccer_italy_serie_a: 'Serie A',
    soccer_germany_bundesliga: 'Bundesliga', soccer_france_ligue_one: 'Ligue 1', soccer_uefa_champs_league: 'Champions League', soccer_ls_32644: 'Champions League' };
  const CONFERE = { 'Champions League': /UEFA Champions League$/i };
  // mercados de jogador: "Nome — N ou mais …" vira MAIS de N−0,5
  const PLAYER = { 'Chutes do jogador': 'SH', 'Faltas cometidas pelo jogador (ou mais)': 'FC', 'Desarmes do jogador (N ou mais)': 'TK', 'Defesas do goleiro (N ou mais)': 'SV' };
  // time e jogo: "Mais de 16,5" e "Menos de 16,5"
  const TEAM = { 'Finalizações — casa (total)': ['TSH', 0], 'Finalizações — fora (total)': ['TSH', 1], 'Chutes a gol — casa (total)': ['TSOT', 0], 'Chutes a gol — fora (total)': ['TSOT', 1] };
  const MATCH = { 'Total de finalizações': 'JSH', 'Total de chutes a gol': 'JSOT' };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const hhmm = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const page = async url => { const r = await fetch(url, { credentials: 'same-origin' }); if (!r.ok) throw new Error(url.split('/').pop() + ' ' + r.status); return new DOMParser().parseFromString(await r.text(), 'text/html'); };
  // "Hoje 18:30", "Amanhã 16:00", "21/11 09:30" (horário de Brasília, UTC−3) → ISO
  function quando(txt) {
    const t = String(txt).replace(/\s+/g, ' '), hm = t.match(/(\d{1,2}):(\d{2})/); if (!hm) return null;
    const br = new Date(Date.now() - 3 * 3600e3); let y = br.getUTCFullYear(), mo = br.getUTCMonth() + 1, d = br.getUTCDate();
    const dm = t.match(/(\d{1,2})\/(\d{1,2})/);
    if (dm) { d = +dm[1]; mo = +dm[2]; if (mo < br.getUTCMonth() + 1 - 6) y++; }
    else if (/amanh/i.test(t)) { const x = new Date(Date.UTC(y, mo - 1, d + 1)); y = x.getUTCFullYear(); mo = x.getUTCMonth() + 1; d = x.getUTCDate(); }
    else if (!/hoje/i.test(t)) return null;
    return new Date(Date.UTC(y, mo - 1, d, +hm[1] + 3, +hm[2])).toISOString();
  }
  const num = s => +String(s).replace(',', '.');

  async function coletar(horas = 36) {
    const ligas = LIGAS;
    const now = Date.now(), jogos = new Map();
    for (const [k, lg] of Object.entries(ligas)) {
      try {
        const doc = await page('/esportes/odds?liga=' + k);
        for (const c of doc.querySelectorAll('article.sbl-card[data-sbl-jogo]')) {
          const utc = quando(c.querySelector('.sbl-quando')?.textContent ?? ''), id = c.dataset.sblJogo;
          if (!utc || Date.parse(utc) < now - 10 * 6e4 || Date.parse(utc) > now + horas * 3600e3) continue;
          jogos.set(id, { id, utc, league: lg });
        }
      } catch { /* liga sem página agora */ }
      await sleep(500);
    }
    const lines = [], erros = [];
    for (const j of jogos.values()) {
      try {
        const doc = await page('/esportes/odds/jogo/' + j.id);
        const btns = [...doc.querySelectorAll('button[data-odd][data-mercado]')];
        const ev = btns.find(b => b.dataset.evento)?.dataset.evento ?? '', [home, away] = ev.split(/\s+x\s+/);
        if (!home || !away) continue;
        const barra = doc.querySelector('.sbj-barra-liga')?.textContent.trim().replace(/\s+/g, ' ') ?? '';
        if (CONFERE[j.league] && !CONFERE[j.league].test(barra)) continue;
        const base = { home, away, utc: j.utc, league: j.league };
        for (const b of btns) {
          const m = b.dataset.mercado, odd = num(b.dataset.odd), rot = b.dataset.rotulo ?? '';
          if (!(odd > 1)) continue;
          if (PLAYER[m]) {
            const x = rot.match(/^(.*?)\s+—\s+(\d+)\s+ou mais/); if (!x) continue;
            const lado = b.closest('section[data-sbjj-time]')?.dataset.sbjjTime;
            lines.push({ ...base, type: 'player', player: x[1].trim(), team: lado === 'home' ? home : lado === 'away' ? away : undefined, mk: PLAYER[m], line: +x[2] - 0.5, odd });
          } else if (TEAM[m] || MATCH[m]) {
            const x = rot.match(/^(Mais|Menos) de\s+(\d+(?:[.,]\d+)?)/); if (!x) continue;
            const side = x[1] === 'Menos' ? 'u' : undefined;
            if (TEAM[m]) lines.push({ ...base, type: 'team', team: TEAM[m][1] ? away : home, mk: TEAM[m][0], line: num(x[2]), odd, side });
            else lines.push({ ...base, type: 'match', mk: MATCH[m], line: num(x[2]), odd, side });
          }
        }
      } catch (err) { erros.push(j.id + ': ' + err.message); }
      await sleep(700); // sem pressa: um jogo de cada vez
    }
    const key = x => [x.home, x.away, x.type, x.player ?? x.team ?? '', x.mk, x.line, x.side ?? 'o'].join('|'), u = new Map();
    for (const x of lines) u.set(key(x), x);
    return { house: HOUSE, jogos: jogos.size, lines: [...u.values()], erros };
  }

  const badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;font:12px/1.3 system-ui,sans-serif;background:#111;color:#9f9;padding:4px 8px;border-radius:6px;opacity:.85;pointer-events:none';
  const show = (txt, ok = true) => { badge.textContent = 'BH ⚽ ' + txt; badge.style.color = ok ? '#9f9' : '#f99'; if (!badge.isConnected) document.body.appendChild(badge); };
  async function ler() {
    if (Date.now() - (+localStorage.getItem(LOCK) || 0) < 5 * 60e3) return;
    localStorage.setItem(LOCK, String(Date.now()));
    show('lendo as linhas…');
    try {
      if (TOKEN.startsWith('__')) throw new Error('falta o LINHAS_TOKEN no script');
      const foto = await coletar();
      if (!foto.lines.length) { localStorage.setItem(KEY, String(Date.now())); show(`${hhmm(Date.now())} · ${foto.jogos} jogos, nenhuma linha aberta`); return; }
      const r = await fetch(POST + TOKEN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ house: HOUSE, lines: foto.lines }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('envio ' + r.status + (j.erro ? ' ' + j.erro : ''));
      localStorage.setItem(KEY, String(Date.now()));
      show(`${hhmm(Date.now())} · ${foto.jogos} jogos, ${j.linhas} linhas ✓`);
    } catch (err) {
      show(`${hhmm(Date.now())} · erro: ${err.message} (tento de novo em 10 min)`, false);
      localStorage.setItem(KEY, String(Date.now() - 20 * 60e3));
    } finally { localStorage.removeItem(LOCK); }
  }
  window.__bhColetarFarra = coletar; // para conferir à mão no console: await __bhColetarFarra()
  const last = () => +localStorage.getItem(KEY) || 0;
  const due = () => { const m = new Date().getMinutes(); return Date.now() - last() > 30 * 60e3 || ((m >= 5 && m < 20) || (m >= 35 && m < 50)) && Date.now() - last() > 25 * 60e3; };
  setTimeout(() => { if (Date.now() - last() > 25 * 60e3) ler(); else show(`última leitura ${hhmm(last())} ✓`); }, 8000);
  setInterval(() => { if (due()) ler(); }, 60e3);
})();
