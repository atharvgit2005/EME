/**
 * HyperFrames Composition Compiler
 *
 * Compiles a canonical EME project into a self-contained HyperFrames HTML/CSS/GSAP composition.
 * Fully supports text typography, local fonts, layered video elements, audio tracks, and effects.
 */

const fs = require('fs');
const path = require('path');
const { MediaTime, TICKS_PER_SECOND } = require('../../engine/time.js');
const { HyperFramesCapabilities } = require('./capabilities.js');

class HyperFramesCompiler {
  /**
   * Compile canonical project JSON into a HyperFrames project directory.
   */
  static compile(project, outputDir) {
    // 1. Verify backend capabilities
    const cap = HyperFramesCapabilities.validate(project);
    if (!cap.supported) {
      const err = new Error(`Cannot compile project due to unsupported renderer capabilities:\n${cap.errors.join('; ')}`);
      err.errors = cap.errors;
      throw err;
    }

    const outDirResolved = path.resolve(outputDir);
    fs.mkdirSync(outDirResolved, { recursive: true });

    const canvas = project.canvas || { width: 1080, height: 1920 };
    const fps = project.timebase && project.timebase.fps ? project.timebase.fps : { numerator: 60, denominator: 1 };
    const durationSeconds = project.timebase ? MediaTime.ticksToSeconds(project.timebase.durationTicks) : 3.0;

    // Build Asset Map & Copy Assets to compilation dir
    const fontFaces = [];
    const fontMap = new Map();
    const assetPathMap = new Map();

    if (Array.isArray(project.assets)) {
      for (const asset of project.assets) {
        const assetSrcAbs = path.resolve(asset.src);
        const assetFilename = path.basename(assetSrcAbs);
        const targetDest = path.join(outDirResolved, assetFilename);

        if (fs.existsSync(assetSrcAbs)) {
          // If not already copied, copy or symlink
          if (!fs.existsSync(targetDest)) {
            try {
              fs.copyFileSync(assetSrcAbs, targetDest);
            } catch (e) {
              // fallback to copy
            }
          }
          assetPathMap.set(asset.id, `./${assetFilename}`);
        } else {
          // Relative fallback
          assetPathMap.set(asset.id, asset.src);
        }

        if (asset.type === 'font') {
          const familyName = (asset.metadata && asset.metadata.fontFamily) || asset.id;
          fontMap.set(asset.id, familyName);
          fontFaces.push(`
            @font-face {
              font-family: '${familyName}';
              src: url('./${assetFilename}');
              font-weight: normal;
              font-style: normal;
            }
          `);
        }
      }
    }

    // Map tracks for z-index
    const trackMap = new Map();
    (project.tracks || []).forEach(t => trackMap.set(t.id, t));

    // Sort clips by track zIndex
    const visualClips = (project.clips || [])
      .filter(c => c.type !== 'audio')
      .sort((a, b) => {
        const zA = (trackMap.get(a.trackId) || {}).zIndex || 0;
        const zB = (trackMap.get(b.trackId) || {}).zIndex || 0;
        return zA - zB;
      });

    const audioClips = (project.clips || []).filter(c => c.type === 'audio');

    // Generate HTML elements for visual clips
    const clipElementsHtml = [];
    for (const clip of visualClips) {
      const startSec = MediaTime.ticksToSeconds(clip.startTick);
      const durSec = MediaTime.ticksToSeconds(clip.durationTicks);
      const track = trackMap.get(clip.trackId) || { zIndex: 0 };

      let innerContent = '';
      const styleRules = [
        'position: absolute',
        'top: 0',
        'left: 0',
        `width: ${canvas.width}px`,
        `height: ${canvas.height}px`,
        'box-sizing: border-box',
        `z-index: ${track.zIndex}`
      ];

      // Filters & Blend modes
      const filters = [];
      if (Array.isArray(clip.effects)) {
        for (const eff of clip.effects) {
          if (eff.type === 'blendMode' && eff.parameters && eff.parameters.mode) {
            styleRules.push(`mix-blend-mode: ${eff.parameters.mode}`);
          }
          if (eff.type === 'invert') {
            filters.push('invert(1)');
          }
          if (eff.type === 'contrast') {
            filters.push(`contrast(${eff.parameters.factor ?? 1})`);
          }
          if (eff.type === 'brightness') {
            filters.push(`brightness(${eff.parameters.factor ?? 1})`);
          }
          if (eff.type === 'blur') {
            filters.push(`blur(${eff.parameters.radius || 0}px)`);
          }
        }
      }
      if (filters.length > 0) {
        styleRules.push(`filter: ${filters.join(' ')}`);
      }

      // Initial transform
      const t = clip.transform || {};
      const x = t.x || 0;
      const y = t.y || 0;
      const scaleX = t.scaleX !== undefined ? t.scaleX : 1.0;
      const scaleY = t.scaleY !== undefined ? t.scaleY : 1.0;
      const rotation = t.rotation || 0;
      const opacity = t.opacity !== undefined ? t.opacity : 1.0;

      styleRules.push(`transform: translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY}) rotate(${rotation}deg)`);
      styleRules.push(`opacity: ${opacity}`);

      if (clip.type === 'text') {
        const typo = clip.typography || {};
        const fontFam = typo.fontAssetId ? (fontMap.get(typo.fontAssetId) || typo.fontAssetId) : 'sans-serif';
        const fontSize = typo.fontSize || 64;
        const color = typo.color || '#ffffff';
        const textAlign = typo.textAlign || 'center';
        const letterSpacing = typo.letterSpacing || 0;

        styleRules.push(`font-family: '${fontFam}', sans-serif`);
        styleRules.push(`font-size: ${fontSize}px`);
        styleRules.push(`color: ${color}`);
        styleRules.push(`text-align: ${textAlign}`);
        styleRules.push(`letter-spacing: ${letterSpacing}px`);
        styleRules.push(`display: flex`);
        styleRules.push(`align-items: center`);
        styleRules.push(`justify-content: ${textAlign === 'center' ? 'center' : (textAlign === 'right' ? 'flex-end' : 'flex-start')}`);

        innerContent = typo.text || '';
      } else if (clip.type === 'video' || clip.type === 'graphic') {
        const assetId = (clip.source && clip.source.assetId) || clip.assetId;
        const assetRel = assetPathMap.get(assetId) || '';
        if (assetRel) {
          innerContent = `<video src="${assetRel}" muted playsinline autoplay loop style="width:100%; height:100%; object-fit:cover;"></video>`;
        } else {
          styleRules.push(`background: #ffffff`);
        }
      }

      clipElementsHtml.push(`
        <div id="${clip.id}"
             class="clip"
             data-start="${startSec}"
             data-duration="${durSec}"
             data-track-index="${track.zIndex}"
             style="${styleRules.join('; ')};">
          ${innerContent}
        </div>
      `);
    }

    // Audio elements
    const audioElementsHtml = [];
    for (const aClip of audioClips) {
      const startSec = MediaTime.ticksToSeconds(aClip.startTick);
      const durSec = MediaTime.ticksToSeconds(aClip.durationTicks);
      const assetId = (aClip.source && aClip.source.assetId) || aClip.assetId;
      const assetRel = assetPathMap.get(assetId) || '';
      if (assetRel) {
        let automationAttr = '';
        if (aClip.audio && Array.isArray(aClip.audio.volumeEnvelope) && aClip.audio.volumeEnvelope.length > 0) {
          const lanePoints = aClip.audio.volumeEnvelope.map(kf => ({
            t: MediaTime.ticksToSeconds(kf.offsetTick),
            v: kf.volume !== undefined ? kf.volume : (kf.gain !== undefined ? kf.gain : 1)
          }));
          const autoObj = {
            version: 1,
            lanes: [{ target: 'volume', points: lanePoints }]
          };
          automationAttr = ` data-automation='${JSON.stringify(autoObj)}'`;
        }
        const volAttr = (aClip.audio && typeof aClip.audio.volume === 'number') ? ` data-volume="${aClip.audio.volume}" volume="${aClip.audio.volume}"` : '';
        audioElementsHtml.push(`
          <audio id="${aClip.id}" src="${assetRel}" data-start="${startSec}" data-duration="${durSec}"${volAttr}${automationAttr}></audio>
        `);
      }
    }

    // Compile GSAP timeline animations
    const gsapTweens = [];

    // Enforce clip timeline visibility boundaries (opacity 0 before start, 1 during duration, 0 after)
    for (const clip of visualClips) {
      const clipStartSec = MediaTime.ticksToSeconds(clip.startTick);
      const clipDurSec = MediaTime.ticksToSeconds(clip.durationTicks);
      const clipEndSec = clipStartSec + clipDurSec;

      // Ensure clip is hidden before startSec if startSec > 0
      if (clipStartSec > 0) {
        gsapTweens.push(`
          gsap.set("#${clip.id}", { autoAlpha: 0 });
          tl.set("#${clip.id}", { autoAlpha: 1 }, ${clipStartSec});
        `);
      }
      // Hide clip after duration
      gsapTweens.push(`
        tl.set("#${clip.id}", { autoAlpha: 0 }, ${clipEndSec});
      `);
    }

    // Render visual transitions (e.g. cross_dissolve) between clips
    for (const clip of visualClips) {
      for (const effect of clip.effects || []) {
        const tType = effect.parameters?.transitionType || (effect.type === 'transition' ? effect.parameters?.type : null);
        if (tType === 'cross_dissolve') {
          const durationTicks = effect.parameters?.durationTicks || 120000;
          const durSec = MediaTime.ticksToSeconds(durationTicks);
          const clipStartSec = MediaTime.ticksToSeconds(clip.startTick);
          const clipDurSec = MediaTime.ticksToSeconds(clip.durationTicks);
          const clipEndSec = clipStartSec + clipDurSec;
          const inClipId = effect.parameters?.targetClipId;
          const fadeStartSec = clipEndSec - durSec;

          // Outgoing clip cross-fades out
          gsapTweens.push(`
            tl.to("#${clip.id}", { opacity: 0, duration: ${durSec}, ease: "power1.inOut" }, ${fadeStartSec});
          `);

          // Incoming clip cross-fades in simultaneously, blending both clips over transition handle
          if (inClipId) {
            gsapTweens.push(`
              tl.fromTo("#${inClipId}", { opacity: 0 }, { opacity: 1, duration: ${durSec}, ease: "power1.inOut" }, ${fadeStartSec});
            `);
          }
        }
      }
    }

    if (Array.isArray(project.animations)) {
      for (const anim of project.animations) {
        const clip = (project.clips || []).find(c => c.id === anim.clipId);
        if (!clip) continue;

        const clipStartSec = MediaTime.ticksToSeconds(clip.startTick);

        // Sort keyframes by offsetTick
        const sortedKfs = [...anim.keyframes].sort((a, b) => a.offsetTick - b.offsetTick);
        for (let i = 0; i < sortedKfs.length - 1; i++) {
          const kfA = sortedKfs[i];
          const kfB = sortedKfs[i + 1];
          const segStartSec = clipStartSec + MediaTime.ticksToSeconds(kfA.offsetTick);
          const segDurSec = MediaTime.ticksToSeconds(kfB.offsetTick - kfA.offsetTick);

          const cssProp = this._mapPropertyToGsap(anim.property);
          const ease = this._mapEasing(kfB.easing || 'linear');

          gsapTweens.push(`
            tl.fromTo("#${clip.id}",
              { ${cssProp}: ${JSON.stringify(kfA.value)} },
              { ${cssProp}: ${JSON.stringify(kfB.value)}, duration: ${segDurSec}, ease: "${ease}" },
              ${segStartSec}
            );
          `);
        }
      }
    }

    // Full HTML Document
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${canvas.width}, height=${canvas.height}" />
    <title>${project.title || 'EME Composition'}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      ${fontFaces.join('\n')}

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      html, body {
        width: ${canvas.width}px;
        height: ${canvas.height}px;
        overflow: hidden;
        background: ${canvas.backgroundColor || '#0a0a0d'};
      }
      #main {
        position: relative;
        width: ${canvas.width}px;
        height: ${canvas.height}px;
        overflow: hidden;
      }
    </style>
  </head>
  <body>
    <div id="main"
         data-composition-id="main"
         data-width="${canvas.width}"
         data-height="${canvas.height}"
         data-start="0"
         data-duration="${durationSeconds}"
         data-fps="${fps.numerator / fps.denominator}">
      ${clipElementsHtml.join('\n')}
      ${audioElementsHtml.join('\n')}
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      var tl = gsap.timeline({ paused: true });

