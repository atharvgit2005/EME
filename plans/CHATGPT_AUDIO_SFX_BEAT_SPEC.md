EME Audio & Rhythmic Intelligence — Architecture Specification

Architecture decision: Build three cooperating subsystems—Beat Understander, Beat Actor, and SFX Engine—above EME’s existing deterministic editing core. They should share a canonical audio-analysis contract and timeline timebase, but remain independently testable, cacheable, and versioned.

The central design rule is that audio analysis proposes evidence, editorial policy decides intent, and the existing operation executor performs edits. None of these subsystems should directly mutate timeline state, bypass transaction guards, or modify the existing project schema.

1. System architecture and module boundaries
Natural-language edit intent

Owned by the separate PF-01–PF-05 workstream

Audio Intelligence Facade

Audio ingest · canonical timebase · job coordination · artifact references

Beat Understander

STFT, onset strength, tempo, beat grid, sections, spectral bands, confidence

Analysis only

Beat Actor

Editorial policies, cue generation, spacing, sync validation, operation compilation

Plan only

SFX Engine

Procedural synthesis, asset retrieval, layering, spatialization, ducking, mixing

Audio artifacts

Validated EME operation plan

Existing operation contracts · src/engine/operations.js · transaction and lock guards

Existing renderer and verification pipeline

HyperFrames / FFmpeg · audio-video synchronization · artifact manifest · QA

Responsibilities and hard boundaries

Component

	

Owns

	

Must not own




Beat Understander

	

Deterministic signal features and confidence-bearing musical events

	

Timeline mutation, artistic decisions




Beat Actor

	

Mapping events to proposed editorial cues and legal operations

	

Direct project-state mutation, rendering




SFX Engine

	

Synthesis, asset selection, cue rendering and mix generation

	

Editing video clips or bypassing audio routing




Audio Intelligence Facade

	

Job orchestration, artifact registry, versioning and cache coordination

	

Duplicating the canonical timeline model




Existing EME executor

	

Validating and committing timeline operations

	

Audio-analysis algorithms or implicit editorial decisions

Integration constraint: Keep TL-01's 120,000-ticks-per-second canonical timebase and its existing transaction model. Audio-derived events should use integer canonical ticks for timeline positions; audio analysis can use integer sample indices and rational sample rates internally. Convert at explicit boundaries, not through repeated floating-point seconds conversions.

The existing project schema remains unchanged initially. Store analysis results and generated audio as versioned sidecar artifacts, referenced by job IDs and content hashes. Only after the existing contracts are inspected should any required operation type or schema extension be proposed.

The diagram describes the target architecture; actual repository paths, operation names and current schema details must be verified against the working tree before implementation.

2. Beat Understander — algorithmic specification
2.1 Recommended implementation strategy

Start with a deterministic, CPU-based analysis pipeline. Use FFT/STFT and conventional signal processing as the primary engine; use a library such as librosa as a reference implementation or optional backend, not as an unexamined black box. Its documented onset-strength and beat-tracking algorithms provide a sound baseline for spectral flux, tempo estimation, and beat selection. 
librosa 0.11.0 documentation
+1


Suggested module layout:

Plain text
src/audio/beat/
  audio-ingest.js
  decode-and-resample.js
  stft.js
  spectral-features.js
  onset-detector.js
  tempo-estimator.js
  beat-grid.js
  downbeat-estimator.js
  section-detector.js
  band-analysis.js
  confidence.js
  beat-analysis-cache.js
  beat-analysis.schema.json

Keep the numerical DSP core isolated from Node.js process orchestration. The DSP functions should accept explicit buffers, sample rate, and configuration, and return values rather than mutate shared state.

2.2 Audio normalization and time alignment

For every input, capture:

Original file SHA-256 and file size.

Decoder and version, codec, source sample rate, channel count and duration.

Canonical analysis sample rate, channel-mix policy and resampling settings.

Analysis configuration, algorithm version and floating-point implementation.

Any source offset or known synchronization offset.

Convert input audio to a documented floating-point PCM representation. Preserve stereo channels for spatial and channel-specific analysis; derive a deterministic mono analysis signal for tempo and general onset detection. Do not assume averaging stereo channels is safe for every source: phase cancellation can suppress features. Test a fixed downmix policy and allow a documented fallback for problematic stereo material.

For a sample index 
𝑛
n, sample rate 
𝑓
𝑠
f
s
	​

, and canonical timebase 
𝑇
=
120,000
T=120,000 ticks/second:

𝑡
t
i
c
k
s
=
round
⁡
(
𝑛
𝑇
𝑓
𝑠
)
t
ticks
	​

=round(
f
s
	​

nT
	​

)

Use integer sample indices as the authoritative DSP positions and convert to ticks only at the interface boundary. Keep source offsets explicit; do not hide them inside detected beat timestamps.

2.3 STFT and spectral flux

Use a Hann-windowed short-time Fourier transform:

