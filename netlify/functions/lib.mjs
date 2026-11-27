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
  { id: 'sketch', kind: 'toon', name: 'Instant sketch', shape: 'portrait', caricature: false, group: 'Line Drawing',
    prompt: 'a realistic hand-drawn graphite pencil portrait on white drawing paper, true to life and not exaggerated, fine detailed shading on the face and hair, loose diagonal pencil hatching fading out into the background, looks drawn by a skilled portrait artist',
    motion: 'The pencil portrait gently comes to life: the person blinks, smiles warmly and turns their head slightly, while loose pencil strokes sketch themselves in around them. Everything stays a black and white pencil drawing on paper. The camera stays still. Soft pencil-scratching sound only.' },
  { id: 'pencil', kind: 'toon', name: 'Pencil caricature', shape: 'portrait', caricature: true, group: 'Line Drawing',
    prompt: 'a hand-drawn black and white pencil caricature on clean white sketchbook paper: confident graphite lines, soft cross-hatched shading, a big head on a smaller body, a few playful hand-drawn doodles around them such as stars, sparkles and swirls' },
  { id: 'cartoon', kind: 'toon', name: 'Bold cartoon', shape: 'portrait', caricature: true, group: 'Cartoon',
    prompt: 'a bold digital cartoon caricature with thick clean black outlines, smooth flat colours with soft cel shading, a slightly big head, friendly and flattering, on a solid bright sunshine-yellow background' },
  { id: 'lineart', kind: 'toon', name: 'Clean illustration', shape: 'portrait', caricature: false, group: 'Line Drawing',
    prompt: 'a clean modern digital illustration with fine dark outlines and soft natural colours, realistic proportions, flattering and friendly, on a plain white background' },
  { id: 'comic', kind: 'toon', name: 'Comic pop', shape: 'portrait', caricature: true, group: 'Cartoon',
    prompt: 'a bold comic-book pop-art caricature: thick black ink outlines, punchy flat colours, halftone dot shading, a slightly big head, on a bright burst background with action lines' },
  { id: 'anime', kind: 'toon', name: 'Anime', shape: 'portrait', caricature: false, group: 'Anime Film',
    prompt: 'a polished Japanese anime-style illustration: clean line art, large expressive eyes, cel shading, vibrant colours, on a soft dreamy sky background with light sparkles' },
  { id: 'avatar', kind: 'toon', name: 'Pro avatar', shape: 'portrait', caricature: false, group: 'Cartoon',
    prompt: 'a polished vector-style professional avatar portrait, head and shoulders, smooth digital painting with clean outlines, warm flattering lighting, a confident friendly smile, a bold coral-orange arch shape behind the head on a deep navy background; great as a profile picture' },
  { id: 'retroanime', kind: 'toon', name: 'Retro anime film', shape: 'portrait', caricature: false, group: 'Anime Film',
    prompt: 'a still from a hand-drawn 1990s Japanese animated film: soft flat cel colours, gentle linework, rosy cheeks, warm natural light, an everyday background softly painted behind them' },
  { id: 'animated3d', kind: 'toon', name: '3D animated film', shape: 'portrait', caricature: true, group: 'Cartoon',
    prompt: 'a high-quality 3D animated-film character render, full body: soft global lighting, smooth stylised skin, big expressive eyes, a slightly big head, warm colours, in a pleasant sunny outdoor setting with greenery behind them' },
  { id: 'figurine', kind: 'toon', name: 'Golf bobblehead', shape: 'portrait', caricature: true, group: 'Bobbleheads',
    prompt: 'a 3D-rendered collectible bobblehead figurine with a big head on a small full body, standing on a round green-marble display base with a little grass on top, posed with props for the event (change these to suit: leaning on a golf club beside a golf bag), glossy painted vinyl look, soft studio lighting, plain teal studio backdrop',
    motion: 'The collectible figurine comes alive on its base: the big head bobbles, the figure waves and does a little happy dance, then strikes a proud pose. Keep the glossy vinyl toy look, the base and the backdrop exactly the same. The camera slowly circles a little. Playful toy sound effects only.' },
  { id: 'clay', kind: 'toon', name: 'Claymation', shape: 'portrait', caricature: true, group: 'Cartoon',
    prompt: 'a handmade claymation stop-motion character made of plasticine with visible fingerprints and texture, a slightly big head, bright colours, on a simple handmade felt-and-card set',
    motion: 'Animate in stop-motion claymation style at a slightly choppy frame rate: the clay character waves, laughs and bounces, with the plasticine squishing as they move. Keep the same handmade clay look and set. The camera stays still. Playful squishy sound effects only.' },
  { id: 'giant', kind: 'ai', name: 'Urban giant', shape: 'portrait', caricature: false, group: 'Fun photos',
    prompt: 'a photo-realistic, dramatic worm\'s-eye view photograph: they are towering giants, as tall as the skyscrapers, walking down the middle of a busy modern city street (change the city to suit the event: downtown Dubai with the tallest tower in the background), wearing the same clothes as in the photo, one huge shoe stepping towards the camera, tiny yellow taxis, traffic lights and people at street level around their feet, glass towers on both sides, bright blue sky, wide-angle lens',
    motion: 'The giants stride down the city street towards the camera: one huge foot lands just short of the lens, the tiny taxis swerve, people below look up, and they grin down at the camera. Keep it photo-realistic with the same clothes and city. Low wide-angle camera, slowly tilting up. Big thudding footsteps and city traffic sounds, no words.' },
  { id: 'bighead', kind: 'toon', name: 'Big-head photo', shape: 'portrait', caricature: true, group: 'Cartoon',
    prompt: 'a photo-realistic big-head caricature: a hugely oversized head on a small full body, real skin texture and studio lighting, a fun confident pose, smartly dressed for a party, on a solid colour studio background with a soft floor shadow',
    motion: 'The big-head character comes alive: they bust out a fun dance move, head bobbling, then land a confident pose. Keep it photo-realistic with the same oversized head, outfit and studio background. The camera stays still. Upbeat sound effects only, no words.' },
  { id: 'dream', kind: 'ai', name: 'Dream adventure', shape: 'portrait', caricature: false, group: 'Fun photos',
    prompt: 'a realistic, sunny action photograph of them kitesurfing on a bright turquoise sea, holding the kite bar, water spraying, seagulls in a blue sky, wearing the same clothes as in the photo, joyful and natural',
    motion: 'Continue the action: they glide across the turquoise water on the kiteboard, spray flying, then jump a small wave and land smiling. Keep it photo-realistic, same person and outfit. The camera follows smoothly. Wind and splashing water sounds only.' },
  { id: 'pixel', kind: 'toon', name: 'Pixel game hero', shape: 'portrait', caricature: false, group: 'Pixel Game',
    prompt: 'a bright retro 8-bit pixel-art video game scene in a tall vertical layout: the person as the pixel-art hero character (full body, chunky pixels, clearly the same person) standing on a grassy pixel platform at the bottom, floating brick platforms stacked up the screen above with spinning gold coins on them, rounded green hills, fluffy pixel clouds and a rainbow sky; an original game world',
    motion: 'Animate it as a retro 8-bit platform game: the pixel hero jumps up from platform to platform, catching the spinning gold coins, each coin sparkling as it is collected, then lands on the top platform and does a little victory pose. Keep the chunky pixel-art style, the same character and the same game world for the whole clip. The game camera scrolls upwards with them. Retro chiptune coin and jump sound effects only, no words.' },
  { id: 'superhero', kind: 'toon', name: 'Superhero comic', shape: 'portrait', caricature: false, group: 'Cartoon',
    prompt: 'a dynamic comic-book cover style illustration of them as an original superhero in a costume of your own design (no real superhero costumes, symbols or logos), cape flowing, heroic pose, city skyline and dramatic sky behind',
    motion: 'The superhero takes off: the cape billows, they power up with a glow and fly up past the city skyline. Keep the comic-book illustration style and the same character. The camera tilts up with them. Whoosh and power-up sound effects only.' },
  { id: 'laugh', kind: 'toon', name: 'Big laugh cartoon', shape: 'portrait', caricature: false, group: 'Cartoon',
    prompt: 'a warm hand-painted comic illustration with bold outlines: everyone bursting with huge open-mouthed laughter, big bright smiles, rosy cheeks, sparkling eyes, slightly big heads, fun energetic pose, on a solid warm golden-yellow background',
    motion: 'If there are two or more people, they turn to look at each other, one playfully points at the other, then they both turn back to the camera and burst out laughing together, heads tipping back and shoulders shaking. If there is one person, they glance to the side, point at something off screen, then turn back to the camera and burst out laughing. Keep the same hand-painted comic style, colours and yellow background. The camera stays still. Happy laughter sounds only, no words.' },
  { id: 'studio', kind: 'toon', name: 'Studio caricature', shape: 'portrait', caricature: false, group: 'Cartoon',
    prompt: 'a photo-realistic studio caricature: true-to-life face and skin texture with a gently oversized head on a slim body, relaxed confident pose with hands in pockets, wearing the same clothes as in the photo, on a plain soft grey studio background with soft lighting' },
  { id: 'crayon', kind: 'toon', name: 'Crayon scribble', shape: 'portrait', caricature: false, group: 'Line Drawing',
    prompt: 'an expressive coloured-pencil and wax-crayon portrait on warm kraft paper: realistic likeness built from energetic scribbled strokes, bold blues, reds, oranges and yellows in the background, rich textured colour on the face and clothes' },
  { id: 'fashion', kind: 'toon', name: 'Fashion sketch', shape: 'portrait', caricature: false, group: 'Fashion Sketch',
    prompt: 'an elegant fashion-design illustration in ink and soft watercolour: full-length, tall graceful proportions, confident runway-style pose, fine ink outlines with loose watercolour washes on the clothes, on a clean white studio background' },
  { id: 'elf', kind: 'ai', name: 'Elfie selfie', shape: 'portrait', caricature: false, group: 'Festive',
    prompt: 'a realistic, magical Christmas photograph, full body head to toe, of them dressed as Christmas elves: red and green velvet elf outfits with white fur trim, gold buttons and a black buckled belt, red and green striped tights or trousers, curly elf shoes with little bells, pointy striped elf hats with bells (worn over any head covering, never replacing it), pointed elf ears, standing close together smiling with a cheerful pose, in a snowy clearing of frosted Christmas trees with red baubles and fairy lights, a cosy snow-covered log cabin with glowing windows and a smoking chimney behind, warm golden sunlight, big glittering snowflakes and streaks of golden sparkle in the air',
    motion: 'Christmas magic: each elf bends down, picks up a small wrapped present from the snow and holds it out towards the camera with a big smile, then gives a cheerful wave. At that moment all the fairy lights on the trees and the log cabin switch on together with a warm golden glow, and far away in the sky Santa\'s sleigh pulled by reindeer flies past the moon. Snow keeps falling and the bells on their hats jingle. Keep it photo-realistic with the same people, outfits and snowy scene. The camera slowly pushes in. Jingle bells and a soft ho ho ho in the distance, no other words.' },
  { id: 'jumper', kind: 'toon', name: 'Christmas jumper card', shape: 'portrait', caricature: true, group: 'Cartoon',
    prompt: 'a cosy, cheerful 3D cartoon Christmas card scene: wearing bright knitted Christmas jumpers over their own outfits, in front of a decorated Christmas tree and a crackling fireplace with stockings, warm golden glow, wrapped presents and a few floating snowflakes',
    motion: 'Christmas cheer: they raise a mug of hot chocolate, laugh and do a little happy jiggle, the tree lights twinkle and the fire flickers. Keep the same cosy 3D cartoon style and scene. The camera stays still. Crackling fire and jingle sound effects only, no words.' },
  // ---------- realistic AI photo + video (time machine, sports, heroes, glamour) ----------
  { id: 'era20s', kind: 'ai', name: 'Roaring 20s', shape: 'portrait', caricature: false, group: 'Movies',
    prompt: 'a photo-realistic 1920s glamour portrait in rich sepia and black and white: dressed in elegant 1920s evening wear (a sharp three-piece suit with a bow tie, or a beaded flapper-style gown with the same coverage as their own clothes), art deco ballroom with chandeliers and champagne towers behind, soft vintage film grain',
    motion: 'A 1920s party comes alive: they turn to the camera with a charming smile, raise a glass, and a little jazz-age dance step; the chandeliers sparkle and confetti drifts down. Keep the sepia vintage film look throughout. The camera slowly pushes in. Crackly 1920s jazz band music, no words.' },
  { id: 'disco', kind: 'ai', name: 'Disco 70s', shape: 'portrait', caricature: false, group: 'Movies',
    prompt: 'a photo-realistic 1970s disco photograph: dressed in glamorous 70s disco outfits (wide collars, flares, sequins and sparkle, with the same coverage as their own clothes), big glossy 70s hair, on a light-up dance floor under a spinning mirror ball with purple and pink lights',
    motion: 'They strike classic disco moves under the spinning mirror ball, pointing up and grooving, the light-up floor flashing in time. Keep the same 70s look and outfits. The camera slowly circles. Funky disco beat, no words.' },
  { id: 'noir', kind: 'ai', name: 'Film noir', shape: 'portrait', caricature: false, group: 'Movies',
    prompt: 'a dramatic black and white 1940s film noir photograph: dressed in 1940s fashion (a fedora and trench coat or tailored suit, or an elegant 1940s dress with the same coverage as their own clothes), moody side lighting, light through window blinds, a rainy city street with old cars behind, cinematic film grain',
    motion: 'A film noir moment: rain falls, they slowly turn their head to the camera with a knowing smile, light from passing car headlights sweeps across them. Keep the black and white 1940s film look. The camera slowly pushes in. Rain and a soft jazz saxophone, no words.' },
  { id: 'steampunk', kind: 'ai', name: 'Steampunk adventure', shape: 'portrait', caricature: false, group: 'Futuristic',
    prompt: 'a photo-realistic steampunk adventure scene: wearing leather aviator caps with brass goggles and vintage leather flying jackets, seated in a magnificent polished wood and brass steam-powered flying car with spinning propellers, gauges, gears and pipes, flying high over an old European city with a clock tower and copper domes at golden sunset, clouds all around',
    motion: 'The flying machine soars over the city through the golden clouds: wind in their faces, they lower their goggles, point ahead and grin as the propellers spin and steam puffs out. Keep the same steampunk look. The camera glides alongside. Steam, propellers and wind sounds, no words.' },
  { id: 'future', kind: 'ai', name: 'Future city', shape: 'portrait', caricature: false, group: 'Futuristic',
    prompt: 'a photo-realistic sci-fi portrait in the year 2100: sleek futuristic outfits with soft glowing light panels (same coverage as their own clothes), on a high balcony overlooking a gleaming neon futuristic city with flying vehicles, holographic lights and a purple-blue dusk sky',
    motion: 'The future city comes alive: flying vehicles glide past, holographic lights shimmer around them, they turn to the camera with a confident smile as their outfits glow brighter. Keep the same futuristic look. The camera slowly orbits. Futuristic hum and whoosh sounds, no words.' },
  { id: 'football', kind: 'ai', name: 'Football star', shape: 'portrait', caricature: false, group: 'Sports',
    prompt: 'a photo-realistic action sports photograph: as a professional football (soccer) player in a plain team kit with no badges, logos or numbers, mid-air doing a spectacular volley kick at the ball, in a packed floodlit stadium at night, crowd blurred behind, dramatic sports-photography lighting',
    motion: 'Spectacular sports moment: they leap and smash a volley, the ball rockets into the net, then they run and celebrate with arms wide as the stadium crowd roars and camera flashes pop. Keep it photo-realistic with the same player and kit. The camera tracks the action. Stadium crowd roar, no words.' },
  { id: 'basketball', kind: 'ai', name: 'Slam dunk', shape: 'portrait', caricature: false, group: 'Sports',
    prompt: 'a photo-realistic action sports photograph: as a basketball player in a plain team kit with no badges, logos or numbers, soaring high to slam dunk the ball, on an outdoor court with a city skyline at golden sunset behind',
    motion: 'They run in, leap high and slam dunk the ball through the hoop, hang on the rim for a moment, land and celebrate. Keep it photo-realistic with the same player, kit and sunset skyline. The camera follows the jump in slow motion. Ball bounce, rim clang and cheer, no words.' },
  { id: 'squad', kind: 'ai', name: 'Hero landing', shape: 'portrait', caricature: false, group: 'Superheroes',
    prompt: 'a photo-realistic cinematic superhero image: as superheroes in original high-tech armoured suits of your own design (no real superhero costumes, symbols or logos), with flowing capes, hovering above a glittering city rooftop at sunset, beams of rainbow-coloured light shooting up behind them',
    motion: 'Epic superhero landing: they descend from the sky through the rainbow light beams, land on the rooftop in a powerful crouch, then rise up into a heroic standing pose as their capes settle. Keep it photo-realistic with the same suits and city. The camera slowly pulls back. Whoosh, impact boom and heroic swell, no words.' },
  { id: 'gala', kind: 'ai', name: 'Gala night', shape: 'portrait', caricature: false, group: 'Red Carpet',
    prompt: 'a photo-realistic glamorous gala photograph: dressed in black tie (a tuxedo, or an elegant floor-length evening gown with the same coverage as their own clothes), standing at the foot of a grand marble staircase with a red carpet, red velvet drapes and warm golden lighting',
    motion: 'A grand gala entrance: they walk elegantly down the red-carpet staircase arm in arm, then pause, smile and wave as camera flashes pop. Keep it photo-realistic with the same outfits and staircase. The camera slowly pulls back. Gentle orchestral music and camera flashes, no words.' },
  { id: 'golden', kind: 'ai', name: 'Golden celebration', shape: 'portrait', caricature: false, group: 'Red Carpet',
    prompt: 'a photo-realistic luxury celebration portrait: dressed in glamorous party wear (a sharp tuxedo or a shimmering gold evening dress with the same coverage as their own clothes), in front of a glowing gold glitter backdrop with warm bokeh lights and floating gold confetti, magazine-cover lighting',
    motion: 'Party moment: gold confetti bursts and rains down, they laugh, lean in together and raise a toast to the camera. Keep it photo-realistic with the same outfits and gold backdrop. The camera slowly pushes in. Celebration pop and cheers, no words.' },
  { id: 'sleigh', kind: 'toon', name: 'Sleigh ride', shape: 'portrait', caricature: true, group: 'Cartoon',
    prompt: 'a festive digital-painting caricature: wearing red velvet Santa outfits with white fur trim and Santa hats (worn over any head covering, never replacing it), laughing as they ride a carved wooden sleigh piled with presents, flying through a starry night sky with green and purple northern lights, a trail of sparkling snow behind the sleigh',
    motion: 'The sleigh swoops across the night sky: they hold the reins, laugh and wave, presents bounce in the back, the northern lights ripple and a trail of sparkling snow streams behind. Keep the same painted caricature style. The camera follows the sleigh. Sleigh bells and whoosh sounds, no words.' },
  { id: 'workshop', kind: 'ai', name: "Santa's workshop", shape: 'portrait', caricature: false, group: 'Festive',
    prompt: "a warm, realistic Christmas photograph: dressed as Santa's helpers in green velvet tunics with white fur collars, Santa hats (worn over any head covering, never replacing it), red and white striped tights or trousers and curly elf shoes, each holding a small wrapped present, standing in Santa's cosy wooden toy workshop with a big decorated Christmas tree, wooden toys, a toy train on the floor and golden light streaming through the window",
    motion: "Workshop magic: they hold up their presents and grin, the toy train chugs past their feet, the tree lights twinkle and a little snow drifts in the golden light. Keep it photo-realistic with the same outfits and workshop. The camera slowly pushes in. Jingle bells and toy train sounds, no words." },
  { id: 'globe', kind: 'toon', name: 'Snow globe', shape: 'portrait', caricature: false, group: 'Cartoon',
    prompt: 'a charming 3D animated-film style scene: them as small, full-body 3D characters in cosy winter coats and scarves, standing inside a glass snow globe in front of a little snowy log cabin with lamp posts and tiny Christmas trees, the globe on a plain polished wooden base, set on a snowy table with soft blue bokeh lights behind',
    motion: 'The snow globe gives a gentle shake: snow swirls all around them inside the glass, they look up in wonder, laugh and wave out at the viewer as the snow settles. Keep the same 3D style and snow globe. The camera slowly circles the globe. Soft music-box chime, no words.' },
  { id: 'dragon', kind: 'ai', name: 'Dragon slayers', shape: 'portrait', caricature: false, group: 'Movies',
    prompt: 'an epic, photo-realistic fantasy movie still: dressed as medieval warriors in battle-worn leather and steel armour, one raising a sword and shield, another holding a crossbow, in the cobbled courtyard of a stone castle, a huge dragon breathing fire over the battlements behind them, glowing embers in the air, cinematic lighting',
    motion: 'Epic battle moment: the dragon roars and sweeps its wings, fire blasts over the walls, they brace, raise their weapons and charge forward as embers swirl. Keep it photo-realistic with the same armour and castle. The camera pushes in dramatically. Dragon roar, fire whoosh and clashing steel, no words.' },
  { id: 'disco54', kind: 'ai', name: 'Disco red carpet', shape: 'portrait', caricature: false, group: 'Red Carpet',
    prompt: 'a photo-realistic 1970s nightclub arrival: dressed in glamorous 70s evening wear (a velvet suit with a wide-collared shirt, or a shimmering long-sleeved sequinned gown with the same coverage as their own clothes), stepping out of a vintage cream convertible onto a wet street under a glowing neon nightclub canopy (neon shapes and stars only, no readable words), velvet ropes and photographers with flashing cameras on both sides',
    motion: 'Red carpet arrival: they step away from the vintage car arm in arm, smile and wave as the photographers\' flashes pop all around and the neon canopy glows. Keep it photo-realistic with the same outfits and street. The camera slowly pulls back. Camera flashes, crowd buzz and a disco beat, no words.' },
  { id: 'heist', kind: 'ai', name: 'Laser heist', shape: 'portrait', caricature: false, group: 'Movies',
    prompt: 'a photo-realistic action-movie still: dressed as stealthy agents in sleek black tactical outfits with gloves, one crouching low and one leaping through a criss-crossing grid of red security lasers in a steel high-tech vault, reaching for a glowing golden trophy on a glass plinth, glowing screens on the walls, cinematic blue and red lighting',
    motion: 'Heist in slow motion: they dodge and leap through the red lasers, one snatches the glowing golden trophy off the plinth just as the lasers flicker, then they share a triumphant look. Keep it photo-realistic with the same outfits and vault. The camera tracks the move. Laser hum and a tense spy-film sting, no words.' },
  { id: 'western', kind: 'ai', name: 'Wild west ride', shape: 'portrait', caricature: false, group: 'Movies',
    prompt: 'a cinematic, photo-realistic wild west photograph: dressed as cowboys and cowgirls in wide-brimmed hats (worn over any head covering, never replacing it), long dusters, scarves and leather boots, riding dark horses towards the camera through red desert dust, towering red rock buttes and a golden sunset behind',
    motion: 'They ride towards the camera at a gentle gallop, dust kicking up from the hooves, then rein in, tip their hats and grin. Keep it photo-realistic with the same outfits, horses and desert. The camera slowly pulls back. Hoofbeats, wind and a western guitar twang, no words.' },
  { id: 'space', kind: 'ai', name: 'Astronauts', shape: 'portrait', caricature: false, group: 'Futuristic',
    prompt: 'a photo-realistic sci-fi photograph: as astronauts in white space suits with open clear helmets (plain mission patches only, no agency logos, flags or writing), standing inside a sleek spaceship beside a huge window looking out at a colourful glowing nebula and stars, soft cabin lighting',
    motion: 'Space wonder: they gaze out of the window as the nebula slowly drifts past, then turn to the camera with a big smile and a wave while floating gently in zero gravity. Keep it photo-realistic with the same suits and spaceship. The camera slowly pans. Soft spaceship hum, no words.' },
  { id: 'cricket', kind: 'ai', name: 'Cricket hero', shape: 'portrait', caricature: false, group: 'Sports',
    prompt: 'a polished, realistic sports illustration: as a professional cricketer in a plain coloured team kit with no badges, logos or numbers, batting pads and gloves, crouched ready with the bat at the crease beside the stumps, full body, in a huge sunny cricket stadium',
    motion: 'Big hit: the ball comes in, they swing and smash it high into the stands, then raise the bat to the crowd as the stadium cheers. Keep the same style, kit and stadium. The camera follows the shot. Bat crack and crowd roar, no words.' },
  { id: 'stormhero', kind: 'ai', name: 'Storm superhero', shape: 'portrait', caricature: false, group: 'Superheroes',
    prompt: 'a photo-realistic cinematic superhero image: as an original superhero in a sleek black armoured suit with silver panel lines and a glowing white-blue light in the centre of the chest and on each shoulder (a suit of your own design, no real superhero emblems, symbols or logos), a long black cape billowing behind, flying powerfully straight towards the camera with fists clenched and a determined expression, above a dark futuristic city skyline with smoke and fiery glows below, dramatic stormy clouds and bright lightning bolts around them',
    motion: 'They surge towards the camera through the storm, cape whipping behind, lightning cracking around them, then stop mid-air and hover as the chest light flares brighter and they give a confident nod. Keep it photo-realistic with the same suit and stormy city. The camera pulls back as they approach. Thunder, wind and a power-up hum, no words.' },
  { id: 'cyberhero', kind: 'ai', name: 'Cyber hero', shape: 'portrait', caricature: false, group: 'Superheroes',
    prompt: 'a photo-realistic cinematic superhero image: as an original cyber superhero in a sleek high-tech armoured suit of your own design (deep purple and black with glowing cyan details, no real superhero costumes, symbols or logos) with a long flowing cape, flying straight towards the camera through a towering neon futuristic city at dusk, flying vehicles and glowing screens all around, dramatic low-angle shot',
    motion: 'They rocket towards the camera through the neon city, cape whipping behind, swerve past a flying vehicle, then stop mid-air and hover with a confident look as their suit glows brighter. Keep it photo-realistic with the same suit and city. The camera pulls back fast. Whoosh and power hum, no words.' },
  { id: 'bobble', kind: 'toon', name: 'Classic bobblehead', shape: 'portrait', caricature: false, group: 'Bobbleheads',
    prompt: 'a 3D-rendered collectible bobblehead figurine, full body: a big head (true likeness, real facial features, natural smile) on a small body, wearing the same clothes as in the photo, arms folded confidently, standing on a round light oak wooden display base, smooth painted resin finish, soft studio lighting, plain solid bright blue studio backdrop',
    motion: 'The bobblehead comes alive on its base: the big head bobbles side to side, they unfold their arms, give a cheeky thumbs up and a little wiggle, then fold their arms again with a grin. Keep the same 3D figurine look, base and backdrop. The camera slowly circles. Playful boing sound effects, no words.' },
  { id: 'bobblesport', kind: 'toon', name: 'Sports bobblehead', shape: 'portrait', caricature: false, group: 'Bobbleheads',
    prompt: 'a 3D-rendered collectible bobblehead figurine, full body: a big head (true likeness, natural smile) on a small body, in a plain white sports kit, holding a ball for the event (change the sport to suit: a rugby ball), standing on a round green-marble base topped with grass, smooth painted resin finish, soft studio lighting, plain solid royal blue backdrop',
    motion: 'The sports bobblehead comes alive: the head bobbles, they toss the ball up, catch it and strike a proud pose. Keep the same 3D figurine look, base and backdrop. The camera slowly circles. Ball thud and a small crowd cheer, no words.' },
  { id: 'bobbletech', kind: 'toon', name: 'Tech bobblehead', shape: 'portrait', caricature: false, group: 'Bobbleheads',
    prompt: 'a 3D-rendered collectible bobblehead figurine, full body: a big head (true likeness, natural smile) on a small body, wearing big over-ear headphones and a smart black jacket (headphones worn over any head covering, never replacing it), holding a glowing floating hologram gem in one hand, standing on a pile of shiny gold and silver coins (plain coins with no symbols) on a round glowing display base, floating orange and blue sparks, dark studio background',
    motion: 'The tech bobblehead comes alive: the head bobbles, the hologram gem spins and glows brighter, coins sparkle and sparks drift up, then they give a thumbs up. Keep the same 3D figurine look and base. The camera slowly circles. Digital chime and sparkle sounds, no words.' },
  { id: 'popart', kind: 'toon', name: 'Pop art burst', shape: 'portrait', caricature: false, group: 'Cartoon',
    prompt: 'a classic 1960s pop-art comic panel, head and shoulders: bold black ink outlines, flat bright colours, visible halftone dot shading on the skin, a dramatic wide-eyed surprised expression with an open mouth, on a background of radiating red and turquoise burst lines with little black stars',
    motion: 'Comic-book reaction: they gasp, eyes widening even more, then break into a big grin and wink while the burst lines pulse and the stars twinkle. Keep the flat pop-art comic style and halftone dots throughout. The camera stays still. Comic pop sound effects only, no words.' },
  { id: 'popwarhol', kind: 'toon', name: 'Pop art squares', shape: 'portrait', caricature: false, group: 'Cartoon',
    prompt: 'a 1960s silkscreen pop-art portrait: a bold high-contrast likeness printed in flat, wildly unexpected colour blocks (hot pink skin shadows, electric yellow hair, turquoise background), slightly off-register ink like a screen print, head and shoulders',
    motion: 'The pop-art portrait comes alive: the colours flash and swap to new bright combinations in rhythm while the person smiles, raises an eyebrow and winks. Keep the silkscreen pop-art look. The camera stays still. Upbeat pop beat, no words.' },
  { id: 'watercouple', kind: 'toon', name: 'Watercolour full length', shape: 'portrait', caricature: false, group: 'Watercolour',
    prompt: 'an elegant, realistic watercolour and fine-ink illustration, full length from head to knees: a true likeness with gentle detailed washes on the face, their clothes painted in loose confident washes, standing close together and smiling warmly, a soft green, teal and gold watercolour splash behind them fading into textured white watercolour paper with drips and speckles' },
  { id: 'pop4', kind: 'toon', name: 'Pop art four squares', shape: 'portrait', caricature: false, group: 'Cartoon',
    prompt: 'a 1960s silkscreen pop-art print made of four equal panels in a 2 by 2 grid, the same head-and-shoulders portrait repeated in each panel, posterised into flat bold colour shapes (tall portrait layout), each panel in a different wild colour scheme: navy and violet on mint green, crimson and hot pink on pink, teal and navy on lemon yellow, orange and gold on sky blue',
    motion: 'The four pop-art panels come alive one after another: in each one the person smiles, then all four wink together as the colours flash and swap between panels. Keep the flat silkscreen look. The camera stays still. Upbeat pop beat, no words.' },
  { id: 'rgb', kind: 'toon', name: 'RGB split', shape: 'portrait', caricature: false, group: 'Cartoon',
    prompt: 'a bold RGB split-light photo effect on a pure black background: the same person repeated three times side by side, overlapping, once in pure red, once in pure green and once in pure blue light, the colours mixing into yellow, cyan and magenta where they overlap, a big smile and a fun hand gesture (peace sign or thumbs up), with a few thin digital glitch lines',
    motion: 'The three red, green and blue copies slide apart and snap back together in rhythm with glitch flickers, while the person laughs and changes hand gesture from a peace sign to a thumbs up. Keep the black background and RGB look. The camera stays still. Glitchy electronic beat, no words.' },
  { id: 'cockpit', kind: 'ai', name: 'Starship captain', shape: 'portrait', caricature: false, group: 'Futuristic',
    prompt: 'a photo-realistic sci-fi photograph: seated in the captain\'s chair of a high-tech spaceship cockpit, wearing a sleek dark flight jacket with silver shoulder armour, glowing control panels and screens all around, huge windows showing an alien desert planet with mountains and a ringed planet and moons in the sky',
    motion: 'The ship comes to life: screens flicker on, they turn to the camera with a confident nod, push the throttle forward, and the view outside streaks into light speed. Keep it photo-realistic with the same outfit and cockpit. The camera slowly pushes in. Engine hum and a whoosh, no words.' },
  { id: 'dino', kind: 'ai', name: 'Dino rider', shape: 'portrait', caricature: false, group: 'Movies',
    prompt: 'a photo-realistic adventure photograph: riding a huge friendly green dinosaur with a saddle and reins, laughing with excitement, hair blowing, wearing the same clothes as in the photo with sturdy boots, a lush prehistoric jungle valley with palm trees, misty mountains and a golden sunrise behind, dust kicking up',
    motion: 'The dinosaur charges forward with a mighty roar, dust flying, while they hold the reins, whoop with joy and wave at the camera. Keep it photo-realistic with the same dinosaur and valley. The camera tracks alongside. Dinosaur roar and thundering footsteps, no words.' },
  { id: 'battle', kind: 'toon', name: 'Battle royale gamer', shape: 'portrait', caricature: false, group: 'Pixel Game',
    prompt: 'a bright, glossy 3D video-game character render in a colourful battle royale cartoon style: them as playable game heroes with arms around each other, keeping their real hairstyles and the colours of their own clothes but turned into game gear (tactical vests, armour pads, holsters, fingerless gloves), standing on a wooden lookout platform, floating islands, blue sky and a purple storm cloud behind; an original game world with no game logos or titles',
    motion: 'Victory moment: they do a celebration dance together, then high five as the storm cloud rumbles and a supply drop parachutes down behind them. Keep the same glossy 3D game style. The camera slowly circles. Game victory jingle, no words.' },
  { id: 'hologram', kind: 'ai', name: 'Digital twin', shape: 'portrait', caricature: false, group: 'Futuristic',
    prompt: 'a photo-realistic tech-conference photograph: standing in a bright modern data centre aisle between rows of glowing server racks, wearing the same smart clothes as in the photo, one hand held out palm up with a glowing blue holographic miniature of themselves standing on it, floating holographic data screens and circular light rings, cool blue lighting',
    motion: 'The hologram on their palm flickers on, spins slowly and waves, data screens glide past and the light rings pulse, then they look up at the camera with a proud smile. Keep it photo-realistic with the same data centre. The camera slowly pushes in. Soft digital hum and chimes, no words.' },
  { id: 'premiere', kind: 'ai', name: 'Red Carpet', shape: 'portrait', caricature: false, group: 'Red Carpet',
    prompt: 'a photo-realistic film-premiere photograph at night: walking towards the camera down a red carpet in elegant black-tie evening wear (a tuxedo or a floor-length satin evening gown with the same coverage as their own clothes), one hand raised in a wave, gold stanchions with red velvet ropes, photographers with flashing cameras and a cheering crowd on both sides, the Dubai skyline with the tallest tower lit up behind',
    motion: 'They walk down the red carpet, smile and wave to the crowd as dozens of camera flashes pop, then pause for a glamorous pose. Keep it photo-realistic with the same outfit and Dubai skyline. The camera slowly pulls back ahead of them. Camera flashes and crowd cheers, no words.' },
  { id: 'futurecarpet', kind: 'ai', name: 'Neon gala', shape: 'portrait', caricature: false, group: 'Red Carpet',
    prompt: 'a dazzling photo-realistic futuristic gala: walking together down a sparkling red glitter carpet in black evening wear with glowing orange-red light seams, robot photographers with cameras on both sides, a giant glowing red observation wheel, red fireworks and a futuristic city skyline at night behind them',
    motion: 'They stride down the glittering carpet, fireworks bursting overhead, the observation wheel turning, the robot photographers flashing their cameras as they smile and wave. Keep it photo-realistic with the same outfits and scene. The camera slowly pulls back. Fireworks and futuristic music, no words.' },
  { id: 'luxcar', kind: 'ai', name: 'Supercar skyline', shape: 'portrait', caricature: false, group: 'Red Carpet',
    prompt: 'a photo-realistic luxury lifestyle photograph: in black tie, leaning confidently against a gleaming white luxury sports saloon (no visible badges or brand logos) on a sunny boulevard, the Dubai skyline with the tallest tower behind, palm trees, blue sky',
    motion: 'They push off the car, adjust their cuffs, share a grin and stroll towards the camera as the sunlight glints off the car. Keep it photo-realistic with the same outfits, car and skyline. The camera slowly pulls back. Cool lounge beat, no words.' },
  { id: 'social', kind: 'ai', name: 'Social media star', shape: 'portrait', caricature: false, group: 'Fun photos',
    prompt: 'a playful photo-realistic image: sitting on the bottom edge of a giant white social media photo frame (a plain white frame with a heart icon and a speech-bubble icon, no app logos or names) floating in a bright blue sky with fluffy white clouds, holding the sides of the frame, legs dangling, wearing the same clothes as in the photo, happy smile',
    motion: 'Floating in the sky: they swing their legs, the frame drifts gently, hearts float up from the heart icon, then they lean out of the frame and wave. Keep it photo-realistic with the same outfit and sky. The camera slowly drifts. Light airy music and pop sounds, no words.' },
  { id: 'spy', kind: 'ai', name: 'Secret agent', shape: 'portrait', caricature: false, group: 'Movies',
    prompt: 'a cinematic, photo-realistic spy-film still: in sharp black tuxedos with bow ties (or an elegant black evening gown with the same coverage as their own clothes), standing tall with cool, confident expressions in a grand gilded casino ballroom with a crystal chandelier and polished parquet floor, warm golden light; no logos or film titles',
    motion: 'Spy moment: they straighten a cufflink, share a knowing glance, then turn to the camera with a cool half smile as the chandelier glitters. Keep it photo-realistic with the same outfits and ballroom. The camera slowly pushes in. Smooth brass spy-film music sting, no words.' },
  { id: 'fighter', kind: 'toon', name: 'Street fighter', shape: 'portrait', caricature: false, group: 'Pixel Game',
    prompt: 'a dramatic, semi-realistic arcade fighting-game illustration: wearing an original black martial-arts gi with a black belt and taped hands (over their own top, same coverage as their own clothes), in a low fighting stance with both fists wreathed in flames, a rainy neon-lit city street at night behind with glowing signs (abstract shapes only, no readable writing) and light streaks',
    motion: 'Fight intro: they crack their knuckles, the flames on their fists flare up, they throw a powerful punch towards the camera that bursts into a fireball, then return to the stance with a grin. Keep the same arcade illustration style. The camera pushes in. Punch whoosh and fire blast, no words.' },
  { id: 'cryptowalk', kind: 'ai', name: 'Golden walkway', shape: 'portrait', caricature: false, group: 'Red Carpet',
    prompt: 'a photo-realistic night-time VIP walkway: walking towards the camera in a tuxedo or elegant evening wear (same coverage as their own clothes), one hand raised in a wave, on a dark glittering cosmic carpet set with glowing golden and blue circular light discs (plain, with no symbols), photographers on both sides behind blue velvet ropes, a lit-up city skyline behind',
    motion: 'They walk forward and wave as the glowing discs light up under each step and camera flashes pop all around. Keep it photo-realistic with the same outfit and scene. The camera slowly pulls back. Camera flashes and an electronic beat, no words.' },
  { id: 'minime', kind: 'toon', name: 'Mini me', shape: 'portrait', caricature: false, group: 'Mini Me',
    prompt: 'a photo-realistic full-length studio portrait on a plain soft grey background: each person standing tall and relaxed with legs crossed at the ankles, one elbow resting casually on the head of their own Mini Me beside them, wearing the same clothes as in the photo; the Mini Me is a small 3D animated-film character version of the same person (big head, big friendly eyes, same hair, same outfit in miniature), standing with hands in pockets and smiling up cheekily; soft studio lighting and floor shadows',
    motion: 'The Mini Me looks up at the real person, the real person looks down, they share a grin, then the Mini Me copies the real person\'s pose and both give the camera a cheeky wink. Keep it photo-realistic for the person and 3D animated for the Mini Me, same outfits and grey studio. The camera stays still. Playful boing and a little laugh, no words.' },
  { id: 'storybook', kind: 'toon', name: 'Storybook', shape: 'portrait', caricature: false, group: 'Cartoon',
    prompt: 'a warm hand-drawn storybook illustration with soft watercolour colours and clean ink outlines: a true likeness with gentle rosy cheeks, same pose, hair and clothes as in the photo, in a sunny flower garden with wildflowers, green trees and a soft blue sky',
    motion: 'The storybook scene comes alive: a soft breeze moves their hair and the flowers, they lean in closer, smile and one gives a little wave, petals drifting past. Keep the hand-drawn storybook style. The camera slowly pushes in. Birdsong and a gentle breeze, no words.' },
  { id: 'planetdxb', kind: 'ai', name: 'Little planet Dubai', shape: 'portrait', caricature: false, group: 'Fun photos', word: 'Dubai',
    prompt: 'a photo-realistic "little planet" 360-degree fisheye photograph: they sit casually on top of a huge glossy white 3D script word in the middle of a tiny round planet made of the city of Dubai curving around them: the tallest tower in the world, the sail-shaped luxury hotel on the beach, the golden picture-frame landmark, the palm-shaped island, the futuristic museum with its oval shape, the dancing fountain, an abra boat on the creek, desert dunes with a camel, palm trees, a gold souk dome and an Emirati flag, all bending around the edge of the planet, bright blue sky with fluffy clouds and sunshine; same clothes as in the photo',
    motion: 'The little planet slowly spins under them, the fountain dances, an abra glides along the creek and a plane flies over the tower; they look up, smile and wave at the camera. Keep it photo-realistic with the same planet and big word. The camera slowly orbits. Light city ambience and a cheerful beat, no words.' },
  { id: 'planetldn', kind: 'ai', name: 'Little planet London', shape: 'portrait', caricature: false, group: 'Fun photos', word: 'London',
    prompt: 'a photo-realistic "little planet" 360-degree fisheye photograph: they sit casually on top of a huge glossy white 3D script word in the middle of a tiny round planet made of London curving around them: the famous clock tower, the observation wheel, the glass skyscraper spire, Tower Bridge over the river, a red double-decker bus, a red phone box, a Union flag, parks and trees, bright blue sky with fluffy clouds and sunshine; same clothes as in the photo',
    motion: 'The little planet slowly spins under them, the red bus drives around the curve, a boat passes under Tower Bridge; they look up, smile and wave at the camera. Keep it photo-realistic with the same planet and big word. The camera slowly orbits. City ambience and a cheerful beat, no words.' },
  { id: 'flapper', kind: 'ai', name: 'Jazz age club', shape: 'portrait', caricature: false, group: 'Movies',
    prompt: 'a photo-realistic 1920s jazz-club portrait, half body: dressed for a 1920s night out (a pinstripe suit with a bow tie and slicked hair, or a beaded fringe flapper dress with long pearls and a jewelled headband (same coverage as their own clothes)), posing glamorously in a plush art deco club with brass wall lamps and a gold sunburst panel, warm amber light',
    motion: 'Jazz plays: they lean in together, one twirls a string of pearls, they share a laugh and give the camera a glamorous look as the lamps glow. Keep it photo-realistic 1920s. The camera slowly pushes in. Crackly 1920s jazz, no words.' },
  { id: 'greaser', kind: 'ai', name: '1950s rock and roll', shape: 'portrait', caricature: false, group: 'Movies',
    prompt: 'a photo-realistic 1950s portrait: dressed as rock and roll greasers (black leather jackets with white t-shirts, quiffs or pin-up curls and red lipstick, high-waisted trousers or a pencil skirt (same coverage as their own clothes)), posing cool and confident beside a gleaming cream and chrome 1950s convertible (no badges or brand names) on a suburban driveway, warm vintage film tones',
    motion: 'They lean on the convertible, one runs a comb through their quiff, they share a cheeky grin and point at the camera as the chrome gleams. Keep it photo-realistic 1950s. The camera slowly circles. A rock and roll guitar riff, no words.' },
  { id: 'egypt', kind: 'ai', name: 'Ancient Egypt', shape: 'portrait', caricature: false, group: 'Movies',
    prompt: 'a photo-realistic ancient Egypt portrait, half body: dressed as Egyptian royalty in flowing white linen robes with wide gold and turquoise beaded collars, gold jewellery and a royal headdress or headscarf (worn over any head covering, never replacing it) (same coverage as their own clothes), standing before huge carved sandstone temple columns with hieroglyph reliefs, warm golden desert sunlight',
    motion: 'Desert breeze moves their linen robes, sunlight sweeps across the temple columns, they turn their heads regally to the camera and give a slow, knowing smile. Keep it photo-realistic. The camera slowly pushes in. Desert wind and soft ancient flute, no words.' },
  { id: 'victorian', kind: 'ai', name: 'Victorian portrait', shape: 'portrait', caricature: false, group: 'Movies',
    prompt: 'a photo-realistic Victorian-era portrait, half body: dressed in fashionable 1880s attire (a tailored frock coat with a cravat and waistcoat, or a silk gown with lace trim, long gloves and a feathered hat (same coverage as their own clothes)), posing formally in an elegant parlour with damask wallpaper, velvet curtains and polished antique furniture, soft window light',
    motion: 'A formal Victorian portrait that comes alive: they hold still for the photographer, then break into a delighted smile, one tips a hat and the other gives a gracious nod. Keep it photo-realistic. The camera stays still with a vintage flash pop. Ticking clock and a gentle piano, no words.' },
  { id: 'royal', kind: 'ai', name: 'Royal coronation', shape: 'portrait', caricature: false, group: 'Movies',
    prompt: 'a photo-realistic royal portrait, three-quarter length: dressed as a king and queen (or two monarchs) in elaborate ceremonial robes with ermine-trimmed velvet capes, gold embroidery, jewelled sashes and medals, white gloves, a sparkling crown or tiara (worn over any head covering, never replacing it) (same coverage as their own clothes), standing in a palace throne room with red and gold drapes',
    motion: 'Royal moment: trumpets sound, they lift their chins, give a regal royal wave, then can\'t help breaking into a grin at each other. Keep it photo-realistic with the same robes and throne room. The camera slowly pushes in. Royal fanfare, no words.' },
  { id: 'speakeasy', kind: 'ai', name: '1930s speakeasy', shape: 'portrait', caricature: false, group: 'Movies',
    prompt: 'a sepia-toned photo-realistic 1930s photograph: dressed in 1930s fashion (a pinstripe suit with a fedora, or a fur-collared coat with a beret (same coverage as their own clothes)), sitting together at a small round table in a smoky-looking speakeasy with a chandelier, a jazz band and patrons softly blurred behind, two cocktail glasses on the table, confident smiles',
    motion: 'The speakeasy hums: they raise their glasses in a toast, clink them, and share a sly smile with the camera as the band plays behind. Keep the sepia 1930s look. The camera slowly pushes in. 1930s jazz band and clinking glasses, no words.' },
  { id: 'cyberpunk', kind: 'ai', name: 'Cyberpunk city', shape: 'portrait', caricature: false, group: 'Futuristic',
    prompt: 'a photo-realistic cyberpunk photograph, full body: wearing sleek futuristic fashion with white and black armour panels and glowing cyan light lines (same coverage as their own clothes), standing in the middle of a rainy neon-lit city street at night lined with glowing signs (abstract shapes only, no readable writing), futuristic sports cars parked on both sides, light haze',
    motion: 'The neon city comes alive: signs flicker, a futuristic car glides past with light trails, their suit lines pulse brighter, and they turn to the camera with a cool smile. Keep it photo-realistic with the same outfits and street. The camera slowly pushes in. Synth beat and city hum, no words.' },
  { id: 'neonportrait', kind: 'ai', name: 'Neon portrait', shape: 'portrait', caricature: false, group: 'Futuristic',
    prompt: 'a vivid digital neon portrait, head and shoulders: wearing a glossy futuristic jacket with glowing pink, cyan and purple geometric panels, in front of a towering neon city of pink, purple and cyan skyscrapers, strong coloured rim lighting on the face',
    motion: 'The neon city pulses with light, the jacket panels glow in waves of colour, and they slowly turn from a side glance to look straight at the camera with a confident smile. Keep the same vivid neon style. The camera slowly pushes in. Synthwave beat, no words.' },
  { id: 'scifi', kind: 'ai', name: 'Sci-fi commander', shape: 'portrait', caricature: false, group: 'Futuristic',
    prompt: 'a polished semi-realistic sci-fi illustration, half body: wearing a teal and black high-tech flight suit with silver shoulder armour and glowing panels, standing in a futuristic command room surrounded by glowing blue holographic screens and data panels (abstract shapes only, no readable writing)',
    motion: 'The command room powers up: holographic screens flicker on around them, they swipe a floating panel aside, then turn to the camera with a determined nod as their suit lights glow. Keep the same sci-fi illustration style. The camera slowly orbits. Digital beeps and a power-up hum, no words.' },
  { id: 'rain', kind: 'toon', name: 'Dancing in the rain', shape: 'portrait', caricature: false, group: 'Watercolour',
    prompt: 'a romantic impressionist oil painting with visible brush strokes: them dancing together joyfully on a rainy cobbled street at dusk (or one person twirling happily on their own), dressed in elegant vintage evening clothes (same coverage as their own clothes), glowing old street lamps, rain sparkling, warm golden light reflecting on the wet cobbles, passers-by with umbrellas softly painted behind',
    motion: 'They twirl and dance in the rain on the shining cobbles, laughing, as raindrops sparkle in the lamplight and the umbrellas drift past. Keep the impressionist oil-painting look with visible brush strokes. The camera slowly circles. Gentle rain and a romantic waltz, no words.' },
  { id: 'golf', kind: 'toon', name: 'Golf swing', shape: 'portrait', caricature: false, group: 'Line Drawing',
    prompt: 'a black and white ink line-art caricature: a slightly big head on a full body, caught mid golf swing with the club raised high, wearing smart golf clothes, on a hand-drawn golf course with rolling greens, trees, fluffy clouds, a flag on the green, a golf bag and a ball on the tee, clean confident outlines with light hatching, like a hand-inked colouring-book drawing',
    motion: 'The ink drawing comes alive: they finish a smooth golf swing, the ball flies off in a drawn arc towards the flag, they shade their eyes to watch, then cheer as it lands on the green. Keep the black and white hand-inked line-art style, the same character and course for the whole clip. The camera stays still. Golf club swish, ball thwack and soft cheer sound effects only, no words.' },
  { id: 'dollbox', kind: 'toon', name: 'Doll in a box', shape: 'portrait', caricature: false, group: 'Doll',
    prompt: 'a glossy 3D collectible fashion doll version of them, full body, with big sparkling eyes and a friendly smile, wearing a stylish version of their own outfit, standing inside a bright pink and white toy display box with a clear window, little accessories (sunglasses, handbag, phone, shoes) in moulded compartments beside them; an original toy brand with no logos or writing on the box',
    motion: 'The doll comes alive in the box: blinks, waves, flips their hair, pushes the box window open, steps out and strikes a pose. Keep the same glossy 3D doll style and box. The camera slowly pushes in. Sparkle chimes and a playful pop, no words.' },
  { id: 'dollchibi', kind: 'toon', name: 'Chibi doll', shape: 'portrait', caricature: false, group: 'Doll',
    prompt: 'a cute 3D chibi doll figure of them: a big round head, huge glossy eyes, rosy cheeks, a small soft body, the same hairstyle, hair colour and outfit in miniature, standing on a round pastel display base on a soft pastel background with tiny floating hearts and stars',
    motion: 'The chibi doll comes alive: it bounces on its base, tilts its head, waves both hands and gives a big happy smile as the hearts and stars float up. Keep the same cute 3D doll style. The camera slowly circles. Cute pop and sparkle sounds, no words.' },
  { id: 'chibiemo', kind: 'toon', name: 'Chibi emotions', shape: 'portrait', caricature: true, group: 'Cartoon',
    prompt: 'a cute glossy chibi cartoon caricature, head and shoulders, with a very big head, huge sparkly eyes and an exaggerated emoji-style expression (big tears, puffed cheeks, sparkles or a little halo to match the mood), soft pastel lavender background with a few tiny doves and sparkles',
    motion: 'The chibi bursts into its big emotion: the expression wobbles and exaggerates, tears or sparkles fly, then it suddenly breaks into a huge happy grin and winks. Keep the same glossy chibi style. The camera stays still. Cute cartoon sound effects, no words.' },
  { id: 'neonpop', kind: 'toon', name: 'Neon pop caricature', shape: 'portrait', caricature: true, group: 'Cartoon',
    prompt: 'a bold digital caricature, head and shoulders, with a very big head and a wildly exaggerated cheeky expression, glowing neon pink eyes and neon light accents, smooth airbrushed shading, on a black background with glowing neon hearts, stars and sparkles',
    motion: 'The neon caricature comes alive: its eyes flash brighter, it raises its eyebrows and laughs, the neon hearts and stars pulse to a beat. Keep the same neon caricature style. The camera stays still. Electronic pop beat, no words.' },
  { id: 'pastelpop', kind: 'toon', name: 'Pastel heart eyes', shape: 'portrait', caricature: true, group: 'Cartoon',
    prompt: 'a soft pastel watercolour-and-ink caricature, head and shoulders, with a big head and an exaggerated love-struck expression with pink heart-shaped eyes or a cheeky kiss face, on a light background of floating pastel hearts, swirls and question marks',
    motion: 'The caricature comes alive: the heart eyes pulse, it blows a kiss, giggles and the pastel hearts float upwards. Keep the same pastel caricature style. The camera stays still. Soft playful sound effects, no words.' },
  { id: 'water', kind: 'toon', name: 'Watercolour', shape: 'portrait', caricature: false, group: 'Watercolour',
    prompt: 'a soft, realistic watercolour portrait on textured white watercolour paper: a true likeness with gentle detailed washes on the face, loose painterly clothes, and a soft green, yellow and blue watercolour splash behind them with a few drips and speckles fading into the white paper' },
  { id: 'oil', kind: 'toon', name: 'Royal oil painting', shape: 'portrait', caricature: false, group: 'Watercolour',
    prompt: 'a classical Renaissance-style royal oil painting portrait: rich dark background, dramatic warm lighting, visible brush strokes and canvas texture, dressed in grand regal robes with a velvet cape and gold details, dignified pose',
    motion: 'The oil painting gently comes to life: the subject raises an eyebrow, breaks into a grin and gives a royal wave, candlelight flickering. Keep the oil-paint brush-stroke texture throughout. The camera stays still. Soft classical ambience, no words.' },
  { id: 'neon', kind: 'toon', name: 'Neon retro 80s', shape: 'portrait', caricature: false, group: 'Cartoon',
    prompt: 'a retro 1980s synthwave illustration: glowing neon pink and cyan rim lighting, airbrushed style, sunset grid landscape and palm silhouettes behind, cool sunglasses pushed up on the head' },
];
const pick = (...ids) => ids.map((id) => ({ ...STYLE_LIBRARY.find((s) => s.id === id), on: true }));
// the order categories appear in on the booth
export const GROUP_ORDER = ['Superheroes', 'Red Carpet', 'Sports', 'Movies', 'Futuristic', 'Festive', 'Fun photos', 'Line Drawing', 'Cartoon', 'Anime Film', 'Pixel Game', 'Doll', 'Watercolour', 'Fashion Sketch', 'Mini Me', 'Bobbleheads'];
export const MAX_PER_MODE = 12;
// new events start with 12 Toon Style and 12 AI Create styles ticked, one or more from every category
export const DEFAULT_STYLES = pick(
  'pencil', 'lineart', 'cartoon', 'laugh', 'retroanime', 'pixel', 'dollbox', 'water', 'fashion', 'minime', 'bobble', 'chibiemo',
  'stormhero', 'cyberhero', 'premiere', 'gala', 'football', 'giant', 'spy', 'dragon', 'cyberpunk', 'future', 'elf', 'planetdxb');
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
    boothTitle: 'AI Create Booth', tagline: 'Pick a style. Strike a pose.', startBtn: 'Start',
    colors: { bg: '#121012', accent: '#ED2F5B', text: '#FFFFFF' },
    styles: DEFAULT_STYLES.map((s) => ({ ...s })), guestChoice: true, expressions: DEFAULT_EXPRESSIONS.slice(),
    allowGroup: true, countdown: 3, makingTitle: 'Please wait', makingSub: 'whilst the magic happens',
    video: { on: true, motion: DEFAULT_MOTION, aspect: '9:16', resolution: '720p' },
    print: { on: true, from: 'station', copies: 1, qr: true, inset: true, hasFrame: false, hasFrameL: false },
    email: { enabled: true, atBooth: true, senderName: '', subject: 'Your AI Create Booth video', heading: 'Your video',
      message: 'Thanks for stopping by! Here is your video from the AI Create Booth. Tap below to watch it and save it to your phone.', button: 'Watch my video',
      consent: 'I agree to receive this email with my video.', marketing: false, marketingText: 'Keep me updated with news and offers from the event organiser.' },
    hasLogo: false, hasBg: false, resetSec: 45,
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
export function toonPrompt(style, expression, team, logo = false) {
  const who = team ? 'everyone in this photo (the same people, no one added or removed), together in one picture' : 'the person in this photo (if there are several people, include all of them together, no one added or removed)';
  const landscape = false;   // every style is vertical (portrait 2:3)
  return `Create a new image of ${who} in this style: ${style.prompt || 'a fun, flattering cartoon'}. Keep every person clearly recognisable: the same face shape, features, hairstyle, hair colour, skin tone, glasses and jewellery. Keep their clothing unless the style describes an outfit, and always keep any head covering (hijab, shayla, ghutra, kandura, abaya, turban) and modest clothing exactly as in the photo; never make clothing more revealing. Keep it respectful, kind and flattering, never mocking.${style.caricature && expression ? ` Expression: ${expression}.` : ''} ${landscape ? 'Landscape' : 'Portrait'} format, the people centred and fully in frame with space around them. ${style.word ? `The big 3D lettering spells exactly "${style.word}" (spelt correctly, letter for letter); apart from that word there is NO other text, letters or numbers anywhere, NO speech bubbles,` : 'NO text, NO letters, NO words, NO numbers, NO speech bubbles with writing,'} ${logo ? 'Put the logo from the SECOND image neatly on the chest of their top (one small, clean, accurate copy per person, exactly as given); NO other logos or brand names anywhere,' : 'NO logos or brand names on clothing or anywhere,'} NO watermark, NO signature, NO borders, NO frames, NO extra people.`;
}

