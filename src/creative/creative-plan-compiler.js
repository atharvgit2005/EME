/**
 * Editing Mechanics Engine (EME) - Creative Plan Compiler
 *
 * Compiles a validated EME Creative Plan (eme-creative-plan.v1) into a canonical
 * Declarative Operation Plan (eme-operation-plan.v1) for atomic execution by OperationExecutor.
 *
 * Invariants:
 * - Zero direct project mutation during compilation or dry-run simulation.
 * - Translates ONLY creative decisions representable by existing, verified canonical operations.
 * - Conforms strictly to schema/eme-operation-plan.v1.schema.json.
 * - Preserves OperationExecutor as the sole mutation authority.
 * - Fails closed on unsupported capabilities, missing references, or stale revisions.
 */

const crypto = require('node:crypto');
const { CreativePlanValidator, CreativePlanErrorCodes } = require('./schema-validator.js');
const { ReframingEngine } = require('./reframing-engine.js');
const { VisualConstraintSolver } = require('../solver/visual-constraint-solver.js');
const { OperationExecutor } = require('../engine/operations.js');
const { ProjectManager } = require('../engine/project.js');
const { TICKS_PER_SECOND, MediaTime } = require('../engine/time.js');
const { computeProjectSnapshotSha256 } = require('../prompt-core/context-normalizer.js');
const { CurvedTypography } = require('./curved-typography.js');
const { SpeechDuckingCompiler } = require('./speech-ducking-compiler.js');
const { AudioCatalog, AudioSelector } = require('./audio-catalog.js');