𝑋
[
𝑘
,
𝑚
]
=
∑
𝑛
=
0
𝑁
−
1
𝑥
[
𝑛
+
𝑚
𝐻
]
𝑤
[
𝑛
]
𝑒
−
𝑗
2
𝜋
𝑘
𝑛
/
𝑁
X[k,m]=
n=0
∑
N−1
	​

x[n+mH]w[n]e
−j2πkn/N

Where 
𝑁
N is the FFT window length, 
𝐻
H is the hop length, and 
𝑚
m is the frame index.

Recommended initial configuration:

Parameter

	

Initial value

	

Reason




Analysis sample rate

	

44,100 Hz

	

Common audio rate with adequate high-frequency coverage




FFT size

	

2,048

	

Practical frequency/time trade-off




Hop length

	

441 samples

	

10 ms feature spacing




Window

	

Hann

	

General-purpose spectral analysis




Onset representation

	

Log magnitude or log power

	

Reduces dominance of loud bins




Channel strategy

	

Stereo preserved; deterministic mono feature path

	

Avoids losing spatial data

These are starting parameters, not universal optima. Evaluate alternate window sizes for low-frequency beat estimation and transient localization before freezing the defaults.

For log-magnitude spectral features 
𝑆
[
𝑘
,
𝑚
]
S[k,m], compute positive spectral flux:

𝐹
[
𝑚
]
=
∑
𝑘
𝑤
𝑘
max
⁡
(
0
,
𝑆
[
𝑘
,
𝑚
]
−
𝑆
[
𝑘
,
𝑚
−
1
]
)
F[m]=
k
∑
	​

w
k
	​

max(0,S[k,m]−S[k,m−1])

Here 
𝑤
𝑘
w
k
	​

 may apply a frequency weighting, and a local spectral reference or whitening stage can suppress sustained spectral energy. Normalize robustly within local windows rather than normalizing every file by its maximum alone; one isolated impact should not erase the useful dynamic range of the remaining track.

Use at least two onset envelopes:

Broadband flux: general musical attacks.

Transient-focused flux: stronger sensitivity to short percussive changes.

Optionally calculate low-, mid- and high-band flux independently. Every derived curve should have an explicit frame-to-sample mapping, and the cache should record whether frame centering is enabled. Mixing centered and non-centered STFT conventions is a common source of systematic timing errors.

2.4 Onset detection and peak picking

Do not treat every local peak as a beat. Onsets are acoustic attacks; beats are estimated rhythmic positions. They are different event classes.

A first-pass onset detector should:

Smooth the onset envelope with a small, fixed kernel.

Estimate a local adaptive threshold.

Detect local maxima above that threshold.

Apply a minimum event separation.

Optionally backtrack a detected attack to a nearby local energy minimum.

Store onset strength and local prominence rather than only a timestamp.

A candidate peak at frame 
𝑚
m is eligible when:

𝐹
[
𝑚
]
>
𝐹
[
𝑚
−
𝑖
]
and
𝐹
[
𝑚
]
≥
𝐹
[
𝑚
+
𝑖
]
F[m]>F[m−i]andF[m]≥F[m+i]

for the configured neighborhood, and its prominence exceeds a local threshold.

Store both the detected peak time and the backtracked onset time. The first is useful for event strength; the second can be useful for tighter edit alignment. Neither should be silently substituted for the other.

Initial acceptance targets for synthetic transients:

Median onset timing error: at most 10 ms.

95th-percentile timing error: at most 25 ms.

Duplicate detections within the configured refractory window: zero.

Missed reference attacks on clean, isolated synthetic fixtures: zero.

Real music should have a separate benchmark, because reverberation, layered percussion, distortion and sustained sounds make a universal onset tolerance unrealistic.

2.5 Tempo estimation and beat grid

Use multiple tempo hypotheses, not a single estimate.

Stage A — autocorrelation. Calculate onset-envelope autocorrelation:

𝑅
[
𝜏
]
=
∑
𝑚
𝐹
[
𝑚
]
𝐹
[
𝑚
−
𝜏
]
R[τ]=
m
∑
	​

F[m]F[m−τ]

For a frame rate 
𝑓
𝑟
=
𝑓
𝑠
/
𝐻
f
r
	​

=f
s
	​

/H, a lag 
𝜏
τ corresponds to:

B
P
M
=
60
𝑓
𝑟
𝜏
BPM=
τ
60f
r
	​

	​


Evaluate a configurable plausible tempo range, initially 40–240 BPM. Retain competing hypotheses at half-time and double-time. A song with a 70 BPM half-time interpretation and a 140 BPM beat interpretation can have both hypotheses acoustically plausible.

Stage B — candidate scoring. Score each tempo hypothesis by onset energy near predicted beats, autocorrelation strength, grid regularity and consistency across local windows.

Stage C — sequence decoding. Use dynamic programming or an equivalent deterministic sequence optimizer to select a beat sequence that balances alignment with onset evidence against implausible beat-to-beat interval changes. This is consistent with the broad three-stage structure of established beat trackers. 
librosa 0.11.0 documentation


