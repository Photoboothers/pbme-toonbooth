import { api, esc, toast, modal, loadImg, composePrint } from '/js/common.js';

const app = document.getElementById('app');
const $ = (s, r = app) => r.querySelector(s), $$ = (s, r = app) => Array.from(r.querySelectorAll(s));
let settings = null, ev = null, STATIC = new Set();
fetch('/img/samples/list.json').then((r) => r.json()).then((l) => { STATIC = new Set(l); }).catch(() => {});
const busy = async (btn, fn) => { const t = btn.textContent; btn.disabled = true; btn.textContent = 'Working…'; try { return await fn(); } catch (e) { toast(e.message, true); } finally { btn.disabled = false; btn.textContent = t; } };
const put = async (body) => { ev = await api('/events/' + ev.id, { method: 'PUT', body }); toast('Saved'); return ev; };
const upload = (key, file) => api('/files/' + key, { method: 'PUT', body: file, headers: { 'content-type': file.type || 'image/png' } });
const val = (id) => $('#' + id).value, chk = (id) => $('#' + id).checked;
const lines = (t) => t.split('\n').map((x) => x.trim()).filter(Boolean);

window.addEventListener('tb-auth', renderLogin);
document.getElementById('logout').onclick = async (e) => { e.preventDefault(); await api('/logout', { method: 'POST', allow401: true }); renderLogin(); };
function renderLogin() {
  document.getElementById('nav').classList.add('hidden');
  app.innerHTML = `<div class="card login"><h1>Sign in</h1><p class="muted">AI Create Booth admin</p><form id="lf"><label class="f">Admin password</label><input type="password" id="pw" autofocus>
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
  el.innerHTML = `<div class="card"><h2>Booth type</h2><select id="boothType" style="max-width:560px">
      <option value="both" ${(ev.boothType || 'both') === 'both' ? 'selected' : ''}>AI Create + Toon Style: opens on "Choose your style"</option>
      <option value="ai" ${ev.boothType === 'ai' ? 'selected' : ''}>AI Create only: Start screen, then the AI Create styles</option>
      <option value="toon" ${ev.boothType === 'toon' ? 'selected' : ''}>Toon Style only: Start screen, then the Toon Style styles</option></select>
    <p class="hint">Only the styles of the chosen type show on the booth. Switch them on or off in the Styles tab.</p></div>
    <div class="grid2"><div class="card"><h2>Start screen</h2>
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
  $('#save', el).onclick = (e) => busy(e.target, () => put({ boothType: val('boothType'), boothTitle: val('boothTitle'), tagline: val('tagline'), startBtn: val('startBtn'), makingTitle: val('makingTitle'), makingSub: val('makingSub'),
    countdown: +val('countdown'), resetSec: +val('resetSec'), colors: { bg: val('cbg'), accent: val('cacc'), text: val('ctext') } }));
}