// ---------- Gemini ----------
export async function geminiImage(b64, prompt, aspect = '2:3', extra = null) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL()}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }, ...(extra ? [{ inline_data: extra }] : [])] }],
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
  const button = hasVideo ? (em.button || 'Watch my video') : 'See my picture';
  const html = `<!doctype html><html><body style="margin:0;background:#f2f3f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden">
<tr><td align="center" style="background:${escH(accent)};padding:22px">${logo ? `<img src="${escH(logo)}" alt="" style="max-width:260px;max-height:90px">` : `<div style="color:#fff;font-size:22px;font-weight:bold">${escH(em.heading || ev.name)}</div>`}</td></tr>
<tr><td style="padding:24px 26px 8px;color:#222;font-size:16px;line-height:1.55">${escH(em.message).replace(/\n/g, '<br>')}</td></tr>
<tr><td align="center" style="padding:10px 24px"><a href="${escH(link)}"><img src="${escH(origin)}/api/public/media/${m.id}/thumb.jpg" alt="Your picture" width="240" style="width:240px;max-width:100%;border-radius:10px;display:block"></a></td></tr>
<tr><td align="center" style="padding:16px 24px 30px"><a href="${escH(link)}" style="background:${escH(accent)};color:#fff;text-decoration:none;padding:15px 28px;border-radius:30px;font-weight:bold;display:inline-block">${escH(button)}</a></td></tr>
</table></td></tr></table></body></html>`;
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { name: em.senderName || ev.name || 'Photobooth-ME', email: from }, replyTo: { email: from }, to: [{ email: to }],
      subject: em.subject || 'Your AI Create Booth video', htmlContent: html, textContent: `${em.message || ''}\n\n${button}: ${link}` }),
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