Stage D — local tempo tracking. Allow tempo changes across sections instead of forcing the entire soundtrack into a single constant BPM. Use a smoothness penalty so transient noise does not create erratic tempo jumps.

Stage E — grid anchoring. Estimate the phase offset, then derive beats, subdivisions and candidate bars from the selected grid. Mark the grid as uncertain if phase or tempo hypotheses are too close in score.

Do not report a false sense of precision. Tempo confidence must be derived from measurable evidence, including:

Separation between the best and second-best tempo hypotheses.

Consistency of local tempo estimates.

Strength and stability of grid-aligned onset energy.

Fraction of the track with usable rhythmic evidence.

Agreement between independent onset representations.

Use a normalized confidence score in the interval 
[
0
,
1
]
[0,1], with a documented deterministic formula and calibration dataset. It is an engineering confidence estimate, not a statistical probability unless calibrated as one.

2.6 Downbeats, bars and musical sections

Beat tracking alone does not establish bar phase or time signature. Implement these as separate inference stages.

Downbeat estimation: use periodic patterns in onset strength, low-frequency energy and spectral features across successive beats.

Meter hypotheses: compare candidate groupings such as 3/4 and 4/4, retaining uncertainty when evidence is weak.

Bar indexing: derive bar numbers only when a bar-phase hypothesis has sufficient support.

Phrase boundaries: combine repeated rhythmic patterns, energy changes and harmonic or timbral changes.

Drop/build/breakdown detection: use local energy, spectral flux, low-frequency activity, high-frequency density and onset-rate changes.

Represent section labels as hypotheses with start/end ticks, confidence, and supporting feature references. Do not claim semantic certainty about a “drop” merely because loudness increases; it is an editorially useful classification, not a universal acoustic fact.

2.7 Frequency-band and energy analysis

Calculate band energies from the STFT, using configurable filters with documented boundaries. A useful initial feature partition is:

Band

	

Initial range

	

Primary utility




Sub/bass

	

20–120 Hz

	

Bass energy, 808s, low-end pulses




Low-mid

	

120–500 Hz

	

Kick body and low-frequency musical weight




Mid

	

500–2,000 Hz

	

Snare body, vocals, melodic attacks




High-mid

	

2–8 kHz

	

Snare snap, claps, percussive detail




High

	

8–16 kHz

	

Hats and high-frequency texture

These are analysis bands, not guaranteed instrument labels. A frequency band cannot reliably distinguish a kick from a bass synth or a snare from a bright synth stab. Add transient shape, attack duration, harmonicity and band-relative energy to improve event classification, and return unknown when evidence is insufficient.

For energy dynamics, use short-term RMS, band energy, onset density and rolling percentile baselines. Detect builds and drops from changes relative to local context, not absolute loudness alone.

3. Formal Beat Understander contracts

Create a versioned sidecar artifact such as eme-beat-analysis.v1. The following is a proposed contract, not a claim that this file already exists in the repository.

JSON
{
  "schemaVersion": "eme-beat-analysis.v1",
  "analysisId": "sha256:...",
  "source": {
    "sha256": "...",
    "sampleRate": 44100,
    "channels": 2,
    "durationSamples": 7938000
  },
  "config": {
    "algorithmVersion": "beat-understander-0.1.0",
    "fftSize": 2048,
    "hopLength": 441,
    "window": "hann",
    "analysisSampleRate": 44100
  },
  "tempo": {
    "bpm": 128.0,
    "confidence": 0.91,
    "alternativesBpm": [64.0],
    "phaseOffsetSamples": 1200
  },
  "meter": {
    "numerator": 4,
    "denominator": 4,
    "confidence": 0.76
  },
  "events": {
    "beats": [],
    "downbeats": [],
    "onsets": [],
    "sections": []
  },
  "features": {
    "spectralFluxRef": "artifact://...",
    "bandEnergyRef": "artifact://...",
    "energyCurveRef": "artifact://..."
  }
}
Contract requirements

schemaVersion, algorithm version and configuration hash are mandatory.

Timestamps are integer sample indices or integer canonical ticks, never ambiguous floating-point seconds.

BPM is a numeric estimate; confidence is bounded from 0 to 1.

Empty detections are valid results. They must not be replaced with fabricated beats.

Uncertain meter, downbeat or section classifications may be null or unknown.

Long feature arrays should live in binary sidecar artifacts, not enormous JSON project objects.

All references must resolve to immutable artifacts with checksums.

Each event should include a stable ID, event type, sample index, canonical tick, strength, confidence, and optional supporting feature references. Downbeats should also identify their beat-grid position and bar index when known.

Deterministic caching

Use a cache key computed from canonicalized inputs:

𝐾
=
𝐻
(
source hash
 
∥
 
decoder version
 
∥
 
config hash
 
∥
 
algorithm version
)
K=H(source hash∥decoder version∥config hash∥algorithm version)

