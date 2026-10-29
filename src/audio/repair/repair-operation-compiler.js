/**
 * Editing Mechanics Engine (EME) - Phase 27: Repair Operation Compiler & Executor
 *
 * Implements Stage 27.2:
 * - Compiles validated AudioRepairProposal into canonical operations conforming strictly
 *   to schema/eme-project.v1.schema.json.
 * - Reuses verified canonical operations:
 *     * 'move_clip' for SYNC_RETIME (with clipId, targetTick, targetTrackId).
 *     * 'set_audio_envelope' for PEAK_ATTENUATION (with clipId, volumeKeyframes).
 * - Enforces expectedBaseRevision check to prevent stale mutations.
 * - Executes mutations exclusively through OperationExecutor (ARC-27-01).
 * - Generates exact inverse operations to support atomic rollback.
 */

const { OperationExecutor } = require('../../engine/operations.js');

class RepairOperationCompiler {
  /**
   * Compiles an AudioRepairProposal into a single canonical operation envelope.
   *
   * @param {object} proposal Structured AudioRepairProposal
   * @param {object} project Current canonical project state
   * @returns {object} Canonical operation object accepted by OperationExecutor
   */
  static compile(proposal, project) {
    if (!proposal || typeof proposal !== 'object') {
      throw new Error('compile requires a valid proposal object');
    }
    if (proposal.status !== 'PLANNED') {
      const err = new Error(`Cannot compile proposal with status "${proposal.status}": ${proposal.rejection_reason || 'not planned'}`);
      err.code = 'INVALID_PROPOSAL_STATUS';
      throw err;
    }

    const expectedRevision = proposal.preconditions?.expected_base_revision !== undefined
      ? proposal.preconditions.expected_base_revision
      : project?.revision;

    switch (proposal.strategy) {
      case 'SYNC_RETIME': {
        const targetTick = proposal.parameters?.target_start_tick;
        if (targetTick === undefined || targetTick < 0) {
          const err = new Error(`Invalid target_start_tick in proposal: ${targetTick}`);
          err.code = 'INVALID_OPERATION_PARAMETERS';
          throw err;
        }

        return {
          type: 'move_clip',
          expectedBaseRevision: expectedRevision,
          clipId: proposal.target_clip_id,
          targetTick: targetTick,
          targetTrackId: proposal.target_track_id
        };
      }

      case 'PEAK_ATTENUATION': {
        const keyframes = proposal.parameters?.volume_keyframes;
        if (!Array.isArray(keyframes) || keyframes.length === 0) {
          const err = new Error('PEAK_ATTENUATION requires volume_keyframes array');
          err.code = 'INVALID_OPERATION_PARAMETERS';
          throw err;
        }

        return {
          type: 'set_audio_envelope',
          expectedBaseRevision: expectedRevision,
          clipId: proposal.target_clip_id,
          volumeKeyframes: keyframes
        };
      }

      default: {
        const err = new Error(`Unsupported repair strategy: "${proposal.strategy}"`);
        err.code = 'UNSUPPORTED_STRATEGY';
        throw err;
      }
    }
  }

  /**
   * Executes a repair proposal against a project state via OperationExecutor.
   *
   * @param {object} project Canonical project state
   * @param {object} proposal Structured AudioRepairProposal
   * @returns {{ success: boolean, project: object, affectedIds?: string[], error?: string, errorCode?: string, operation: object }}
   */
  static executeRepair(project, proposal) {
    let operation;
    try {
      operation = this.compile(proposal, project);
    } catch (err) {
      return {
        success: false,
        error: err.message,
        errorCode: err.code || 'COMPILATION_ERROR',
        project,
        operation: null
      };
    }

    // Capture state before mutation to generate exact inverse operation for rollback
    const inverseOp = this.createInverseOperation(operation, project);

    // Route mutation exclusively through OperationExecutor (ARC-27-01)
    const result = OperationExecutor.execute(project, operation);

    return {
      success: result.success,
      project: result.project,
      affectedIds: result.affectedIds,
      error: result.error,
      errorCode: result.errorCode,
      operation,
      inverseOperation: inverseOp
    };
  }

  /**
   * Generates an inverse operation to roll back a committed repair operation.
   *
   * @param {object} operation The applied canonical operation
   * @param {object} beforeProject The project state before the operation was applied
   * @returns {object|null} The inverse operation or null if uninvertible
   */
  static createInverseOperation(operation, beforeProject) {
    if (!operation || !beforeProject) return null;

    const clip = (beforeProject.clips || []).find(c => c.id === operation.clipId);
    if (!clip) return null;

    if (operation.type === 'move_clip') {
      return {
        type: 'move_clip',
        expectedBaseRevision: (beforeProject.revision || 0) + 1,
        clipId: operation.clipId,
        targetTick: clip.startTick,
        targetTrackId: clip.trackId
      };
    }

    if (operation.type === 'set_audio_envelope') {
      const priorEnvelope = clip.audio?.volumeEnvelope || [
        { offsetTick: 0, volume: clip.audio?.volume || 1.0 },
        { offsetTick: clip.durationTicks, volume: clip.audio?.volume || 1.0 }
      ];
      return {
        type: 'set_audio_envelope',
        expectedBaseRevision: (beforeProject.revision || 0) + 1,
        clipId: operation.clipId,
        volumeKeyframes: priorEnvelope
      };
    }

    return null;
  }
}

module.exports = {
  RepairOperationCompiler
};
