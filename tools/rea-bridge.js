#!/usr/bin/env node

/**
 * REA Investigation Bridge for Editing Mechanics Engine
 * Integrates local REA CLI capabilities (v6.5.0) into the project audit & reconnaissance pipeline.
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const REA_PATH = process.env.REA_BIN || '/Users/atharvpaharia100/.local/bin/rea';

function getReaVersion() {
  try {
    const res = execSync(`${REA_PATH} --version`, { encoding: 'utf8' }).trim();
    return res;
  } catch (err) {
    return null;
  }
}

function runReaCommand(subcommand, args = [], options = {}) {
  const fullArgs = [subcommand, ...args];
  if (!fullArgs.includes('--format')) {
    fullArgs.push('--format', 'json');
  }

  const result = spawnSync(REA_PATH, fullArgs, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function getProviders() {
  const res = runReaCommand('providers');
  if (res.status === 0) {
    try {
      return JSON.parse(res.stdout);
    } catch {
      return res.stdout;
    }
  }
  return null;
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'check';

  if (command === 'check') {
    const ver = getReaVersion();
    if (ver) {
      console.log(`✅ REA CLI is installed and available (version: ${ver})`);
      console.log(`   Binary path: ${REA_PATH}`);
      console.log(`   REA Repository: /Users/atharvpaharia100/REA`);
    } else {
      console.error(`❌ REA CLI not found at ${REA_PATH}`);
      process.exit(1);
    }
  } else if (command === 'providers') {
    const providers = getProviders();
    console.log(typeof providers === 'object' ? JSON.stringify(providers, null, 2) : providers);
  } else if (command === 'run') {
    const sub = args[1];
    const subArgs = args.slice(2);
    if (!sub) {
      console.error('Usage: node tools/rea-bridge.js run <subcommand> [args...]');
      process.exit(1);
    }
    const res = runReaCommand(sub, subArgs);
    if (res.stderr) console.error(res.stderr);
    console.log(res.stdout);
    process.exit(res.status || 0);
  } else {
    console.log(`
REA Bridge CLI

Usage:
  node tools/rea-bridge.js check        Check REA installation and version
  node tools/rea-bridge.js providers    List configured REA analysis providers
  node tools/rea-bridge.js run <cmd>    Execute an REA command
    `);
  }
}

if (require.main === module) {
  main();
}

module.exports = { getReaVersion, runReaCommand, getProviders, REA_PATH };
