const fs = require('fs');
const { spawnSync, execSync } = require('child_process');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('1. Preparing ff-unmute & Dynamic Duration prompt for ChatGPT...');

  const prompt = `We have completed Phase 1, Phase 2, and the initial 3D tilted camera tracking prototype with 100% verified test suites (47/47 PASS) and confirmed clean baseline isolation.

User Feedback & Next Direction:
1. Camera & HUD Validation: The 3D tilted camera tracking movement and HUD state machine were validated and approved.
2. Audio Architecture Upgrade (ff-unmute): The user requested upgrading from the minimal click SFX to the procedural synth engine from https://github.com/mrsarac/ff-unmute.
   - Synthetic DSP: Zero sample files. PolyBLEP bandlimited saw oscillator, ADSR envelopes, resonant biquad lowpass/bandpass filters, 808/909-style exponential kick, 4-tap micro-flam noise clap, metallic hat oscillator, rolling off-beat saw/pulse bass, detuned stereo pad chords, and ping-pong delay.
   - Emits 48 kHz 16-bit stereo PCM WAV + precise synchronized event timestamps (events.json).
3. Removing the 6-Second Duration Cap:
   - ff-tracking hardcoded duration to 6.0 seconds (12 scenes * 15 frames = 180 frames @ 30 fps).
   - ff-unmute hardcoded duration to 16.0 seconds (8 bars @ 120 BPM = 480 frames @ 30 fps).
   - In EME, we are generalizing the architecture so duration is completely dynamic and parametric: any duration T (e.g. 6s, 8s, 12s, 16s, 30s) automatically scales the score bars, DAW timeline scroll width, camera flight spline, and beat tracker events.

Zero-Dependency Architecture in EME:
- Porting the NumPy/SciPy DSP formulas from ff-unmute/music/synth.py into a pure Node.js synthesizer (experiments/unmute-audio/synth.js) using Float64Array and direct RIFF WAV export (0 external npm dependencies).
- Combining the 3D tilted camera perspective (experiments/tracking-camera/projection.js) with the DAW timeline lanes (Pad, Kick, Clap, Bass, Playhead) in HyperFrames.

Please review this dynamic duration and procedural synth architecture. Do you have any specific guidelines on audio-video sync alignment, LUFS normalization, or camera trajectory scaling before we execute the full pipeline?`;

  console.log('2. Staging prompt to clipboard...');
  const tmpPath = '/tmp/unmute_dynamic_duration_prompt.txt';
  fs.writeFileSync(tmpPath, prompt, 'utf8');
  execSync(`cat "${tmpPath}" | pbcopy`);

  console.log('3. Focusing ChatGPT in Brave Browser...');
  const focusScript = `
tell application "Brave Browser"
  repeat with w in windows
    set tabIdx to 0
    repeat with t in tabs of w
      set tabIdx to tabIdx + 1
      if (URL of t) contains "6ace7915-8720-83e8-9d86-ca8f22ba9a80" then
        set active tab index of w to tabIdx
        set index of w to 1
        activate
        delay 0.3
        return execute t javascript "
          (() => {
            const el = document.querySelector('div.ProseMirror[aria-label=\\\"Ask ChatGPT\\\"]') ||
                       document.querySelector('div.ProseMirror');
            if (!el) return 'NO_EL';
            el.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            return 'FOCUSED_AND_CLEARED';
          })()
        "
      end if
    end repeat
  end repeat
  return "NO_TAB"
end tell`;

  const focusRes = spawnSync('osascript', ['-e', focusScript], { encoding: 'utf8' });
  console.log('   Focus result:', (focusRes.stdout || '').trim());

  console.log('4. Pasting from clipboard...');
  const pasteScript = `
tell application "Brave Browser" to activate
delay 0.3
tell application "System Events"
  keystroke "v" using command down
end tell`;
  spawnSync('osascript', ['-e', pasteScript]);

  await sleep(1500);

  console.log('5. Clicking Send button...');
  const sendScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "6ace7915-8720-83e8-9d86-ca8f22ba9a80" then
        return execute t javascript "
          (() => {
            const btn = document.querySelector('button[data-testid=\\\"send-button\\\"]') ||
                        document.querySelector('button[aria-label=\\\"Send prompt\\\"]');
            if (btn) {
              btn.click();
              return 'CLICKED_SEND';
            }
            return 'NO_BTN';
          })()
        "
      end if
    end repeat
  end repeat
end tell`;

  const sendRes = spawnSync('osascript', ['-e', sendScript], { encoding: 'utf8' });
  console.log('   Send result:', (sendRes.stdout || '').trim());
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
