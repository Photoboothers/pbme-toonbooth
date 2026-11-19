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
// The style library. Admin adds any of these to an event (and can edit or write their own).
// shape: portrait = 2:3 (prints full 4x6), landscape = 3:2 (prints turned on the 4x6). caricature: gets a random fun expression.
// motion: how the animated video moves for this style (the event's default motion is used when empty).
export const STYLE_LIBRARY = [
  { id: 'golf', name: 'Golf swing', shape: 'portrait', caricature: false, group: 'Activity',
    prompt: 'a black and white ink line-art caricature: a slightly big head on a full body, caught mid golf swing with the club raised high, wearing smart golf clothes, on a hand-drawn golf course with rolling greens, trees, fluffy clouds, a flag on the green, a golf bag and a ball on the tee, clean confident outlines with light hatching, like a hand-inked colouring-book drawing',
    motion: 'The ink drawing comes alive: they finish a smooth golf swing, the ball flies off in a drawn arc towards the flag, they shade their eyes to watch, then cheer as it lands on the green. Keep the black and white hand-inked line-art style, the same character and course for the whole clip. The camera stays still. Golf club swish, ball thwack and soft cheer sound effects only, no words.' },
  { id: 'sketch', name: 'Instant sketch', shape: 'portrait', caricature: false, group: 'Classic',
    prompt: 'a realistic hand-drawn graphite pencil portrait on white drawing paper, true to life and not exaggerated, fine detailed shading on the face and hair, loose diagonal pencil hatching fading out into the background, looks drawn by a skilled portrait artist',
    motion: 'The pencil portrait gently comes to life: the person blinks, smiles warmly and turns their head slightly, while loose pencil strokes sketch themselves in around them. Everything stays a black and white pencil drawing on paper. The camera stays still. Soft pencil-scratching sound only.' },
  { id: 'pencil', name: 'Pencil caricature', shape: 'portrait', caricature: true, group: 'Classic',
    prompt: 'a hand-drawn black and white pencil caricature on clean white sketchbook paper: confident graphite lines, soft cross-hatched shading, a big head on a smaller body, a few playful hand-drawn doodles around them such as stars, sparkles and swirls' },
  { id: 'cartoon', name: 'Bold cartoon', shape: 'portrait', caricature: true, group: 'Cartoon',
    prompt: 'a bold digital cartoon caricature with thick clean black outlines, smooth flat colours with soft cel shading, a slightly big head, friendly and flattering, on a solid bright sunshine-yellow background' },
  { id: 'lineart', name: 'Clean illustration', shape: 'portrait', caricature: false, group: 'Cartoon',
    prompt: 'a clean modern digital illustration with fine dark outlines and soft natural colours, realistic proportions, flattering and friendly, on a plain white background' },
  { id: 'comic', name: 'Comic pop', shape: 'portrait', caricature: true, group: 'Cartoon',
    prompt: 'a bold comic-book pop-art caricature: thick black ink outlines, punchy flat colours, halftone dot shading, a slightly big head, on a bright burst background with action lines' },
  { id: 'anime', name: 'Anime', shape: 'portrait', caricature: false, group: 'Cartoon',
    prompt: 'a polished Japanese anime-style illustration: clean line art, large expressive eyes, cel shading, vibrant colours, on a soft dreamy sky background with light sparkles' },
  { id: 'avatar', name: 'Pro avatar', shape: 'portrait', caricature: false, group: 'Cartoon',
    prompt: 'a polished vector-style professional avatar portrait, head and shoulders, smooth digital painting with clean outlines, warm flattering lighting, a confident friendly smile, a bold coral-orange arch shape behind the head on a deep navy background; great as a profile picture' },
  { id: 'retroanime', name: 'Retro anime film', shape: 'portrait', caricature: false, group: 'Cartoon',
    prompt: 'a still from a hand-drawn 1990s Japanese animated film: soft flat cel colours, gentle linework, rosy cheeks, warm natural light, an everyday background softly painted behind them' },
  { id: 'animated3d', name: '3D animated film', shape: 'portrait', caricature: true, group: '3D',
    prompt: 'a high-quality 3D animated-film character render, full body: soft global lighting, smooth stylised skin, big expressive eyes, a slightly big head, warm colours, in a pleasant sunny outdoor setting with greenery behind them' },
  { id: 'figurine', name: 'Collectible figurine', shape: 'portrait', caricature: true, group: '3D',
    prompt: 'a 3D-rendered collectible bobblehead figurine with a big head on a small full body, standing on a round green-marble display base with a little grass on top, glossy painted vinyl look, soft studio lighting, plain teal studio backdrop',
    motion: 'The collectible figurine comes alive on its base: the big head bobbles, the figure waves and does a little happy dance, then strikes a proud pose. Keep the glossy vinyl toy look, the base and the backdrop exactly the same. The camera slowly circles a little. Playful toy sound effects only.' },
  { id: 'clay', name: 'Claymation', shape: 'portrait', caricature: true, group: '3D',
    prompt: 'a handmade claymation stop-motion character made of plasticine with visible fingerprints and texture, a slightly big head, bright colours, on a simple handmade felt-and-card set',
    motion: 'Animate in stop-motion claymation style at a slightly choppy frame rate: the clay character waves, laughs and bounces, with the plasticine squishing as they move. Keep the same handmade clay look and set. The camera stays still. Playful squishy sound effects only.' },
  { id: 'bighead', name: 'Big-head photo', shape: 'portrait', caricature: true, group: 'Photo',
    prompt: 'a photo-realistic big-head caricature: a hugely oversized head on a small full body, real skin texture and studio lighting, a fun confident pose, smartly dressed for a party, on a solid colour studio background with a soft floor shadow',
    motion: 'The big-head character comes alive: they bust out a fun dance move, head bobbling, then land a confident pose. Keep it photo-realistic with the same oversized head, outfit and studio background. The camera stays still. Upbeat sound effects only, no words.' },
  { id: 'dream', name: 'Dream adventure', shape: 'portrait', caricature: false, group: 'Photo',
    prompt: 'a realistic, sunny action photograph of them kitesurfing on a bright turquoise sea, holding the kite bar, water spraying, seagulls in a blue sky, wearing the same clothes as in the photo, joyful and natural',
    motion: 'Continue the action: they glide across the turquoise water on the kiteboard, spray flying, then jump a small wave and land smiling. Keep it photo-realistic, same person and outfit. The camera follows smoothly. Wind and splashing water sounds only.' },
  { id: 'pixel', name: 'Pixel game hero', shape: 'landscape', caricature: false, group: 'Game',
    prompt: 'a bright retro 8-bit pixel-art video game scene with the person as the pixel-art hero character (full body, chunky pixels, clearly the same person), standing on a grassy pixel platform, original pixel-art game world: rounded green hills, fluffy pixel clouds, floating brick platforms and spinning gold coins, a rainbow sky',
    motion: 'Animate it as a retro 8-bit platform game: the pixel hero runs, jumps between the brick platforms and catches the spinning gold coins, each coin sparkling as it is collected, then lands and does a little victory pose. Keep the chunky pixel-art style, the same character and the same game world for the whole clip. Side-on game camera that scrolls slightly. Retro chiptune coin and jump sound effects only, no words.' },
  { id: 'superhero', name: 'Superhero comic', shape: 'portrait', caricature: false, group: 'Game',
    prompt: 'a dynamic comic-book cover style illustration of them as an original superhero in a costume of your own design (no real superhero costumes, symbols or logos), cape flowing, heroic pose, city skyline and dramatic sky behind',
    motion: 'The superhero takes off: the cape billows, they power up with a glow and fly up past the city skyline. Keep the comic-book illustration style and the same character. The camera tilts up with them. Whoosh and power-up sound effects only.' },
  { id: 'laugh', name: 'Big laugh cartoon', shape: 'portrait', caricature: false, group: 'Cartoon',
    prompt: 'a warm hand-painted comic illustration with bold outlines: everyone bursting with huge open-mouthed laughter, big bright smiles, rosy cheeks, sparkling eyes, slightly big heads, fun energetic pose, on a solid warm golden-yellow background',
    motion: 'If there are two or more people, they turn to look at each other, one playfully points at the other, then they both turn back to the camera and burst out laughing together, heads tipping back and shoulders shaking. If there is one person, they glance to the side, point at something off screen, then turn back to the camera and burst out laughing. Keep the same hand-painted comic style, colours and yellow background. The camera stays still. Happy laughter sounds only, no words.' },
  { id: 'redcarpet', name: 'Red carpet stars', shape: 'portrait', caricature: true, group: '3D',
    prompt: 'a glossy 3D cartoon caricature with slightly big heads, full body, dressed in elegant formal evening wear (a sharp tuxedo or a glamorous evening gown with the same coverage as their own clothes), standing on a red carpet between red velvet theatre curtains, a glittering gold sparkle backdrop behind',
    motion: 'Red carpet moment: camera flashes pop, they strike a glamorous pose, smile and wave to the crowd, gold sparkles shimmer behind. Keep the same 3D cartoon style, outfits and red carpet set. The camera slowly pushes in. Camera flash and crowd cheer sound effects only, no words.' },
  { id: 'studio', name: 'Studio caricature', shape: 'portrait', caricature: false, group: 'Photo',
    prompt: 'a photo-realistic studio caricature: true-to-life face and skin texture with a gently oversized head on a slim body, relaxed confident pose with hands in pockets, wearing the same clothes as in the photo, on a plain soft grey studio background with soft lighting' },
  { id: 'crayon', name: 'Crayon scribble', shape: 'portrait', caricature: false, group: 'Art',
    prompt: 'an expressive coloured-pencil and wax-crayon portrait on warm kraft paper: realistic likeness built from energetic scribbled strokes, bold blues, reds, oranges and yellows in the background, rich textured colour on the face and clothes' },
  { id: 'fashion', name: 'Fashion sketch', shape: 'portrait', caricature: false, group: 'Art',
    prompt: 'an elegant fashion-design illustration in ink and soft watercolour: full-length, tall graceful proportions, confident runway-style pose, fine ink outlines with loose watercolour washes on the clothes, on a clean white studio background' },
  { id: 'elf', name: 'Elfie selfie', shape: 'portrait', caricature: false, group: 'Festive',
    prompt: 'a realistic, magical Christmas photograph, full body head to toe, of them dressed as Christmas elves: red and green velvet elf outfits with white fur trim, gold buttons and a black buckled belt, red and green striped tights or trousers, curly elf shoes with little bells, pointy striped elf hats with bells (worn over any head covering, never replacing it), pointed elf ears, standing close together smiling with a cheerful pose, in a snowy clearing of frosted Christmas trees with red baubles and fairy lights, a cosy snow-covered log cabin with glowing windows and a smoking chimney behind, warm golden sunlight, big glittering snowflakes and streaks of golden sparkle in the air',
    motion: 'Festive magic: snow keeps falling, the fairy lights twinkle, they give a big thumbs up and a cheeky wave, the bells on their elf hats jingle, then they lean in together and laugh. Keep it photo-realistic with the same outfits and snowy scene. The camera slowly pushes in. Jingle bells and soft festive sound effects only, no words.' },
  { id: 'jumper', name: 'Christmas jumper card', shape: 'portrait', caricature: true, group: 'Festive',
    prompt: 'a cosy, cheerful 3D cartoon Christmas card scene: wearing bright knitted Christmas jumpers over their own outfits, in front of a decorated Christmas tree and a crackling fireplace with stockings, warm golden glow, wrapped presents and a few floating snowflakes',
    motion: 'Christmas cheer: they raise a mug of hot chocolate, laugh and do a little happy jiggle, the tree lights twinkle and the fire flickers. Keep the same cosy 3D cartoon style and scene. The camera stays still. Crackling fire and jingle sound effects only, no words.' },
  { id: 'water', name: 'Watercolour', shape: 'portrait', caricature: false, group: 'Art',
    prompt: 'a soft, realistic watercolour portrait on textured white watercolour paper: a true likeness with gentle detailed washes on the face, loose painterly clothes, and a soft green, yellow and blue watercolour splash behind them with a few drips and speckles fading into the white paper' },
  { id: 'oil', name: 'Royal oil painting', shape: 'portrait', caricature: false, group: 'Art',
    prompt: 'a classical Renaissance-style royal oil painting portrait: rich dark background, dramatic warm lighting, visible brush strokes and canvas texture, dressed in grand regal robes with a velvet cape and gold details, dignified pose',
    motion: 'The oil painting gently comes to life: the subject raises an eyebrow, breaks into a grin and gives a royal wave, candlelight flickering. Keep the oil-paint brush-stroke texture throughout. The camera stays still. Soft classical ambience, no words.' },
  { id: 'neon', name: 'Neon retro 80s', shape: 'portrait', caricature: false, group: 'Art',
    prompt: 'a retro 1980s synthwave illustration: glowing neon pink and cyan rim lighting, airbrushed style, sunset grid landscape and palm silhouettes behind, cool sunglasses pushed up on the head' },
];
const pick = (...ids) => ids.map((id) => ({ ...STYLE_LIBRARY.find((s) => s.id === id), on: true }));
export const DEFAULT_STYLES = pick('elf', 'golf', 'laugh', 'redcarpet', 'pixel');
export const DEFAULT_EXPRESSIONS = [
  'laughing out loud, eyes squeezed shut with joy',
  'amazed, mouth wide open in a big "wow"',
  'cheeky grin with one eyebrow raised',
  'beaming proudly with a big confident smile',
  'giggling with a hand near their mouth',
  'love-struck, with a huge dreamy smile',
];
export const DEFAULT_MOTION = 'Bring this caricature to life as a short, playful animation. The character comes alive with a big, exaggerated version of their expression: they laugh, react and move their head, shoulders and hands naturally. Any doodles, sparkles or background details gently move and twinkle. Keep exactly the same art style, colours, face and framing for the whole clip. The camera stays still. Light playful sound effects only: no speech, no singing, no words on screen.';

