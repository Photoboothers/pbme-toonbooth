# Photobooth-ME · AI Photo Booth (caricatures, AI photos and AI video)

Guests take a photo and get an AI caricature. The still prints at 4x6 straight away, and an animated video of the caricature is emailed to them a minute or two later.

1. Guest taps Start, picks a style (optional) and takes a photo with a countdown.
2. While Google's Nano Banana image AI draws the caricature, the "Magic happening" screen shows a pencil scribbling across the page as the timer.
3. The caricature appears on screen. The 4x6 print (caricature + frame overlay + small QR code) goes to the printer.
4. The guest types their email on the booth screen (or scans the QR code).
5. In the background, Gemini Omni Flash turns the caricature into a short animated video. As soon as it is ready the guest is emailed a link to their page, where they can watch and save the video and the picture.

## Styles

Admin → Styles → **Add from the style library** has 36 ready styles: cartoon and caricature looks (golf swing, big laugh cartoon, red carpet stars, pixel game hero, collectible figurine, instant sketch, watercolour and more), festive (elfie selfie) and realistic AI photo transformations (time machine eras, football star, slam dunk, hero landing, gala night, golden celebration). Each style has its own look prompt, its own animation (the pixel hero runs and catches coins, the laughing friends look at each other and crack up), a shape (portrait or landscape) and an optional sample image for the style button. Everything is editable per event.

Admin → Print & video → **What guests get**: print + animated video, print only, video only, or digital only.

**Golden rule:** the AI never writes any words. Every word on the print, the screens and the email comes from the app.

If the video can't be made, the guest is still emailed, with their caricature instead, and staff can retry the video from the Gallery.

## Pages

- `/admin`: events, booth look, styles and expressions, print and video, email, gallery, email export (CSV).
- `/booth/?event=…`: the guest touchscreen (Chrome, full screen).
- `/station/?event=…`: the print station. Chrome started with `--kiosk-printing`, DNP as the default printer at 4x6 (Printer setup button has the steps).
- `/v/<id>`: the guest page (video + picture, save buttons). Updates by itself while the video is being made.

## Netlify set-up (once)

1. Link the repository: Netlify → Add new project → Import from GitHub → `Photoboothers/pbme-toonbooth`, branch `main`.
2. Environment variables:
   - `ADMIN_PASSWORD` (required)
   - `GEMINI_API_KEY` (required, Google AI Studio with billing on)
   - `EMAIL_API_KEY` (Brevo key, same as the other booths). Sends from events@photobooth-me.com, or set `EMAIL_FROM`.
   - `GEMINI_IMAGE_MODEL` (optional, default `gemini-2.5-flash-image`)
   - `GEMINI_VIDEO_MODEL` (optional, default `gemini-omni-1.1-flash`)
3. Turn off the "Powered by Netlify" badge. Custom domain: a CNAME in Bluehost (for example `caricature`) pointing to `<project>.netlify.app`.

## Printing

- **Separate print station** (default): a laptop with the DNP runs `/station/`. Prints come out automatically.
- **From the booth itself**: set "Print from" to the booth screen in admin, and start the booth's Chrome with `--kiosk-printing`.

## Costs and timing

Each guest uses one image generation (a few cents) and, with video on, one video generation (much more per guest). Switch video off in admin for print-only events. Video usually takes under a minute but can take a few minutes when Google is busy, which is why it is emailed rather than shown at the booth.
