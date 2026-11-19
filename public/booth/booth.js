import { api, toast, ensureLogin, loadImg, composePrint, toJpeg, printBlob, esc } from '/js/common.js';
import { drawQR } from '/js/qr.js';

const $ = (s) => document.querySelector(s);
let EVENT = new URLSearchParams(location.search).get('event') || '';
try { if (EVENT) localStorage.setItem('tb-booth-event', EVENT); else EVENT = localStorage.getItem('tb-booth-event') || ''; } catch { /* private mode */ }
let ev = null, frame = null, stream = null, photo = null, style = '', cur = null, wakeLock = null, idle = null, run = 0;

const show = (id) => { document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== id)); armIdle(id); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function keepAwake() { try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => (wakeLock = null)); } } catch { /* not supported */ } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });

// back to the start screen when nobody touches the booth for a while (never while the caricature is being made)
function armIdle(id) {
  clearTimeout(idle); if (!ev || id === 'home' || id === 'making') return;
  idle = setTimeout(() => goHome(), (ev.resetSec || 25) * 1000 * (id === 'result' ? 2 : 1));
}
['pointerdown', 'keydown', 'input'].forEach((t) => document.addEventListener(t, () => { const s = document.querySelector('.screen:not(.hidden)'); if (s) armIdle(s.id); }, true));

const onStyles = () => (ev.styles || []).filter((s) => s.on !== false);
async function loadEvent() {
  ev = await api('/events/' + EVENT);
  const b = document.body.style, c = ev.colors || {};
  b.setProperty('--bg', c.bg); b.setProperty('--accent', c.accent); b.setProperty('--text', c.text);
  b.backgroundImage = ev.hasBg ? `url(/api/files/bg/${ev.id}?v=${ev.filesV || 0})` : '';
  $('#logo').classList.toggle('hidden', !ev.hasLogo); if (ev.hasLogo) $('#logo').src = `/api/files/logo/${ev.id}?v=${ev.filesV || 0}`;
  $('#title').textContent = ev.boothTitle || ''; $('#tagline').textContent = ev.tagline || ''; $('#go').textContent = ev.startBtn || 'Start';
  $('#styleGrid').innerHTML = onStyles().map((s) => `<button class="style-card" data-s="${esc(s.id)}">${s.hasSample ? `<img src="/api/files/sample/${ev.id}/${esc(s.id)}?v=${ev.filesV || 0}" alt="">` : '<div class="ph"><img src="/img/pencil.png" alt=""></div>'}<span>${esc(s.name)}</span></button>`).join('');
  $('#styleGrid').querySelectorAll('[data-s]').forEach((el) => { el.onclick = () => { style = el.dataset.s; openCamera(); }; });
  frame = ev.print && ev.print.hasFrame ? await loadImg(`/api/files/frame/${ev.id}?v=${ev.filesV || 0}`) : null;
  document.title = ev.name + ' · Caricature Booth';
}

