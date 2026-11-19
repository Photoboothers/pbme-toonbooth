import { drawQR } from '/js/qr.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function toast(msg, bad = false) {
  const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), bad ? 6500 : 2600);
}
export async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: { ...(opts.headers || {}) }, credentials: 'same-origin' };
  if (opts.body !== undefined) {
    if (opts.body instanceof Blob || opts.body instanceof ArrayBuffer) init.body = opts.body;
    else { init.body = JSON.stringify(opts.body); init.headers['content-type'] = 'application/json'; }
  }
  const r = await fetch('/api' + path, init);
  if (r.status === 401 && !opts.allow401) { window.dispatchEvent(new CustomEvent('tb-auth')); throw new Error('Please sign in again.'); }
  const t = await r.text(); let j = {}; try { j = t ? JSON.parse(t) : {}; } catch { j = { error: t.slice(0, 300) }; }
  if (!r.ok) throw new Error(j.error || `Server error ${r.status}`);
  return j;
}
export function modal(html) {
  const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(bg); bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
  return { el: bg.firstChild, close: () => bg.remove() };
}
export async function ensureLogin(title = 'Sign in') {
  try { await api('/me', { allow401: true }); return; } catch { /* show form */ }
  await new Promise((resolve) => {
    const m = modal(`<h2>${esc(title)}</h2><form><input type="password" placeholder="Admin password" autocomplete="current-password"><p class="hint" style="color:var(--bad)"></p><button class="btn" style="margin-top:10px;width:100%">Sign in</button></form>`);
    m.el.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/login', { method: 'POST', body: { password: m.el.querySelector('input').value }, allow401: true }); m.close(); resolve(); }
      catch (err) { m.el.querySelector('.hint').textContent = err.message; }
    };
  });
}
export async function loadImg(url) { try { const r = await fetch(url, { cache: 'no-store', credentials: 'same-origin' }); if (!r.ok) return null; return await createImageBitmap(await r.blob()); } catch { return null; } }
export const toJpeg = (c, q = 0.92) => new Promise((r) => c.toBlob(r, 'image/jpeg', q));

// ---------- the 4x6 print (1200 x 1800 at 300 dpi; landscape styles are laid out 1800 x 1200, then turned for the printer) ----------
export const PW = 1200, PH = 1800;
function cover(g, img, w, h) { const s = Math.max(w / img.width, h / img.height), dw = img.width * s, dh = img.height * s; g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh); }
// toon = the caricature, frames = { p, l } transparent PNG overlays, qrUrl = guest page link, photo = the guest's original photo (small polaroid)
export function composePrint(ev, toon, frames, qrUrl, o = {}) {
  const land = o.landscape ?? !!(toon && toon.width > toon.height);
  const w = o.w || (land ? PH : PW), h = o.h || (land ? PW : PH), k = Math.min(w, h) / PW, p = ev.print || {};
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  const wn = (land ? p.winL : p.win) || { x: 0, y: 0, w: 100, h: 100 }, wx = wn.x / 100 * w, wy = wn.y / 100 * h, ww = wn.w / 100 * w, wh = wn.h / 100 * h;
  if (toon) { g.save(); g.translate(wx, wy); g.beginPath(); g.rect(0, 0, ww, wh); g.clip(); cover(g, toon, ww, wh); g.restore(); }
  else { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#e8e3e6'); gr.addColorStop(1, '#cfc7cc'); g.fillStyle = gr; g.fillRect(wx, wy, ww, wh); g.fillStyle = '#8a8288'; g.font = `700 ${60 * k}px Montserrat, Arial`; g.textAlign = 'center'; g.fillText('Your picture here', wx + ww / 2, wy + wh / 2); }
  const fr = frames && (land ? frames.l : frames.p); if (fr) g.drawImage(fr, 0, 0, w, h);
  if (p.inset && (o.photo || !toon)) {   // the original photo as a little tilted polaroid, bottom left
    const pw = 270 * k, ph = pw * 1.5, b = 14 * k, x = 50 * k, y = h - ph - b * 2 - 46 * k - 60 * k;
    g.save(); g.translate(x + pw / 2, y + ph / 2); g.rotate(-5 * Math.PI / 180); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 24 * k; g.shadowOffsetY = 8 * k;
    g.fillStyle = '#fff'; g.fillRect(-pw / 2 - b, -ph / 2 - b, pw + b * 2, ph + b * 2 + 46 * k); g.shadowColor = 'transparent';
    if (o.photo) { g.beginPath(); g.rect(-pw / 2, -ph / 2, pw, ph); g.clip(); const ph2 = o.photo, s2 = Math.max(pw / ph2.width, ph / ph2.height); g.drawImage(ph2, -ph2.width * s2 / 2, -ph2.height * s2 / 2, ph2.width * s2, ph2.height * s2); }
    else { g.fillStyle = '#d9d3d7'; g.fillRect(-pw / 2, -ph / 2, pw, ph); }
    g.restore();
  }
  if (qrUrl && p.qr) {
    const box = 250 * k, pad = 22 * k, x = w - box - 44 * k, y = h - box - 70 * k;
    g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(x, y, box, box + 44 * k, 18 * k); g.fill();
    drawQR(g, qrUrl, x + pad, y + pad, box - pad * 2);
    g.fillStyle = '#121012'; g.font = `700 ${22 * k}px Montserrat, Arial`; g.textAlign = 'center'; g.fillText('Scan for your video', x + box / 2, y + box + 22 * k);
  }
  return c;
}
// the printer always gets a portrait 1200 x 1800 page: landscape layouts are turned a quarter
export function forPrinter(c) {
  if (c.width <= c.height) return c;
  const r = document.createElement('canvas'); r.width = c.height; r.height = c.width; const g = r.getContext('2d');
  g.translate(r.width, 0); g.rotate(Math.PI / 2); g.drawImage(c, 0, 0); return r;
}
export function thumbOf(img, long = 720) { const s = long / Math.max(img.width, img.height), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c; }

// ---------- printing (Chrome started with --kiosk-printing prints straight to the default printer) ----------
let printChain = Promise.resolve();
export function printBlob(blob, frameEl) {
  printChain = printChain.then(() => new Promise((resolve) => {
    const fr = frameEl, url = URL.createObjectURL(blob);
    fr.onload = () => {
      const img = fr.contentDocument.querySelector('img');
      const go = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast('Print failed: ' + e.message, true); } setTimeout(() => { URL.revokeObjectURL(url); resolve(); }, 1500); };
      if (img.complete) go(); else img.onload = go;
    };
    // size:auto = the printer's own paper; the image covers the whole page (DNP 4x6 paper is slightly bigger than 4x6 in)
    fr.srcdoc = `<!doctype html><html><head><style>@page{size:auto;margin:0}html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#fff}img{position:fixed;top:0;left:0;width:100%;height:100%;display:block;object-fit:cover}</style></head><body><img src="${url}"></body></html>`;
  }));
  return printChain;
}