function tabStyles(el) {
  const row = (s) => `<div class="card" data-style="${esc(s.id)}"><div class="row"><label class="switch"><input type="checkbox" data-k="on" ${s.on !== false ? 'checked' : ''}> On</label>
      <input type="text" data-k="name" value="${esc(s.name)}" style="width:220px">
      <select data-k="kind" style="width:150px"><option value="ai" ${s.kind === 'ai' ? 'selected' : ''}>AI Create</option><option value="toon" ${s.kind !== 'ai' ? 'selected' : ''}>Toon Style</option></select>
      <label class="switch" title="Gives each guest a random fun expression from the list below"><input type="checkbox" data-k="caricature" ${s.caricature ? 'checked' : ''}> Fun expressions</label>
      <label class="switch" title="Uses the event logo (Booth look tab)"><input type="checkbox" data-k="logo" ${s.logo ? 'checked' : ''}> Event logo on clothes</label><span class="grow"></span>
      <button class="btn ghost small" data-up-btn>Move up</button><button class="btn ghost small" data-down-btn>Move down</button><button class="btn danger small" data-rm>Remove</button></div>
    <div class="row" style="margin-top:8px">${s.hasSample ? '<span class="pill ok">Own sample image</span>' : (ev.libSamples || {})[s.id] ? '<span class="pill ok">Made from staff photo</span>' : STATIC.has(s.id) ? '<span class="pill ok">Built-in example</span>' : '<span class="pill">No example yet (shows a pencil)</span>'}<label class="btn ghost small">Upload sample<input type="file" accept="image/*" hidden data-up="sample/${ev.id}/${esc(s.id)}"></label>
      ${s.hasSample ? `<button class="btn danger small" data-del="sample/${ev.id}/${esc(s.id)}">Remove sample</button>` : ''}</div>
    <div class="row" style="margin-top:8px"><label class="f" style="margin:0">Big word in the picture (optional, one short word such as a city)</label><input type="text" data-k="word" value="${esc(s.word || '')}" maxlength="20" style="width:200px"></div>
    <label class="f">The look (AI prompt for the picture)</label><textarea data-k="prompt" style="min-height:80px">${esc(s.prompt)}</textarea>
    <label class="f">How it moves in the video (leave empty to use the event's default movement)</label><textarea data-k="motion" style="min-height:60px">${esc(s.motion || '')}</textarea></div>`;
  el.innerHTML = `<div class="card"><div class="row"><label class="switch"><input type="checkbox" id="guestChoice" ${ev.guestChoice ? 'checked' : ''}> Guests pick their style on the booth</label><span class="grow"></span><button class="btn" id="lib">+ Add from the style library</button><button class="btn ghost" id="add">+ Blank style</button></div>
    <p class="hint">Styles are either AI Create (realistic) or Toon Style (cartoon and art). When an event has both, guests switch between AI Create and Toon Style on the booth. When off, each guest gets a surprise style from the ones ticked (like a sketch booth). Upload a sample image for each style so guests can see it on the style button (one of your own test results works best). To change a theme, just edit the words, for example "swinging a golf club" to "serving a tennis ball".</p></div>
    <div class="card"><h2>Pick the styles for this booth</h2><p class="hint">Tick up to 12 for AI Create and up to 12 for Toon Style. The booth shows them under their categories. Tick <b>Mix</b> on a category to show it as one button: the guest picks the category and gets a surprise style from it, like a sketch booth. Edit any style's wording further down after saving.</p>
      <div id="picker"></div><button class="btn" id="pickSave" style="margin-top:10px">Save selection</button></div>
    <div class="card"><h2>Example pictures for the style buttons</h2><p class="hint">Guests choose faster when every button shows a real example. Upload one clear photo of yourself or the team and the AI makes an example for each style (about 15 seconds each, so give it a few minutes). Examples are shared by all your events. An event's own uploaded sample always wins.</p>
      <div class="row"><label class="btn ghost">Choose a staff photo<input type="file" accept="image/*" id="smPhoto" hidden></label><span id="smName" class="muted"></span>
      <select id="smScope" style="width:300px"><option value="missing">Styles in this event with no example</option><option value="event">All styles in this event</option><option value="all">Every style in the library</option></select>
      <button class="btn" id="smGo">Make examples</button></div><p class="hint" id="smMsg"></p></div>
    <div id="styles">${ev.styles.map(row).join('')}</div>
    <div class="card" style="margin-top:18px"><h2>Fun expressions</h2><p class="hint">One per line. Styles with "Fun expressions" ticked give each guest one of these at random.</p><textarea id="expr">${esc(ev.expressions.join('\n'))}</textarea></div>
    <button class="btn" id="save">Save styles</button>`;
  wireFiles(el);
  const collect = () => $$('[data-style]', el).map((c) => ({ id: c.dataset.style, on: $('[data-k=on]', c).checked, name: $('[data-k=name]', c).value, kind: $('[data-k=kind]', c).value, caricature: $('[data-k=caricature]', c).checked, logo: $('[data-k=logo]', c).checked, word: $('[data-k=word]', c).value, group: (ev.styles.find((s) => s.id === c.dataset.style) || {}).group || '',
    prompt: $('[data-k=prompt]', c).value, motion: $('[data-k=motion]', c).value, hasSample: (ev.styles.find((s) => s.id === c.dataset.style) || {}).hasSample }));
  const saveAll = () => put({ guestChoice: chk('guestChoice'), styles: collect(), expressions: lines(val('expr')) });
  $$('[data-rm]', el).forEach((b) => { b.onclick = () => { if (confirm('Remove this style from the event?')) b.closest('[data-style]').remove(); }; });
  $$('[data-down-btn]', el).forEach((b) => { b.onclick = () => { const c = b.closest('[data-style]'); if (c.nextElementSibling) c.parentNode.insertBefore(c.nextElementSibling, c); }; });
  $$('[data-up-btn]', el).forEach((b) => { b.onclick = () => { const c = b.closest('[data-style]'); if (c.previousElementSibling) c.parentNode.insertBefore(c, c.previousElementSibling); }; });
  $('#add', el).onclick = async () => { await put({ guestChoice: chk('guestChoice'), styles: [...collect(), { name: 'New style', prompt: '', on: true }], expressions: lines(val('expr')) }); route(); };
  $('#lib', el).onclick = async () => {
    const lib = await api('/library'), have = new Set(ev.styles.map((s) => s.id)), groups = [...new Set(lib.map((s) => s.group))];
    const m = modal(`<h2>Style library</h2><p class="hint">Tick the styles to add to this event. You can edit them after.</p>${[['ai', 'AI Create styles'], ['toon', 'Toon Style styles']].map(([k, title]) => `<h2 style="margin-top:20px">${title}</h2>` + groups.filter((g) => lib.some((s) => s.kind === k && s.group === g)).map((g) => `<h3 style="margin-top:14px">${esc(g)}</h3>${lib.filter((s) => s.group === g && s.kind === k).map((s) => `<label class="switch" style="display:flex;margin:6px 0;align-items:flex-start"><input type="checkbox" value="${s.id}" ${have.has(s.id) ? 'disabled checked' : ''}><span><b>${esc(s.name)}</b>${s.motion ? ' <span class="pill pink">Own animation</span>' : ''}<br><span class="muted">${esc(s.prompt.slice(0, 140))}…</span></span></label>`).join('')}`).join('')).join('')}
      <div class="row" style="margin-top:14px"><button class="btn" id="addSel">Add selected</button><button class="btn ghost" id="cancel">Cancel</button></div>`);
    m.el.querySelector('#cancel').onclick = m.close;
    m.el.querySelector('#addSel').onclick = async () => {
      const pickIds = [...m.el.querySelectorAll('input:checked:not([disabled])')].map((i) => i.value);
      await put({ guestChoice: chk('guestChoice'), styles: [...collect(), ...lib.filter((s) => pickIds.includes(s.id)).map((s) => ({ ...s, on: true }))], expressions: lines(val('expr')) }); m.close(); route();
    };
  };
  $('#save', el).onclick = (e) => busy(e.target, async () => { await saveAll(); route(); });
  (async () => {
    const lib = await api('/library'), ord = ev.groupOrder || [], rank = (g) => { const i = ord.indexOf(g); return i < 0 ? 99 : i; };
    const kOf = (x) => (x.kind === 'ai' ? 'ai' : 'toon'), onIds = new Set(ev.styles.filter((x) => x.on !== false).map((x) => x.id));
    const thumb = (x) => { const src = (ev.libSamples || {})[x.id] ? `/api/files/sample/lib/${x.id}` : STATIC.has(x.id) ? `/img/samples/${x.id}.jpg` : '/img/pencil.png'; return `<img src="${src}" alt="" style="width:34px;height:51px;object-fit:cover;border-radius:4px;background:#fdfcf8">`; };
    $('#picker', el).innerHTML = [['ai', 'AI Create'], ['toon', 'Toon Style']].map(([k, t]) => {
      const mine = lib.filter((x) => kOf(x) === k), groups = [...new Set(mine.map((x) => x.group))].sort((a, b) => rank(a) - rank(b));
      return `<h3 style="margin-top:14px">${t} <span class="pill" data-count="${k}"></span></h3><div class="grid2">${groups.map((g) => `<div><b>${esc(g)}</b> <label class="switch" style="font-size:13px" title="Guests pick this category and get a surprise style from it"><input type="checkbox" data-mix="${esc(g)}" ${(ev.mixGroups || []).includes(g) ? 'checked' : ''}> Mix (one button, surprise style)</label>${mine.filter((x) => x.group === g).map((x) => `<label class="switch" style="display:flex;gap:8px;align-items:center;margin:5px 0"><input type="checkbox" data-pick="${x.id}" data-k="${k}" ${onIds.has(x.id) ? 'checked' : ''}>${thumb(x)} ${esc(x.name)}</label>`).join('')}</div>`).join('')}</div>`;
    }).join('');
    const recount = () => { for (const k of ['ai', 'toon']) { const n = $$(`[data-pick][data-k=${k}]:checked`, el).length; $(`[data-count=${k}]`, el).textContent = `${n} of 12`; $$(`[data-pick][data-k=${k}]`, el).forEach((c) => { c.disabled = !c.checked && n >= 12; }); } };
    $$('[data-pick]', el).forEach((c) => { c.onchange = recount; }); recount();
    $('#pickSave', el).onclick = (e) => busy(e.target, async () => {
      const want = new Set($$('[data-pick]:checked', el).map((c) => c.dataset.pick)), have = new Set(ev.styles.map((x) => x.id));
      const styles = [...ev.styles.map((x) => (lib.some((l) => l.id === x.id) ? { ...x, on: want.has(x.id) } : x)), ...lib.filter((x) => want.has(x.id) && !have.has(x.id)).map((x) => ({ ...x, on: true }))];
      await put({ styles, groupsOff: [], mixGroups: $$('[data-mix]:checked', el).map((c) => c.dataset.mix) }); route();
    });
  })();
  $('#smPhoto', el).onchange = () => { const f = $('#smPhoto', el).files[0]; $('#smName', el).textContent = f ? f.name : ''; };
  $('#smGo', el).onclick = (e) => busy(e.target, async () => {
    const f = $('#smPhoto', el).files[0]; if (!f) return toast('Choose a staff photo first', true);
    const scope = val('smScope'), lib = scope === 'all' ? await api('/library') : null;
    const ids = scope === 'all' ? lib.map((x) => x.id) : ev.styles.filter((x) => scope === 'event' || !(x.hasSample || (ev.libSamples || {})[x.id] || STATIC.has(x.id))).map((x) => x.id);
    if (!ids.length) return toast('Every style already has an example');
    const small = await shrink(f);
    const r = await api(`/events/${ev.id}/samples?styles=${ids.join(',')}`, { method: 'POST', body: small, headers: { 'content-type': 'image/jpeg' } });
    $('#smMsg', el).textContent = `Making ${r.count} examples now. Come back to this page in a few minutes to see them.`;
  });
}
// shrink a phone photo before uploading (keeps it under the size limit and quick to send)
async function shrink(file) {
  const b = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(b.width, b.height)), c = document.createElement('canvas');
  c.width = Math.round(b.width * k); c.height = Math.round(b.height * k); c.getContext('2d').drawImage(b, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
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
    ${fileRow('Branded frame', 'frame/' + ev.id, p.hasFrame, 'Your own frame for this event: a transparent PNG, 1200 x 1800 px (4x6 portrait at 300 dpi), made in Canva or Photoshop. It goes over every style, so one frame works with all of them.')}
    <label class="f">Picture window (% of the page: left, top, width, height)</label><div class="row">${['x', 'y', 'w', 'h'].map((k) => `<input type="number" min="0" max="100" data-win="p${k}" value="${(p.win || { x: 0, y: 0, w: 100, h: 100 })[k]}" style="width:80px">`).join('')}</div>
    <p class="hint">Leave at 0, 0, 100, 100 for a full-page picture. For a branded card frame (logos along the bottom), set the window to match the frame's clear area, for example 6, 5, 88, 75. The preview updates when you save.</p>
    <button class="btn" id="savep" style="margin-top:16px">Save print</button></div>
    <div class="card"><h2>Preview</h2><div class="preview-wrap row" style="justify-content:center;align-items:center"><canvas id="pv" style="max-width:260px"></canvas></div></div></div>
    <div class="card"><h2>Animated video</h2>
    <label class="f">Default movement (used by styles without their own)</label><textarea id="vmotion">${esc(v.motion)}</textarea>
    <label class="f">Quality</label><select id="vres" style="width:200px">${['360p', '720p', '1080p'].map((r) => `<option ${v.resolution === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
    <p class="hint">Every video is upright (9:16) for phones. 720p is the best balance of speed, cost and quality.</p>
    <button class="btn" id="savev" style="margin-top:12px">Save video</button></div>`;
  wireFiles(el);
  (async () => {
    const vv = ev.filesV || 0, frames = { p: p.hasFrame ? await loadImg(`/api/files/frame/${ev.id}?v=${vv}`) : null, l: p.hasFrameL ? await loadImg(`/api/files/framel/${ev.id}?v=${vv}`) : null };
    for (const [id, land] of [['pv', false]]) {
      const c = composePrint(ev, null, frames, 'https://example.com/v/preview', { landscape: land, w: land ? 600 : 400, h: land ? 400 : 600 }), pv = $('#' + id, el);
      pv.width = c.width; pv.height = c.height; pv.getContext('2d').drawImage(c, 0, 0);
    }
  })();
  $('#mode', el).onchange = async () => { const m = val('mode'); await put({ print: { on: m === 'both' || m === 'print' }, video: { on: m === 'both' || m === 'video' } }); };
  $('#savep', el).onclick = (e) => busy(e.target, async () => { const wv = (pre) => Object.fromEntries(['x', 'y', 'w', 'h'].map((k) => [k, +$(`[data-win=${pre}${k}]`, el).value]));
    await put({ print: { from: val('pfrom'), copies: +val('pcopies'), qr: chk('pqr'), inset: chk('pinset'), win: wv('p') } }); route(); });
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
