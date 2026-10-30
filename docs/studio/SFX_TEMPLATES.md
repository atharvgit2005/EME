# Contextual SFX templates

The IDE can call `eme_studio_list_sfx_templates` and `eme_studio_plan_sfx`.
These are pure proposal tools: they do not approve edits, mutate projects or
record preference feedback. The existing approval workflow is unchanged.

Six original procedural materials replace the need to choose the same generic
whoosh for every event: `editorial-paper`, `kinetic-type`, `product-glass`,
`cinematic-weight`, `spatial-transition`, and `digital-lock`.

Choose an editorial profile (`editorial`, `kinetic`, `product`, `cinematic`, or
`interface`) and supply explicit events with IDs, kinds, ticks and optional
salience from 0 to 1. Kinds are `cut`, `title`, `reveal`, `transition`, `accent`.
The planner returns chronological cues and explicit reasons for skipped events.
Ordinary cuts are intentionally silent in most profiles. Important events win
crowded windows, repeated materials have cooldowns, and dialogue suppresses
low-salience effects. Explicit dialogue intervals are required; this is not VAD.

```json
{
  "events": [
    {"id": "product-reveal", "kind": "reveal", "tick": 120000, "salience": 0.9}
  ],
  "options": {"profile": "product", "durationTicks": 720000, "seed": 42}
}
```

Save the request above to a JSON file, then:

```sh
node bin/eme-sfx.js list
node bin/eme-sfx.js plan request.json
node bin/eme-sfx.js render product-glass reveal.wav 42
```

For the exact planned variation, pass the returned cue seed to `render`, and
the cue intensity to `AudioIntelligenceFacade.renderSfxTemplate(templateId,
{seed, intensity})`. The CLI defaults to intensity 0.65; its optional final
argument overrides that intensity. Import the WAV into Studio and place it at
the returned `startTick` through an ordinary review proposal. Alignment uses
an explicitly designed gesture anchor, not a claim of measured acoustic peak.
Cues without enough timeline handles are skipped, not silently clamped.

All output is 48 kHz stereo PCM WAV. Repeating a seed reproduces bytes; changing
the seed varies material microstructure. No downloaded or unlicensed sound pack
is required. Legacy procedural generators remain available with bounded inputs,
zero-valued edge samples and independent stereo filters for risers.

Run `npm run test:sfx` and `npm run benchmark:sfx`. The benchmark sweeps 216
seed/material combinations in three rounds and five 300-event briefs. It checks
signal bounds, edge discontinuities, reproducibility, cue density and handles.
These are technical gates, not proof of subjective sound quality. Audition the
six WAV examples under `.artifacts/engine-hardening/sfx/` in the actual mix.

## Research and design rationale

Pinterest was used for reference discovery. Individual Pin pages for
[PERSONA](https://in.pinterest.com/pin/persona-on-behance--83809243056714512/)
and [Eco Kinetic](https://in.pinterest.com/pin/typography-slides-eco-kinetic-v11--796785359088133873/)
were indexed but blocked direct access (403). Their audio was not auditioned or
copied; those search previews alone cannot substantiate sound-design judgments.

The primary creator's [Pinterest motion identity case study](https://dia.tv/project/pinterest/)
describes named components, behavioral rules, collage rhythm and reusable
templates. EME's interpretation is a small vocabulary of sound materials with
consistent event mapping, timing, repetition limits and deliberate silence.
These sound recipes are our original implementation, not DIA's audio assets.

[Pinterest's creative guidance](https://business.pinterest.com/pdf/pinterest-presents/path-to-performance)
emphasizes mobile context, intentional motion, contrast and testing alternatives.
Applied here: restrained effects under speech, contextual profiles and a
reproducible benchmark. No claim is made that these references validate EME's
audio quality or improve conversion metrics.
