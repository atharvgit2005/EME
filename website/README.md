# EME website

A restrained neo-brutalist product website: charcoal, off-white, lime, generous
spacing, an interactive Three.js layer stack and a compact design playground.

Preview from the EME checkout:

```sh
python3 -m http.server 4731 --directory website
```

Open http://127.0.0.1:4731. No credentials, model calls or backend are needed.
The Studio link requires the local EME server. The comparison is an interactive
illustration, not a live engine render or a training vote.

## Interaction and accessibility

- Drag the 3D frames to rotate, or focus them and use arrow keys / Home.
- Separate layers, reset the view, and pause or resume animation.
- Reduced-motion preferences disable initial animation and animated separation.
- Rendering pauses offscreen and when the tab is hidden. Pixel density is capped.
- An inline SVG remains available if WebGL fails or JavaScript is unavailable.
- All three design variants, playback, keyboard timeline scrubbing, copy command,
  setup/source links and engine explanations remain available.
- Engine details use native accessible disclosures. Mobile controls use 44px targets.

Three.js 0.187.0 is bundled locally under `vendor/`; its MIT license is included.
The bundle was generated from the official npm package with esbuild. Runtime 3D
requires no external script CDN. DM Sans and Space Mono load from Google Fonts,
with system fallbacks.

## Deploy with Vercel CLI

Production: https://eme-website-pied.vercel.app

The Vercel project `eme-website` is connected to this repository. Its **Root
Directory must be `website`**, with framework Other, output directory `.`, and
empty install/build commands. Pushes to `main` then deploy only the static site.
Do not reset the root to the repository root: that publishes the wrong directory
and makes the homepage return 404.

To rebuild the current production Git deployment with Vercel CLI:

```sh
vercel redeploy https://eme-website-pied.vercel.app --target production --scope atharv-paharias-projects
```

This is a static deployment with no install/build step or environment variables.
Local Vercel project linkage is ignored by Git. Engine credentials, media and
feedback databases live outside the website root. The CLI command above rebuilds
the existing Git source without uploading local files.

The supplied logo is in `assets/eme-logo.png`, recolored to lime
with a transparent background using the built-in image editing tool. The two
white shapes below the mark have been removed. Edit prompt: remove only the
two off-white shapes, replacing them with transparency; keep the lime mark. Header, footer and favicon use the same asset.

The earlier Sites deployment is separate; Vercel is now the requested hosting target.

## Product walkthrough

The homepage includes a 65-second narrated product demo, five chapter buttons,
English captions, a text transcript, and a download link. The native player
works without JavaScript. Video loading waits for the visitor to press play.

`assets/demo/eme-walkthrough.mp4` is a 1600×900, 30 fps H.264/AAC fast-start MP4
(about 5.6 MiB). It is a short cut of the existing EME cinematic film, using real
Studio captures, generated sample footage and a native EME export. It is an edited
presentation, not an uninterrupted recording. Existing Inworld Grayson narration
and original procedural music are retained. `manifest.json` records the source
hash, chapter cuts and output hash. Captions are also visible in the picture.

Rebuild from the original local film and its timeline (requires FFmpeg):

```sh
python3 scripts/build-website-demo.py ../outputs/eme-cinematic-demo
```

The Python preview server above does not support byte-range requests, so chapter
seeking may fail there even when the full video plays. Use a static server with
HTTP Range support for playback QA; Vercel serves the deployed MP4 with ranges.
