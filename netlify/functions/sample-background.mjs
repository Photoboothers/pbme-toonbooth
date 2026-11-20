// Background job: turns one staff photo into example pictures for the style buttons (saved for every event to use).
import { EV, SET, FILES, jobKey, toonPrompt, geminiImage, STYLE_LIBRARY } from './lib.mjs';

export default async (req) => {
  const { eventId, photo, styles, k } = await req.json().catch(() => ({}));
  if (!photo || k !== jobKey('samples:' + photo)) return;
  const ev = (await EV().get(eventId, { type: 'json' })) || {};
  const img = await FILES().get(`samplephoto/${photo}`, { type: 'arrayBuffer' }); if (!img) return;
  const b64 = Buffer.from(img).toString('base64');
  for (const id of styles || []) {
    const style = (ev.styles || []).find((s) => s.id === id) || STYLE_LIBRARY.find((s) => s.id === id); if (!style) continue;
    try {
      let out; const p = toonPrompt(style, 'big happy smile', false);
      try { out = await geminiImage(b64, p, '2:3'); } catch { out = await geminiImage(b64, p, '2:3'); }
      await FILES().set(`sample/lib/${id}`, out.buf, { metadata: { type: out.type } });
      const s = (await SET().get('global', { type: 'json' })) || {}; s.libSamples = { ...(s.libSamples || {}), [id]: Date.now() }; await SET().setJSON('global', s);
    } catch (e) { console.log('sample failed', id, e.message); }
  }
};

export const config = { background: true };
