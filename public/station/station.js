import { api, esc, toast, modal, ensureLogin, printBlob } from '/js/common.js';
import { kioskHelpHTML } from '/js/help.js';

const $ = (s) => document.querySelector(s);
const EVENT = new URLSearchParams(location.search).get('event') || '';
const KEY = 'tb_station_' + EVENT;
let on = false, shots = [], startedAt = 0, timer = null, ev = {};
const printing = new Set();
const ls = { get: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } } };
const state = ls.get(KEY) || { done: {} };   // shot id -> printed by this station
const saveState = () => ls.set(KEY, state);

async function printShot(m, n = 1) {
  if (printing.has(m.id)) return;
  printing.add(m.id); render();
  try {
    const r = await fetch(`/api/shots/${m.id}/print`, { credentials: 'same-origin' }); if (!r.ok) throw new Error('Could not load print (' + r.status + ')');
    const blob = await r.blob();
    state.done[m.id] = Date.now(); saveState();   // mark first, so a slow multi-copy job never starts twice
    for (let k = 0; k < n; k++) { await printBlob(blob, $('#printframe')); api(`/shots/${m.id}`, { method: 'PATCH', body: { printed: true, printedBy: 'station' } }).then((x) => { Object.assign(m, x); render(); }).catch(() => {}); }
  } catch (e) { toast(e.message, true); } finally { printing.delete(m.id); render(); }
}

async function poll() {
  try {
    shots = await api(`/events/${EVENT}/shots`);
    $('#net').className = 'pill ok'; $('#net').textContent = on ? 'Auto-print ON' : 'Online';
    $('#last').textContent = 'Checked ' + new Date().toLocaleTimeString();
    if (on && ev.print && ev.print.on && ev.print.from !== 'booth') {
      const todo = shots.filter((m) => m.hasPrint && !m.printed && !state.done[m.id] && (m.printReady || 0) >= startedAt).sort((a, b) => a.printReady - b.printReady);
      for (const m of todo) printShot(m, (ev.print && ev.print.copies) || 1);
    }
    render();
  } catch { $('#net').className = 'pill bad'; $('#net').textContent = 'Offline - retrying'; }
  clearTimeout(timer); timer = setTimeout(poll, 3000);
}
const VID = { waiting: 'Video queued', making: 'Video being animated…', ready: 'Video ready ✓', error: 'Video failed (still sent)', off: '' };
function render() {
  const done = (m) => m.printed || state.done[m.id];
  $('#cWait').textContent = shots.filter((m) => m.hasPrint && !done(m) && !printing.has(m.id)).length;
  $('#cPrint').textContent = printing.size;
  $('#cDone').textContent = shots.filter(done).length;
  $('#cVid').textContent = shots.filter((m) => m.video === 'ready').length;
  $('#cMail').textContent = shots.reduce((n, m) => n + (m.emails || []).filter((e) => e.sent).length, 0);
  $('#empty').classList.toggle('hidden', shots.length > 0);
  $('#queue').innerHTML = shots.slice(0, 60).map((m) => {
    const st = printing.has(m.id) ? ['printing', 'Printing…'] : done(m) ? ['done', `Printed${m.printed > 1 ? ' ' + m.printed + 'x' : ''}`] : m.hasPrint ? ['waiting', on && (m.printReady || 0) >= startedAt ? 'Queued' : 'Ready - tap Print'] : m.toon === 'error' ? ['error', 'Drawing failed'] : ['creating', 'Drawing…'];
    const mails = (m.emails || []).length ? `${(m.emails || []).filter((e) => e.sent).length}/${m.emails.length} emailed` : '';
    return `<div class="st-item s-${st[0]}">${m.hasThumb ? `<img loading="lazy" src="/api/shots/${m.id}/thumb" alt="">` : '<img alt="">'}<div class="b">
      <div class="nm">${new Date(m.created).toLocaleTimeString()} · ${esc(m.id)}</div><div class="stt">${st[1]}</div>
      <div class="lbl">${[VID[m.video] || '', mails].filter(Boolean).join(' · ')}</div>
      <div class="acts">${m.hasPrint ? `<button class="btn ghost light" data-p="${m.id}">${done(m) ? 'Reprint' : 'Print'}</button>` : ''}</div></div></div>`;
  }).join('');
  $('#queue').querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => { const m = shots.find((x) => x.id === b.dataset.p); if (m) printShot(m); }; });
}
function setAuto(v) {
  on = v; ls.set('tb_autoprint', v);
  if (on) { startedAt = Date.now() - 5000; $('#toggle').textContent = '⏸ Pause auto-print'; $('#toggle').classList.add('live'); }   // only new guests from now on
  else { $('#toggle').textContent = '▶ Start auto-print'; $('#toggle').classList.remove('live'); }
}
$('#toggle').onclick = () => { setAuto(!on); poll(); };
$('#testprint').onclick = async () => {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 1800; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 1200, 1800); x.strokeStyle = (ev.colors && ev.colors.accent) || '#ED2F5B'; x.lineWidth = 30; x.strokeRect(15, 15, 1170, 1770);
  x.fillStyle = '#111'; x.font = 'bold 90px Montserrat, Arial'; x.textAlign = 'center'; x.fillText('Test print 4x6', 600, 860); x.font = '50px Montserrat, Arial'; x.fillText('Border should be even on all sides', 600, 960);
  printBlob(await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92)), $('#printframe'));
};
$('#help').onclick = () => { const m = modal(`<h2>Printer setup</h2>${kioskHelpHTML}<button class="btn" style="margin-top:12px">Close</button>`); m.el.querySelector('button').onclick = m.close; };
window.addEventListener('tb-auth', () => ensureLogin('Staff sign-in').then(poll));
window.addEventListener('beforeunload', (e) => { if (on) { e.preventDefault(); e.returnValue = ''; } });
setInterval(() => { if (EVENT) api('/events/' + EVENT).then((e) => { ev = e; }).catch(() => {}); }, 30000);

(async () => {
  await ensureLogin('Print station');
  if (!EVENT) { $('#empty').innerHTML = 'Open this page from admin → your event → <b>Print station</b>.'; return; }
  try { ev = await api('/events/' + EVENT); $('#evname').textContent = ev.name; document.title = 'Print station · ' + ev.name;
    if (!ev.print || !ev.print.on) toast('Printing is switched off for this event (admin → Print).', true);
    else if (ev.print.from === 'booth') toast('This event prints from the booth screen itself. This page only shows the queue.', false);
  } catch (e) { toast(e.message, true); }
  setAuto(ls.get('tb_autoprint') !== false); poll();
})();
