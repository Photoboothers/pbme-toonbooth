// Background job (up to 15 min): caricature still -> short animated video (Gemini Omni Flash), then emails the guest.
import { EV, FILES, jobKey, patchShot, shotMeta, geminiVideo, flushEmails, DEFAULT_MOTION } from './lib.mjs';

export default async (req) => {
  const { id, origin, k } = await req.json().catch(() => ({}));
  if (!id || k !== jobKey(id)) return;
  try {
    const m = await shotMeta(id); if (!m || m.toon !== 'ready') return;
    const ev = await EV().get(m.eventId, { type: 'json' }); const style = (ev.styles || []).find((x) => x.id === m.style) || {};
    // each style can have its own movement (e.g. the pixel hero catching coins); the video shape follows the picture
    const v = { ...(ev.video || {}), aspect: m.shape === 'landscape' ? '16:9' : '9:16' };
    await patchShot(id, (cur) => { cur.video = 'making'; cur.videoStart = Date.now(); return cur; });
    const toon = await FILES().get(`toon/${id}`, { type: 'arrayBuffer' });
    const b64 = Buffer.from(toon).toString('base64'), prompt = (style.motion || '').trim() || (v.motion || '').trim() || DEFAULT_MOTION;
    let out;
    try { out = await geminiVideo(b64, m.toonType, prompt, v); } catch { out = await geminiVideo(b64, m.toonType, prompt, v); }   // one automatic retry
    await FILES().set(`video/${id}`, out.buf, { metadata: { type: out.type } });
    await patchShot(id, (cur) => { cur.video = 'ready'; cur.videoAt = Date.now(); cur.videoSize = out.buf.length; delete cur.videoError; return cur; });
  } catch (e) {
    // the guest still gets an email, with their caricature still instead of the video
    await patchShot(id, (cur) => { cur.video = 'error'; cur.videoError = e.message; return cur; });
  }
  await flushEmails(id, origin);
};
