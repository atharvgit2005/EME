/**
 * Editing Mechanics Engine (EME) - Phase 34.5 Audio Asset Catalog & Deterministic Selector
 *
 * Implements:
 * 1. Verified local asset inventory (BGM & SFX) with integrity checks (SHA-256, duration, format).
 * 2. Deterministic candidate ranking and selection based on declared creative intent.
 * 3. Structured reporting of constraints, missing assets, and explicit fallbacks without hallucination.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { TICKS_PER_SECOND } = require('../engine/time.js');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Verified local audio assets in repository
const VERIFIED_ASSETS = [
  // BGM Tracks
  {
    asset_id: 'bgm_snowfall',
    type: 'audio',
    sub_type: 'bgm',
    title: 'Snowfall (Lofi Ambient)',
    rel_path: 'assets/bgm/snowfall.mp3',
    format: 'mp3',
    sample_rate: 48000,
    channels: 2,
    duration_sec: 123.24,
    duration_ticks: Math.round(123.24 * TICKS_PER_SECOND),
    mood: 'ambient_calm',
    energy: 'low',
    tempo: 'slow',
    bpm: 75,
    licensing: {
      physical_verification: 'verified_local',
      rights_status: 'bundled_demo_use',
      attribution_required: true,
      attribution_text: 'Snowfall by Lofi Ambient Library',
      license_type: 'royalty_free_evaluation',
      provenance: 'bundled_project_assets',
      commercial_cleared: false
    }
  },
  {
    asset_id: 'bgm_creator_reel',
    type: 'audio',
    sub_type: 'bgm',
    title: 'Creator Reel Soundtrack 20s',
    rel_path: 'assets/creator_reel_soundtrack_20s.wav',
    format: 'wav',
    sample_rate: 48000,
    channels: 2,
    duration_sec: 20.0,
    duration_ticks: 20 * TICKS_PER_SECOND,
    mood: 'upbeat_energetic',
    energy: 'high',
    tempo: 'medium_fast',
    bpm: 120,
    licensing: {
      physical_verification: 'verified_local',
      rights_status: 'cleared_commercial',
      attribution_required: false,
      attribution_text: null,
      license_type: 'proprietary_in_house',
      provenance: 'in_house_mastered',
      commercial_cleared: true
    }
  },
  {
    asset_id: 'bgm_cinematic_ad',
    type: 'audio',
    sub_type: 'bgm',
    title: 'Cinematic Ad Soundtrack 20s',
    rel_path: 'assets/cinematic_ad_soundtrack_20s.wav',
    format: 'wav',
    sample_rate: 48000,
    channels: 2,
    duration_sec: 20.0,
    duration_ticks: 20 * TICKS_PER_SECOND,
    mood: 'cinematic_dramatic',
    energy: 'medium_high',
    tempo: 'medium',
    bpm: 100,
    licensing: {
      physical_verification: 'verified_local',
      rights_status: 'cleared_commercial',
      attribution_required: false,
      attribution_text: null,
      license_type: 'proprietary_in_house',
      provenance: 'in_house_mastered',
      commercial_cleared: true
    }
  },

  // SFX Cues
  {
    asset_id: 'sfx_bass_impact',
    type: 'audio',
    sub_type: 'sfx',
    title: 'Sub-Bass Pixel Explosion Impact',
    rel_path: 'assets/sfx/synergy/reel_01_bass_impact.wav',
    category: 'impact',
    role: 'transition_accent',
    format: 'wav',
    sample_rate: 192000,
    channels: 2,
    duration_sec: 1.4,
    duration_ticks: Math.round(1.4 * TICKS_PER_SECOND),
    licensing: {
      physical_verification: 'verified_local',
      rights_status: 'cleared_commercial',
      attribution_required: false,
      attribution_text: null,
      license_type: 'synergy_sound_kit_commercial',
      provenance: 'synergy_sound_kit',
      commercial_cleared: true
    }
  },
  {
    asset_id: 'sfx_apple_typing',
    type: 'audio',
    sub_type: 'sfx',
    title: 'Apple Phone Haptic Typing Sound',
    rel_path: 'assets/sfx/synergy/reel_02_apple_typing.wav',
    category: 'ui_haptic',
    role: 'text_reveal_accent',
    format: 'wav',
    sample_rate: 192000,
    channels: 2,
    duration_sec: 1.3,
    duration_ticks: Math.round(1.3 * TICKS_PER_SECOND),
    licensing: {
      physical_verification: 'verified_local',
      rights_status: 'cleared_commercial',
      attribution_required: false,
      attribution_text: null,
      license_type: 'synergy_sound_kit_commercial',
      provenance: 'synergy_sound_kit',
      commercial_cleared: true
    }
  },
  {
    asset_id: 'sfx_noise_glitch',
    type: 'audio',
    sub_type: 'sfx',
    title: 'Movie Noise RF Static Glitch',
    rel_path: 'assets/sfx/synergy/reel_03_noise_glitch.wav',
    category: 'glitch',
    role: 'visual_cut_accent',
    format: 'wav',
    sample_rate: 192000,
    channels: 2,
    duration_sec: 1.35,
    duration_ticks: Math.round(1.35 * TICKS_PER_SECOND),
    licensing: {
      physical_verification: 'verified_local',
      rights_status: 'cleared_commercial',
      attribution_required: false,
      attribution_text: null,
      license_type: 'synergy_sound_kit_commercial',
      provenance: 'synergy_sound_kit',
      commercial_cleared: true
    }
  }
];

class AudioCatalog {
  /**
   * Lists available assets optionally filtered by criteria.
   * @param {object} [filter={}]
   * @param {string} [baseDir=PROJECT_ROOT]
   * @returns {Array<object>}
   */
  static listAssets(filter = {}, baseDir = PROJECT_ROOT) {
    let list = this.listAvailableAssets(baseDir);
    if (filter.type) list = list.filter(a => a.type === filter.type);
    if (filter.sub_type) list = list.filter(a => a.sub_type === filter.sub_type);
    return list;
  }

  /**
   * Retrieves verified catalog items with physical file checks and SHA-256 caching.
   * @param {string} [baseDir=PROJECT_ROOT]
   * @returns {Array<object>}
   */
  static listAvailableAssets(baseDir = PROJECT_ROOT) {
    return VERIFIED_ASSETS.map(entry => this.verifyEntry(entry, baseDir));
  }

  static verifyEntry(entry, baseDir = PROJECT_ROOT) {
    const fullPath = path.resolve(baseDir, entry.rel_path);
    let sha256 = null, sizeBytes = null, error = null, measured = null;
    try {
      const bytes = fs.readFileSync(fullPath);
      sha256 = crypto.createHash('sha256').update(bytes).digest('hex'); sizeBytes = bytes.length;
      const probe = spawnSync(require('../engine/environment.js').EnvironmentResolver.resolveFfprobe() || 'ffprobe', ['-v','error','-show_streams','-show_format','-of','json',fullPath], {encoding:'utf8',timeout:30000});
      if (probe.status !== 0 || probe.error) throw new Error('Media probe failed');
      const meta = JSON.parse(probe.stdout), audio = meta.streams?.find(s=>s.codec_type==='audio');
      if (!audio || !Number.isFinite(Number(meta.format?.duration)) || Number(meta.format.duration)<=0) throw new Error('Audio metadata unavailable');
      measured = {sample_rate:Number(audio.sample_rate),channels:audio.channels,duration_sec:Number(meta.format.duration),duration_ticks:require('../engine/time.js').MediaTime.secondsToTicks(Number(meta.format.duration))};
    } catch (e) { error = e.code || e.message; }
    return {...entry,...(measured || {}), declared_metadata:{sample_rate:entry.sample_rate,channels:entry.channels,duration_sec:entry.duration_sec},
      licensing:{...entry.licensing,evidence_status:'declaration_only'},full_path:fullPath,available:!error,
      sha256,size_bytes:sizeBytes,physical_verification:error?'UNAVAILABLE':'VERIFIED_BYTES_AND_METADATA',verification_error:error};
  }

  static toProjectAsset(entry) {
    if (!entry.available || !entry.sha256 || !entry.full_path) throw new Error('ERR_AUDIO_ASSET_UNAVAILABLE');
    return {id:entry.asset_id,type:'audio',src:entry.full_path,sha256:entry.sha256,
      metadata:{durationSec:entry.duration_sec,sampleRate:entry.sample_rate,channels:entry.channels,licensing:entry.licensing}};
  }

  /**
   * Finds an asset by ID and ensures physical availability.
   * @param {string} assetId
   * @param {string} [baseDir=PROJECT_ROOT]
   * @returns {object}
   */
  static getAsset(assetId, baseDir = PROJECT_ROOT) {
    const entry = VERIFIED_ASSETS.find(a => a.asset_id === assetId);
    const found = entry && this.verifyEntry(entry, baseDir);
    if (!found) {
      throw new Error(`ERR_AUDIO_ASSET_NOT_FOUND: Audio asset "${assetId}" is not registered in catalog`);
    }
    if (!found.available) {
      throw new Error(`ERR_AUDIO_ASSET_UNAVAILABLE: Audio asset "${assetId}" file missing at: ${found.full_path}`);
    }
    return found;
  }
}

