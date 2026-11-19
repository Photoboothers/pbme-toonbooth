// Shared server code: storage, sign-in keys, AI prompts, Gemini calls and email.
import { getStore } from '@netlify/blobs';
import { createHmac } from 'node:crypto';

export const store = (name) => getStore({ name, consistency: 'strong' });
export const EV = () => store('tb-events'), SET = () => store('tb-settings'), FILES = () => store('tb-files');
export const SHOTS = () => store('tb-shots'), SIDX = () => store('tb-sid');

export const secret = () => 'tb-session|' + (process.env.ADMIN_PASSWORD || '');
export const sign = (v) => createHmac('sha256', secret()).update(v).digest('base64url');
export const jobKey = (id) => sign('job:' + id).slice(0, 24);   // protects the background functions
export const validId = (s) => typeof s === 'string' && /^[a-z0-9]{6,20}$/.test(s);
export const IMAGE_MODEL = () => process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
export const VIDEO_MODEL = () => process.env.GEMINI_VIDEO_MODEL || 'gemini-omni-1.1-flash';
export const DEFAULT_FROM = 'events@photobooth-me.com';

// ---------- events ----------
export const DEFAULT_STYLES = [
  { id: 'sketch', name: 'Pencil sketch', on: true, prompt: 'a hand-drawn black and white pencil caricature on clean white sketchbook paper: confident graphite lines, soft cross-hatched shading, a slightly oversized head on a smaller body, a few playful hand-drawn doodles around them such as stars, sparkles and swirls' },
  { id: 'cartoon', name: 'Cartoon', on: true, prompt: 'a bright, polished cartoon caricature in a premium animated-film style: smooth soft shading, big expressive eyes, warm glowing colours, a slightly oversized head, on a soft pastel background with a few floating sparkles and hearts' },
  { id: 'comic', name: 'Comic pop', on: true, prompt: 'a bold comic-book pop-art caricature: thick black ink outlines, punchy flat colours, halftone dot shading, a slightly oversized head, on a bright burst background with action lines' },
  { id: 'water', name: 'Watercolour', on: false, prompt: 'a soft watercolour and ink caricature: loose fine ink lines, gentle colour washes that bleed at the edges, a slightly oversized head, on textured white watercolour paper with a few painted splashes' },
];
export const DEFAULT_EXPRESSIONS = [
  'laughing out loud, eyes squeezed shut with joy',
  'amazed, mouth wide open in a big "wow"',
  'cheeky grin with one eyebrow raised',
  'beaming proudly with a big confident smile',
  'giggling with a hand near their mouth',
  'love-struck, with a huge dreamy smile',
];
export const DEFAULT_MOTION = 'Bring this caricature to life as a short, playful animation. The character comes alive with a big, exaggerated version of their expression: they laugh, react and move their head, shoulders and hands naturally. The doodles and sparkles around them gently wiggle and twinkle. Keep exactly the same art style, colours, linework, face and framing for the whole clip, so it still looks hand-made. The camera stays still. Light playful sound effects only: no speech, no singing, no words on screen.';

export function newEvent(id, name) {
  return {
    id, name: name || 'New event', created: Date.now(),
    boothTitle: 'Caricature Booth', tagline: 'Strike a pose. Get drawn.', startBtn: 'Start',
    colors: { bg: '#121012', accent: '#ED2F5B', text: '#FFFFFF' },
    styles: DEFAULT_STYLES.map((s) => ({ ...s })), guestChoice: true, expressions: DEFAULT_EXPRESSIONS.slice(),
    allowGroup: true, countdown: 3, makingTitle: 'Magic happening', makingSub: 'Please wait, just a moment',
    video: { on: true, motion: DEFAULT_MOTION, aspect: '9:16', resolution: '720p' },
    print: { on: true, from: 'station', copies: 1, qr: true, hasFrame: false },
    email: { enabled: true, atBooth: true, senderName: '', subject: 'Your caricature video', heading: 'Your caricature video',
      message: 'Thanks for stopping by! Here is your animated caricature. Tap below to watch it and save it to your phone.', button: 'Watch my video',
      consent: 'I agree to receive this email with my video.', marketing: false, marketingText: 'Keep me updated with news and offers from the event organiser.' },
    hasLogo: false, hasBg: false, resetSec: 25,
  };
}

// ---------- shots (one guest = one shot) ----------
export async function shotMeta(id) { if (!validId(id)) return null; const i = await SIDX().get(id, { type: 'json' }); return i ? SHOTS().get(`${i.eventId}/${id}`, { type: 'json' }) : null; }
// Each save re-reads the latest copy and only applies the given changes, so the background jobs and the booth never undo each other.
export async function patchShot(id, fn) {
  const cur = await shotMeta(id); if (!cur) return null;
  const out = fn(cur) || cur; await SHOTS().setJSON(`${out.eventId}/${out.id}`, out); return out;
}

// ---------- prompts (the AI never writes any words: all text comes from our own code) ----------
export function toonPrompt(style, expression, team) {
  const who = team ? 'everyone in this photo (the same people, no one added or removed), together in one picture' : 'the person in this photo (if there are several people, include all of them together, no one added or removed)';
  return `Create a fun, flattering caricature of ${who}. Keep them clearly recognisable: the same face shape, features, hairstyle, hair colour, skin tone, glasses, jewellery and clothing. Keep any head covering (hijab, shayla, ghutra, kandura, abaya, turban) and modest clothing exactly as in the photo; never remove, change or add clothing, and keep it respectful and kind, never mocking. Expression: ${expression}. Style: ${style}. Head and upper body, centred, facing the viewer, with space around them; portrait format. NO text, NO letters, NO words, NO speech bubbles with writing, NO logos, NO watermark, NO signature, NO borders, NO frames, NO extra people.`;
}