// ---------- camera ----------
async function openCamera() {
  show('camera'); keepAwake();
  if (stream) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    $('#video').srcObject = stream;
  } catch (e) { toast('Camera not available: ' + e.message, true); show('home'); }
}
function stopCamera() { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } }
async function snap() {
  $('#snap').disabled = true; const c = $('#count'); c.classList.remove('hidden');
  for (let n = ev.countdown ?? 3; n > 0; n--) { c.textContent = n; await sleep(900); }
  c.textContent = ''; c.classList.add('hidden');
  const v = $('#video'), fl = $('#flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
  // crop the middle of the camera to 2:3 portrait (what the guest saw on screen), mirrored like a mirror
  const vw = v.videoWidth, vh = v.videoHeight, ch = vh, cw = Math.min(vw, Math.round(vh * 2 / 3)), sx = (vw - cw) / 2;
  const s = Math.min(1, 1600 / ch), cv = document.createElement('canvas'); cv.width = Math.round(cw * s); cv.height = Math.round(ch * s);
  const g = cv.getContext('2d'); g.translate(cv.width, 0); g.scale(-1, 1); g.drawImage(v, sx, 0, cw, ch, 0, 0, cv.width, cv.height);
  photo = await toJpeg(cv, 0.9); $('#snap').disabled = false;
  $('#shot').src = URL.createObjectURL(photo); show('review');
}

// ---------- making the caricature: the pencil scribbling across the page is the timer ----------
// cursive loops like the pencil artwork: small, small, tall, then a flat stretch, repeated across the page
function squigglePath() {
  const Y = 128; let x = 130, d = `M ${x} ${Y}`;   // starts in from the left so the whole pencil stays on the page
  const loop = (h) => { d += ` C ${x + 0.55 * h} ${Y} ${x + 0.75 * h} ${Y - h} ${x + 0.38 * h} ${Y - h} C ${x + 0.02 * h} ${Y - h} ${x + 0.12 * h} ${Y} ${x + 0.8 * h} ${Y}`; x += 0.8 * h; };
  const flat = (w) => { d += ` C ${x + w * 0.3} ${Y + 6} ${x + w * 0.7} ${Y - 6} ${x + w} ${Y}`; x += w; };
  while (x < 860) { flat(40); loop(44); loop(44); flat(30); loop(110); flat(55); }
  d += ` C ${x + 40} ${Y + 10} ${x + 80} ${Y - 14} ${Math.min(995, x + 110)} ${Y - 4}`;
  return d;
}
const PTIP = [662.5 / 697, 1193.75 / 1202];   // where the pencil tip sits in pencil.png
let target = 0, shown = 0, raf = 0, progTimer = null, pathLen = 0;
function drawFrame() {
  shown += (target - shown) * 0.06;
  const path = $('#sqPath'), svg = $('#sq'), pen = $('#pencil');
  if (pathLen) {
    path.style.strokeDashoffset = String(pathLen * (1 - shown));
    const pt = path.getPointAtLength(pathLen * shown), k = svg.getBoundingClientRect().width / 1000, pw = pen.offsetWidth, ph = pw * 1202 / 697;
    pen.style.left = (pt.x * k - PTIP[0] * pw) + 'px'; pen.style.top = (pt.y * k - PTIP[1] * ph) + 'px';
  }
  raf = requestAnimationFrame(drawFrame);
}
function sketching(on) {
  clearInterval(progTimer); cancelAnimationFrame(raf); if (!on) return;
  $('#mkTitle').textContent = ev.makingTitle || 'Magic happening'; $('#mkSub').textContent = ev.makingSub || 'Please wait, just a moment';
  $('#mkErrMsg').classList.add('hidden'); $('.paper').classList.remove('hidden');
  const path = $('#sqPath'); path.setAttribute('d', squigglePath()); pathLen = path.getTotalLength();
  path.style.strokeDasharray = String(pathLen); target = 0.01; shown = 0;
  const t0 = Date.now();
  // estimated progress: to about 85% over ~20 s, then it creeps (the AI takes a different time for each guest)
  progTimer = setInterval(() => { const sec = (Date.now() - t0) / 1000; target = Math.min(0.96, sec < 20 ? sec / 20 * 0.85 : 0.85 + (sec - 20) / 400); }, 300);
  drawFrame();
}
const finishLine = () => new Promise((r) => { clearInterval(progTimer); target = 1; const t = setInterval(() => { if (shown > 0.985) { clearInterval(t); setTimeout(r, 250); } }, 50); });
async function start() {
  $('#use').disabled = true; $('#mkErr').classList.add('hidden');
  try {
    const q = new URLSearchParams({ event: EVENT, style });
    const r = await api('/shots/start?' + q, { method: 'POST', body: photo });
    cur = { id: r.id }; stopCamera(); show('making'); sketching(true); wait(r.id);
  } catch (e) { toast(e.message, true); } finally { $('#use').disabled = false; }
}
async function wait(id) {
  const token = ++run, t0 = Date.now();
  while (token === run) {
    await sleep(1500);
    let m; try { m = await api('/shots/' + id); } catch { continue; }   // network blip: keep waiting
    if (token !== run) return;
    if (m.toon === 'ready') return finish(m);
    if (m.toon === 'error' || Date.now() - t0 > 150000) {
      sketching(false); $('.paper').classList.add('hidden'); $('#mkErrMsg').classList.remove('hidden');
      $('#mkErr').classList.remove('hidden'); return;
    }
  }
}
async function finish(m) {
  const toon = await loadImg(`/api/shots/${m.id}/toon`);
  await finishLine(); sketching(false);
  if (!toon) { toast('Could not load the caricature', true); $('#mkErr').classList.remove('hidden'); return; }
  const link = `${location.origin}/v/${m.id}`;
  $('#toon').src = `/api/shots/${m.id}/toon`;
  // result screen
  const em = ev.email || {}, vid = ev.video && ev.video.on, printing = ev.print && ev.print.on;
  $('#printMsg').classList.toggle('hidden', !printing);
  $('#ebox').classList.toggle('hidden', !(em.enabled && em.atBooth)); $('#ebox').reset(); $('#bsend').disabled = false; $('#bmsg').textContent = '';
  $('#eTitle').textContent = vid ? 'Get your animated video by email' : 'Get your caricature by email';
  $('#consentTxt').textContent = em.consent || 'I agree to receive this email.';
  $('#mkRow').classList.toggle('hidden', !em.marketing); $('#mkTxt').textContent = em.marketingText || '';
  $('#qrTxt').textContent = vid ? 'Or scan to watch it on your phone' : 'Or scan to save it on your phone';
  const q = $('#qr'); q.getContext('2d').clearRect(0, 0, q.width, q.height); drawQR(q.getContext('2d'), link, 0, 0, q.width);
  show('result');
  // print + thumbnail (in the background while the guest looks at their caricature)
  try {
    const th = composePrint({ print: { qr: false } }, toon, null, '', 480, 720);
    await api(`/shots/${m.id}/thumb`, { method: 'PUT', body: await toJpeg(th, 0.82) });
    if (printing) {
      const blob = await toJpeg(composePrint(ev, toon, frame, link), 0.93);
      await api(`/shots/${m.id}/print`, { method: 'PUT', body: blob });
      if (ev.print.from === 'booth') {
        for (let k = 0; k < (ev.print.copies || 1); k++) { await printBlob(blob, $('#printframe')); api(`/shots/${m.id}`, { method: 'PATCH', body: { printed: true, printedBy: 'booth' } }).catch(() => {}); }
      }
    }
  } catch (e) { toast('Print: ' + e.message, true); }
}
function goHome() { run++; sketching(false); stopCamera(); cur = null; clearTimeout(idle); show('home'); if (ev) loadEvent().catch(() => {}); }

// ---------- email at the booth ----------
$('#ebox').onsubmit = async (e) => {
  e.preventDefault(); const b = $('#bsend'); b.disabled = true; $('#bmsg').textContent = 'Saving…';
  try {
    const r = await fetch('/api/public/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: cur.id, email: $('#bemail').value.trim(), consent: $('#bok').checked, marketing: $('#bmk').checked }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not save');
    $('#ebox').reset();
    $('#bmsg').textContent = j.later ? '✓ Done! Your video lands in your inbox in a few minutes.' : '✓ Sent! Check your inbox.';
    setTimeout(() => { b.disabled = false; }, 1500);
  } catch (err) { $('#bmsg').textContent = err.message; b.disabled = false; }
};

// ---------- buttons ----------
$('#go').onclick = () => { style = (onStyles()[0] || {}).id || ''; if (ev.guestChoice && onStyles().length > 1) show('styles'); else openCamera(); };
$('#stBack').onclick = goHome;
$('#camBack').onclick = () => { stopCamera(); if (ev.guestChoice && onStyles().length > 1) show('styles'); else goHome(); };
$('#snap').onclick = snap;
$('#retake').onclick = openCamera;
$('#use').onclick = start;
$('#mkHome').onclick = goHome;
$('#mkRetry').onclick = async () => { $('#mkErr').classList.add('hidden'); try { await api(`/shots/${cur.id}/retry/toon`, { method: 'POST' }); sketching(true); wait(cur.id); } catch (e) { toast(e.message, true); $('#mkErr').classList.remove('hidden'); } };
$('#done').onclick = goHome;
$('#staff').onclick = (e) => { e.preventDefault(); if (confirm('Open the print station for staff?')) location.href = `/station/?event=${EVENT}`; };

(async () => {
  if (!EVENT) { $('#title').textContent = 'Open this booth from the event page in admin'; $('#go').classList.add('hidden'); return; }
  await ensureLogin('Staff sign-in for the booth');
  for (let i = 0; i < 3 && !ev; i++) {
    try { await loadEvent(); } catch (e) { if (i === 2) { $('#tagline').textContent = 'Could not load this event (' + e.message + '). Check the internet, then reload.'; } else await sleep(1500); }
  }
  keepAwake();
})();
window.addEventListener('tb-auth', () => ensureLogin('Staff sign-in for the booth'));
