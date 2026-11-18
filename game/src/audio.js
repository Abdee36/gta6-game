// Synthesized sound for Solmarina: WebAudio oscillators and noise only, no
// audio files. Everything is a no-op until the first user gesture creates the
// context, and every call is guarded so headless runs stay silent and safe.
let ctx = null;
let master = null;
let muted = false;
let engineNodes = null;
let sirenNodes = null;
let musicTimer = null;
let musicStep = 0;

function ensure() {
  if (ctx || muted) return ctx;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  return !!c;
}

export function setMuted(value) {
  muted = value;
  if (master) master.gain.value = muted ? 0 : 0.5;
  if (muted) {
    stopEngineSound();
    stopSirenSound();
    stopMusic();
  }
  return muted;
}

export function isMuted() {
  return muted;
}

function tone(freq, dur, type, vol, slideTo) {
  if (!ensure()) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch {
    // Audio is decoration; never break the game for it.
  }
}

function noise(dur, vol, lowpass) {
  if (!ensure()) return;
  try {
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node = src;
    if (lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      src.connect(filter);
      node = filter;
    }
    node.connect(gain);
    gain.connect(master);
    src.start(t);
  } catch {
    // Ignore audio failures.
  }
}

export function sfx(name) {
  if (muted) return;
  switch (name) {
    case 'shot':
      noise(0.09, 0.5, 3200);
      tone(180, 0.08, 'square', 0.25, 60);
      break;
    case 'crash':
      noise(0.28, 0.55, 900);
      tone(90, 0.25, 'sawtooth', 0.3, 40);
      break;
    case 'pickup':
      tone(660, 0.09, 'sine', 0.3);
      setTimeout(() => tone(990, 0.12, 'sine', 0.3), 70);
      break;
    case 'cash':
      tone(880, 0.08, 'triangle', 0.3);
      setTimeout(() => tone(1174, 0.1, 'triangle', 0.3), 80);
      setTimeout(() => tone(1568, 0.16, 'triangle', 0.3), 160);
      break;
    case 'mission':
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.32), i * 110));
      break;
    case 'fail':
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'sawtooth', 0.18), i * 140));
      break;
    case 'click':
      tone(700, 0.05, 'square', 0.15);
      break;
    case 'horn':
      tone(370, 0.22, 'square', 0.2);
      tone(466, 0.22, 'square', 0.16);
      break;
    case 'door':
      noise(0.08, 0.3, 1400);
      break;
    case 'busted':
      [440, 415, 392, 370].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.2), i * 160));
      break;
    case 'heal':
      tone(520, 0.15, 'sine', 0.25, 780);
      break;
    default:
      break;
  }
}

export function engineSound(speed01, running) {
  if (muted || !ensure()) {
    stopEngineSound();
    return;
  }
  try {
    if (!running) {
      stopEngineSound();
      return;
    }
    if (!engineNodes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 60;
      gain.gain.value = 0.05;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start();
      engineNodes = { osc, gain };
    }
    const t = ctx.currentTime;
    engineNodes.osc.frequency.setTargetAtTime(55 + speed01 * 130, t, 0.08);
    engineNodes.gain.gain.setTargetAtTime(0.03 + speed01 * 0.06, t, 0.08);
  } catch {
    stopEngineSound();
  }
}

export function stopEngineSound() {
  try {
    if (engineNodes) engineNodes.osc.stop();
  } catch {
    // Already stopped.
  }
  engineNodes = null;
}

export function sirenSound(on) {
  if (muted || !ensure()) {
    stopSirenSound();
    return;
  }
  try {
    if (!on) {
      stopSirenSound();
      return;
    }
    if (sirenNodes) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 750;
    lfo.type = 'square';
    lfo.frequency.value = 1.6;
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    gain.gain.value = 0.045;
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    lfo.start();
    sirenNodes = { osc, lfo };
  } catch {
    stopSirenSound();
  }
}

export function stopSirenSound() {
  try {
    if (sirenNodes) {
      sirenNodes.osc.stop();
      sirenNodes.lfo.stop();
    }
  } catch {
    // Already stopped.
  }
  sirenNodes = null;
}

// A light two-bar synth loop: bass pulse plus a sparse pentatonic figure.
const BASS = [110, 110, 131, 98, 110, 110, 147, 131];
const LEAD = [440, 0, 523, 0, 587, 0, 523, 659, 0, 587, 523, 0, 440, 392, 0, 0];

export function startMusic() {
  if (musicTimer || muted || !ensure()) return;
  musicStep = 0;
  musicTimer = setInterval(() => {
    if (muted || !ctx) return;
    try {
      const bar = Math.floor(musicStep / 2) % BASS.length;
      if (musicStep % 2 === 0) tone(BASS[bar], 0.22, 'triangle', 0.12);
      const lead = LEAD[musicStep % LEAD.length];
      if (lead) tone(lead, 0.16, 'sine', 0.06);
      musicStep += 1;
    } catch {
      // Music must never throw.
    }
  }, 210);
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}