The configuration hash must include every parameter affecting numerical output, including resampling, channel mixing, frame centering, peak thresholds and tempo bounds. Avoid relying on object key order, locale-dependent string conversion or implicit default values.

Cache the final analysis artifact separately from intermediate STFT, onset and band-energy artifacts. Re-running the same job with the same input, versions and configuration must either reuse the immutable result or produce equivalent output within the declared numerical tolerance.

For cross-platform bit-for-bit reproducibility, test the actual FFT and resampling implementations. Do not promise byte-identical floating-point output across arbitrary CPU architectures unless the numerical stack has been constrained and verified.

4. Beat Actor — deterministic rhythm-to-timeline editing

The Beat Actor is an editorial decision engine, not a beat-clicking macro. It should convert analyzed musical evidence into a candidate cue graph, apply pacing and safety policies, then compile accepted cues into existing EME operations.

4.1 Internal pipeline
Plain text
BeatAnalysis artifact
        |
        v
Musical Event Normalizer
        |
        v
Editorial Policy Engine
        |
        v
Candidate Cue Graph
        |
        v
Constraint + Collision Resolver
        |
        v
Operation Compiler
        |
        v
Existing Operation Validator
        |
        v
Existing Transactional Executor
        |
        v
Rendered Output + QA

Suggested module layout:

Plain text
src/audio/actor/
  event-normalizer.js
  editorial-policy.js
  pacing-policy.js
  cue-generator.js
  cue-collision-resolver.js
  sync-validator.js
  operation-compiler.js
  actor-plan.schema.json
  policies/
    music-video.js
    cinematic.js
    social-short.js
    restrained.js

The Beat Actor must not call the executor while it is still deciding what to do. First produce a complete, inspectable plan; validate it; then submit it through the existing execution interface.

4.2 Cue graph contract

Proposed sidecar contract: eme-beat-actor-plan.v1.

JSON
{
  "schemaVersion": "eme-beat-actor-plan.v1",
  "planId": "sha256:...",
  "analysisRef": "artifact://beat-analysis/...",
  "policy": {
    "id": "social-short",
    "version": "1.0.0"
  },
  "cues": [
    {
      "cueId": "cue-0001",
      "kind": "jump_cut",
      "target": {
        "clipId": "clip-a",
        "trackId": "video-main"
      },
      "atTicks": 240000,
      "sourceEventId": "beat-0008",
      "confidence": 0.93,
      "priority": 80,
      "constraints": {
        "minimumGapTicks": 72000,
        "requiresValidSourceRange": true
      }
    }
  ],
  "diagnostics": [],
  "compiledOperationsRef": null
}

The IDs and example timing are illustrative. Actual target references and operation payloads must follow the current repository contracts.

Every cue must specify:

A stable cue ID and cue type.

A target clip, track, sequence, or explicitly declared target-selection rule.

An integer timeline position.

Source evidence and confidence.

Policy version and priority.

Required preconditions, constraints and expected postconditions.

A rejection reason if it cannot be safely compiled.

The cue graph should be immutable after validation. A policy change generates a new plan ID rather than modifying a committed plan in place.

4.3 Rhythm-to-visual mapping

Jump cuts and camera punches

Use strong beats, phrase boundaries or high-confidence transients. Prefer cuts at editorially meaningful boundaries instead of cutting on every beat.

Compile to existing split/trim/selection operations only when their current contracts support the intended edit.

Accent flashes and glitch kicks

Use high-confidence downbeats and selected accent transients. Require explicit intensity, duration and flash-rate limits.

If no existing operation supports the visual effect, propose a new operation contract rather than writing timeline state directly.

Kinetic typography

Align word or phrase entrances with beats, bars or phrase boundaries. Prefer phrase-level timing when word-level sync would become visually noisy.

Preserve text order, readable dwell time, clip bounds and any explicit user timing constraints.

Speed ramps

Anchor buildup, anticipation and release to section boundaries or selected beats. Validate source-frame availability, duration and audio policy.

Do not assume speed changes are supported until the actual operation schema and renderer path are verified.

SFX placement

Use acoustic transients, beat accents, visual transitions and phrase boundaries. Store a reason and source event for every generated cue.

Route audio through the SFX/mix subsystem, then use validated audio-track operations for placement.

4.4 Sync tolerances and event selection

Use a policy-specific tolerance rather than one universal rule.

Cue category

	

Initial timing target

	

Policy




Sharp SFX on a detected transient

	

±10 ms

	

Tight alignment




Accent visual effect on a high-confidence beat

	

±1 video frame

	

Snap to frame boundary




Word entrance on a beat

	

±1 frame

	

Preserve readability




Phrase-level cut

	

±2 frames

	

Allow editorial flexibility




Speed-ramp transition

	

Configurable window

	

Optimize motion and musical phrase

At 60 fps, one frame is approximately 16.67 ms. Since EME uses an integer tick timebase, use exact rational frame-to-tick conversions and a documented rounding policy. Do not round a beat to the nearest frame until the final video-operation compilation stage.