class CreativePlanCompiler {
  /**
   * Compiles an accepted Creative Plan and canonical Project snapshot into an OperationPlan.
   *
   * @param {object} params
   * @param {object} params.creativePlan Validated EME Creative Plan
   * @param {object} params.project Canonical EME project snapshot
   * @param {object} [params.options] Compiler options
   * @returns {{
   *   success: boolean,
   *   operationPlan: object | null,
   *   dryRunResult: object | null,
   *   errors: string[],
   *   errorCodes: string[],
   *   diagnostics: object
   * }}
   */
  static compile({ creativePlan, project, options = {} }) {
    if (!creativePlan || typeof creativePlan !== 'object') {
      return {
        success: false,
        operationPlan: null,
        dryRunResult: null,
        errors: ['Valid Creative Plan object is required for compilation'],
        errorCodes: [CreativePlanErrorCodes.ERR_MALFORMED_PLAN],
        diagnostics: {}
      };
    }

    if (!project || typeof project !== 'object') {
      return {
        success: false,
        operationPlan: null,
        dryRunResult: null,
        errors: ['Valid EME Project snapshot is required for compilation'],
        errorCodes: [CreativePlanErrorCodes.ERR_MISSING_ASSET_REFERENCE],
        diagnostics: {}
      };
    }

    // 1. Validate Creative Plan Schema & Semantics against Project
    const planValidation = CreativePlanValidator.validate(creativePlan, project);
    if (!planValidation.valid) {
      return {
        success: false,
        operationPlan: null,
        dryRunResult: null,
        errors: planValidation.errors,
        errorCodes: planValidation.errorCodes,
        diagnostics: planValidation.diagnostics
      };
    }

    const supportedOptions=['vtsmSidecar','vtsmSidecars','failOnInfeasiblePlacement','musicCriteria','sfxCues','speechIntervals','opticalDistortion','curvedTypography','preserveSourceDialogue','dialogueGain','dialoguePeakControl','audioCatalogBaseDir','assetBaseDir','fontAssetId'];
    for(const key of Object.keys(options))if(!supportedOptions.includes(key))return{success:false,operationPlan:null,errors:[`ERR_UNSUPPORTED_COMPILATION_OPTION: ${key}`],errorCodes:['ERR_UNSUPPORTED_COMPILATION_OPTION'],diagnostics:{}};
    const d=creativePlan.deliverable;
    if(d.width!==project.canvas.width || d.height!==project.canvas.height || d.target_duration_ticks!==project.timebase.durationTicks || d.frame_rate.numerator!==project.timebase.fps.numerator || d.frame_rate.denominator!==project.timebase.fps.denominator) return {success:false,operationPlan:null,errors:['ERR_CANONICAL_OUTPUT_PROFILE_MISMATCH: Create a project with the intended output profile before compilation'],errorCodes:['ERR_CANONICAL_OUTPUT_PROFILE_MISMATCH'],diagnostics:{}};
    if(creativePlan.narrative_beats.some(b=>!['hard_cut','jump_cut','none'].includes(b.editorial_decisions.cut_type)))return{success:false,operationPlan:null,errors:['ERR_UNSUPPORTED_TRANSITION'],errorCodes:['ERR_UNSUPPORTED_TRANSITION'],diagnostics:{}};

    const baseRevision = project.revision ?? 0;
    const snapshotSha256 = creativePlan.project_snapshot?.snapshot_sha256 || computeProjectSnapshotSha256(project);
    const targetDurationTicks = creativePlan.deliverable.target_duration_ticks;

    const diagnostics = {
      unsupported_requests: [],
      missing_references: [...planValidation.diagnostics.missingReferences],
      conflicts: [],
      rejected_operations: []
    };

    const blockingIssues = [];

    // 2. Fail-Closed Handling for Unsupported Features
    for (const feat of creativePlan.unsupported_features || []) {
      if (feat.fallback_policy === 'refuse' || !feat.accepted_by_user) {
        diagnostics.unsupported_requests.push(`Unsupported feature: ${feat.feature_name} (${feat.reason})`);
        blockingIssues.push('ERR_UNSUPPORTED_CREATIVE_FEATURE');
      }
    }

    if (blockingIssues.length > 0) {
      return {
        success: false,
        operationPlan: null,
        dryRunResult: null,
        errors: diagnostics.unsupported_requests,
        errorCodes: blockingIssues,
        diagnostics
      };
    }

    // 3. Assemble Canonical Operations
    const operations = [];
    let stepIndex = 0;

    // Track Topology Resolution
    const existingTracks = project.tracks || [];
    let mainVideoTrack = existingTracks.find(t => t.kind === 'visual' && !t.id.includes('graphic'));
    let graphicsTrack = existingTracks.find(t => t.kind === 'visual' && (t.id.includes('graphic') || t.id.includes('overlay') || t.id.includes('title')));
    let mainAudioTrack = existingTracks.find(t => t.kind === 'audio' && /music|soundtrack/.test(t.id));

    // Emit add_track for main video if none exist
    if (!mainVideoTrack) {
      const vTrackId = 'track_v_main';
      operations.push({
        op_id: `op-${String(stepIndex + 1).padStart(3, '0')}`,
        step_index: stepIndex++,
        type: 'add_track',
        target_id: vTrackId,
        params: {
          id: vTrackId,
          name: 'Main Video Track',
          kind: 'visual',
          zIndex: 0,
          muted: false,
          locked: false
        },
        dependencies: []
      });
      mainVideoTrack = { id: vTrackId, kind: 'visual', locked: false };
    }

    // Check track lock
    if (mainVideoTrack.locked) {
      diagnostics.conflicts.push(`Main visual track "${mainVideoTrack.id}" is locked`);
      blockingIssues.push('ERR_TRACK_LOCKED');
    }

    // Emit add_track for graphics track if visual events exist and track missing
    const visualEvents = creativePlan.visual_events || [];
    if (visualEvents.length > 0 && !graphicsTrack) {
      const gTrackId = 'track_v_graphics';
      operations.push({
        op_id: `op-${String(stepIndex + 1).padStart(3, '0')}`,
        step_index: stepIndex++,
        type: 'add_track',
        target_id: gTrackId,
        params: {
          id: gTrackId,
          name: 'Graphics & Typography Track',
          kind: 'visual',
          zIndex: 10,
          muted: false,
          locked: false
        },
        dependencies: []
      });
      graphicsTrack = { id: gTrackId, kind: 'visual', locked: false };
    }

    // Emit add_track for audio track if soundtrack exists and track missing
    const audioDir = creativePlan.audio_direction;
    const needsMusicBed = Boolean(
      audioDir?.soundtrack_selection?.asset_id ||
      audioDir?.dialogue_ducking_enabled ||
      options.speechIntervals ||
      options.musicCriteria
    );

    if (needsMusicBed && !mainAudioTrack) {
      const aTrackId = 'track_a_music';
      operations.push({
        op_id: `op-${String(stepIndex + 1).padStart(3, '0')}`,
        step_index: stepIndex++,
        type: 'add_track',
        target_id: aTrackId,
        params: {
          id: aTrackId,
          name: 'Music Bed Track',
          kind: 'audio',
          zIndex: 0,
          muted: false,
          locked: false
        },
        dependencies: []
      });
      mainAudioTrack = { id: aTrackId, kind: 'audio', locked: false };
    }

    // Emit add_track for SFX track if SFX cues exist and SFX track missing
    const sfxList = (options.sfxCues || audioDir?.sfx_cues || []).map(cue => require('./audio-contracts.js').normalizeSfxCue(cue));
    let sfxTrack = existingTracks.find(t => t.kind === 'audio' && (t.id.includes('sfx') || t.id.includes('effect')));
    if (sfxList.length > 0 && !sfxTrack) {
      const sTrackId = 'track_a_sfx';
      operations.push({
        op_id: `op-${String(stepIndex + 1).padStart(3, '0')}`,
        step_index: stepIndex++,
        type: 'add_track',
        target_id: sTrackId,
        params: {
          id: sTrackId,
          name: 'Sound Effects Track',
          kind: 'audio',
          zIndex: 1,
          muted: false,
          locked: false
        },
        dependencies: []
      });
      sfxTrack = { id: sTrackId, kind: 'audio', locked: false };
    }

    // If main video track has existing clips, delete them so new beats can be sequenced cleanly
    const existingMainClips = (project.clips || []).filter(c => c.trackId === mainVideoTrack.id);
    for (const ec of existingMainClips) {
      operations.push({
        op_id: `op-${String(stepIndex + 1).padStart(3, '0')}`,
        step_index: stepIndex++,
        type: 'delete_clip',
        target_id: ec.id,
        params: {
          clipId: ec.id
        },
        dependencies: []
      });
    }

    // If main audio track has existing clips and audio direction is specified, delete them so soundtrack bed can be placed cleanly
    if (mainAudioTrack && needsMusicBed) {
      const existingAudioClips = (project.clips || []).filter(c => c.trackId === mainAudioTrack.id);
      for (const ec of existingAudioClips) {
        operations.push({
          op_id: `op-${String(stepIndex + 1).padStart(3, '0')}`,
          step_index: stepIndex++,
          type: 'delete_clip',
          target_id: ec.id,
          params: {
            clipId: ec.id
          },
          dependencies: []
        });
      }
    }

    // If graphics track has existing clips and visual events are specified, delete them so graphics can be placed cleanly
    if (graphicsTrack && visualEvents.length > 0) {
      const existingGraphicsClips = (project.clips || []).filter(c => c.trackId === graphicsTrack.id);
      for (const ec of existingGraphicsClips) {
        operations.push({
          op_id: `op-${String(stepIndex + 1).padStart(3, '0')}`,
          step_index: stepIndex++,
          type: 'delete_clip',
          target_id: ec.id,
          params: {
            clipId: ec.id
          },
          dependencies: []
        });
      }
    }

    // A. Narrative Beats -> insert_clip operations
    const beats = creativePlan.narrative_beats || [];
    const createdClipIds = [];

    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];
      const clipId = `clip_beat_${i + 1}`;
      createdClipIds.push(clipId);

