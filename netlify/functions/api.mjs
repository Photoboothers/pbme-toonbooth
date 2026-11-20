// Photobooth-ME Caricature Booth - API (one function, routed by path)
import { timingSafeEqual, randomBytes } from 'node:crypto';
import { EV, SET, FILES, SHOTS, SIDX, sign, jobKey, validId, newEvent, STYLE_LIBRARY, GROUP_ORDER, MAX_PER_MODE, shotMeta, patchShot, flushEmails, videoSettled, DEFAULT_FROM, IMAGE_MODEL, VIDEO_MODEL } from './lib.mjs';

export const config = { path: '/api/*' };

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const err = (msg, status = 400) => json({ error: msg }, status);
const rid = (n = 10) => { const a = 'abcdefghijkmnpqrstuvwxyz23456789'; const b = randomBytes(n); let s = ''; for (let i = 0; i < n; i++) s += a[b[i] % a.length]; return s; };
function cookies(req) { const o = {}; (req.headers.get('cookie') || '').split(';').forEach((c) => { const i = c.indexOf('='); if (i > 0) o[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); }); return o; }
function isAdmin(req) {
  if (!process.env.ADMIN_PASSWORD) return false;
  const c = cookies(req).tb_admin; if (!c) return false;
  const [exp, sig] = c.split('.'); if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp); return good.length === sig.length && timingSafeEqual(Buffer.from(good), Buffer.from(sig));
}
const sameText = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
async function body(req) { try { return await req.json(); } catch { return {}; } }
const okEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
const FILE_KEY = /^((logo|bg|frame|framel)\/[a-z0-9]+|sample\/[a-z0-9]+\/[a-z0-9]{2,12})$/;
const str = (v, n) => String(v ?? '').slice(0, n);
// streamed in pieces so phones get exactly the byte range they ask for (iPhones need ranges to play video)
const streamOf = (buf) => new ReadableStream({ start(ctrl) { for (let i = 0; i < buf.length; i += 256 * 1024) ctrl.enqueue(new Uint8Array(buf.buffer, buf.byteOffset + i, Math.min(256 * 1024, buf.length - i))); ctrl.close(); } });