The source soundtrack remains the authority for musical timing. A video cut may be frame-quantized while an SFX audio cue remains sample-accurate. They need not share identical quantization.

4.5 Pacing policies and over-cutting prevention

Build an explicit policy engine with configurable constraints, rather than burying thresholds in individual cue generators.

Recommended initial social-short policy:

Minimum cut interval: 250 ms.

Preferred cut interval: 400–900 ms.

Maximum beat-driven cuts per four-beat bar: 2 by default.

Strong phrase boundaries may override the preferred interval, but not hard safety constraints.

Require a high-confidence beat or a separately validated editorial event.

Suppress duplicate cues targeting the same clip and timestamp.

Do not create a cut without a valid source range on both sides.

Preserve explicit user-requested cuts and timing constraints.

Reject conflicting edits instead of silently choosing a winner.

These are initial engineering defaults, not universal editing rules. Different profiles should express different behavior: restrained/cinematic, dialogue-led, performance montage, high-energy social and experimental glitch.

An energy-aware cut score can be expressed as:

𝑆
(
𝑐
)
=
𝑤
𝑏
𝐵
(
𝑐
)
+
𝑤
𝑜
𝑂
(
𝑐
)
+
𝑤
𝑝
𝑃
(
𝑐
)
+
𝑤
𝑒
𝐸
(
𝑐
)
−
𝑤
𝑟
𝑅
(
𝑐
)
S(c)=w
b
	​

B(c)+w
o
	​

O(c)+w
p
	​

P(c)+w
e
	​

E(c)−w
r
	​

R(c)

Where:

𝐵
B: beat/downbeat confidence.

𝑂
O: onset strength.

𝑃
P: phrase-boundary significance.

𝐸
E: normalized local energy change.

𝑅
R: repetition or pacing penalty.

Candidates are ranked deterministically, then filtered by minimum gaps, per-bar limits, target availability and clip-boundary constraints. Use a stable tie-breaker such as (priority descending, confidence descending, atTicks ascending, cueId ascending).

Energy should increase or decrease the likelihood of selecting a cut, not bypass the hard limits. A loud, transient-dense section should not automatically turn into a chaotic edit.

4.6 Compilation into existing operations

The compiler should produce a legal operation batch for the existing src/engine/operations.js interface. Do not invent operation names or payloads until that file and its validators have been inspected.

Compilation steps:

Resolve target IDs against a read-only snapshot of the timeline.

Convert cue positions to the canonical tick timebase.

Resolve frame boundaries where required.

Sort operations deterministically.

Validate clip existence, source ranges, track state, lock state and operation preconditions.

Detect conflicting operations and impossible ranges.

Emit a batch with expected preconditions and postconditions.

Submit through the existing transaction/undo/recovery path.

Verify the resulting timeline against the predicted postconditions.

If the repository's current operations cannot express a requested effect, return a structured unsupported_operation diagnostic. Do not patch the timeline through a side channel.

Critical invariant: Re-running the same validated actor plan must not duplicate cuts, effects or SFX. Use operation IDs or existing idempotency facilities if available; otherwise define the smallest compatible idempotency extension after inspecting the current executor.

5. SFX Engine — professional sound design architecture

The SFX Engine should combine procedural generation with curated audio assets. Neither alone is enough: procedural synthesis provides parameter control and reproducibility, while well-designed assets provide realistic impacts, foley and complex textures that are difficult to synthesize convincingly from basic oscillators.

5.1 Module structure
Plain text
src/audio/sfx/
  sfx-catalog.js
  asset-index.js
  asset-retrieval.js
  procedural/
    oscillator.js
    noise.js
    envelopes.js
    filters.js
    riser.js
    whoosh.js
    impact.js
    click.js
    glitch.js
    foley-texture.js
  layering/
    layer-graph.js
    cue-renderer.js
    spatializer.js
    loudness.js
    ducking.js
  render/
    ffmpeg-graph.js
    mix-validator.js
    sfx-manifest.js

Keep synthesis and cue planning independent from FFmpeg command construction. The same SFX cue should have a stable description whether it is rendered to WAV, inspected in tests or passed to the final audio mixer.

5.2 Parametric synthesis

Every procedural generator should take an explicit parameter object and a deterministic seed. The output must be reproducible for the same implementation version, seed and parameters.

Common primitives:

Oscillators: sine, triangle, saw and band-limited waveforms.

Noise: white and filtered noise, with deterministic pseudorandom generation.

Envelopes: attack, decay, sustain and release; one-shot curves; exponential or logarithmic fades.

Filters: low-pass, high-pass, band-pass and resonant filtering.

Modulation: pitch sweeps, amplitude modulation, filter movement and controlled distortion.

Spatial movement: stereo panning trajectories and width automation.