      // Clip timeline tweens
      ${gsapTweens.join('\n')}

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>`;

    const entryHtmlPath = path.join(outDirResolved, 'index.html');
    fs.writeFileSync(entryHtmlPath, html, 'utf8');

    return {
      outputDir: outDirResolved,
      entryHtmlPath,
      durationSeconds,
      fps: fps.numerator / fps.denominator,
      clipCount: visualClips.length + audioClips.length
    };
  }

  static _mapPropertyToGsap(prop) {
    if (prop === 'transform.opacity' || prop === 'opacity') return 'opacity';
    if (prop === 'transform.x' || prop === 'x') return 'x';
    if (prop === 'transform.y' || prop === 'y') return 'y';
    if (prop === 'transform.scaleX') return 'scaleX';
    if (prop === 'transform.scaleY') return 'scaleY';
    if (prop === 'transform.scale' || prop === 'scale') return 'scale';
    if (prop === 'transform.rotation' || prop === 'rotation') return 'rotation';
    return prop;
  }

  static _mapEasing(easing) {
    if (easing === 'easeIn') return 'power2.in';
    if (easing === 'easeOut') return 'power2.out';
    if (easing === 'easeInOut') return 'power2.inOut';
    if (easing === 'spring') return 'back.out(1.7)';
    return easing || 'none';
  }
}

module.exports = {
  HyperFramesCompiler
};