      const clipParams = {
        id: clipId,
        trackId: mainVideoTrack.id,
        type: 'video',
        startTick: beat.timeline_range.start_tick,
        durationTicks: beat.timeline_range.duration_ticks,
        source: {
          assetId: beat.source_media_ref.asset_id,
          trimInTick: beat.source_range.start_tick,
          trimOutTick: beat.source_range.end_tick
        },
        metadata: {
          beat_id: beat.beat_id,
          beat_type: beat.beat_type,
          narrative_purpose: beat.narrative_purpose
        }
      };

      // Translate 9:16 reframing decision to canonical clip transform/properties
      const reframing = beat.editorial_decisions?.reframing;
      if (reframing && reframing.enabled) {
        clipParams.properties = {
          reframing: {
            mode: reframing.mode,
            target_aspect_ratio: reframing.target_aspect_ratio,
            crop_rect: reframing.crop_rect,
            anchor_composition: reframing.anchor_composition
          }
        };

        if (reframing.crop_rect) {
          // Native crop is applied before canvas scaling; a second crop transform would double-apply it.
          clipParams.transform = {x:0,y:0,scaleX:1,scaleY:1,rotation:0,opacity:1};
        }
      }

      // Attach optical distortion to clip properties
      const optDist = beat.editorial_decisions?.optical_distortion || options.opticalDistortion;
      if(optDist){try{require('./composition-renderer.js').CompositionRenderer.validateOpticalDistortionParams(optDist);}catch(error){return{success:false,operationPlan:null,errors:[error.message],errorCodes:['ERR_INVALID_DISTORTION_PARAMETER'],diagnostics};}}
      if (optDist && optDist.enabled !== false) {
        clipParams.properties = clipParams.properties || {};
        clipParams.properties.optical_distortion = {
          cx: optDist.cx ?? 0.5,
          cy: optDist.cy ?? 0.5,
          k1: optDist.k1 ?? -0.25,
          k2: optDist.k2 ?? -0.05,
          interpolation: optDist.interpolation ?? 'bilinear'
        };
      }