Avoid discontinuities in oscillators, abrupt envelope changes and uncontrolled DC offsets. Band-limit discontinuous waveforms and test for clipping, NaNs, excessive subsonic energy and clicks at segment boundaries.

5.3 Generator recipes

SFX family

	

Primary construction

	

Important controls




Riser

	

Noise + rising filter cutoff + pitch or spectral movement

	

Duration, brightness, pitch curve, density




Whoosh

	

Shaped noise + band-pass sweep + amplitude envelope

	

Direction, stereo width, duration




Impact

	

Low-frequency body + transient noise + optional metallic layer

	

Pitch, decay, transient ratio, saturation




Click

	

Short transient with a narrow-band or impulse-like body

	

Attack, duration, brightness




Glitch

	

Gated micro-bursts, bit reduction, short resampling or granular fragments

	

Burst rate, pattern, spectral harshness




Foley texture

	

Layered or granular recorded textures, optional filtered noise

	

Texture category, density, randomness, room character

Do not market these as photorealistic foley from synthesis alone. Realistic footsteps, fabric, glass, doors and environmental interactions should primarily come from vetted recorded assets or specialized synthesis with an appropriate physical model.

5.4 SFX asset catalog and retrieval

Each asset needs immutable metadata:

JSON
{
  "assetId": "sfx-impact-metal-001",
  "sha256": "...",
  "uri": "asset://sfx/impact-metal-001.wav",
  "durationSamples": 35280,
  "sampleRate": 44100,
  "channels": 2,
  "tags": ["impact", "metallic", "short"],
  "loudness": {
    "integratedLufs": -18.4,
    "truePeakDbtp": -2.1
  },
  "license": {
    "source": "curated-pack",
    "rightsStatus": "verified",
    "attributionRequired": false
  }
}

The values are examples, not measurements of a real file.

Asset retrieval should use a transparent ranking process:

Filter by licensing, allowed use, channel count and duration.

Filter by semantic tags and intended role.

Rank by duration fit, timbral descriptors, loudness suitability and deterministic asset priority.

Apply any approved variation policy.

Record the chosen asset, score components and catalog version in the manifest.

Hash every source asset. Preserve license and attribution records, and reject assets whose rights status is unknown for a release intended for distribution.

5.5 Layer compositing and spatialization

Represent each cue as a graph of layers. Each layer specifies:

Source generator or asset.

Start offset and duration.

Gain and envelope.

Filter and pitch parameters.

Pan trajectory.

Optional processing chain.

Required peak and duration limits.

Normalize layer timing to integer samples in the mix's declared sample rate. Use deterministic gain envelopes and stable layer ordering. Detect overlapping low-frequency impacts and coincident transients to avoid accidental buildup.

Automated stereo panning should be cue-aware:

Center important transient impacts by default.

Use bounded pan movement for whooshes and transitions.

Keep dialogue and critical musical elements within the intended stereo policy.

Use equal-power panning for mono-source movement where appropriate.

Avoid phase-incoherent widening as a default.

Verify mono compatibility and left/right channel balance.

Spatialization should be controlled by the cue plan; do not randomize pan positions on each render.

5.6 Loudness, ducking and sidechain mixing

The engine needs separate targets for individual SFX, music, dialogue and the final program. Peak normalization alone is insufficient because it does not control perceived loudness. Use loudness measurement and true-peak measurement as explicit QA stages. EBU R 128 provides a professional loudness framework; its broadcast target should not be blindly imposed on every creator-oriented deliverable. 
EBU Technology & Innovation
+1


For dialogue ducking, use dialogue as the sidechain detector input and music as the gain-controlled input. Define attack, release, ratio, threshold, knee and maximum attenuation explicitly. If the dialogue detector becomes unreliable, do not silently apply extreme gain reduction.

Initial tunable profile:

Dialogue/music ducking: start with 3–6 dB of reduction under active speech.

Attack: 10–30 ms.

Release: 150–400 ms.

SFX transient protection: avoid unnecessary attenuation of short accent transients unless they mask speech.

Final output true peak: use a configurable ceiling, with a conservative initial target such as −1 dBTP.

These are starting values to be validated against actual dialogue and music fixtures, not fixed industry requirements.

Use FFmpeg's sidechaincompress for sidechain dynamics and loudnorm for EBU R 128-style loudness processing where appropriate. Its documentation describes double-pass normalization for files and true-peak-aware processing. 
ffmpeg.org


5.7 Headless render pipeline

The render pipeline should be built from a declarative audio mix plan, not assembled from arbitrary shell strings.

Plain text
SFX cue graph
   |
   v
Generate / retrieve source layers
   |
   v
Decode + resample to mix format
   |
   v
Trim / delay / gain / envelope / pan
   |
   v
Dialogue-aware music ducking
   |
   v
Layer mixing + master processing
   |
   v
Loudness / true-peak / clipping QA
   |
   v
Audio artifact + manifest + checksum

Requirements:

Invoke FFmpeg with argument arrays, not shell-interpolated user content.

Pin and record the FFmpeg version.

