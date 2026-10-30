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

Deploy only this directory, never the repository root:

```sh
cd website
vercel link --yes --project eme-website --scope atharv-paharias-projects
vercel deploy --prod --yes --scope atharv-paharias-projects
```

This is a static deployment with no install/build step or environment variables.
Local Vercel project linkage is ignored by Git. Engine credentials, media and
feedback databases live outside the deploy directory.

The supplied logo is in `assets/eme-logo.png`, recolored to lime
with a transparent background using the built-in image editing tool. The two
white shapes below the mark have been removed. Edit prompt: remove only the
two off-white shapes, replacing them with transparency; keep the lime mark. Header, footer and favicon use the same asset.

The earlier Sites deployment is separate; Vercel is now the requested hosting target.
