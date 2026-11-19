import { api, esc, toast, modal, loadImg, composePrint } from '/js/common.js';

const app = document.getElementById('app');
const $ = (s, r = app) => r.querySelector(s), $$ = (s, r = app) => Array.from(r.querySelectorAll(s));
let settings = null, ev = null;
const busy = async (btn, fn) => { const t = btn.textContent; btn.disabled = true; btn.textContent = 'Working…'; try { return await fn(); } catch (e) { toast(e.message, true); } finally { btn.disabled = false; btn.textContent = t; } };
const put = async (body) => { ev = await api('/events/' + ev.id, { method: 'PUT', body }); toast('Saved'); return ev; };
const upload = (key, file) => api('/files/' + key, { method: 'PUT', body: file, headers: { 'content-type': file.type || 'image/png' } });
const val = (id) => $('#' + id).value, chk = (id) => $('#' + id).checked;
const lines = (t) => t.split('\n').map((x) => x.trim()).filter(Boolean);

window.addEventListener('tb-auth', renderLogin);
document.getElementById('logout').onclick = async (e) => { e.preventDefault(); await api('/logout', { method: 'POST', allow401: true }); renderLogin(); };
function renderLogin() {
  document.getElementById('nav').classList.add('hidden');
  app.innerHTML = `<div class="card login"><h1>Sign in</h1><p class="muted">AI Photo Booth admin</p><form id="lf"><label class="f">Admin password</label><input type="password" id="pw" autofocus>
    <p id="lerr" class="hint" style="color:var(--bad)"></p><button class="btn" style="width:100%;margin-top:10px">Sign in</button></form></div>`;
  $('#lf').onsubmit = async (e) => { e.preventDefault(); try { await api('/login', { method: 'POST', body: { password: $('#pw').value }, allow401: true }); route(); } catch (err) { $('#lerr').textContent = err.message; } };
}
async function route() {
  try { await api('/me', { allow401: true }); } catch { return renderLogin(); }
  document.getElementById('nav').classList.remove('hidden');
  const h = location.hash.replace(/^#\/?/, '').split('/');
  $$('[data-nav]', document).forEach((a) => a.classList.toggle('on', a.dataset.nav === (h[0] === 'settings' ? 'settings' : 'events')));
  try {
    settings = await api('/settings');
    if (h[0] === 'settings') return renderSettings();
    if (h[0] === 'e' && h[1]) return renderEvent(h[1], h[2] || 'look');
    return renderEvents();
  } catch (e) { app.innerHTML = `<div class="card"><h2>Something went wrong</h2><p>${esc(e.message)}</p></div>`; }
}
window.addEventListener('hashchange', route); route();

function renderSettings() {
  const p = (ok) => `<span class="pill ${ok ? 'ok' : 'bad'}">${ok ? 'Ready' : 'Missing'}</span>`;
  app.innerHTML = `<h1>Settings</h1><div class="card"><div class="kv">
    <div>Gemini AI key</div><div>${p(settings.geminiReady)} <span class="muted">GEMINI_API_KEY in Netlify</span></div>
    <div>Email (Brevo)</div><div>${p(settings.emailReady)} <span class="muted">EMAIL_API_KEY in Netlify. Sends from ${esc(settings.emailFrom)}</span></div>
    <div>Caricature model</div><div><code>${esc(settings.imageModel)}</code> <span class="muted">change with GEMINI_IMAGE_MODEL</span></div>
    <div>Video model</div><div><code>${esc(settings.videoModel)}</code> <span class="muted">change with GEMINI_VIDEO_MODEL</span></div></div>
    <p class="hint">After changing environment variables in Netlify, redeploy the site.</p></div>`;
}

async function renderEvents() {
  const list = await api('/events');
  app.innerHTML = `<div class="row" style="justify-content:space-between"><h1>Events</h1><form id="nf" class="row"><input type="text" id="nn" placeholder="New event name" style="width:260px"><button class="btn">+ Create event</button></form></div>
    ${settings.geminiReady ? '' : '<div class="card"><b>Before the first event:</b> add GEMINI_API_KEY in Netlify (see Settings).</div>'}
    <div class="events-list">${list.map((e) => `<a class="ev-card" href="#/e/${e.id}/look"><h3>${esc(e.name)}</h3><div class="muted">Created ${new Date(e.created).toLocaleDateString()}</div></a>`).join('') || '<div class="card">No events yet.</div>'}</div>`;
  $('#nf').onsubmit = async (e) => { e.preventDefault(); const n = $('#nn').value.trim(); if (!n) return toast('Type a name', true); const x = await api('/events', { method: 'POST', body: { name: n } }); location.hash = `#/e/${x.id}/look`; };
}

const TABS = [['look', 'Booth look'], ['styles', 'Styles'], ['print', 'Print & video'], ['email', 'Email'], ['gallery', 'Gallery']];
async function renderEvent(id, tab) {
  ev = await api('/events/' + id);
  app.innerHTML = `<div class="row" style="justify-content:space-between;align-items:flex-start"><div><a href="#/" class="muted">← All events</a>
      <h1 style="margin-top:6px"><span id="evname">${esc(ev.name)}</span> <button class="btn ghost small" id="rename">Rename</button></h1></div>
      <div class="row"><a class="btn dark big" href="/booth/?event=${ev.id}" target="_blank">Open booth</a><a class="btn ghost big" href="/station/?event=${ev.id}" target="_blank">Print station</a></div></div>
    <div class="tabs">${TABS.map(([k, l]) => `<a href="#/e/${ev.id}/${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</div><div id="tab"></div>
    <div style="margin-top:40px"><button class="btn danger small" id="delev">Delete this event</button></div>`;
  $('#rename').onclick = async () => { const n = prompt('Event name', ev.name); if (!n || !n.trim()) return; await put({ name: n.trim() }); $('#evname').textContent = ev.name; };
  $('#delev').onclick = async () => { if (!confirm(`Delete "${ev.name}" and ALL its guests' photos and videos?`)) return; await api('/events/' + ev.id, { method: 'DELETE' }); location.hash = '#/'; };
  ({ look: tabLook, styles: tabStyles, print: tabPrint, email: tabEmail, gallery: tabGallery }[tab] || tabLook)($('#tab'));
}
const fileRow = (label, key, has, hint) => `<div class="row" style="margin-top:10px"><b style="min-width:150px">${label}</b><span class="pill ${has ? 'ok' : ''}">${has ? 'Uploaded' : 'None'}</span>
  <label class="btn ghost small">Upload<input type="file" accept="image/*" hidden data-up="${key}"></label>${has ? `<button class="btn danger small" data-del="${key}">Remove</button>` : ''}</div>${hint ? `<p class="hint">${hint}</p>` : ''}`;
function wireFiles(el) {
  $$('[data-up]', el).forEach((i) => { i.onchange = async () => { const f = i.files[0]; if (!f) return; try { await upload(i.dataset.up, f); toast('Uploaded'); route(); } catch (e) { toast(e.message, true); } }; });
  $$('[data-del]', el).forEach((b) => { b.onclick = async () => { await api('/files/' + b.dataset.del, { method: 'DELETE' }); route(); }; });
}

function tabLook(el) {
  const c = ev.colors;
  el.innerHTML = `<div class="grid2"><div class="card"><h2>Start screen</h2>
    <label class="f">Title</label><input type="text" id="boothTitle" value="${esc(ev.boothTitle)}">
    <label class="f">Tagline</label><input type="text" id="tagline" value="${esc(ev.tagline)}">
    <label class="f">Start button</label><input type="text" id="startBtn" value="${esc(ev.startBtn)}">
    <h2 style="margin-top:22px">While the caricature is drawn</h2>
    <label class="f">Headline</label><input type="text" id="makingTitle" value="${esc(ev.makingTitle)}">
    <label class="f">Second line</label><input type="text" id="makingSub" value="${esc(ev.makingSub)}">
    <div class="row" style="margin-top:14px"><label class="f">Countdown (seconds)</label><input type="number" id="countdown" min="0" max="10" value="${ev.countdown}" style="width:90px">
      <label class="f">Back to start after (seconds idle)</label><input type="number" id="resetSec" min="10" max="120" value="${ev.resetSec}" style="width:90px"></div>
    <button class="btn" id="save" style="margin-top:18px">Save</button></div>
    <div class="card"><h2>Colours and images</h2>
    <div class="row"><label class="switch"><input type="color" id="cbg" value="${c.bg}"> Background</label><label class="switch"><input type="color" id="cacc" value="${c.accent}"> Buttons</label><label class="switch"><input type="color" id="ctext" value="${c.text}"> Text</label></div>
    ${fileRow('Logo', 'logo/' + ev.id, ev.hasLogo, 'PNG with a transparent background. Shows on the start screen, the guest page and the email.')}
    ${fileRow('Background', 'bg/' + ev.id, ev.hasBg, 'Full-screen JPG behind the booth screens, sized for the booth screen (e.g. 1080 x 1920 portrait).')}</div></div>`;
  wireFiles(el);
  $('#save', el).onclick = (e) => busy(e.target, () => put({ boothTitle: val('boothTitle'), tagline: val('tagline'), startBtn: val('startBtn'), makingTitle: val('makingTitle'), makingSub: val('makingSub'),
    countdown: +val('countdown'), resetSec: +val('resetSec'), colors: { bg: val('cbg'), accent: val('cacc'), text: val('ctext') } }));
}

function tabStyles(el) {
  const row = (s) => `<div class="card" data-style="${esc(s.id)}"><div class="row"><label class="switch"><input type="checkbox" data-k="on" ${s.on !== false ? 'checked' : ''}> On</label>
      <input type="text" data-k="name" value="${esc(s.name)}" style="width:220px">
      <select data-k="shape" style="width:150px"><option value="portrait" ${s.shape !== 'landscape' ? 'selected' : ''}>Portrait</option><option value="landscape" ${s.shape === 'landscape' ? 'selected' : ''}>Landscape</option></select>
      <label class="switch" title="Gives each guest a random fun expression from the list below"><input type="checkbox" data-k="caricature" ${s.caricature ? 'checked' : ''}> Fun expressions</label>
      <label class="switch" title="Uses the event logo (Booth look tab)"><input type="checkbox" data-k="logo" ${s.logo ? 'checked' : ''}> Event logo on clothes</label><span class="grow"></span>
      <button class="btn ghost small" data-up-btn>Move up</button><button class="btn danger small" data-rm>Remove</button></div>
    <div class="row" style="margin-top:8px"><span class="pill ${s.hasSample ? 'ok' : ''}">${s.hasSample ? 'Sample image' : 'No sample image'}</span><label class="btn ghost small">Upload sample<input type="file" accept="image/*" hidden data-up="sample/${ev.id}/${esc(s.id)}"></label>
      ${s.hasSample ? `<button class="btn danger small" data-del="sample/${ev.id}/${esc(s.id)}">Remove sample</button>` : ''}</div>
    <label class="f">The look (AI prompt for the picture)</label><textarea data-k="prompt" style="min-height:80px">${esc(s.prompt)}</textarea>
    <label class="f">How it moves in the video (leave empty to use the event's default movement)</label><textarea data-k="motion" style="min-height:60px">${esc(s.motion || '')}</textarea></div>`;
  el.innerHTML = `<div class="card"><div class="row"><label class="switch"><input type="checkbox" id="guestChoice" ${ev.guestChoice ? 'checked' : ''}> Guests pick their style on the booth</label><span class="grow"></span><button class="btn" id="lib">+ Add from the style library</button><button class="btn ghost" id="add">+ Blank style</button></div>
    <p class="hint">When off, every guest gets the first style that is on. Upload a sample image for each style so guests can see it on the style button (one of your own test results works best). To change a theme, just edit the words, for example "swinging a golf club" to "serving a tennis ball".</p></div>
    <div id="styles">${ev.styles.map(row).join('')}</div>
    <div class="card" style="margin-top:18px"><h2>Fun expressions</h2><p class="hint">One per line. Styles with "Fun expressions" ticked give each guest one of these at random.</p><textarea id="expr">${esc(ev.expressions.join('\n'))}</textarea></div>
    <button class="btn" id="save">Save styles</button>`;
  wireFiles(el);
  const collect = () => $$('[data-style]', el).map((c) => ({ id: c.dataset.style, on: $('[data-k=on]', c).checked, name: $('[data-k=name]', c).value, shape: $('[data-k=shape]', c).value, caricature: $('[data-k=caricature]', c).checked, logo: $('[data-k=logo]', c).checked, group: (ev.styles.find((s) => s.id === c.dataset.style) || {}).group || '',
    prompt: $('[data-k=prompt]', c).value, motion: $('[data-k=motion]', c).value, hasSample: (ev.styles.find((s) => s.id === c.dataset.style) || {}).hasSample }));
  const saveAll = () => put({ guestChoice: chk('guestChoice'), styles: collect(), expressions: lines(val('expr')) });
  $$('[data-rm]', el).forEach((b) => { b.onclick = () => { if (confirm('Remove this style from the event?')) b.closest('[data-style]').remove(); }; });
  $$('[data-up-btn]', el).forEach((b) => { b.onclick = () => { const c = b.closest('[data-style]'); if (c.previousElementSibling) c.parentNode.insertBefore(c, c.previousElementSibling); }; });
  $('#add', el).onclick = async () => { await put({ guestChoice: chk('guestChoice'), styles: [...collect(), { name: 'New style', prompt: '', on: true }], expressions: lines(val('expr')) }); route(); };
  $('#lib', el).onclick = async () => {
    const lib = await api('/library'), have = new Set(ev.styles.map((s) => s.id)), groups = [...new Set(lib.map((s) => s.group))];
    const m = modal(`<h2>Style library</h2><p class="hint">Tick the styles to add to this event. You can edit them after.</p>${groups.map((g) => `<h3 style="margin-top:14px">${esc(g)}</h3>${lib.filter((s) => s.group === g).map((s) => `<label class="switch" style="display:flex;margin:6px 0;align-items:flex-start"><input type="checkbox" value="${s.id}" ${have.has(s.id) ? 'disabled checked' : ''}><span><b>${esc(s.name)}</b>${s.shape === 'landscape' ? ' <span class="pill">Landscape</span>' : ''}${s.motion ? ' <span class="pill pink">Own animation</span>' : ''}<br><span class="muted">${esc(s.prompt.slice(0, 140))}…</span></span></label>`).join('')}`).join('')}
      <div class="row" style="margin-top:14px"><button class="btn" id="addSel">Add selected</button><button class="btn ghost" id="cancel">Cancel</button></div>`);
    m.el.querySelector('#cancel').onclick = m.close;
    m.el.querySelector('#addSel').onclick = async () => {
      const pickIds = [...m.el.querySelectorAll('input:checked:not([disabled])')].map((i) => i.value);
      await put({ guestChoice: chk('guestChoice'), styles: [...collect(), ...lib.filter((s) => pickIds.includes(s.id)).map((s) => ({ ...s, on: true }))], expressions: lines(val('expr')) }); m.close(); route();
    };
  };
  $('#save', el).onclick = (e) => busy(e.target, async () => { await saveAll(); route(); });
}

function tabPrint(el) {
  const p = ev.print, v = ev.video;
  el.innerHTML = `<div class="card"><h2>What guests get</h2><select id="mode" style="max-width:520px">
      <option value="both" ${p.on && v.on ? 'selected' : ''}>Print + animated video by email</option><option value="print" ${p.on && !v.on ? 'selected' : ''}>Print only (instant, no video)</option>
      <option value="video" ${!p.on && v.on ? 'selected' : ''}>Animated video only (no print)</option><option value="digital" ${!p.on && !v.on ? 'selected' : ''}>Digital picture only (QR / email, no print)</option></select>
    <p class="hint">Print only is the fastest and cheapest. The animated video costs more per guest, so it suits premium packages.</p></div>
    <div class="grid2"><div class="card"><h2>4x6 print</h2>
    <label class="f">Print from</label><select id="pfrom"><option value="station" ${p.from !== 'booth' ? 'selected' : ''}>A separate print station (Chrome with kiosk printing)</option><option value="booth" ${p.from === 'booth' ? 'selected' : ''}>The booth screen itself (booth Chrome in kiosk printing)</option></select>
    <label class="f">Copies per guest</label><input type="number" id="pcopies" min="1" max="5" value="${p.copies}" style="width:90px">
    <label class="switch" style="margin-top:12px"><input type="checkbox" id="pinset" ${p.inset ? 'checked' : ''}> Show the guest's original photo as a small polaroid (bottom left)</label>
    <label class="switch" style="margin-top:8px"><input type="checkbox" id="pqr" ${p.qr ? 'checked' : ''}> Small QR code (bottom right) that opens the guest's page</label>
    ${fileRow('Frame (portrait)', 'frame/' + ev.id, p.hasFrame, 'Transparent PNG, 1200 x 1800 px, laid over portrait styles.')}
    ${fileRow('Frame (landscape)', 'framel/' + ev.id, p.hasFrameL, 'Transparent PNG, 1800 x 1200 px, laid over landscape styles (such as the pixel game). They print turned on the same 4x6 paper.')}
    <label class="f">Picture window, portrait (% of the page: left, top, width, height)</label><div class="row">${['x', 'y', 'w', 'h'].map((k) => `<input type="number" min="0" max="100" data-win="p${k}" value="${(p.win || { x: 0, y: 0, w: 100, h: 100 })[k]}" style="width:80px">`).join('')}</div>
    <label class="f">Picture window, landscape</label><div class="row">${['x', 'y', 'w', 'h'].map((k) => `<input type="number" min="0" max="100" data-win="l${k}" value="${(p.winL || { x: 0, y: 0, w: 100, h: 100 })[k]}" style="width:80px">`).join('')}</div>
    <p class="hint">Leave at 0, 0, 100, 100 for a full-page picture. For a branded card frame (logos along the bottom), set the window to match the frame's clear area, for example 6, 5, 88, 75. The preview updates when you save.</p>
    <button class="btn" id="savep" style="margin-top:16px">Save print</button></div>
    <div class="card"><h2>Preview</h2><div class="preview-wrap row" style="justify-content:center;align-items:center"><canvas id="pv" style="max-width:220px"></canvas><canvas id="pvl" style="max-width:300px"></canvas></div></div></div>
    <div class="card"><h2>Animated video</h2>
    <label class="f">Default movement (used by styles without their own)</label><textarea id="vmotion">${esc(v.motion)}</textarea>
    <label class="f">Quality</label><select id="vres" style="width:200px">${['360p', '720p', '1080p'].map((r) => `<option ${v.resolution === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
    <p class="hint">Portrait styles make an upright phone video; landscape styles make a widescreen one. 720p is the best balance of speed, cost and quality.</p>
    <button class="btn" id="savev" style="margin-top:12px">Save video</button></div>`;
  wireFiles(el);
  (async () => {
    const vv = ev.filesV || 0, frames = { p: p.hasFrame ? await loadImg(`/api/files/frame/${ev.id}?v=${vv}`) : null, l: p.hasFrameL ? await loadImg(`/api/files/framel/${ev.id}?v=${vv}`) : null };
    for (const [id, land] of [['pv', false], ['pvl', true]]) {
      const c = composePrint(ev, null, frames, 'https://example.com/v/preview', { landscape: land, w: land ? 600 : 400, h: land ? 400 : 600 }), pv = $('#' + id, el);
      pv.width = c.width; pv.height = c.height; pv.getContext('2d').drawImage(c, 0, 0);
    }
  })();
  $('#mode', el).onchange = async () => { const m = val('mode'); await put({ print: { on: m === 'both' || m === 'print' }, video: { on: m === 'both' || m === 'video' } }); };
  $('#savep', el).onclick = (e) => busy(e.target, async () => { const wv = (pre) => Object.fromEntries(['x', 'y', 'w', 'h'].map((k) => [k, +$(`[data-win=${pre}${k}]`, el).value]));
    await put({ print: { from: val('pfrom'), copies: +val('pcopies'), qr: chk('pqr'), inset: chk('pinset'), win: wv('p'), winL: wv('l') } }); route(); });
  $('#savev', el).onclick = (e) => busy(e.target, () => put({ video: { motion: val('vmotion'), resolution: val('vres') } }));
}

function tabEmail(el) {
  const m = ev.email;
  el.innerHTML = `<div class="card"><h2>Guest email</h2>
    ${settings.emailReady ? '' : '<p class="pill warn">EMAIL_API_KEY is not set yet. Addresses are saved and you can send them later from the Gallery.</p>'}
    <label class="switch"><input type="checkbox" id="een" ${m.enabled ? 'checked' : ''}> Email guests their video</label><br>
    <label class="switch" style="margin-top:8px"><input type="checkbox" id="ebooth" ${m.atBooth ? 'checked' : ''}> Ask for the email on the booth screen</label>
    <label class="f">Sender name</label><input type="text" id="esender" value="${esc(m.senderName)}" placeholder="${esc(ev.name)}">
    <label class="f">Subject</label><input type="text" id="esubj" value="${esc(m.subject)}">
    <label class="f">Heading (also on the guest page)</label><input type="text" id="ehead" value="${esc(m.heading)}">
    <label class="f">Message</label><textarea id="emsg">${esc(m.message)}</textarea>
    <label class="f">Button</label><input type="text" id="ebtn" value="${esc(m.button)}">
    <label class="f">Consent tick box (required)</label><input type="text" id="econs" value="${esc(m.consent)}">
    <label class="switch" style="margin-top:12px"><input type="checkbox" id="emk" ${m.marketing ? 'checked' : ''}> Also show an optional marketing opt-in tick box</label>
    <input type="text" id="emktxt" value="${esc(m.marketingText)}" style="margin-top:6px">
    <button class="btn" id="save" style="margin-top:16px">Save email</button></div>`;
  $('#save', el).onclick = (e) => busy(e.target, () => put({ email: { enabled: chk('een'), atBooth: chk('ebooth'), senderName: val('esender'), subject: val('esubj'), heading: val('ehead'), message: val('emsg'), button: val('ebtn'), consent: val('econs'), marketing: chk('emk'), marketingText: val('emktxt') } }));
}

const VPILL = { ready: ['ok', 'Video ready'], making: ['warn', 'Animating…'], waiting: ['warn', 'Video queued'], error: ['bad', 'Video failed'], off: ['', 'No video'] };
async function tabGallery(el) {
  const list = await api(`/events/${ev.id}/shots`);
  const nMail = list.reduce((n, m) => n + (m.emails || []).length, 0);
  el.innerHTML = `<div class="card row"><b>${list.length} guests</b><span class="muted">${list.filter((m) => m.video === 'ready').length} videos · ${list.reduce((n, m) => n + (m.printed || 0), 0)} prints · ${nMail} email addresses</span><span class="grow"></span>
      <a class="btn ghost small" href="/api/events/${ev.id}/emails.csv">Download emails (CSV)</a><button class="btn ghost small" id="reload">Refresh</button></div>
    <div class="gallery">${list.map((m) => {
      const vp = VPILL[m.video] || ['', m.video], img = m.hasThumb ? `/api/shots/${m.id}/thumb` : m.toon === 'ready' ? `/api/shots/${m.id}/toon` : '';
      const mails = (m.emails || []).map((e) => `<div title="${esc(e.error || '')}">${esc(e.to)} ${e.sent ? '✓' : e.error ? '✗' : '…'}</div>`).join('');
      return `<div class="tile">${img ? `<img loading="lazy" src="${img}" alt="">` : `<img alt="">`}
        <div class="meta">${new Date(m.created).toLocaleString()} · ${esc((ev.styles.find((s) => s.id === m.style) || {}).name || '')}</div>
        <div class="meta"><span class="pill ${m.toon === 'error' ? 'bad' : ''}">${m.toon === 'ready' ? 'Drawn' : m.toon === 'error' ? 'Drawing failed' : 'Drawing…'}</span> <span class="pill ${vp[0]}" title="${esc(m.videoError || '')}">${vp[1]}</span></div>
        <div class="meta">${m.printed ? `Printed ${m.printed}x` : 'Not printed'}</div><div class="meta">${mails}</div>
        <div class="acts">${m.toon === 'ready' ? `<a class="btn ghost" href="/v/${m.id}" target="_blank">Guest page</a><button class="btn ghost" data-mail="${m.id}">Email</button>` : ''}
          ${m.toon === 'error' ? `<button class="btn ghost" data-retry="${m.id}" data-what="toon">Redraw</button>` : ''}${m.toon === 'ready' && ['error', 'ready'].includes(m.video) ? `<button class="btn ghost" data-retry="${m.id}" data-what="video">${m.video === 'error' ? 'Retry video' : 'Remake video'}</button>` : ''}
          <button class="btn danger" data-del="${m.id}">Delete</button></div></div>`;
    }).join('') || '<div class="card">No guests yet.</div>'}</div>`;
  $('#reload', el).onclick = route;
  $$('[data-mail]', el).forEach((b) => { b.onclick = () => busy(b, async () => { const to = prompt('Send to which email address?'); if (!to) return; const r = await api(`/shots/${b.dataset.mail}/email`, { method: 'POST', body: { email: to } }); toast(r.sentNow ? 'Sent' : 'Saved: it sends when the video is ready'); route(); }); });
  $$('[data-retry]', el).forEach((b) => { b.onclick = () => busy(b, async () => { await api(`/shots/${b.dataset.retry}/retry/${b.dataset.what}`, { method: 'POST' }); toast('Started'); setTimeout(route, 800); }); });
  $$('[data-del]', el).forEach((b) => { b.onclick = async () => { if (!confirm('Delete this guest\'s photo, caricature and video?')) return; await api('/shots/' + b.dataset.del, { method: 'DELETE' }); route(); }; });
}