Fix sample rate, sample format, channel layout, dither policy and filter ordering.

Specify output duration and trailing-silence behavior.

Ensure the final audio duration matches the intended video duration within the declared tolerance.

Verify that no unexpected channel mapping, clipping, NaNs, truncation or audio gaps are present.

Record source hashes, cue IDs, filter configuration, output hash and QA measurements.

The existing EME render pipeline should remain the final authority for packaging and artifact verification. The SFX Engine supplies a validated audio artifact and metadata; it does not bypass the established render and recovery system.

6. Phase-by-phase implementation roadmap

Implement these phases sequentially. The order deliberately establishes reproducible analysis before introducing automated edits and generated sound. Do not build all three subsystems simultaneously and attempt to debug them through final renders.

A0

Foundation

Repository and contract audit

Gate 0

Inspect src/engine/operations.js, timeline schemas, tick conversions, executor, undo/redo, render graph and artifact manifests.

Identify existing audio-track operations, effect operations, idempotency guarantees and recovery behavior.

Pin the DSP runtime, decoder, resampler and FFmpeg versions.

Create a baseline regression report before modifying shared code.

Acceptance: No project-schema or operation behavior changes; baseline tests pass; every required integration point is documented.

A1

DSP

Beat Understander MVP

Gate 1

Implement ingest, deterministic decoding, STFT, spectral flux, onset detection, tempo hypotheses and beat-grid output.

Implement confidence and uncertainty handling.

Add versioned schemas, immutable sidecars and content-addressed caching.

Acceptance: Synthetic BPM fixtures within ±0.5 BPM where the signal makes that accuracy measurable; clean transient fixtures within the defined timing tolerance; stable repeated results; zero fabricated beats on silence.

A2

Musical structure

Musical event and section intelligence

Gate 2

Add downbeat and bar-phase hypotheses.

Add local tempo tracking, band-energy curves, transient classes and section boundaries.

Implement confidence thresholds and explicit unknown states.

Acceptance: Correct meter or downbeat decisions on labeled fixtures; bounded section-boundary errors; reliable half-time/double-time ambiguity reporting; no forced classifications when evidence is insufficient.

A3

Editorial policy

Beat Actor in dry-run mode

Gate 3

Implement cue graphs, pacing profiles, candidate scoring, collision resolution and operation compilation.

Add plan inspection and deterministic rejection diagnostics.

Use the existing timeline snapshot as read-only context.

Acceptance: Identical inputs and policies yield identical plans; no executor calls in dry-run mode; every accepted cue satisfies its constraints; unsupported operations fail closed.

A4

Synthesis

SFX Engine MVP

Gate 4

Implement seeded synthesis primitives, envelopes, risers, whooshes, impacts and clicks.

Add asset cataloging, rights metadata, layer graphs and cue manifests.

Implement deterministic sample-accurate placement and basic stereo panning.

Acceptance: Reproducible output for the same supported environment; no unexpected clipping or discontinuities; exact declared sample duration; verified asset provenance.

A5

Integration

Timeline execution and audio mixing

Gate 5

Connect validated Beat Actor plans to the existing operation executor.

Add music ducking, audio mixing, loudness measurement and final artifact verification.

Test rollback, recovery, duplicate prevention and render reuse.

Acceptance: No unauthorized timeline mutations; no duplicate edits on retry; audio-video synchronization within the specified limits; existing live-pilot regressions pass.

A6

Certification

End-to-end benchmark and controlled release

Gate 6

Run the full benchmark corpus and adversarial matrix.

Compare baseline renders and audio metrics.

Record algorithm versions, policy versions, hashes, diagnostics and known limitations.

Promote the new subsystem only after all blocking gates pass.

Acceptance: Reproducible analysis and edit plans, validated audio quality, complete manifests, no regressions in the existing executor or recovery pipeline.

7. Golden test fixtures and adversarial matrix

Build a small, labeled corpus first. Large real-world music datasets are useful later, but they are poor substitutes for controlled fixtures when diagnosing algorithm errors.

Fixture

	

Construction

	

Required verification




beat-060

	

Metronome at 60 BPM

	

Tempo and beat-grid timing




beat-128

	

Clean 128 BPM percussion

	

Tempo, phase and subdivisions




half-double-ambiguity

	

Rhythm compatible with half/double tempo

	

Competing hypotheses retained




tempo-change

	

Piecewise tempo ramp or step change

	

Local tempo tracking




silent-input

	

Digital silence

	

No fabricated events




isolated-transients

	

Clicks/impulses at known sample positions

	

Onset precision and duplicate suppression




low-frequency-pulses

	

Known bass pulses with high-frequency hats

	

Band separation and onset behavior




drop-build-breakdown

	

Programmatically generated energy and density changes

	

Section boundaries and confidence




stereo-phase-challenge

	

Out-of-phase and channel-asymmetric content

	

Safe downmix and stereo preservation




irregular-music

	

Syncopated, swung or irregular rhythm

	

