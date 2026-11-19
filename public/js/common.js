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

// ---------- the 4x6 print (1200 x 1800, 300 dpi) ----------
export const PW = 1200, PH = 1800;
function cover(g, img, w, h) { const s = Math.max(w / img.width, h / img.height), dw = img.width * s, dh = img.height * s; g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh); }
// toon = the caricature, frame = optional transparent PNG overlay (1200x1800), qrUrl = guest page link (optional)
export function composePrint(ev, toon, frame, qrUrl, w = PW, h = PH) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), k = w / PW;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  if (toon) cover(g, toon, w, h);
  else { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#e8e3e6'); gr.addColorStop(1, '#cfc7cc'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#8a8288'; g.font = `700 ${60 * k}px Montserrat, Arial`; g.textAlign = 'center'; g.fillText('Caricature here', w / 2, h / 2); }
  if (frame) g.drawImage(frame, 0, 0, w, h);
  if (qrUrl && ev.print && ev.print.qr) {
    const box = 250 * k, pad = 22 * k, x = w - box - 44 * k, y = h - box - 70 * k;
    g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(x, y, box, box + 44 * k, 18 * k); g.fill();
    drawQR(g, qrUrl, x + pad, y + pad, box - pad * 2);
    g.fillStyle = '#121012'; g.font = `700 ${22 * k}px Montserrat, Arial`; g.textAlign = 'center'; g.fillText('Scan for your video', x + box / 2, y + box + 22 * k);
  }
  return c;
}

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
