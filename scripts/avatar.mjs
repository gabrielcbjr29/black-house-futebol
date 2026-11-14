// Avatar sem foto (direito de imagem): selo com as iniciais na cor do time. Usado no PDF e nos cards.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export const initials = s => String(s ?? '').replace(/[^\p{L}\s.-]/gu, ' ').split(/[\s.-]+/).filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('') || '?';
export function avatarSVG(r, bot, size = 24) {
  const name = r.k === 'j' ? r.t : r.k === 't' ? r.n : r.n, h = hue(r.t);
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="19" fill="hsl(${h} 55% 38%)"/><text x="20" y="25" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="15" fill="#fff">${esc(initials(name))}</text></svg>`;
}
