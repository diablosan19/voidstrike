// Tiny WebAudio synth: every sound is an oscillator or a burst of filtered noise made in code —
// no audio assets, nothing fetched. The context is created and resumed only on the first user
// gesture (unlock), as browsers require; before that, play() is a no-op. Sounds are throttled
// per kind so a busy second of combat stays a texture, not a pile-up.
import {
  EVENT_BIG_KILL, EVENT_BURST, EVENT_DASH, EVENT_HIT, EVENT_KILL,
  EVENT_OVER, EVENT_PICKUP, EVENT_PLAYER_HIT, EVENT_SHOOT, EVENT_WAVE,
} from './world.js';

export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  const lastPlayed = new Map();

  function unlock() {
    if (context !== null) {
      if (context.state === 'suspended') context.resume();
      return;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    context = new AudioCtor();
    master = context.createGain();
    master.gain.value = 0.16;
    master.connect(context.destination);
    // One second of white noise, reused by every explosion and dash.
    noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  }

  /** True at most once per `ms` for this kind; the gate that keeps bursts of events playable. */
  function throttle(kind, ms) {
    const now = performance.now();
    if (now - (lastPlayed.get(kind) ?? 0) < ms) return false;
    lastPlayed.set(kind, now);
    return true;
  }

  /** One oscillator note with a pitch glide and a short envelope. */
  function tone(type, from, to, seconds, volume, delay = 0) {
    const start = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  /** One noise burst through a sweeping filter: explosions, dash wind, impact grit. */
  function noise(seconds, volume, filterType, from, to, delay = 0) {
    const start = context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, to), start + seconds);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
    source.stop(start + seconds + 0.02);
  }

  /** Play the sounds for one step's event flags. */
  function play(events) {
    if (context === null || events === 0) return;
    if (events & EVENT_SHOOT && throttle('shoot', 48)) tone('square', 940, 320, 0.055, 0.11);
    if (events & EVENT_HIT && throttle('hit', 34)) tone('triangle', 330, 210, 0.03, 0.08);
    if (events & EVENT_KILL && throttle('kill', 40)) {
      noise(0.16, 0.2, 'lowpass', 1500, 120);
      tone('triangle', 170, 42, 0.16, 0.16);
    }
    if (events & EVENT_BIG_KILL && throttle('big', 90)) {
      noise(0.5, 0.42, 'lowpass', 3200, 70);
      tone('sine', 96, 28, 0.5, 0.4);
    }
    if (events & EVENT_BURST && throttle('burst', 120)) tone('sawtooth', 130, 60, 0.22, 0.1);
    if (events & EVENT_PLAYER_HIT && throttle('hurt', 90)) {
      tone('sawtooth', 230, 55, 0.24, 0.26);
      noise(0.14, 0.18, 'highpass', 500, 2400);
    }
    if (events & EVENT_DASH && throttle('dash', 80)) noise(0.15, 0.13, 'bandpass', 420, 2600);
    if (events & EVENT_PICKUP) {
      tone('sine', 660, 660, 0.07, 0.16);
      tone('sine', 990, 990, 0.1, 0.16, 0.07);
    }
    if (events & EVENT_WAVE) {
      tone('square', 440, 440, 0.07, 0.1);
      tone('square', 660, 660, 0.07, 0.1, 0.08);
      tone('square', 880, 880, 0.11, 0.1, 0.16);
    }
    if (events & EVENT_OVER) {
      tone('sawtooth', 320, 40, 0.9, 0.24);
      noise(0.8, 0.3, 'lowpass', 2400, 60);
    }
  }

  return { unlock, play };
}
