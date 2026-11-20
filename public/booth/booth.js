import { api, toast, modal, ensureLogin, loadImg, composePrint, forPrinter, thumbOf, toJpeg, printBlob, esc } from '/js/common.js';
import { drawQR } from '/js/qr.js';
import { saveJob, delJob, allJobs, newId, tfetch, net, checkNet } from '/js/queue.js';

const $ = (s) => document.querySelector(s);
let EVENT = new URLSearchParams(location.search).get('event') || '';
try { if (EVENT) localStorage.setItem('tb-booth-event', EVENT); else EVENT = localStorage.getItem('tb-booth-event') || ''; } catch { /* private mode */ }
let ev = null, frames = {}, stream = null, photo = null, style = '', cur = null, wakeLock = null, idle = null, run = 0;

const show = (id) => { document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== id)); armIdle(id); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function keepAwake() { try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => (wakeLock = null)); } } catch { /* not supported */ } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });

// back to the start screen when nobody touches the booth for a while (never while the caricature is being made)
function armIdle(id) {
  clearTimeout(idle); if (!ev || id === 'home' || id === 'making' || (id === 'modes' && startsOnModes())) return;
  idle = setTimeout(() => goHome(), (ev.resetSec || 25) * 1000 * (id === 'result' ? 2 : 1));
}
['pointerdown', 'keydown', 'input'].forEach((t) => document.addEventListener(t, () => { const s = document.querySelector('.screen:not(.hidden)'); if (s) armIdle(s.id); }, true));

// the event's booth type decides which styles exist on this booth: both (guests choose first), AI Create only, or Toon Style only
const onStyles = () => (ev.styles || []).filter((s) => s.on !== false && !(ev.groupsOff || []).includes(s.group || '') && (!ev.boothType || ev.boothType === 'both' || (s.kind === 'ai' ? 'ai' : 'toon') === ev.boothType));
const EVKEY = 'tb-ev-' + EVENT;
async function loadEvent() {
  try { ev = await api('/events/' + EVENT); try { localStorage.setItem(EVKEY, JSON.stringify(ev)); } catch { /* full */ } }
  catch (e) { const c = (() => { try { return JSON.parse(localStorage.getItem(EVKEY) || 'null'); } catch { return null; } })(); if (!c) throw e; ev = c; }   // offline: last saved copy
  const b = document.body.style, c = ev.colors || {};
  b.setProperty('--bg', c.bg); b.setProperty('--accent', c.accent); b.setProperty('--text', c.text);
  b.backgroundImage = ev.hasBg ? `url(/api/files/bg/${ev.id}?v=${ev.filesV || 0})` : '';
  $('#logo').classList.toggle('hidden', !ev.hasLogo); if (ev.hasLogo) $('#logo').src = `/api/files/logo/${ev.id}?v=${ev.filesV || 0}`;
  document.body.classList.remove('loading');
  $('#title').textContent = ev.boothTitle || ''; $('#tagline').textContent = ev.tagline || ''; $('#go').textContent = ev.startBtn || 'Start';
  kind = ''; renderStyles(); modeImages();
  $('#mdLogo').classList.toggle('hidden', !ev.hasLogo); if (ev.hasLogo) $('#mdLogo').src = $('#logo').src;
  $('#mdBack').classList.toggle('hidden', startsOnModes());
  { const vis = document.querySelector('.screen:not(.hidden)'); if (!vis || vis.id === 'home' || (vis.id === 'modes' && !cur)) show(homeId()); }
  const v = ev.filesV || 0, p = ev.print || {};
  frames = { p: p.hasFrame ? await loadImg(`/api/files/frame/${ev.id}?v=${v}`) : null, l: p.hasFrameL ? await loadImg(`/api/files/framel/${ev.id}?v=${v}`) : null };
  document.title = ev.name + ' · AI Create Booth';
}