// ---------- Gemini ----------
export async function geminiImage(b64, prompt) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL()}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '2:3' } } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Gemini: ' + ((j.error && j.error.message) || r.status));
  const c = j.candidates && j.candidates[0], parts = (c && c.content && c.content.parts) || [];
  const img = parts.find((p) => p.inlineData || p.inline_data);
  if (!img) throw new Error('The AI did not return a picture' + (c && c.finishReason ? ` (${c.finishReason})` : ''));
  const d = img.inlineData || img.inline_data;
  return { buf: Buffer.from(d.data, 'base64'), type: d.mimeType || d.mime_type || 'image/png' };
}

// Image to video with Gemini Omni Flash (Interactions API). One call; the video comes back in the response.
export async function geminiVideo(b64, mime, prompt, opts = {}) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      model: VIDEO_MODEL(),
      input: [{ type: 'image', data: b64, mime_type: mime || 'image/png' }, { type: 'text', text: prompt }],
      generation_config: { video_config: { task: 'image_to_video' } },
      response_format: { type: 'video', aspect_ratio: opts.aspect || '9:16', resolution: opts.resolution || '720p' },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Gemini video: ' + ((j.error && j.error.message) || r.status));
  let vid = null;
  for (const s of j.steps || []) for (const c of s.content || []) if (c.type === 'video' && (c.data || c.uri)) vid = c;
  if (!vid) throw new Error('The AI did not return a video' + (j.status && j.status !== 'completed' ? ` (${j.status})` : ''));
  if (vid.data) return { buf: Buffer.from(vid.data, 'base64'), type: vid.mime_type || 'video/mp4' };
  const d = await fetch(vid.uri, { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY } });
  if (!d.ok) throw new Error('Could not download the video (' + d.status + ')');
  return { buf: Buffer.from(await d.arrayBuffer()), type: 'video/mp4' };
}

// ---------- email (Brevo, same service and sender as the other booths) ----------
const escH = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export async function sendGuestEmail({ to, ev, m, origin }) {
  const key = process.env.EMAIL_API_KEY;
  if (!key) throw Object.assign(new Error('Email is not set up yet: add EMAIL_API_KEY in Netlify (then redeploy).'), { status: 503 });
  const s = (await SET().get('global', { type: 'json' })) || {};
  const em = ev.email || {}, accent = (ev.colors && ev.colors.accent) || '#ED2F5B', link = `${origin}/v/${m.id}`;
  const from = process.env.EMAIL_FROM || s.emailFrom || DEFAULT_FROM;
  const logo = ev.hasLogo ? `${origin}/api/files/logo/${ev.id}?v=${ev.filesV || 0}` : '';
  const hasVideo = m.video === 'ready';
  const button = hasVideo ? (em.button || 'Watch my video') : 'See my caricature';
  const html = `<!doctype html><html><body style="margin:0;background:#f2f3f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden">
<tr><td align="center" style="background:${escH(accent)};padding:22px">${logo ? `<img src="${escH(logo)}" alt="" style="max-width:260px;max-height:90px">` : `<div style="color:#fff;font-size:22px;font-weight:bold">${escH(em.heading || ev.name)}</div>`}</td></tr>
<tr><td style="padding:24px 26px 8px;color:#222;font-size:16px;line-height:1.55">${escH(em.message).replace(/\n/g, '<br>')}</td></tr>
<tr><td align="center" style="padding:10px 24px"><a href="${escH(link)}"><img src="${escH(origin)}/api/public/media/${m.id}/thumb.jpg" alt="Your caricature" width="240" style="width:240px;max-width:100%;border-radius:10px;display:block"></a></td></tr>
<tr><td align="center" style="padding:16px 24px 30px"><a href="${escH(link)}" style="background:${escH(accent)};color:#fff;text-decoration:none;padding:15px 28px;border-radius:30px;font-weight:bold;display:inline-block">${escH(button)}</a></td></tr>
</table></td></tr></table></body></html>`;
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { name: em.senderName || ev.name || 'Photobooth-ME', email: from }, replyTo: { email: from }, to: [{ email: to }],
      subject: em.subject || 'Your caricature video', htmlContent: html, textContent: `${em.message || ''}\n\n${button}: ${link}` }),
  });
  if (!r.ok) throw Object.assign(new Error('Email service: ' + (await r.text()).slice(0, 300)), { status: 502 });
}

// The video is finished (or failed, or switched off): email everyone waiting for this guest's video.
export const videoSettled = (m) => ['ready', 'error', 'off'].includes(m.video);
export async function flushEmails(id, origin) {
  if (!process.env.EMAIL_API_KEY) return 0;
  let todo = [];
  const m = await patchShot(id, (cur) => {
    if (!videoSettled(cur) || cur.toon !== 'ready') return cur;
    for (const e of cur.emails || []) if (!e.sent && !(e.sending && Date.now() - e.sending < 5 * 60 * 1000) && (e.tries || 0) < 3) { e.sending = Date.now(); todo.push(e.to); }
    return cur;
  });
  if (!m || !todo.length) return 0;
  const ev = await EV().get(m.eventId, { type: 'json' }); let n = 0;
  for (const to of todo) {
    let res = {};
    try { await sendGuestEmail({ to, ev, m, origin }); res = { sent: Date.now() }; n++; } catch (e) { res = { error: e.message }; }
    await patchShot(id, (cur) => { const e = (cur.emails || []).find((x) => x.to === to); if (e) { delete e.sending; e.tries = (e.tries || 0) + 1; if (res.sent) { e.sent = res.sent; delete e.error; } else e.error = res.error; } return cur; });
  }
  return n;
}
