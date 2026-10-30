# EME website

A restrained neo-brutalist product website: off-white, black, lime, generous
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

The Sites-managed checkout lives under `../sites/eme-surreal` (the original
checkout name). Copy changes there and use the Sites packaging workflow to publish.
Keep its current Site identity and access settings.
