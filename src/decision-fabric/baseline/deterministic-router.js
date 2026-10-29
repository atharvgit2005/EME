/**
 * Deterministic Baseline Router for EME.
 * Implements rule-based, deterministic heuristics used as an empirical baseline (M1)
 * and as a reliable fallback when ML inference is unavailable or uncertain.
 */

export class DeterministicRouter {
  constructor(policy) {
    this.policy = policy || {
      allowed_routes: [
        'transcription',
        'subtitle_generation',
        'audio_cleanup',
        'clip_selection',
        'motion_graphics',
        'color_grading',
        'timeline_manipulation',
        'render_export',
        'media_qa',
        'needs_planning'
      ],
      thresholds: {
        min_confidence_route: 0.75,
        multistep_escalation_p_true: 0.50
      }
    };

    this.rules = [
      {
        route: 'transcription',
        keywords: [
          /\btranscrib(e|tion|ing)\b/i,
          /\bspeech to text\b/i,
          /\bspeaker id(entification)?\b/i,
          /\bdialogue transcription\b/i,
          /\btranscribe the speech\b/i,
          /\bverbatim transcript\b/i,
          /\b(extract|convert).*dialogue.*(script|text)\b/i,
          /\btimestamped script\b/i,
          /\bwritten text format\b/i,
          /\bdialogue into written\b/i,
          /\bdiarize\b/i
        ]
      },
      {
        route: 'subtitle_generation',
        keywords: [
          /\bcaption(s)?\b/i,
          /\bsubtitle(s)?\b/i,
          /\bword[- ]level (timing|captions)\b/i,
          /\bsrt\b/i,
          /\bsynchronized (subtitles|captions)\b/i,
          /\bon[- ]?screen captions\b/i,
          /\bburn captions\b/i,
          /\bcaptions burned\b/i,
          /\bshow subtitles\b/i,
          /\bexport an srt\b/i
        ]
      },
      {
        route: 'audio_cleanup',
        keywords: [
          /\b(de)?noise\b/i,
          /\baudio cleanup\b/i,
          /\bhiss\b/i,
          /\bhum\b/i,
          /\bloudness\b/i,
          /\bducking\b/i,
          /\bequaliz(e|ation)\b/i,
          /\bfix the audio\b/i,
          /\bsteady hum\b/i,
          /\bnoisy outdoor recording\b/i,
          /\blevel the speech volume\b/i,
          /\bair conditioning rumble\b/i,
          /\bkill the.*hum\b/i
        ]
      },
      {
        route: 'clip_selection',
        keywords: [
          /\b(clip|soundbite|moment|video)? ?highlight(s)? (discovery|moments|takes|reel|soundbites)\b/i,
          /\bfind.*highlight(s)?\b/i,
          /\bselect.*highlight(s)?\b/i,
          /\bdiscover highlights\b/i,
          /\bb[- ]roll\b/i,
          /\brough[- ]cut\b/i,
          /\bstrongest (takes|moments)\b/i,
          /\bselect (the )?(best|candidate|clip|strongest|highlight(s)?)\b/i,
          /\b(find|select|pick|choose).*(strongest|best|candidate) (takes|recordings)\b/i,
          /\bisolate.*candidate soundbites\b/i,
          /\bscan through.*footage\b/i,
          /\bpull.*soundbites\b/i,
          /\bteaser from.*takes\b/i
        ]
      },
      {
        route: 'motion_graphics',
        keywords: [
          /\blower[- ]third(s)?\b/i,
          /\btitle (card|animation|sequence)(s)?\b/i,
          /\bmotion graphic(s)?\b/i,
          /\bcallout(s)?\b/i,
          /\bkinetic typography\b/i,
          /\badd (a |the |an animated )?title\b/i,
          /\banimate (a |the )?title\b/i,
          /\banimate the words\b/i
        ]
      },
      {
        route: 'color_grading',
        keywords: [
          /\bcolor grad(e|ing)\b/i,
          /\b3d lut\b/i,
          /\bteal and orange\b/i,
          /\bwarm golden\b/i,
          /\bbleach bypass\b/i,
          /\btrue tone\b/i,
          /\bexposure\b/i,
          /\bwhite balance\b/i,
          /\bfix the picture\b/i,
          /\bcinematic contrast grading\b/i,
          /\bmichael bay look\b/i
        ]
      },
      {
        route: 'timeline_manipulation',
        keywords: [
          /\bsplit (the |selected )?clip\b/i,
          /\bripple trim\b/i,
          /\bslip clip\b/i,
          /\bslide clip\b/i,
          /\btrim (head|tail|clip|pauses)\b/i,
          /\bmove clip\b/i,
          /\bcut track\b/i,
          /\bremove pauses\b/i,
          /\btighten( the)? pauses\b/i,
          /\btrimming pauses\b/i,
          /\bmake the cuts (snappier|faster)\b/i,
          /\b(clip )?playback faster\b/i,
          /\bspeed up\b/i,
          /\bretime\b/i,
          /\bcut out silent gaps\b/i,
          /\bshave off.*dead air\b/i,
          /\btrim the fat\b/i
        ]
      },
      {
        route: 'render_export',
        keywords: [
          /\brender (the )?timeline\b/i,
          /\brender (final|to mp4|video)\b/i,
          /\brender.*final video\b/i,
          /\bexport (the )?(video|final|project)\b/i,
          /\b(then )?export\b/i,
          /\bencode to mp4\b/i,
          /\bencode.*(mp4|deliverable|sequence)\b/i,
          /\bdeliverable\b/i,
          /\bprepare the project for export\b/i,
          /\bexport.*deliverable\b/i
        ]
      },
      {
        route: 'media_qa',
        keywords: [
          /\bmedia qa\b/i,
          /\bblank frame check\b/i,
          /\baudio sync check\b/i,
          /\bcut continuity check\b/i,
          /\bclipping inspection\b/i,
          /\bqa audit\b/i,
          /\bdouble check.*frames\b/i
        ]
      }
    ];

    this.compoundMarkers = [
      /\band then\b/i,
      /\bafter that\b/i,
      /\bfirst\b.*\bthen\b/i,
      /\bcreate.*and.*export\b/i,
      /\bfind.*and.*add\b/i,
      /\bstep 1\b/i,
      /\bmulti[- ]step\b/i,
      /\bcomplex brief\b/i,
      /,.*,.*and\b/i,
      /,.*then\b/i,
      /\bthen (export|render|deliver|grade|cut|transcribe)\b/i,
      /\bhave (them|it) reviewed\b/i,
      /\breview.*then\b/i,
      /\b(take|review|transcribe|clean|select|grade|edit).*,.*and (export|render|deliver)\b/i,
      /\bfrom scratch\b/i,
      /\binto.*(recap|trailer|reel|video)\b/i,
      /\bif\b.*\b(then|otherwise)\b/i,
      /;.*then\b/i,
      /\brather than\b/i,
      /\bre[- ]architect\b/i,
      /\b(resolve dependencies|dependencies between)\b/i,
      /\bmultiple.*(stages|tasks|workflows|notes|passes)\b/i,
      /\bcross[- ]subsystem\b/i
    ];
  }

