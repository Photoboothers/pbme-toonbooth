// Background job: photo -> caricature still (Gemini image). Then starts the video job.
import { EV, FILES, jobKey, patchShot, shotMeta, toonPrompt, geminiImage, flushEmails } from './lib.mjs';

export default async (req) => {
  const { id, origin, k } = await req.json().catch(() => ({}));
  if (!id || k !== jobKey(id)) return;
  try {
    const m = await patchShot(id, (cur) => { cur.toonStart = Date.now(); return cur; }); if (!m) return;
    const ev = await EV().get(m.eventId, { type: 'json' });
    const style = (ev.styles || []).find((s) => s.id === m.style) || (ev.styles || [])[0];
    const photo = await FILES().get(`photo/${id}`, { type: 'arrayBuffer' });
    const lg = style.logo && ev.hasLogo ? await FILES().getWithMetadata(`logo/${ev.id}`, { type: 'arrayBuffer' }) : null;
    const extra = lg ? { mime_type: (lg.metadata && lg.metadata.type) || 'image/png', data: Buffer.from(lg.data).toString('base64') } : null;
    const prompt = toonPrompt(style, m.expression, m.team, !!extra), aspect = '2:3';
    const b64 = Buffer.from(photo).toString('base64');
    let out;
    try { out = await geminiImage(b64, prompt, aspect, extra); } catch { out = await geminiImage(b64, prompt, aspect, extra); }   // one automatic retry
    await FILES().set(`toon/${id}`, out.buf, { metadata: { type: out.type } });
    const videoOn = !!(ev.video && ev.video.on);
    await patchShot(id, (cur) => { cur.toon = 'ready'; cur.toonType = out.type; cur.shape = 'portrait'; cur.toonAt = Date.now(); cur.video = videoOn ? 'waiting' : 'off'; delete cur.toonError; return cur; });
    if (videoOn) await fetch(`${origin}/.netlify/functions/video-background`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, origin, k: jobKey(id) }) });
    else await flushEmails(id, origin);
  } catch (e) {
    await patchShot(id, (cur) => { cur.toon = 'error'; cur.toonError = e.message; return cur; });
  }
};

export const config = { background: true };