Honest uncertainty; no forced grid




sfx-envelope-suite

	

Every generator with fixed seed and parameters

	

Duration, envelope, reproducibility, peak limits




dialogue-ducking-suite

	

Speech bursts over constant-level music

	

Gain-reduction timing and release




operation-conflict

	

Overlapping cuts, locked track and invalid source range

	

Deterministic rejection or legal resolution




crash-recovery-audio

	

Termination during synthesis/mix/render

	

Safe resume and no partial-artifact reuse

Additional non-regression checks

Existing TL-01 operations retain their established behavior and timebase.

Existing project files load without migration.

Sidecar artifacts never become implicit authoritative timeline state.

Re-running an operation batch cannot duplicate an already committed edit.

Analysis cache keys change when any output-affecting configuration changes.

Same-input render comparisons use exact hashes when bit-identical output is guaranteed, otherwise explicitly defined numerical/audio tolerances.

Audio QA includes integrated loudness, true peak, clipping, channel imbalance, silence/dropout detection and duration.

Video QA includes blank frames, frame boundaries, expected duration and audio-video sync.

Failure at any stage leaves a recoverable state and preserves previously verified artifacts.

All generated assets carry source hashes and provenance.

8. Engineering directives for Antigravity

Use the following as the initial implementation instruction. It intentionally limits the first task to repository inspection and architecture validation rather than allowing an agent to start changing several subsystems at once.

Writing
EME Audio & Rhythmic Intelligence — Phase A0 Implementation Directive
Role

Act as the senior implementation engineer for EME's Audio & Rhythmic Intelligence expansion.

Scope

Audit and design the new Beat Understander, Beat Actor, and SFX Engine without disrupting the separate PF-01–PF-05 workstream or changing existing timeline/project contracts.

Required actions

Inspect the current repository before writing code. Verify src/engine/operations.js, timeline schemas, canonical tick conversions, executor transaction behavior, undo/redo, audio operations, renderer integration, artifact manifests, and crash-recovery behavior.

Identify which required capabilities already exist. Do not duplicate them or invent operation names, schema fields, file paths, or API signatures.

Propose the smallest compatible module boundaries and versioned sidecar contracts for:

eme-beat-analysis.v1

eme-beat-actor-plan.v1

eme-sfx-cue.v1

Audio render manifests and QA results

Specify the deterministic DSP runtime, decoding/resampling policy, STFT configuration, onset detection, multi-hypothesis tempo estimation, beat-grid generation, confidence calibration, caching, and timebase conversions.

Specify the Beat Actor's dry-run planning pipeline, pacing constraints, collision resolution, operation compilation and idempotency behavior.

Specify the SFX asset catalog, licensing/provenance requirements, seeded procedural synthesis, layer compositing, loudness/true-peak QA, dialogue ducking and headless render graph.

Create a dependency graph, phase plan, acceptance gates, golden fixtures, and a list of decisions that require explicit approval.

Run the existing test suite and relevant typecheck/build checks before proposing changes. Record actual commands and results; never claim a test passed unless it was run.

Hard constraints

Preserve the existing TL-01 canonical timebase and transaction/executor path.

Do not modify the existing project schema or core contracts without demonstrating that a sidecar solution is insufficient and obtaining approval.

Do not directly mutate timeline state from the Beat Actor.

Do not add AI/LLM inference to the numerical DSP critical path.

Do not silently guess tempo, meter, downbeats, source offsets, or unsupported operation semantics.

Do not bypass locking, idempotency, undo/redo, crash recovery, or artifact verification.

Do not expand manual timeline UI work.

Do not implement A1–A6 during this audit.

Deliverable

Produce docs/audio-rhythmic-subsystem-architecture.md containing verified repository facts, proposed contracts, module boundaries, operation compatibility findings, risks, test baselines, phase gates and the exact first implementation task.

Use required GSD actions to achieve the goals and wherever needed.

Completion criteria

Phase A0 is complete only when the report distinguishes verified facts from proposals, existing tests are recorded, all shared-contract risks are identified, and the next implementation task is small enough to execute and certify independently.

9. Final architecture decisions

These are the decisions I recommend locking before implementation:

Beat Understander: deterministic signal processing first; confidence-aware, multi-hypothesis analysis; immutable, versioned artifacts.

Beat Actor: dry-run cue graph first; explicit editorial policies; compilation through existing EME operations only.

SFX Engine: seeded procedural synthesis plus a licensed, indexed asset catalog; declarative layer graphs; measurable loudness and synchronization QA.

Integration: sidecar-first, no project-schema migration by default, and no bypass of the existing executor or recovery mechanisms.

Rollout: audit → analysis → editorial planning → synthesis → execution/mixing → certification.

The highest-risk area is not generating a convincing whoosh or detecting a beat. It is preserving timing correctness and transactional safety when probabilistic musical interpretation becomes deterministic timeline mutation. That boundary should be the first thing you test and the last thing you relax.