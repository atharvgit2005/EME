/**
 * HyperFrames Renderer Capability Descriptor & Validator
 */

const SUPPORTED_CAPABILITIES = {
  formats: ['mp4', 'webm'],
  mediaTypes: ['text', 'graphic', 'video', 'audio'],
  blendModes: ['difference', 'multiply', 'screen', 'overlay', 'normal'],
  filters: ['invert', 'contrast', 'brightness', 'blur'],
  properties: [
    'transform.x',
    'transform.y',
    'transform.scale',
    'transform.scaleX',
    'transform.scaleY',
    'transform.opacity',
    'transform.rotation',
    'opacity',
    'scale',
    'x',
    'y'
  ],
  easings: ['linear', 'power2.out', 'power3.out', 'easeIn', 'easeOut', 'easeInOut', 'spring']
};

class HyperFramesCapabilities {
  static getSupported() {
    return SUPPORTED_CAPABILITIES;
  }

  /**
   * Validate that all project features are executable by the HyperFrames adapter.
   */
  static validate(project) {
    const errors = [];

    if (!project || !Array.isArray(project.clips)) {
      return { supported: false, errors: ['Valid canonical clips required'] };
    }

    for (const clip of project.clips) {
      if (!SUPPORTED_CAPABILITIES.mediaTypes.includes(clip.type)) {
        errors.push(`Unsupported clip type: "${clip.type}" in clip "${clip.id}"`);
      }

      if (clip.properties?.curved_typography || clip.properties?.optical_distortion || clip.properties?.reframing || clip.properties?.face_safe || clip.properties?.render_font) errors.push(`Unsupported native-only canonical payload in ${clip.id}`);
      if (Array.isArray(clip.effects)) {
        for (const effect of clip.effects) {
          if (!['blendMode', ...SUPPORTED_CAPABILITIES.filters].includes(effect.type)) errors.push(`Unsupported effect ${effect.type} in ${clip.id}`);
          if (effect.type === 'blendMode') {
            const mode = effect.parameters && effect.parameters.mode;
            if (mode && !SUPPORTED_CAPABILITIES.blendModes.includes(mode)) {
              errors.push(`Unsupported blendMode "${mode}" in clip "${clip.id}"`);
            }
          }
        }
      }
    }

    if (Array.isArray(project.animations)) {
      for (const anim of project.animations) {
        if (!SUPPORTED_CAPABILITIES.properties.includes(anim.property)) {
          errors.push(`Unsupported animated property "${anim.property}" in clip "${anim.clipId}"`);
        }
        if (Array.isArray(anim.keyframes)) {
          for (const kf of anim.keyframes) {
            if (kf.easing && !SUPPORTED_CAPABILITIES.easings.includes(kf.easing)) {
              errors.push(`Unsupported easing curve "${kf.easing}" in clip "${anim.clipId}"`);
            }
          }
        }
      }
    }

    return {
      supported: errors.length === 0,
      errors
    };
  }
}

module.exports = {
  HyperFramesCapabilities,
  SUPPORTED_CAPABILITIES
};