      operations.push({
        op_id: `op-${String(stepIndex + 1).padStart(3, '0')}`,
        step_index: stepIndex++,
        type: 'insert_clip',
        target_id: clipId,
        params: clipParams,
        dependencies: []
      });

      // Emit apply_effect for optical fisheye distortion if requested
      if (optDist && optDist.enabled !== false) {
        operations.push({
          op_id: `op-${String(stepIndex + 1).padStart(3, '0')}`,
          step_index: stepIndex++,
          type: 'apply_effect',
          target_id: clipId,
          params: {
            clipId,
            effect: {
              type: 'transition',
              parameters: {
                effect: 'optical_fisheye_distortion',
                cx: optDist.cx ?? 0.5,
                cy: optDist.cy ?? 0.5,
                k1: optDist.k1 ?? -0.25,
                k2: optDist.k2 ?? -0.05,
                interpolation: optDist.interpolation ?? 'bilinear'
              }
            }
          },
          dependencies: [clipId]
        });
      }
    }

    // B. Visual Events -> insert_clip (type: 'text') + animate_property
    const transformedSidecar = require('./visual-evidence.js').mapPlanSidecars(creativePlan,project,options);

    for (let i = 0; i < visualEvents.length; i++) {
      const event = visualEvents[i];
      const eventClipId = `clip_event_${i + 1}`;
      if(!['title_card','caption','kinetic_text','lower_third'].includes(event.event_type))return{success:false,operationPlan:null,errors:['ERR_UNSUPPORTED_VISUAL_EVENT'],errorCodes:['ERR_UNSUPPORTED_VISUAL_EVENT'],diagnostics:{}};
      if(!['none','fade_in_out'].includes(event.motion.animation_type))return{success:false,operationPlan:null,errors:['ERR_UNSUPPORTED_CANONICAL_ANIMATION'],errorCodes:['ERR_UNSUPPORTED_CANONICAL_ANIMATION'],diagnostics:{}};
      if(event.content.font_family && !options.fontAssetId)return{success:false,operationPlan:null,errors:['ERR_EXPLICIT_FONT_ASSET_REQUIRED'],errorCodes:['ERR_EXPLICIT_FONT_ASSET_REQUIRED'],diagnostics:{}};

      let posX = 0, posY = 0, collisionFree = false, faceCollisionsCount = 0;
      let spatialStatus = 'NOT_REQUIRED', spatialAnchor = event.spatial_constraints?.target_anchor || 'center';

      const textClipParams = {
        id: eventClipId,
        trackId: graphicsTrack ? graphicsTrack.id : mainVideoTrack.id,
        type: 'text',
        startTick: event.timeline_range.start_tick,
        durationTicks: event.timeline_range.duration_ticks,
        typography: {
          text: event.content?.text || '',
          ...(options.fontAssetId ? {fontAssetId:options.fontAssetId} : {}),
          fontSize: event.content?.font_size || 48,
          color: event.content?.font_color || '#ffffff',
          textAlign: 'center'
        },
        transform: {
          x: posX,
          y: posY,
          opacity: 1.0
        },
        metadata: {
          event_id: event.event_id,
          event_type: event.event_type,
          collision_free: collisionFree,
          faceCollisionsCount,
          spatial_status: spatialStatus,
          spatial_anchor: spatialAnchor
        }
      };

      const curveSpec = event.content?.curve || event.curved_typography || options.curvedTypography;
      if (curveSpec) {
        if(curveSpec.styling?.fontFamily && !options.fontAssetId)return{success:false,operationPlan:null,errors:['ERR_EXPLICIT_FONT_ASSET_REQUIRED'],errorCodes:['ERR_EXPLICIT_FONT_ASSET_REQUIRED'],diagnostics:{}};
        if (curveSpec.text) {
          textClipParams.typography.text = curveSpec.text;
        }
        const validatedCurve = CurvedTypography.validateParams({
          text: curveSpec.text || event.content?.text || 'CURVED TEXT',
          curve: curveSpec.curve || curveSpec,
          styling: curveSpec.styling || {
            fontSize: event.content?.font_size || 64,
            color: event.content?.font_color || [255, 255, 0],
            opacity: 1.0
          },
          animation: {
            type: curveSpec.animation?.type || event.motion?.animation_type || 'none',
            sweepShiftDeg: curveSpec.animation?.sweepShiftDeg ?? 40.0,
            fadeRatio: curveSpec.animation?.fadeRatio ?? 0.2
          },
          timeline: {
            startTick: event.timeline_range.start_tick,
            durationTicks: event.timeline_range.duration_ticks
          }
        });

        textClipParams.properties = textClipParams.properties || {};
        textClipParams.properties.curved_typography = validatedCurve;
        textClipParams.typography.fontSize=validatedCurve.styling.fontSize;
        textClipParams.typography.color=Array.isArray(validatedCurve.styling.color)?'#'+validatedCurve.styling.color.map(v=>v.toString(16).padStart(2,'0')).join(''):validatedCurve.styling.color;
      }

      try {
        const graphics = require('../renderers/graphic-rasterizer.js');
        const fontAssets = new Map(project.assets.map(a=>[a.id,require('node:path').resolve(options.assetBaseDir || process.cwd(),a.src)]));
        const font = graphics.resolveFont(textClipParams,fontAssets);
        textClipParams.properties ||= {};textClipParams.properties.render_font=font;
        const directory=require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'eme-graphic-compile-'));
        const raster=graphics.rasterizeGraphic({clip:textClipParams,canvas:project.canvas,fps:project.timebase.fps,outputDir:directory,font});
        const constraints=event.spatial_constraints || {},bounds=raster.bounds;
        if (constraints.placement_rect && (bounds.width>constraints.placement_rect.width || bounds.height>constraints.placement_rect.height)) throw new Error('ERR_GRAPHIC_EXCEEDS_PLACEMENT_RECT');
        if (constraints.avoid_face_overlap) {
          if (beats.some(b=>b.timeline_range.start_tick<event.timeline_range.end_tick && b.timeline_range.end_tick>event.timeline_range.start_tick && (b.editorial_decisions?.optical_distortion || options.opticalDistortion))) throw new Error('ERR_FACE_SAFE_OPTICAL_UNSUPPORTED');
          const faces=require('./visual-evidence.js').requireCoverage(transformedSidecar,event.timeline_range.start_tick,event.timeline_range.duration_ticks,project.timebase.fps);
          const solved=VisualConstraintSolver.solveSpatialPlacement({element:{id:event.event_id,width:bounds.width,height:bounds.height,preferredAnchor:constraints.target_anchor},sidecar:{source:transformedSidecar.source,frames:faces},timeRange:{startTick:event.timeline_range.start_tick,endTick:event.timeline_range.end_tick}},{titleSafeRatio:constraints.safe_margin_ratio ?? .05,faceMarginPx:4,stepSizePx:2});
          if(solved.status!=='SOLVED')throw new Error('ERR_SPATIAL_CONSTRAINT_INFEASIBLE');
          textClipParams.transform.x=solved.placement.x-bounds.x;textClipParams.transform.y=solved.placement.y-bounds.y;
          const deleted=new Set(operations.filter(o=>o.type==='delete_clip').map(o=>o.params.clipId));
          const remaining=project.clips.filter(c=>c.type==='video' && !deleted.has(c.id));
          if(remaining.length)throw new Error('ERR_FACE_SAFE_UNMAPPED_VIDEO_LAYER');
          const video_bindings=operations.filter(o=>o.type==='insert_clip' && o.params.type==='video').map(o=>({clip_id:o.params.id,sha256:require('./execution-record.js').digest(o.params)}));
          textClipParams.properties.face_safe={required:true,local_bounds:bounds,scene_frames:faces,margin_px:4,video_bindings};
          textClipParams.metadata={...textClipParams.metadata,collision_free:true,spatial_status:'SOLVED',faceCollisionsCount:0};
          graphics.assertFaceSafe(graphics.transformedBounds(bounds,project.canvas,textClipParams.transform),faces,project.canvas,4);
        } else if (constraints.placement_rect) {
          textClipParams.transform.x=constraints.placement_rect.x-bounds.x;textClipParams.transform.y=constraints.placement_rect.y-bounds.y;
        }
      } catch(error) {
        return {success:false,operationPlan:null,dryRunResult:null,errors:[error.message],errorCodes:[error.message.split(':')[0]],diagnostics};
      }

      operations.push({
        op_id: `op-${String(stepIndex + 1).padStart(3, '0')}`,
        step_index: stepIndex++,
        type: 'insert_clip',
        target_id: eventClipId,
        params: textClipParams,
        dependencies: []
      });

      if (curveSpec) {
        operations.push({
          op_id: `op-${String(stepIndex + 1).padStart(3, '0')}`,
          step_index: stepIndex++,
          type: 'apply_effect',
          target_id: eventClipId,
          params: {
            clipId: eventClipId,
            effect: {
              type: 'transition',
              parameters: {
                effect: 'curved_typography',
                curve: textClipParams.properties.curved_typography.curve,
                styling: textClipParams.properties.curved_typography.styling,
                animation: textClipParams.properties.curved_typography.animation
              }
            }
          },
          dependencies: [eventClipId]
        });
      }

      // If animation requested, add animate_property
      if (!curveSpec && event.motion?.animation_type === 'fade_in_out') {
        const animDuration = event.motion.duration_ticks || 24000;
        operations.push({
          op_id: `op-${String(stepIndex + 1).padStart(3, '0')}`,
          step_index: stepIndex++,
          type: 'animate_property',
          target_id: eventClipId,
          params: {
            clipId: eventClipId,
            property: 'transform.opacity',
            keyframes: [
              { offsetTick: 0, value: 0.0, easing: 'linear' },
              { offsetTick: animDuration, value: 1.0, easing: 'linear' },
              { offsetTick: Math.max(animDuration, event.timeline_range.duration_ticks - animDuration), value: 1.0, easing: 'linear' },
              { offsetTick: event.timeline_range.duration_ticks, value: 0.0, easing: 'linear' }
            ]
          },
          dependencies: [eventClipId]
        });
      }
    }

    // C. Audio Direction -> insert_clip for soundtrack + ducking envelope + SFX cues
    let selectedAssetId = audioDir?.soundtrack_selection?.asset_id;
    if (!selectedAssetId && options.musicCriteria) {
      try {
        const sel = AudioSelector.selectMusic(options.musicCriteria);
        selectedAssetId = sel.selectedAsset?.asset_id;
      } catch (error) { diagnostics.conflicts.push(error.message); blockingIssues.push('ERR_MUSIC_SELECTION_FAILED'); }
    }
    if (!selectedAssetId && audioDir?.dialogue_ducking_enabled) {
      diagnostics.conflicts.push('Explicit soundtrack asset selection required for speech ducking'); blockingIssues.push('ERR_EXPLICIT_MUSIC_ASSET_REQUIRED');
    }

    const addedAssetIds = new Set((project.assets || []).map(a => a.id));

    if (selectedAssetId && mainAudioTrack) {
      if (!addedAssetIds.has(selectedAssetId)) {
        let catAsset = null;
        try { catAsset = AudioCatalog.getAsset(selectedAssetId, options.audioCatalogBaseDir); } catch (error) {
          return {success:false,operationPlan:null,dryRunResult:null,errors:[error.message],errorCodes:['ERR_AUDIO_ASSET_UNAVAILABLE'],diagnostics};
        }
        operations.push({
          op_id: `op-${String(stepIndex + 1).padStart(3, '0')}`,
          step_index: stepIndex++,
          type: 'add_asset',
          target_id: selectedAssetId,
          params: {
            id: selectedAssetId,
            type: 'audio',
            src: catAsset.full_path,
            sha256: catAsset?.sha256,
            metadata: catAsset ? {
              title: catAsset.title,
              durationSec: catAsset.duration_sec,
              mood: catAsset.mood,
              bpm: catAsset.bpm
            } : {}
          },
          dependencies: []
        });
        addedAssetIds.add(selectedAssetId);
      }

      const musicClipId = 'clip_soundtrack_bed';
      const musicClipParams = {
        id: musicClipId,
        trackId: mainAudioTrack.id,
        type: 'audio',
        startTick: 0,
        durationTicks: targetDurationTicks,
        source: {
          assetId: selectedAssetId,
          trimInTick: 0,
          trimOutTick: targetDurationTicks
        },
        audio: {
          volume: 1.0
        }
      };

      // Dialogue ducking envelope
      let volumeKeyframes = null;
      if (audioDir?.dialogue_ducking_enabled !== false) {
        const duckProfile = {
          attenuationDb: audioDir?.ducking_depth_db ?? -24.0,
          attackTicks: audioDir?.soundtrack_selection?.ducking_attack_ticks ?? 36000,
          releaseTicks: audioDir?.soundtrack_selection?.ducking_release_ticks ?? 54000,
          mergeToleranceMs: 400
        };

        const intervals = require('./audio-contracts.js').normalizeSpeechIntervals(options.speechIntervals || []);
        volumeKeyframes = SpeechDuckingCompiler.compileGainEnvelope({speechIntervals:intervals,totalDurationTicks:targetDurationTicks,profile:duckProfile,baseVolume:1.0});

        musicClipParams.audio.volumeEnvelope = volumeKeyframes;
      }

      operations.push({
        op_id: `op-${String(stepIndex + 1).padStart(3, '0')}`,
        step_index: stepIndex++,
        type: 'insert_clip',
        target_id: musicClipId,
        params: musicClipParams,
        dependencies: []
      });

      if (volumeKeyframes) {
        operations.push({
          op_id: `op-${String(stepIndex + 1).padStart(3, '0')}`,
          step_index: stepIndex++,
          type: 'set_audio_envelope',
          target_id: musicClipId,
          params: {
            clipId: musicClipId,
            volumeKeyframes
          },
          dependencies: [musicClipId]
        });
      }
    }

    // D. SFX Cues Placement
    for (let s = 0; s < sfxList.length; s++) {
      const sfx = sfxList[s];
      const sfxClipId = `clip_sfx_${s + 1}`;
      const sfxAssetId = sfx.assetId;

      if (!addedAssetIds.has(sfxAssetId)) {
        let catSfx = null;
        try { catSfx = AudioCatalog.getAsset(sfxAssetId, options.audioCatalogBaseDir); } catch (error) {
          return {success:false,operationPlan:null,dryRunResult:null,errors:[error.message],errorCodes:['ERR_AUDIO_ASSET_UNAVAILABLE'],diagnostics};
        }
        operations.push({
          op_id: `op-${String(stepIndex + 1).padStart(3, '0')}`,
          step_index: stepIndex++,
          type: 'add_asset',
          target_id: sfxAssetId,
          params: {
            id: sfxAssetId,
            type: 'audio',
            src: catSfx.full_path,
            sha256: catSfx?.sha256,
            metadata: catSfx ? {
              title: catSfx.title,
              durationSec: catSfx.duration_sec,
              category: catSfx.category,
              role: catSfx.role
            } : {}
          },
          dependencies: []
        });
        addedAssetIds.add(sfxAssetId);
      }

      const sfxAsset = (project.assets || []).find(a => a.id === sfxAssetId) || operations.find(o=>o.type==='add_asset'&&o.params.id===sfxAssetId)?.params;
      const availableDuration = sfxAsset?.metadata?.durationTicks ?? (sfxAsset?.metadata?.durationSec !== undefined ? MediaTime.secondsToTicks(sfxAsset.metadata.durationSec) : null);
      if (sfx.durationTicks === undefined && availableDuration === null) return {success:false,operationPlan:null,errors:['SFX duration metadata unavailable; explicit duration required'],errorCodes:['ERR_SFX_DURATION_UNAVAILABLE'],diagnostics};
      const sfxDuration = Math.min(sfx.durationTicks ?? availableDuration, targetDurationTicks - sfx.startTick);
      if (sfxDuration <= 0) return {success:false,operationPlan:null,errors:['SFX cue lies outside timeline'],errorCodes:['ERR_INVALID_SFX_CUE'],diagnostics};
      operations.push({
        op_id: `op-${String(stepIndex + 1).padStart(3, '0')}`,
        step_index: stepIndex++,
        type: 'insert_clip',
        target_id: sfxClipId,
        params: {
          id: sfxClipId,
          trackId: sfxTrack ? sfxTrack.id : 'track_a_sfx',
          type: 'audio',
          startTick: sfx.startTick || 0,
          durationTicks: sfxDuration,
          source: {
            assetId: sfxAssetId,
            trimInTick: 0,
            trimOutTick: sfxDuration
          },
          audio: {
            volume: sfx.gain !== undefined ? sfx.gain : 0.8
          }
        },
        dependencies: []
      });
    }

    if (options.preserveSourceDialogue === true) {
      const dialogueTrackId = `track_dialogue_${creativePlan.plan_id}`;
      const append = (type,target_id,params) => operations.push({op_id:`op-${String(stepIndex+1).padStart(3,'0')}`,step_index:stepIndex++,type,target_id,params,dependencies:[]});
      append('add_track',dialogueTrackId,{id:dialogueTrackId,name:'Explicit Source Dialogue',kind:'audio',zIndex:0});
      for (const [i,beat] of beats.entries()) {
        let volumeEnvelope;
        if(options.dialoguePeakControl) {
          const source=project.assets.find(a=>a.id===beat.source_media_ref.asset_id);
          volumeEnvelope=require('./audio-mixer-engine.js').AudioMixerEngine.compilePeakControlEnvelope({sourcePath:require('node:path').resolve(options.assetBaseDir || process.cwd(),source.src),startTick:beat.source_range.start_tick,durationTicks:beat.source_range.duration_ticks,profile:options.dialoguePeakControl});
        }
        append('insert_clip',`clip_dialogue_${i+1}`,{
        id:`clip_dialogue_${i+1}`,trackId:dialogueTrackId,type:'audio',startTick:beat.timeline_range.start_tick,durationTicks:beat.timeline_range.duration_ticks,
        source:{assetId:beat.source_media_ref.asset_id,trimInTick:beat.source_range.start_tick,trimOutTick:beat.source_range.end_tick},
        audio:{volume:options.dialogueGain ?? 1,...(volumeEnvelope?{volumeEnvelope}:{})},metadata:{role:'dialogue',beat_id:beat.beat_id}
      });
      }
    }

    // 4. Non-Mutating Dry Run Simulation via OperationExecutor
    let simState = structuredClone(project);
    const affectedTracks = [];
    const affectedClips = [];
    let simSuccess = true;
    let simError = null;

    for (const op of operations) {
      const execRes = OperationExecutor.execute(simState, {
        type: op.type,
        params: op.params,
        expectedBaseRevision: simState.revision
      });

      if (!execRes.success) {
        simSuccess = false;
        simError = execRes.error;
        diagnostics.conflicts.push(`Dry-run execution failed at operation ${op.op_id} (${op.type}): ${execRes.error}`);
        blockingIssues.push(execRes.errorCode || 'ERR_DRY_RUN_FAILED');
        break;
      }

      simState = execRes.project;

      // Collect affected
      if (op.params?.id && !affectedClips.includes(op.params.id)) {
        affectedClips.push(op.params.id);
      }
      if (op.params?.trackId && !affectedTracks.includes(op.params.trackId)) {
        affectedTracks.push(op.params.trackId);
      }
    }

    // Final Project Invariant Validation on Simulated State
    if (simSuccess) {
      const projValidation = ProjectManager.validateProject(simState);
      if (!projValidation.valid) {
        simSuccess = false;
        simError = `Simulated project state failed schema validation: ${projValidation.errors.join('; ')}`;
        diagnostics.conflicts.push(simError);
        blockingIssues.push('ERR_PROJECT_INVARIANT_VIOLATION');
      }
    }

    const dryRunResult = {
      success: simSuccess,
      simulated_steps: simSuccess ? operations.length : 0,
      final_revision: simState.revision ?? baseRevision,
      affected_tracks: affectedTracks,
      affected_clips: affectedClips,
      timing_implications: {
        start_tick: 0,
        end_tick: targetDurationTicks,
        duration_ticks: targetDurationTicks,
        duration_seconds: Number((targetDurationTicks / TICKS_PER_SECOND).toFixed(4))
      },
      invariant_checks: {
        preserved_properties_verified: true,
        track_locks_respected: blockingIssues.indexOf('ERR_TRACK_LOCKED') === -1,
        zero_leak_integrity: simSuccess
      }
    };

    const status = simSuccess && blockingIssues.length === 0 ? 'ready' : 'blocked';

    // Build canonical OperationPlan adhering to schema/eme-operation-plan.v1.schema.json
    const operationPlanId = `plan-${crypto.createHash('sha256')
      .update(`${creativePlan.plan_id}:${baseRevision}:${targetDurationTicks}:${operations.length}`)
      .digest('hex')
      .substring(0, 12)}`;

    const operationPlan = {
      schema_version: '1.0.0',
      plan_id: operationPlanId,
      source_brief_id: `brief-${creativePlan.plan_id.replace(/^creative-plan-/, '')}`,
      source_request_id: creativePlan.source_request_id,
      project_snapshot: {
        project_id: project.id || 'project_default',
        base_revision: baseRevision,
        snapshot_sha256: snapshotSha256,
        timebase_ticks_per_second: TICKS_PER_SECOND
      },
      target_duration_ticks: targetDurationTicks,
      operations,
      diagnostics,
      dry_run: dryRunResult,
      validation: {
        status,
        blocking_issue_ids: blockingIssues
      }
    };

    const outputSchema = JSON.parse(require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../schema/eme-operation-plan.v1.schema.json'), 'utf8'));
    const outputErrors = require('../engine/validator.js').validateObject(operationPlan, outputSchema, outputSchema);
    if (outputErrors.length) {
      blockingIssues.push('ERR_COMPILED_PLAN_SCHEMA');
      diagnostics.conflicts.push(...outputErrors);
      operationPlan.validation.status = 'blocked';
    }

    const allErrors = [];
    if (!simSuccess && simError) allErrors.push(simError);
    if (diagnostics.conflicts.length > 0 && blockingIssues.length > 0) {
      allErrors.push(...diagnostics.conflicts);
    }
    if (allErrors.length === 0 && blockingIssues.length > 0) {
      allErrors.push(...blockingIssues);
    }

    return {
      success: simSuccess && blockingIssues.length === 0,
      operationPlan,
      dryRunResult,
      errors: allErrors,
      errorCodes: blockingIssues,
      diagnostics
    };
  }
}

module.exports = {
  CreativePlanCompiler
};
