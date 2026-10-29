#!/usr/bin/env node

/**
 * Editing Mechanics Engine (EME) - Out-of-Band Human Approval Confirmation CLI
 *
 * Provides a trusted, local, human-interactive confirmation channel:
 * 1. Shows exact operations, options, asset hashes, and project revision.
 * 2. Requires explicit confirmation through an interactive TTY terminal session.
 * 3. Issues single-use cryptographic approval tokens bound to the plan and revision.
 *
 * Security Invariants:
 * - NO AUTOMATED BYPASS FLAGS: Any attempt to supply --yes, -y, --test-confirm, or
 *   arbitrary flags to 'approve' fails closed immediately with ERR_APPROVAL_BYPASS_FORBIDDEN.
 * - NO ENVIRONMENT VARIABLE BYPASSES: Environment variables (such as NODE_ENV or
 *   custom flags) are NEVER trusted to bypass user interaction.
 * - MANDATORY TTY: process.stdin.isTTY MUST be true. Piped or non-interactive
 *   invocations fail closed with ERR_NON_INTERACTIVE_FORBIDDEN.
 * - INTERACTIVE CONFIRMATION: This CLI rejects headless approval. A same-user process
 *   controlling a PTY can synthesize terminal input; this does not prove human presence.
 *
 * Operating Boundary:
 * A local CLI establishes an explicit interactive confirmation barrier requiring explicit
 * TTY input, but cannot prove human intent against a process that has full control over
 * the user's interactive terminal or OS session.
 */

const { ApprovalAuthority } = require('../src/creative/approval-authority.js');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'show': {
      const requestId = args[1];
      if (!requestId) {
        console.error('Usage: bin/eme-confirm.js show <request_id>');
        process.exit(1);
      }
      const ticket = ApprovalAuthority.getTicket(requestId);
      if (!ticket) {
        console.error(`Error: Request "${requestId}" not found.`);
        process.exit(1);
      }
      console.log(ticket.summary);
      console.log(`\nStatus: ${ticket.status}`);
      console.log(`Expires At: ${ticket.expires_at}`);
      break;
    }

    case 'approve': {
      const requestId = args[1];
      if (!requestId) {
        console.error('Usage: bin/eme-confirm.js approve <request_id>');
        process.exit(1);
      }

      // Invariant 1: Reject any extra arguments or bypass flags
      if (args.length > 2) {
        const extraArgs = args.slice(2).join(' ');
        console.error(`ERR_APPROVAL_BYPASS_FORBIDDEN: Extra arguments and bypass flags (${extraArgs}) are strictly forbidden. Explicit interactive human confirmation is required.`);
        process.exit(1);
      }

      // Invariant 2: Mandate interactive TTY session
      if (!process.stdin.isTTY) {
        console.error('ERR_NON_INTERACTIVE_FORBIDDEN: Non-interactive confirmation is strictly forbidden. Approval requires an interactive terminal session with human TTY input.');
        process.exit(1);
      }

      const approved = await ApprovalAuthority.confirmInteractively({ requestId });
      console.log('HUMAN APPROVAL GRANTED — AUTHORIZATION TOKEN ISSUED');
      console.log(JSON.stringify(approved));
      break;
    }

    case 'reject': {
      const requestId = args[1];
      if (!requestId) {
        console.error('Usage: bin/eme-confirm.js reject <request_id>');
        process.exit(1);
      }
      ApprovalAuthority.rejectPendingRequest({ requestId });
      console.log(`Request "${requestId}" marked REJECTED.`);
      break;
    }

    case 'help':
    default: {
      console.log(`
EME Human Confirmation CLI (Out-of-band Authorization Channel)

Usage:
  bin/eme-confirm.js show <request_id>       Display sealed execution and binding
  bin/eme-confirm.js approve <request_id>    Interactively confirm plan and issue cryptographic token
  bin/eme-confirm.js reject <request_id>     Cancel a pending approval request
      `);
      break;
    }
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