class AudioSelector {
  /**
   * Deterministically selects the best background music track matching creative intent.
   *
   * Scoring weights:
   * - Mood match: 40 points
   * - Energy match: 30 points
   * - Tempo match: 20 points
   * - Duration adequacy: 10 points
   * - Tie-breaking: Lexicographical order of asset_id
   *
   * @param {object} params
   * @param {string} [params.mood] e.g. 'upbeat_energetic', 'ambient_calm', 'cinematic_dramatic'
   * @param {string} [params.energy] e.g. 'high', 'medium', 'low'
   * @param {string} [params.tempo] e.g. 'fast', 'medium', 'slow'
   * @param {number} [params.minDurationSec=0]
   * @param {string} [params.fallbackAssetId='bgm_snowfall']
   * @param {string} [params.baseDir=PROJECT_ROOT]
   * @returns {{ selectedAsset: object, score: number, scores: Array<object>, warning?: string }}
   */
  static selectMusic({
    mood = null,
    energy = null,
    tempo = null,
    minDurationSec = 0,
    fallbackAssetId = 'bgm_snowfall',
    baseDir = PROJECT_ROOT
  } = {}) {
    const bgmCandidates = AudioCatalog.listAvailableAssets(baseDir).filter(
      a => a.sub_type === 'bgm' && a.available
    );

    if (bgmCandidates.length === 0) {
      throw new Error('ERR_NO_AVAILABLE_MUSIC_ASSETS: No background music tracks available in catalog');
    }

    const scored = bgmCandidates.map(candidate => {
      let score = 0;
      const matchReasons = [];

      // 1. Mood match (40 pts)
      if (mood && candidate.mood) {
        if (candidate.mood.toLowerCase() === mood.toLowerCase()) {
          score += 40;
          matchReasons.push('exact_mood');
        } else if (candidate.mood.includes(mood) || mood.includes(candidate.mood)) {
          score += 20;
          matchReasons.push('partial_mood');
        }
      }

      // 2. Energy match (30 pts)
      if (energy && candidate.energy) {
        if (candidate.energy.toLowerCase() === energy.toLowerCase()) {
          score += 30;
          matchReasons.push('exact_energy');
        }
      }

      // 3. Tempo match (20 pts)
      if (tempo && candidate.tempo) {
        if (candidate.tempo.toLowerCase() === tempo.toLowerCase()) {
          score += 20;
          matchReasons.push('exact_tempo');
        }
      }

      // 4. Duration adequacy (10 pts)
      if (minDurationSec > 0) {
        if (candidate.duration_sec >= minDurationSec) {
          score += 10;
          matchReasons.push('duration_sufficient');
        }
      } else {
        score += 10;
      }

      return {
        candidate,
        score,
        matchReasons
      };
    });

    // Deterministic sort: descending by score, then alphabetical by asset_id
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.candidate.asset_id.localeCompare(b.candidate.asset_id);
    });

    const top = scored[0];
    let warning = null;

    if (top.score < 20) {
      warning = `WARN_LOW_CONFIDENCE_SELECTION: No strong match for criteria (mood: "${mood}", energy: "${energy}"). Selected "${top.candidate.asset_id}" as deterministic best fit.`;
    }

    return {
      selectedAsset: top.candidate,
      score: top.score,
      matchReasons: top.matchReasons,
      scores: scored.map(s => ({ asset_id: s.candidate.asset_id, score: s.score, reasons: s.matchReasons })),
      warning
    };
  }

  /**
   * Selects sound effect cue matching editorial role or category.
   * @param {object} params
   * @param {string} [params.category] 'impact', 'ui_haptic', 'glitch'
   * @param {string} [params.role] 'transition_accent', 'text_reveal_accent', 'visual_cut_accent'
   * @param {string} [params.baseDir=PROJECT_ROOT]
   * @returns {object}
   */
  static selectSfx({ category = null, role = null, baseDir = PROJECT_ROOT } = {}) {
    const sfxCandidates = AudioCatalog.listAvailableAssets(baseDir).filter(
      a => a.sub_type === 'sfx' && a.available
    );

    let match = null;
    if (role) {
      match = sfxCandidates.find(a => a.role === role);
    }
    if (!match && category) {
      match = sfxCandidates.find(a => a.category === category);
    }
    if (!match && sfxCandidates.length > 0) {
      match = sfxCandidates[0]; // deterministic fallback
    }

    if (!match) {
      throw new Error(`ERR_NO_MATCHING_SFX: No SFX found matching role "${role}" or category "${category}"`);
    }

    return match;
  }
}

module.exports = {
  AudioCatalog,
  AudioSelector,
  VERIFIED_ASSETS
};