let kind = '';
function renderStyles() {
  const card = (s) => { const src = sampleOf(s); return `<button class="style-card" data-s="${esc(s.id)}">${src ? `<img src="${src}" alt="" loading="lazy">` : '<div class="ph"><img src="/img/pencil.png" alt=""></div>'}<span>${esc(s.name)}</span></button>`; };
  const all = onStyles();
  if (!bothKinds()) kind = '';
  $('#stTitle').textContent = kind === 'ai' ? 'AI Create: pick your style' : kind === 'toon' ? 'Toon Style: pick your style' : 'Pick your style';
  const list = kind ? all.filter((s) => (s.kind === 'ai' ? 'ai' : 'toon') === kind) : all, ord = ev.groupOrder || [], rank = (g) => { const i = ord.indexOf(g); return i < 0 ? 99 : i; };
  const groups = [...new Set(list.map((s) => s.group || ''))].sort((a, b) => rank(a) - rank(b));
  // lots of styles from several groups: show them under group headings so guests can find their favourite
  // a "mix" category shows as ONE card: the guest picks the category and gets a surprise style from it (like a sketch booth)
  const mixes = new Set(ev.mixGroups || []);
  const mixCard = (g) => { const st = list.filter((s) => (s.group || '') === g), f = st.find(sampleOf) || st[0], src = f && sampleOf(f);
    return `<button class="style-card" data-g="${esc(g)}">${src ? `<img src="${src}" alt="" loading="lazy">` : '<div class="ph"><img src="/img/pencil.png" alt=""></div>'}<span>${esc(g)}: surprise me!</span></button>`; };
  const cardsOf = (g) => (mixes.has(g) ? mixCard(g) : list.filter((s) => (s.group || '') === g).map(card).join(''));
  const many = list.length > 6 && groups.length > 1 && groups.some((g) => !mixes.has(g)) && !groups.every((g) => mixes.has(g) || list.filter((s) => (s.group || '') === g).length < 2);
  $('#styleGrid').innerHTML = many ? groups.map((g) => `<h3 class="sg">${esc(g || 'More')}</h3>` + cardsOf(g)).join('') : groups.map(cardsOf).join('');
  $('#styleGrid').querySelectorAll('[data-s]').forEach((el) => { el.onclick = () => { style = el.dataset.s; openCamera(); }; });
  $('#styleGrid').querySelectorAll('[data-g]').forEach((el) => { el.onclick = () => { style = pickRandom(list.filter((s) => (s.group || '') === el.dataset.g)); openCamera(); }; });
}
// example picture for a style button: the event's own sample, then one made in admin, then our built-in examples
let STATIC = new Set();
fetch('/img/samples/list.json').then((r) => r.json()).then((l) => { STATIC = new Set(l); if (ev) { renderStyles(); modeImages(); } }).catch(() => {});
function sampleOf(s) {
  if (s.hasSample) return `/api/files/sample/${ev.id}/${s.id}?v=${ev.filesV || 0}`;
  if (ev.libSamples && ev.libSamples[s.id]) return `/api/files/sample/lib/${s.id}?v=${ev.libSamples[s.id]}`;
  if (STATIC.has(s.id)) return `/img/samples/${s.id}.jpg`;
  return '';
}
const kindOf = (s) => (s.kind === 'ai' ? 'ai' : 'toon');
const bothKinds = () => { const all = onStyles(); return all.some((s) => kindOf(s) === 'ai') && all.some((s) => kindOf(s) === 'toon'); };
function modeImages() {
  for (const k of ['ai', 'toon']) { const st = onStyles().filter((s) => kindOf(s) === k), first = st.find(sampleOf) || st[0]; const el = $(k === 'ai' ? '#modeAiImg' : '#modeToonImg'); const src = first && sampleOf(first); el.src = src || '/img/pencil.png'; el.style.objectFit = src ? 'cover' : 'contain'; }
}
document.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => { kind = b.dataset.mode; renderStyles(); show('styles'); }; });