export function newEvent(id, name) {
  return {
    id, name: name || 'New event', created: Date.now(),
    boothTitle: 'Caricature Booth', tagline: 'Strike a pose. Get drawn.', startBtn: 'Start',
    colors: { bg: '#121012', accent: '#ED2F5B', text: '#FFFFFF' },
    styles: DEFAULT_STYLES.map((s) => ({ ...s })), guestChoice: true, expressions: DEFAULT_EXPRESSIONS.slice(),
    allowGroup: true, countdown: 3, makingTitle: 'Magic happening', makingSub: 'Please wait, just a moment',
    video: { on: true, motion: DEFAULT_MOTION, aspect: '9:16', resolution: '720p' },
    print: { on: true, from: 'station', copies: 1, qr: true, inset: true, hasFrame: false, hasFrameL: false },
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
  const landscape = style.shape === 'landscape';
  return `Create a new image of ${who} in this style: ${style.prompt || 'a fun, flattering cartoon'}. Keep every person clearly recognisable: the same face shape, features, hairstyle, hair colour, skin tone, glasses and jewellery. Keep their clothing unless the style describes an outfit, and always keep any head covering (hijab, shayla, ghutra, kandura, abaya, turban) and modest clothing exactly as in the photo; never make clothing more revealing. Keep it respectful, kind and flattering, never mocking.${style.caricature && expression ? ` Expression: ${expression}.` : ''} ${landscape ? 'Landscape' : 'Portrait'} format, the people centred and fully in frame with space around them. NO text, NO letters, NO words, NO numbers, NO speech bubbles with writing, NO logos or brand names on clothing or anywhere, NO watermark, NO signature, NO borders, NO frames, NO extra people.`;
}

// ---------- Gemini ----------
export async function geminiImage(b64, prompt, aspect = '2:3') {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL()}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: aspect } } }),
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
