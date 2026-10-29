/**
 * Editing Mechanics Engine (EME) - Candidate Cue Generator (Phase A3)
 * Maps BeatAnalysis events onto timeline clips and tracks to propose candidate cues.
 */

/**
 * Generates candidate editorial cues from beat analysis events and project timeline snapshot.
 * @param {object} beatAnalysis Canonical eme-beat-analysis.v1 artifact
 * @param {object} project EME project snapshot (read-only)
 * @param {object} options Configuration options
 * @returns {Array<object>} Candidate cues
 */
function generateCandidateCues(beatAnalysis, project, options = {}) {
  const candidateCues = [];
  if (!beatAnalysis || !beatAnalysis.events || !project || !project.timeline) {
    return candidateCues;
  }

  const tracks = project.timeline.tracks || [];
  const videoTrack = tracks.find(t => t.type === 'video' && !t.locked) || tracks.find(t => t.type === 'video');
  if (!videoTrack) return candidateCues;

  const targetTrackId = videoTrack.id;
  const clips = videoTrack.clips || [];

  // Helper: Find which clip covers a timeline tick
  function findClipAt(ticks) {
    return clips.find(c => {
      const start = c.timelineStartTicks;
      const end = start + c.durationTicks;
      // Half-open interval: [start, end)
      return ticks >= start && ticks < end;
    });
  }

  let cueCount = 1;

  // 1. Process Downbeats -> Candidate Jump Cuts
  const downbeats = beatAnalysis.events.downbeats || [];
  for (const db of downbeats) {
    const clip = findClipAt(db.ticks);
    if (!clip) continue;

    // Must be inside the clip with safe margin (at least 24,000 ticks = 200ms from start and end)
    const margin = 24000;
    if (db.ticks > clip.timelineStartTicks + margin && db.ticks < clip.timelineStartTicks + clip.durationTicks - margin) {
      candidateCues.push({
        id: `cue-${cueCount++}`,
        type: 'jump_cut',
        atTicks: db.ticks,
        targetTrackId,
        targetClipId: clip.id,
        confidence: db.confidence,
        priority: 80,
        sourceEventId: db.id,
        params: {
          splitTicks: db.ticks
        }
      });
    }
  }

  // 2. Process Sections (Drops) -> Candidate Punch Zooms & Accent Flashes
  const sections = beatAnalysis.events.sections || [];
  for (const sec of sections) {
    if (sec.type === 'drop') {
      const clip = findClipAt(sec.startTicks);
      if (clip) {
        // Punch Zoom on the drop
        candidateCues.push({
          id: `cue-${cueCount++}`,
          type: 'punch_zoom',
          atTicks: sec.startTicks,
          targetTrackId,
          targetClipId: clip.id,
          confidence: sec.confidence,
          priority: 95,
          sourceEventId: sec.id,
          params: {
            scale: 1.15,
            durationTicks: 18000
          }
        });

        // Accent Flash pop on the drop
        candidateCues.push({
          id: `cue-${cueCount++}`,
          type: 'accent_flash',
          atTicks: sec.startTicks,
          targetTrackId,
          targetClipId: clip.id,
          confidence: sec.confidence,
          priority: 90,
          sourceEventId: sec.id,
          params: {
            intensity: 1.0,
            durationTicks: 12000
          }
        });
      }
    }
  }

  // 3. Process Beats (Kicks / Strong Beats) -> Punch Zooms if no cut
  const beats = beatAnalysis.events.beats || [];
  for (const b of beats) {
    if (b.strength && b.strength >= 0.85) {
      const clip = findClipAt(b.ticks);
      if (clip) {
        candidateCues.push({
          id: `cue-${cueCount++}`,
          type: 'punch_zoom',
          atTicks: b.ticks,
          targetTrackId,
          targetClipId: clip.id,
          confidence: b.confidence,
          priority: 50,
          sourceEventId: b.id,
          params: {
            scale: 1.08,
            durationTicks: 12000
          }
        });
      }
    }
  }

  return candidateCues;
}

module.exports = {
  generateCandidateCues
};