// ---------- camera ----------
async function openCamera() {
  show('camera'); keepAwake();
  if (stream) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    $('#video').srcObject = stream;
  } catch (e) { toast('Camera not available: ' + e.message, true); show(homeId()); }
}
function stopCamera() { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } }
async function snap() {
  $('#snap').disabled = true; $('.cambar').style.visibility = 'hidden'; $('#camBack').style.visibility = 'hidden'; const c = $('#count'); c.classList.remove('hidden');
  for (let n = ev.countdown ?? 3; n > 0; n--) { c.textContent = n; await sleep(900); }
  c.textContent = ''; c.classList.add('hidden');
  const v = $('#video'), fl = $('#flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
  // crop the middle of the camera to 2:3 portrait (what the guest saw on screen), mirrored like a mirror
  const vw = v.videoWidth, vh = v.videoHeight, ch = vh, cw = Math.min(vw, Math.round(vh * 2 / 3)), sx = (vw - cw) / 2;
  const s = Math.min(1, 1600 / ch), cv = document.createElement('canvas'); cv.width = Math.round(cw * s); cv.height = Math.round(ch * s);
  const g = cv.getContext('2d'); g.translate(cv.width, 0); g.scale(-1, 1); g.drawImage(v, sx, 0, cw, ch, 0, 0, cv.width, cv.height);
  photo = await toJpeg(cv, 0.9); $('#snap').disabled = false; $('.cambar').style.visibility = ''; $('#camBack').style.visibility = '';
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
// ---------- the guest's job: saved here first, then sent ----------
const instantForced = () => { try { return localStorage.getItem('tb-instant') === '1'; } catch { return false; } };
const busy = new Set();
const printing = () => !!(ev.print && ev.print.on);
const linkOf = (id) => `${location.origin}/v/${id}`;

// send / finish one job. Safe to call again and again: each step remembers it is done.
async function processJob(job, opts = {}) {
  if (busy.has(job.id)) return job; busy.add(job.id);
  try {
    if (!job.started) {
      const q = new URLSearchParams({ event: job.eventId, style: job.style, id: job.id });
      const r = await tfetch('/api/shots/start?' + q, { method: 'POST', body: job.photo }, opts.startMs || 30000);
      if (!r.ok) { const t = await r.text(); throw new Error((() => { try { return JSON.parse(t).error; } catch { return t; } })() || 'Could not start'); }
      job.started = Date.now(); await saveJob(job);
    }
    for (const e of job.emails || []) {
      if (e.sent) continue;
      const r = await tfetch('/api/public/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: job.id, email: e.email, consent: true, marketing: e.marketing }) });
      if (r.ok || r.status === 400 || r.status === 403 || r.status === 429) { e.sent = Date.now(); await saveJob(job); }
    }
    if (!job.posted && !opts.noPost) {
      const r = await tfetch('/api/shots/' + job.id, { cache: 'no-store' }); if (!r.ok) return job;
      const m = await r.json();
      if (m.toon === 'error' && !job.retried) { job.retried = 1; await saveJob(job); await tfetch(`/api/shots/${job.id}/retry/toon`, { method: 'POST' }); return job; }
      if (m.toon === 'error') { job.posted = 'failed'; await saveJob(job); }
      else if (m.toon === 'ready') await postProcess(job);
    }
    if (job.posted && (job.emails || []).every((e) => e.sent) && job.id !== (cur && cur.id)) await delJob(job.id);   // all done: free the space
    return job;
  } finally { busy.delete(job.id); }
}
// thumbnail + print once the AI picture is ready (the print is skipped if this guest already got an instant print)
async function postProcess(job) {
  const toon = await loadImg(`/api/shots/${job.id}/toon`); if (!toon) return;
  if (!job.thumb) { const r = await tfetch(`/api/shots/${job.id}/thumb`, { method: 'PUT', body: await toJpeg(thumbOf(toon), 0.82) }); if (r.ok) { job.thumb = 1; await saveJob(job); } }
  if (printing() && !job.printedInstant && !job.printDone) {
    const ph = ev.print.inset && job.photo ? await createImageBitmap(job.photo).catch(() => null) : null;
    const blob = await toJpeg(forPrinter(composePrint(ev, toon, frames, linkOf(job.id), { photo: ph })), 0.93);
    if (ev.print.from === 'booth') for (let k = 0; k < (ev.print.copies || 1); k++) await printBlob(blob, $('#printframe'));
    const r = await tfetch(`/api/shots/${job.id}/print`, { method: 'PUT', body: blob }, 30000);
    if (r.ok) { if (ev.print.from === 'booth') tfetch(`/api/shots/${job.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ printed: true, printedBy: 'booth' }) }).catch(() => {}); }
    job.printDone = 1; await saveJob(job);   // printed at the booth even if the upload must wait
  }
  if (job.thumb) { job.posted = Date.now(); job.photo = null; await saveJob(job); }
}
// background sender: keeps going through every waiting guest
let syncing = false;
async function syncAll() {
  if (syncing || !ev) return; syncing = true;
  try { for (const j of await allJobs()) { if (j.eventId !== EVENT || (cur && j.id === cur.id && !cur.left)) continue; try { await processJob(j); } catch { break; } } }   // offline: stop and try again later
  finally { syncing = false; updateDot(); }
}

async function start() {
  $('#use').disabled = true; $('#mkErr').classList.add('hidden');
  const job = { id: newId(), eventId: EVENT, style, photo, created: Date.now(), emails: [] };
  await saveJob(job); cur = { id: job.id, job };   // safe on this device before anything else happens
  try {
    if (instantForced() || (!navigator.onLine)) throw new Error('offline');
    await processJob(job, { noPost: true, startMs: 20000 });
    stopCamera(); show('making'); sketching(true); wait(job.id);
  } catch { stopCamera(); await instant(job); }
  finally { $('#use').disabled = false; updateDot(); }
}
async function wait(id) {
  const token = ++run, t0 = Date.now(); let lastOk = Date.now();
  while (token === run) {
    await sleep(1500);
    let m; try { const r = await tfetch('/api/shots/' + id, { cache: 'no-store' }, 8000); if (!r.ok) throw 0; m = await r.json(); lastOk = Date.now(); }
    catch { if (Date.now() - lastOk > 25000) return queued(); continue; }   // the connection dropped while drawing: don't keep the guest waiting
    if (token !== run) return;
    if (m.toon === 'ready') return finish(m);
    if (m.toon === 'error') { sketching(false); $('.paper').classList.add('hidden'); $('#mkErrMsg').classList.remove('hidden'); $('#mkErr').classList.remove('hidden'); return; }
    if (Date.now() - t0 > 90000) return queued();   // the AI is very slow right now: hand over to the background queue
  }
}
function resultScreen({ img, title, note, printNote }) {
  const em = ev.email || {}, vid = ev.video && ev.video.on;
  $('#toon').src = img; $('#resTitle').textContent = title;
  $('#printMsg').textContent = printNote; $('#printMsg').classList.toggle('hidden', !printNote);
  $('#resNote').textContent = note || ''; $('#resNote').classList.toggle('hidden', !note);
  $('#ebox').classList.toggle('hidden', !(em.enabled && em.atBooth)); $('#ebox').reset(); $('#bsend').disabled = false; $('#bmsg').textContent = '';
  $('#eTitle').textContent = vid ? 'Get your animated video by email' : 'Get your picture by email';
  $('#consentTxt').textContent = em.consent || 'I agree to receive this email.';
  $('#mkRow').classList.toggle('hidden', !em.marketing); $('#mkTxt').textContent = em.marketingText || '';
  $('#qrTxt').textContent = vid ? 'Or scan to watch it on your phone' : 'Or scan to save it on your phone';
  const q = $('#qr'); q.getContext('2d').clearRect(0, 0, q.width, q.height); drawQR(q.getContext('2d'), linkOf(cur.id), 0, 0, q.width);
  show('result');
}
async function finish(m) {
  const toon = await loadImg(`/api/shots/${m.id}/toon`);
  await finishLine(); sketching(false);
  if (!toon) return queued();
  resultScreen({ img: `/api/shots/${m.id}/toon`, title: 'Looking good!', printNote: printing() ? 'Your print is on its way.' : '' });
  processJob(cur.job).catch(() => {}).finally(updateDot);   // thumbnail + print in the background
}
// slow AI or a dropped connection: the guest still leaves happy, the picture follows by QR / email
function queued() {
  run++; sketching(false); cur.left = true;
  resultScreen({ img: URL.createObjectURL(cur.job.photo), title: 'You’re all set!',
    note: 'Your AI picture is still being created. Scan the QR code or add your email and it will reach you shortly.',
    printNote: printing() ? 'Your print will come out as soon as it’s ready.' : '' });
  syncAll();
}
// instant mode: no AI right now, so print the guest's own photo in the event frame straight away
async function instant(job) {
  cur.left = true;
  const ph = await createImageBitmap(job.photo).catch(() => null);
  const c = forPrinter(composePrint({ ...ev, print: { ...ev.print, inset: false } }, ph, frames, linkOf(job.id)));
  const blob = await toJpeg(c, 0.93);
  let printNote = '';
  if (printing()) {
    if (ev.print.from === 'booth') { for (let k = 0; k < (ev.print.copies || 1); k++) await printBlob(blob, $('#printframe')); job.printedInstant = 1; printNote = 'Your print is on its way.'; }
    else printNote = 'Your print will come out as soon as it’s ready.';   // the print station needs the connection: it prints the AI version once sent
  }
  await saveJob(job);
  resultScreen({ img: URL.createObjectURL(blob), title: 'Here’s your photo!',
    note: (ev.video && ev.video.on ? 'Your AI picture and video' : 'Your AI picture') + ' will follow by QR code and email shortly.', printNote });
  syncAll();
}
function goHome() { run++; sketching(false); stopCamera(); cur = null; clearTimeout(idle); show(homeId()); if (ev) loadEvent().catch(() => {}); syncAll(); }

// ---------- email at the booth (saved on this device, sent with the guest's job) ----------
$('#ebox').onsubmit = async (e) => {
  e.preventDefault(); const b = $('#bsend'); b.disabled = true;
  const email = $('#bemail').value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { $('#bmsg').textContent = 'Please check the email address.'; b.disabled = false; return; }
  if (!$('#bok').checked) { $('#bmsg').textContent = 'Please tick the box to agree.'; b.disabled = false; return; }
  const job = cur.job; job.emails = job.emails || [];
  if (!job.emails.some((x) => x.email === email)) job.emails.push({ email, marketing: $('#bmk').checked });
  await saveJob(job); $('#ebox').reset();
  $('#bmsg').textContent = '✓ Saved! It will land in your inbox shortly.';
  setTimeout(() => { b.disabled = false; }, 1500);
  if (job.started) processJob(job, { noPost: !job.thumb && !cur.left }).catch(() => {}).finally(updateDot); else syncAll();
};

// ---------- staff: connection dot, waiting guests, instant mode ----------
async function updateDot() {
  const n = (await allJobs()).filter((j) => j.eventId === EVENT && (!j.started || (j.emails || []).some((e) => !e.sent))).length;
  const d = $('#netdot'); d.className = 'netdot ' + (!net.online ? 'bad' : n ? 'warn' : 'ok') + (instantForced() ? ' inst' : '');
  d.textContent = n ? String(n) : ''; d.title = (net.online ? 'Online' : 'Offline') + (n ? ` · ${n} waiting to send` : '');
}
async function heartbeat() { await checkNet(); if (net.online) syncAll(); else updateDot(); }
setInterval(heartbeat, 10000);
window.addEventListener('online', heartbeat); window.addEventListener('offline', () => { net.online = false; updateDot(); });

// ---------- buttons ----------
const pickRandom = (arr) => (arr.length ? arr[Math.floor(Math.random() * arr.length)].id : '');   // a surprise style
// step 1: AI Create or Toon Mode (when the event has both), step 2: the style, step 3: the photo
const choosing = () => ev.guestChoice && onStyles().length > 1;
$('#go').onclick = () => { style = pickRandom(onStyles()); kind = ''; if (!choosing()) return openCamera(); if (bothKinds()) { modeImages(); show('modes'); } else { renderStyles(); show('styles'); } };
$('#mdBack').onclick = goHome;
// when an event has both AI Create and Toon Style, the booth opens straight on "Choose your style" (no Start screen)
function startsOnModes() { return !!ev && choosing() && bothKinds(); }
function homeId() { return startsOnModes() ? 'modes' : 'home'; }
$('#staff2').onclick = (e) => $('#staff').onclick(e);
$('#stBack').onclick = () => (bothKinds() ? show('modes') : goHome());
$('#camBack').onclick = () => { stopCamera(); if (choosing()) show('styles'); else goHome(); };
$('#snap').onclick = snap;
$('#video').onclick = () => { if (!$('#snap').disabled) snap(); };
$('#retake').onclick = openCamera;
$('#use').onclick = start;
$('#mkHome').onclick = goHome;
$('#mkRetry').onclick = async () => { $('#mkErr').classList.add('hidden'); try { await api(`/shots/${cur.id}/retry/toon`, { method: 'POST' }); sketching(true); wait(cur.id); } catch { queued(); } };
$('#done').onclick = goHome;
$('#staff').onclick = async (e) => {
  e.preventDefault(); await checkNet();
  const jobs = (await allJobs()).filter((j) => j.eventId === EVENT), waiting = jobs.filter((j) => !j.started || (j.emails || []).some((x) => !x.sent)).length;
  const m = modal(`<h2>Staff</h2><div class="kv"><div>Connection</div><div><span class="pill ${net.online ? 'ok' : 'bad'}">${net.online ? 'Online' : 'Offline'}</span></div>
    <div>Waiting to send</div><div><b>${waiting}</b> guest${waiting === 1 ? '' : 's'} (sent automatically when online)</div></div>
    <label class="switch" style="margin-top:16px"><input type="checkbox" id="instTog" ${instantForced() ? 'checked' : ''}> Instant mode: print the guest's photo in the frame straight away; the AI picture follows by QR and email</label>
    <p class="hint">The booth switches to instant mode by itself when the internet is down. Tick this to use it on purpose, for example when the queue is long.</p>
    <div class="row" style="margin-top:14px"><button class="btn" id="sendNow">Send waiting guests now</button><a class="btn ghost" href="/station/?event=${EVENT}">Open print station</a><button class="btn ghost" id="close">Close</button></div>`);
  m.el.querySelector('#instTog').onchange = (x) => { try { localStorage.setItem('tb-instant', x.target.checked ? '1' : '0'); } catch { /* ignore */ } updateDot(); };
  m.el.querySelector('#sendNow').onclick = async () => { await heartbeat(); m.close(); toast(net.online ? 'Sending…' : 'Still offline: it will send when the connection is back.', !net.online); };
  m.el.querySelector('#close').onclick = m.close;
};

(async () => {
  if (!EVENT) { document.body.classList.remove('loading'); $('#title').textContent = 'Open this booth from the event page in admin'; $('#go').classList.add('hidden'); return; }
  await ensureLogin('Staff sign-in for the booth');
  for (let i = 0; i < 3 && !ev; i++) {
    try { await loadEvent(); } catch (e) { if (i === 2) { document.body.classList.remove('loading'); $('#tagline').textContent = 'Could not load this event (' + e.message + '). Check the internet, then reload.'; } else await sleep(1500); }
  }
  keepAwake(); heartbeat();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => { if (!new URL(r.scope).pathname.startsWith('/booth')) r.unregister(); })).catch(() => {});
    navigator.serviceWorker.register('/sw.js', { scope: '/booth/' }).catch(() => {});
  }
})();
window.addEventListener('tb-auth', () => ensureLogin('Staff sign-in for the booth'));