  /**
   * Preprocesses text to mask spoken quotes and extract negative/exclusion clauses.
   */
  _extractConstraintsAndCleanText(text) {
    let cleanText = text;
    const forbiddenActions = [];
    const preservedConstraints = [];

    // 1. Mask spoken dialogue quotes: e.g. 'export the project now'
    cleanText = cleanText.replace(/['"‘’“”][^'"‘’“”]+['"‘’“”]/g, (match) => {
      // If speaker says something, that quoted text is content, not command
      return ' [SPOKEN_QUOTE_CONTENT] ';
    });

    // 2. Detect self-contradictory requests
    const hasAddTitle = /\badd (a |an animated )?title\b/i.test(text);
    const hasDoNotAddTitle = /\bdo not add (a )?title\b/i.test(text);
    const isContradictory = hasAddTitle && hasDoNotAddTitle;

    // 3. Detect advisory-only requests
    const isAdvisoryOnly = /\b(explain|which|recommend|suggest)\b.*\bsettings\b/i.test(text) && /\bdo not export\b/i.test(text);

    // 4. Extract negative / forbidden actions
    if (/\b(do not|never|don't)\s+export\b/i.test(text)) {
      forbiddenActions.push('render_export');
      cleanText = cleanText.replace(/\b(do not|never|don't)\s+export\b/gi, ' [FORBIDDEN_ACTION] ');
    }
    if (/\b(do not|never|don't)\s+reorder\b/i.test(text) || /\bpreserve clip order\b/i.test(text)) {
      forbiddenActions.push('reorder_clips');
      preservedConstraints.push('preserve_clip_order');
      cleanText = cleanText.replace(/\b(do not|never|don't)\s+reorder\b/gi, ' [FORBIDDEN_ACTION] ');
      cleanText = cleanText.replace(/\bpreserve clip order\b/gi, ' [PRESERVED_CONSTRAINT] ');
    }
    if (/\bwithout altering exposure\b/i.test(text) || /\block exposure\b/i.test(text)) {
      preservedConstraints.push('lock_exposure');
      cleanText = cleanText.replace(/\bwithout altering exposure\b/gi, ' [PRESERVED_CONSTRAINT] ');
    }
    if (/\bleave the picture unchanged\b/i.test(text)) {
      preservedConstraints.push('preserve_picture');
      cleanText = cleanText.replace(/\bleave the picture unchanged\b/gi, ' [PRESERVED_CONSTRAINT] ');
    }
    if (/\bdo not touch audio\b/i.test(text)) {
      preservedConstraints.push('preserve_audio');
      cleanText = cleanText.replace(/\bdo not touch audio\b/gi, ' [PRESERVED_CONSTRAINT] ');
    }
    if (/\bdo not normalize voices\b/i.test(text)) {
      forbiddenActions.push('normalize_voices');
      cleanText = cleanText.replace(/\bdo not normalize voices\b/gi, ' [FORBIDDEN_ACTION] ');
    }
    if (/\btouch music\b/i.test(text)) {
      forbiddenActions.push('touch_music');
      cleanText = cleanText.replace(/\b(or )?touch music\b/gi, ' [FORBIDDEN_ACTION] ');
    }
    if (/\bdo not paraphrase\b/i.test(text) || /\bverbatim\b/i.test(text)) {
      preservedConstraints.push('verbatim_transcript');
      cleanText = cleanText.replace(/\bdo not paraphrase\b/gi, ' [PRESERVED_CONSTRAINT] ');
    }
    if (/\bno dialogue captions\b/i.test(text) || /\bno on[- ]screen text\b/i.test(text)) {
      forbiddenActions.push('subtitle_generation');
      cleanText = cleanText.replace(/\bno (dialogue captions|on[- ]screen text)\b/gi, ' [FORBIDDEN_ACTION] ');
    }

    return {
      cleanText,
      forbiddenActions,
      preservedConstraints,
      isContradictory,
      isAdvisoryOnly
    };
  }

  predict(state) {
    const rawText = typeof state === 'string' ? state : (state?.request_text || state?.body || '');
    const startTime = performance.now();

    const {
      cleanText,
      forbiddenActions,
      preservedConstraints,
      isContradictory,
      isAdvisoryOnly
    } = this._extractConstraintsAndCleanText(rawText);

    // Contradictory or advisory requests escalate directly to System 2 planning
    if (isContradictory || isAdvisoryOnly) {
      const latencyMs = performance.now() - startTime;
      return {
        answers: {
          intent: {
            choice: 'needs_planning',
            confidence: 0.95,
            probabilities: { needs_planning: 0.95 }
          },
          requires_multistep_plan: {
            noul: 0.95
          }
        },
        routing: {
          model: 'deterministic_heuristic_v1',
          latency_ms: latencyMs,
          matched_categories: [],
          requires_multistep: true,
          forbidden_actions: forbiddenActions,
          constraints: preservedConstraints,
          escalation_reason: isContradictory ? 'Contradictory user instructions' : 'Advisory request'
        }
      };
    }

    // 1. Check for compound / multi-step markers on clean text
    let matchesCategory = [];
    for (const rule of this.rules) {
      for (const kw of rule.keywords) {
        if (kw.test(cleanText)) {
          matchesCategory.push(rule.route);
          break;
        }
      }
    }

    // Filter out any route that was explicitly forbidden
    matchesCategory = matchesCategory.filter(r => !forbiddenActions.includes(r));

    // Route precedence & disambiguation:
    // An artifact-specific request to generate or export an SRT must not be incorrectly routed to generic video export
    if (matchesCategory.includes('subtitle_generation') && matchesCategory.includes('render_export')) {
      if (/\b(srt|subtitle|caption)\b/i.test(cleanText) && !/\b(mp4|final video|timeline into|video master|final cut|h264)\b/i.test(cleanText)) {
        matchesCategory = matchesCategory.filter(r => r !== 'render_export');
      }
    }

    const hasCompoundMarker = this.compoundMarkers.some(re => re.test(cleanText));
    const isMultiCategory = matchesCategory.length >= 2;
    const requiresMultistep = hasCompoundMarker || isMultiCategory;

    let chosenIntent = 'needs_planning';
    let confidence = 0.5;

    if (requiresMultistep) {
      chosenIntent = 'needs_planning';
      confidence = 0.95;
    } else if (matchesCategory.length === 1) {
      chosenIntent = matchesCategory[0];
      confidence = 0.92;
    } else if (matchesCategory.length === 0) {
      chosenIntent = 'needs_planning';
      confidence = 0.60;
    }

    const latencyMs = performance.now() - startTime;

    return {
      answers: {
        intent: {
          choice: chosenIntent,
          confidence: confidence,
          probabilities: {
            [chosenIntent]: confidence,
            needs_planning: chosenIntent === 'needs_planning' ? confidence : (1 - confidence)
          }
        },
        requires_multistep_plan: {
          noul: requiresMultistep ? 0.95 : 0.05
        }
      },
      routing: {
        model: 'deterministic_heuristic_v1',
        latency_ms: latencyMs,
        matched_categories: matchesCategory,
        requires_multistep: requiresMultistep,
        forbidden_actions: forbiddenActions,
        constraints: preservedConstraints
      }
    };
  }
}

