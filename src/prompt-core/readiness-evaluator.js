/**
 * Editing Mechanics Engine (EME) - Prompt Core Readiness Evaluator
 * Deterministically evaluates whether an EditBrief is ready to proceed to planning.
 */

class ReadinessEvaluator {
  /**
   * Deterministically evaluate brief readiness.
   * @param {object} brief Candidate EditBrief object
   * @param {object} options Context options (e.g. projectSnapshot, currentProjectRevision)
   * @returns {{ status: 'ready' | 'needs_clarification' | 'blocked', blocking_issue_ids: string[], issues: object[] }}
   */
  static evaluate(brief, options = {}) {
    const blockingIssueIds = [];
    const issues = [];

    if (!brief || typeof brief !== 'object') {
      return {
        status: 'blocked',
        blocking_issue_ids: ['ERR_NULL_BRIEF'],
        issues: [{ id: 'ERR_NULL_BRIEF', message: 'Brief must be a non-null object' }]
      };
    }

    // 1. Revision / Snapshot check
    if (options.currentProjectRevision !== undefined && brief.project_snapshot) {
      if (brief.project_snapshot.base_revision !== options.currentProjectRevision) {
        const id = 'ERR_STALE_REVISION';
        blockingIssueIds.push(id);
        issues.push({
          id,
          message: `Stale project revision: brief refers to revision ${brief.project_snapshot.base_revision}, but current revision is ${options.currentProjectRevision}`
        });
      }
    }

    // 2. Ambiguity check
    if (Array.isArray(brief.ambiguities)) {
      for (const amb of brief.ambiguities) {
        if (amb.is_blocking) {
          blockingIssueIds.push(amb.id || 'ERR_BLOCKING_AMBIGUITY');
          issues.push({
            id: amb.id,
            kind: amb.kind,
            message: amb.description
          });
        }
      }
    }

    // 3. Contradiction Detection (e.g. G03: make warmer by changing grade vs do not modify grade)
    const requestedChanges = Array.isArray(brief.requested_changes) ? brief.requested_changes : [];
    const constraints = Array.isArray(brief.constraints) ? brief.constraints : [];

    // Check color contradiction
    const hasColorChangeRequest = requestedChanges.some(c => 
      c.domain === 'color' || (c.description || '').toLowerCase().includes('color') || (c.description || '').toLowerCase().includes('warmer')
    );
    const hasColorPreserveConstraint = constraints.some(c => 
      c.type === 'preserve_property' && c.property_key === 'color_grade' && c.strength === 'hard'
    );

    if (hasColorChangeRequest && hasColorPreserveConstraint) {
      const id = 'CONFLICT_COLOR_GRADE';
      blockingIssueIds.push(id);
      issues.push({
        id,
        kind: 'CONFLICTING_REQUIREMENTS',
        message: 'Contradictory requirements: requested color modification conflicts with explicit hard constraint to preserve color grade'
      });
    }

    // Check audio/music contradiction
    const hasMusicAddRequest = requestedChanges.some(c => 
      (c.description || '').toLowerCase().includes('music') && (c.description || '').toLowerCase().includes('add')
    );
    const hasMusicForbidConstraint = constraints.some(c => 
      c.type === 'forbid_effect' && (c.forbidden_effects || []).includes('music_content_added') && c.strength === 'hard'
    );

    if (hasMusicAddRequest && hasMusicForbidConstraint) {
      const id = 'CONFLICT_MUSIC';
      blockingIssueIds.push(id);
      issues.push({
        id,
        kind: 'CONFLICTING_REQUIREMENTS',
        message: 'Contradictory requirements: requested adding music conflicts with explicit hard constraint forbidding music'
      });
    }

    // 4. Target resolution check
    for (const ch of requestedChanges) {
      if (!ch.target_ids || ch.target_ids.length === 0) {
        const id = `UNRESOLVED_TARGET_${ch.change_id}`;
        blockingIssueIds.push(id);
        issues.push({
          id,
          kind: 'AMBIGUOUS_TARGET',
          message: `Change "${ch.change_id}" has unresolved target IDs`
        });
      }
    }

    // 5. Determine status
    if (blockingIssueIds.length > 0) {
      const hasConflictOrAmbiguity = issues.some(i => 
        i.kind === 'CONFLICTING_REQUIREMENTS' || i.kind === 'AMBIGUOUS_TARGET' || i.kind === 'MISSING_INPUT'
      );
      const status = hasConflictOrAmbiguity ? 'needs_clarification' : 'blocked';
      return {
        status,
        blocking_issue_ids: blockingIssueIds,
        issues
      };
    }

    return {
      status: 'ready',
      blocking_issue_ids: [],
      issues: []
    };
  }
}

module.exports = {
  ReadinessEvaluator
};
