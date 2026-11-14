// Avatar sem foto de jogador (direito de imagem): camisa estilizada nas cores do clube, com o número da camisa e as
// iniciais. Cores e números vêm de bot.json (kits: { kit: { nomeDoTime: { p, n, b, gp, gn } }, num: { idJogador: número } }).
// Sem cor conhecida, usa um tom fixo derivado do nome do time. Usado no app, nos cards em imagem e no PDF.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export const initials = s => String(s ?? '').replace(/[^\p{L}\s.-]/gu, ' ').split(/[\s.-]+/).filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('') || '?';
const lum = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? ''); if (!m) return 0.3; const v = parseInt(m[1], 16); const c = [v >> 16, (v >> 8) & 255, v & 255].map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hslHex = h => { const s = 0.55, l = 0.36, k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); };

/* cores da camisa de um alvo: time do jogador (goleiro usa o uniforme de goleiro) */
export function kitOf(r, bot) {
  const team = r.k === 'p' ? r.t : r.k === 't' ? r.n : r.t;
  const k = bot?.kits?.kit?.[team];
  const gk = r.k === 'p' && r.pos === 'G';
  let p = (gk ? k?.gp : k?.p) ?? hslHex(hue(team)), n = (gk ? k?.gn : k?.n) ?? null, b = k?.b ?? null;
  if (!n || contrast(n, p) < 2.2) n = lum(p) > 0.4 ? '#111111' : '#ffffff';
  if (!b || contrast(b, p) < 1.3) b = lum(p) > 0.4 ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.35)';
  return { p, n, b, team };
}
/* SVG da camisa: número grande no peito, iniciais em cima (ou só as iniciais quando não há número) */
export function avatarSVG(r, bot, size = 24) {
  const { p, n, b } = kitOf(r, bot);
  const num = r.k === 'p' ? bot?.kits?.num?.[r.id] : null;
  const ini = r.k === 'j' ? 'J' : initials(r.k === 'p' ? r.n : r.n);
  const big = num != null ? String(num) : ini, fs = big.length >= 3 ? 12 : big.length === 2 ? 15 : 17;
  const small = num != null && size >= 36 ? `<text x="24" y="17.5" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="5.6" fill="${n}" opacity=".9">${esc(ini)}</text>` : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(ini)}${num != null ? ' ' + num : ''}">`
    + `<path d="M15 5 L20.5 3.2 Q24 7.5 27.5 3.2 L33 5 L44.5 13.5 L39.5 21.5 L35.5 18.8 L35.5 44.5 L12.5 44.5 L12.5 18.8 L8.5 21.5 L3.5 13.5 Z" fill="${p}" stroke="${b}" stroke-width="1.6" stroke-linejoin="round"/>`
    + `<path d="M20.5 3.2 Q24 7.5 27.5 3.2" fill="none" stroke="${b}" stroke-width="1.6"/>`
    + small
    + `<text x="24" y="${num != null && size >= 36 ? 33 : 31}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${fs}" fill="${n}">${esc(big)}</text></svg>`;
}