const startJob = (origin, name, id) => fetch(`${origin}/.netlify/functions/${name}-background`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, origin, k: jobKey(id) }) });
async function deleteShot(eventId, id) {
  await Promise.all([...['photo', 'toon', 'video', 'print', 'thumb'].map((k) => FILES().delete(`${k}/${id}`)), SHOTS().delete(`${eventId}/${id}`), SIDX().delete(id)]);
}
async function listShots(eventId) {
  const { blobs } = await SHOTS().list({ prefix: eventId + '/' }); const list = [];
  await Promise.all(blobs.map(async (b) => { const m = await SHOTS().get(b.key, { type: 'json' }); if (m) list.push(m); }));
  return list.sort((a, b) => b.created - a.created);
}
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function cleanEvent(ev, b) {
  for (const k of ['name', 'boothTitle', 'tagline', 'startBtn', 'makingTitle', 'makingSub']) if (b[k] !== undefined) ev[k] = str(b[k], 80);
  for (const k of ['guestChoice', 'allowGroup']) if (b[k] !== undefined) ev[k] = !!b[k];
  if (Array.isArray(b.mixGroups)) ev.mixGroups = b.mixGroups.map((g) => str(g, 30)).slice(0, 40);
  if (Array.isArray(b.groupsOff)) ev.groupsOff = b.groupsOff.map((g) => str(g, 30)).slice(0, 40);
  if (['both', 'ai', 'toon'].includes(b.boothType)) ev.boothType = b.boothType;
  if (b.countdown !== undefined) ev.countdown = Math.max(0, Math.min(10, Math.round(+b.countdown || 0)));
  if (b.resetSec !== undefined) ev.resetSec = Math.max(45, Math.min(300, Math.round(+b.resetSec || 45)));
  if (b.colors && typeof b.colors === 'object') for (const k of ['bg', 'accent', 'text']) if (/^#[0-9a-f]{6}$/i.test(b.colors[k] || '')) ev.colors[k] = b.colors[k];
  if (Array.isArray(b.styles)) {
    const seen = new Set();
    ev.styles = b.styles.slice(0, 100).map((s, i) => {
      let id = /^[a-z0-9]{2,12}$/.test(s.id || '') ? s.id : 's' + rid(5); if (seen.has(id)) id = (id.slice(0, 6) + rid(5)); seen.add(id);
      return { id, name: str(s.name, 30) || 'Style ' + (i + 1), prompt: str(s.prompt, 1200), motion: str(s.motion, 1500), shape: 'portrait', kind: s.kind === 'ai' ? 'ai' : 'toon',
        caricature: !!s.caricature, logo: !!s.logo, word: str(s.word, 20).trim(), group: str(s.group, 30), on: s.on !== false, hasSample: !!s.hasSample };
    });
  }
  // at most 12 styles switched on per mode (AI Create, Toon Style)
  if (Array.isArray(b.styles)) { const n = { ai: 0, toon: 0 }; for (const x of ev.styles) if (x.on) { const k = x.kind === 'ai' ? 'ai' : 'toon'; if (++n[k] > MAX_PER_MODE) x.on = false; } }
  if (Array.isArray(b.expressions)) ev.expressions = b.expressions.map((x) => str(x, 200).trim()).filter(Boolean).slice(0, 20);
  if (b.video && typeof b.video === 'object') {
    const v = b.video; ev.video = { ...ev.video };
    if (v.on !== undefined) ev.video.on = !!v.on;
    if (v.motion !== undefined) ev.video.motion = str(v.motion, 1500);
    if (['360p', '720p', '1080p'].includes(v.resolution)) ev.video.resolution = v.resolution;
  }
  if (b.print && typeof b.print === 'object') {
    const p = b.print; ev.print = { ...ev.print };
    if (p.on !== undefined) ev.print.on = !!p.on;
    if (['station', 'booth'].includes(p.from)) ev.print.from = p.from;
    if (p.copies !== undefined) ev.print.copies = Math.max(1, Math.min(5, Math.round(+p.copies || 1)));
    if (p.qr !== undefined) ev.print.qr = !!p.qr;
    if (p.inset !== undefined) ev.print.inset = !!p.inset;
    // where the picture sits on the page, in % (so a branded card frame can have its own window); default = whole page
    const win = (w) => { const n = (v, d) => { const x = Number(v); return Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : d; }; const r = { x: n(w.x, 0), y: n(w.y, 0), w: n(w.w, 100), h: n(w.h, 100) }; r.w = Math.min(r.w, 100 - r.x) || 100; r.h = Math.min(r.h, 100 - r.y) || 100; return r; };
    if (p.win && typeof p.win === 'object') ev.print.win = win(p.win);
    if (p.winL && typeof p.winL === 'object') ev.print.winL = win(p.winL);
  }
  if (b.email && typeof b.email === 'object') {
    const e = b.email; ev.email = { ...ev.email };
    for (const k of ['enabled', 'atBooth', 'marketing']) if (e[k] !== undefined) ev.email[k] = !!e[k];
    for (const [k, n] of [['senderName', 60], ['subject', 120], ['heading', 80], ['message', 1200], ['button', 40], ['consent', 200], ['marketingText', 200]]) if (e[k] !== undefined) ev.email[k] = str(e[k], n);
  }
  return ev;
}

export default async (req) => {
  const url = new URL(req.url), origin = url.origin, path = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
  const seg = path.split('/').filter(Boolean), method = req.method;
  try {
    // ---------- sign-in ----------
    if (path === '/login' && method === 'POST') {
      if (!process.env.ADMIN_PASSWORD) return err('ADMIN_PASSWORD is not set in Netlify environment variables (then redeploy).', 500);
      const { password } = await body(req);
      if (!sameText(String(password || '').trim(), process.env.ADMIN_PASSWORD.trim())) return err("That password doesn't match.", 401);
      const exp = String(Date.now() + 30 * 24 * 3600 * 1000);
      return json({ ok: true }, 200, { 'set-cookie': `tb_admin=${exp}.${sign(exp)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 3600}` });
    }
    if (path === '/logout') return json({ ok: true }, 200, { 'set-cookie': 'tb_admin=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
    if (path === '/me') return isAdmin(req) ? json({ ok: true }) : err('Not signed in', 401);

    // ---------- public: guest page, media, email ----------
    if (seg[0] === 'public') {
      if (seg[1] === 'v' && method === 'GET') {
        const m = await shotMeta(seg[2]);
        if (!m) return validId(seg[2]) ? json({ pending: true, waiting: true }, 202) : err('Not found', 404);   // not sent from the booth yet
        if (m.toon !== 'ready') return json({ pending: true }, 202);
        const ev = (await EV().get(m.eventId, { type: 'json' })) || {};
        return json({ id: m.id, name: ev.name, heading: (ev.email && ev.email.heading) || 'Your picture', colors: ev.colors || {},
          logo: ev.hasLogo ? `/api/files/logo/${ev.id}?v=${ev.filesV || 0}` : '', video: m.video, toon: `/api/public/media/${m.id}/toon` });
      }
      if (seg[1] === 'media' && method === 'GET') {
        const id = seg[2] || '', name = seg[3] || ''; if (!validId(id)) return err('Not found', 404);
        const dl = url.searchParams.get('dl');
        if (name === 'toon' || name === 'thumb.jpg') {
          const r = (name === 'thumb.jpg' && await FILES().getWithMetadata(`thumb/${id}`, { type: 'arrayBuffer' })) || await FILES().getWithMetadata(`toon/${id}`, { type: 'arrayBuffer' });
          if (!r) return err('Not found', 404);
          const type = (r.metadata && r.metadata.type) || 'image/png', h = { 'content-type': type, 'cache-control': 'public, max-age=3600' };
          if (dl) h['content-disposition'] = `attachment; filename="My-caricature.${type.includes('jpeg') ? 'jpg' : 'png'}"`;
          return new Response(r.data, { headers: h });
        }
        if (name === 'video.mp4') {
          const r = await FILES().get(`video/${id}`, { type: 'arrayBuffer' }); if (!r) return err('Not found', 404);
          const all = Buffer.from(r), total = all.length;
          const base = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=3600' };
          if (dl) base['content-disposition'] = 'attachment; filename="My-caricature-video.mp4"';
          const rg = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
          if (rg) {
            let a = rg[1] === '' ? total - (+rg[2] || 0) : +rg[1], z = rg[1] !== '' && rg[2] !== '' ? +rg[2] : total - 1;
            a = Math.max(0, Math.min(a, total - 1)); z = Math.max(a, Math.min(z, total - 1));
            return new Response(streamOf(all.subarray(a, z + 1)), { status: 206, headers: { ...base, 'content-range': `bytes ${a}-${z}/${total}`, 'content-length': String(z - a + 1) } });
          }
          return new Response(streamOf(all), { headers: { ...base, 'content-length': String(total) } });
        }
        return err('Not found', 404);
      }
      if (seg[1] === 'email' && method === 'POST') {
        const { id, email, consent, marketing } = await body(req), to = String(email || '').trim().toLowerCase();
        if (!consent) return err('Please tick the box to agree to receive the email.');
        if (!okEmail(to)) return err('Please check the email address.');
        const m0 = await shotMeta(id); if (!m0) return err('Not found', 404);
        const ev = await EV().get(m0.eventId, { type: 'json' }); if (!ev || !ev.email || !ev.email.enabled) return err('Email is not available for this event.', 403);
        if ((m0.emails || []).length >= 5) return err('Already sent to several addresses.', 429);
        const m = await patchShot(id, (cur) => { cur.emails = cur.emails || []; if (!cur.emails.some((e) => e.to === to)) cur.emails.push({ to, at: Date.now(), consent: true, marketing: !!marketing }); return cur; });
        if (!process.env.EMAIL_API_KEY) return json({ ok: true, saved: true });
        if (videoSettled(m) && m.toon === 'ready') await flushEmails(id, origin);
        return json({ ok: true, later: !videoSettled(m) });
      }
      return err('Not found', 404);
    }
    if (seg[0] === 'files' && method === 'GET') {
      const key = seg.slice(1).join('/'); if (!FILE_KEY.test(key)) return err('Not found', 404);
      const r = await FILES().getWithMetadata(key, { type: 'arrayBuffer' }); if (!r) return err('Not found', 404);
      return new Response(r.data, { headers: { 'content-type': (r.metadata && r.metadata.type) || 'image/png', 'cache-control': 'public, max-age=60' } });
    }

    // ---------- signed in (admin, booth, print station) ----------
    if (!isAdmin(req)) return err('Not signed in', 401);

    if (path === '/library' && method === 'GET') return json(STYLE_LIBRARY);
    if (path === '/test-ai' && method === 'POST') {   // quick check that the Gemini key and picture model work
      if (!process.env.GEMINI_API_KEY) return err('GEMINI_API_KEY is not set in Netlify (then redeploy).', 503);
      const t0 = Date.now();
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL()}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'A simple cartoon drawing of a smiling yellow sun on a white background.' }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }) });
        const j = await r.json().catch(() => ({}));
        const ok = r.ok && JSON.stringify(j).includes('inlineData');
        return json({ ok, model: IMAGE_MODEL(), seconds: Math.round((Date.now() - t0) / 100) / 10, error: ok ? '' : ((j.error && j.error.message) || `status ${r.status}`) });
      } catch (e) { return json({ ok: false, model: IMAGE_MODEL(), error: e.message }); }
    }
    if (path === '/settings' && method === 'GET') {
      const s = (await SET().get('global', { type: 'json' })) || {};
      return json({ emailFrom: process.env.EMAIL_FROM || s.emailFrom || DEFAULT_FROM, emailReady: !!process.env.EMAIL_API_KEY, geminiReady: !!process.env.GEMINI_API_KEY, imageModel: IMAGE_MODEL(), videoModel: VIDEO_MODEL() });
    }
    if (seg[0] === 'files' && (method === 'PUT' || method === 'DELETE')) {
      const key = seg.slice(1).join('/'); if (!FILE_KEY.test(key)) return err('Bad file name');
      if (method === 'DELETE') await FILES().delete(key);
      else { const buf = await req.arrayBuffer(); if (buf.byteLength > 5.5 * 1024 * 1024) return err('File too large (max 5 MB). Save backgrounds as JPG.'); await FILES().set(key, buf, { metadata: { type: req.headers.get('content-type') || 'image/png' } }); }
      const [kind, id, styleId] = key.split('/'); const ev = await EV().get(id, { type: 'json' });
      if (ev) {
        if (kind === 'sample') { const s = (ev.styles || []).find((x) => x.id === styleId); if (s) s.hasSample = method === 'PUT'; }
        else if (kind === 'frame' || kind === 'framel') ev.print = { ...ev.print, [kind === 'frame' ? 'hasFrame' : 'hasFrameL']: method === 'PUT' };
        else ev[kind === 'logo' ? 'hasLogo' : 'hasBg'] = method === 'PUT';
        ev.filesV = Date.now(); await EV().setJSON(id, ev);
      }
      return json({ ok: true });
    }

    if (seg[0] === 'events') {
      if (seg.length === 1 && method === 'GET') {
        const { blobs } = await EV().list(); const list = [];
        for (const b of blobs) { const e = await EV().get(b.key, { type: 'json' }); if (e) list.push({ id: e.id, name: e.name, created: e.created }); }
        return json(list.sort((a, b) => b.created - a.created));
      }
      if (seg.length === 1 && method === 'POST') { const b = await body(req); const ev = newEvent(rid(8), str(b.name, 80).trim()); await EV().setJSON(ev.id, ev); return json(ev); }
      const id = seg[1]; if (!validId(id)) return err('Bad event id');
      const ev = await EV().get(id, { type: 'json' }); if (!ev) return err('Event not found', 404);
      if (seg.length === 2 && method === 'GET') { const st = (await SET().get('global', { type: 'json' })) || {}; // library styles always use the library's current category and type
        const REMOVED = ['redcarpet'];   // styles taken out of the library also disappear from older events
        const styles = (ev.styles || []).filter((x) => !REMOVED.includes(x.id)).map((x) => { const l = STYLE_LIBRARY.find((y) => y.id === x.id); return l ? { ...x, group: l.group, kind: l.kind } : x; });
        return json({ ...ev, styles, groupOrder: GROUP_ORDER, libSamples: st.libSamples || {} }); }
      if (seg[2] === 'samples' && method === 'POST') {   // make example pictures for the style buttons from one staff photo
        if (!process.env.GEMINI_API_KEY) return err('GEMINI_API_KEY is not set in Netlify yet (then redeploy).', 503);
        const buf = await req.arrayBuffer(); if (!buf.byteLength || buf.byteLength > 5 * 1024 * 1024) return err('Please choose a photo under 5 MB');
        const ids = (url.searchParams.get('styles') || '').split(',').filter((x) => /^[a-z0-9]{2,12}$/.test(x)).slice(0, 100); if (!ids.length) return err('No styles chosen');
        const key = rid(8); await FILES().set(`samplephoto/${key}`, buf, { metadata: { type: 'image/jpeg' } });
        for (let i = 0; i < ids.length; i += 6) await fetch(`${origin}/.netlify/functions/sample-background`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId: id, photo: key, styles: ids.slice(i, i + 6), k: jobKey('samples:' + key) }) });
        return json({ ok: true, count: ids.length });
      }
      if (seg.length === 2 && method === 'PUT') { cleanEvent(ev, await body(req)); await EV().setJSON(id, ev); return json(ev); }
      if (seg.length === 2 && method === 'DELETE') {
        for (const m of await listShots(id)) await deleteShot(id, m.id);
        for (const k of ['logo', 'bg', 'frame', 'framel']) await FILES().delete(`${k}/${id}`);
        for (const s of ev.styles || []) await FILES().delete(`sample/${id}/${s.id}`);
        await EV().delete(id); return json({ ok: true });
      }
      if (seg[2] === 'shots' && method === 'GET') return json(await listShots(id));
      if (seg[2] === 'emails.csv' && method === 'GET') {
        const rows = [['Email', 'Date', 'Marketing opt-in', 'Sent', 'Guest page']];
        for (const m of (await listShots(id)).reverse()) for (const e of m.emails || []) rows.push([e.to, new Date(e.at).toISOString(), e.marketing ? 'yes' : 'no', e.sent ? 'yes' : (e.error ? 'error: ' + e.error : 'waiting'), `${origin}/v/${m.id}`]);
        return new Response('﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="emails-${id}.csv"`, 'cache-control': 'no-store' } });
      }
    }

    if (seg[0] === 'shots') {
      if (seg[1] === 'start' && method === 'POST') {
        if (!process.env.GEMINI_API_KEY) return err('GEMINI_API_KEY is not set in Netlify yet (then redeploy).', 503);
        const eventId = url.searchParams.get('event'); const ev = validId(eventId) && (await EV().get(eventId, { type: 'json' })); if (!ev) return err('Event not found', 404);
        const buf = await req.arrayBuffer(); if (buf.byteLength > 5 * 1024 * 1024) return err('Photo too large');
        const on = (ev.styles || []).filter((s) => s.on !== false), want = url.searchParams.get('style');
        const style = (on.find((s) => s.id === want) || on[0] || (ev.styles || [])[0] || {}).id;
        const ex = ev.expressions && ev.expressions.length ? ev.expressions : ['big happy smile'];
        const wantId = url.searchParams.get('id');   // the booth makes the id itself, so a retry after a dropped connection never makes a second copy
        const id = /^[a-z0-9]{10}$/.test(wantId || '') ? wantId : rid(10);
        if (await SIDX().get(id, { type: 'json' })) return json({ id, existed: true });
        await FILES().set(`photo/${id}`, buf, { metadata: { type: 'image/jpeg' } });
        const meta = { id, eventId, created: Date.now(), style, expression: ex[Math.floor(Math.random() * ex.length)], team: url.searchParams.get('team') === '1',
          toon: 'making', video: ev.video && ev.video.on ? 'waiting' : 'off', printed: 0, emails: [] };
        await SIDX().setJSON(id, { eventId }); await SHOTS().setJSON(`${eventId}/${id}`, meta);
        await startJob(origin, 'toon', id);
        return json({ id });
      }
      const id = seg[1]; const meta = await shotMeta(id); if (!meta) return err('Not found', 404);
      if (seg.length === 2 && method === 'GET') {
        // the drawing job never reported back (it did not start, or was cut off): mark it so the booth can move on
        const started = meta.toonStart || meta.created;
        if (meta.toon === 'making' && Date.now() - started > (meta.toonStart ? 150000 : 45000)) return json(await patchShot(id, (cur) => { cur.toon = 'error'; cur.toonError = meta.toonStart ? 'The AI took too long (over 2.5 minutes)' : 'The drawing job did not start (check the toon-background function log in Netlify)'; return cur; }));
        return json(meta);
      }
      if (seg.length === 3 && ['toon', 'print', 'thumb'].includes(seg[2]) && method === 'GET') {
        const r = await FILES().getWithMetadata(`${seg[2]}/${id}`, { type: 'arrayBuffer' }); if (!r) return err('Not ready', 404);
        return new Response(r.data, { headers: { 'content-type': (r.metadata && r.metadata.type) || 'image/jpeg', 'cache-control': 'private, max-age=600' } });
      }
      if (seg.length === 3 && ['print', 'thumb'].includes(seg[2]) && method === 'PUT') {
        const buf = await req.arrayBuffer(); if (buf.byteLength > 5.8 * 1024 * 1024) return err('File too large');
        await FILES().set(`${seg[2]}/${id}`, buf, { metadata: { type: 'image/jpeg' } });
        return json(await patchShot(id, (cur) => { if (seg[2] === 'print') { cur.hasPrint = true; cur.printReady = Date.now(); } else cur.hasThumb = true; return cur; }));
      }
      if (method === 'PATCH') { const b = await body(req); return json(await patchShot(id, (cur) => { if (b.printed) cur.printed = (cur.printed || 0) + 1; if (b.printedBy) cur.printedBy = str(b.printedBy, 20); return cur; })); }
      if (method === 'POST' && seg[2] === 'retry') {
        if (seg[3] === 'video' || (meta.toon === 'ready' && seg[3] !== 'toon')) {
          if (meta.toon !== 'ready') return err('The caricature is not ready yet');
          await patchShot(id, (cur) => { cur.video = 'waiting'; delete cur.videoError; return cur; }); await startJob(origin, 'video', id);
        } else { await patchShot(id, (cur) => { cur.toon = 'making'; delete cur.toonError; return cur; }); await startJob(origin, 'toon', id); }
        return json({ ok: true });
      }
      if (method === 'POST' && seg[2] === 'email') {   // staff: send (or resend) to an address
        const { email } = await body(req), to = String(email || '').trim().toLowerCase(); if (!okEmail(to)) return err('Please check the email address.');
        const m = await patchShot(id, (cur) => { cur.emails = cur.emails || []; const e = cur.emails.find((x) => x.to === to); if (e) { delete e.sent; e.tries = 0; delete e.sending; } else cur.emails.push({ to, at: Date.now(), consent: true, by: 'staff' }); return cur; });
        const n = videoSettled(m) ? await flushEmails(id, origin) : 0;
        return json({ ...(await shotMeta(id)), sentNow: n });
      }
      if (method === 'DELETE') { await deleteShot(meta.eventId, id); return json({ ok: true }); }
    }
    return err('Not found', 404);
  } catch (e) { return err(e.message || String(e), e.status || 500); }
};
