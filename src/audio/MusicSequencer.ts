import { BEAT, BPM, REACTOR_MOTIF } from './types';
import type { MusicState } from './types';
import type { Arrangement } from './MusicDirector';
import type { Synthesizer } from './Synthesizer';
import type { BusMap } from './types';

type Step16 = number;

const KICK: Record<string, number[]> = {
  MENU:    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  BUILD:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  EARLY:   [0.7,0,0,0, 0,0,0,0, 0.4,0,0,0, 0,0,0,0],
  INTENSE: [0.85,0,0,0, 0,0,0.25,0, 0.7,0,0,0, 0,0,0.2,0],
  BOSS:    [0.9,0,0,0, 0,0,0.3,0, 0.75,0,0,0, 0.35,0,0,0],
  VICTORY: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  DEFEAT:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  PAUSE:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
};

const HAT: Record<string, number[]> = {
  MENU:    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  BUILD:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  EARLY:   [0,0,0.18,0, 0,0,0.12,0, 0,0,0.18,0, 0,0,0.12,0],
  INTENSE: [0,0,0.28,0, 0,0,0.22,0, 0,0,0.28,0, 0,0.12,0.3,0],
  BOSS:    [0,0,0.3,0, 0,0,0.22,0, 0,0,0.3,0, 0,0.15,0.32,0],
  VICTORY: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  DEFEAT:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  PAUSE:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
};

const SNARE: Record<string, number[]> = {
  MENU:    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  BUILD:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  EARLY:   [0,0,0,0, 0.28,0,0,0, 0,0,0,0, 0.22,0,0,0],
  INTENSE: [0,0,0,0, 0.4,0,0,0, 0,0,0,0, 0.38,0,0,0.12],
  BOSS:    [0,0,0,0, 0.45,0,0,0, 0,0,0,0, 0.4,0,0.15,0],
  VICTORY: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  DEFEAT:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  PAUSE:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
};

/** Soft sine-bass roots. A – D – F#m – E. 0 = rest. */
const BASS: Record<string, number[][]> = {
  MENU: [
    n(110.00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    n(146.83, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    n(92.50,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    n(82.41,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  ],
  BUILD: [
    n(110.00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    n(146.83, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    n(92.50,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    n(82.41,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  ],
  EARLY: [
    n(110.00, 0, 0, 0, 0, 0, 0, 0, 110.00, 0, 0, 0, 0, 0, 0, 0),
    n(146.83, 0, 0, 0, 0, 0, 0, 0, 146.83, 0, 0, 0, 0, 0, 0, 0),
    n(92.50,  0, 0, 0, 0, 0, 0, 0, 92.50,  0, 0, 0, 0, 0, 0, 0),
    n(82.41,  0, 0, 0, 0, 0, 0, 0, 98.00,  0, 0, 0, 0, 0, 0, 0),
  ],
  INTENSE: [
    n(110.00, 0, 0, 0, 110.00, 0, 0, 0, 110.00, 0, 0, 0, 123.47, 0, 0, 0),
    n(146.83, 0, 0, 0, 146.83, 0, 0, 0, 146.83, 0, 0, 0, 164.81, 0, 0, 0),
    n(92.50,  0, 0, 0, 92.50,  0, 0, 0, 92.50,  0, 0, 0, 110.00, 0, 0, 0),
    n(82.41,  0, 0, 0, 82.41,  0, 0, 0, 98.00,  0, 0, 0, 82.41,  0, 0, 0),
  ],
  BOSS: [
    n(82.41, 0, 0, 0, 82.41, 0, 0, 0, 82.41, 0, 0, 0, 92.50, 0, 0, 0),
    n(73.42, 0, 0, 0, 73.42, 0, 0, 0, 82.41, 0, 0, 0, 73.42, 0, 0, 0),
    n(92.50, 0, 0, 0, 92.50, 0, 0, 0, 82.41, 0, 0, 0, 73.42, 0, 0, 0),
    n(61.74, 0, 0, 0, 61.74, 0, 0, 0, 73.42, 0, 0, 0, 82.41, 0, 0, 0),
  ],
  ARCHON: [
    n(69.30, 0, 0, 0, 69.30, 0, 0, 0, 73.42, 0, 0, 0, 82.41, 0, 0, 0),
    n(61.74, 0, 0, 0, 61.74, 0, 0, 0, 69.30, 0, 0, 0, 73.42, 0, 0, 0),
    n(82.41, 0, 0, 0, 73.42, 0, 0, 0, 61.74, 0, 0, 0, 55.00, 0, 0, 0),
    n(51.91, 0, 0, 0, 55.00, 0, 0, 0, 61.74, 0, 0, 0, 69.30, 0, 0, 0),
  ],
  VICTORY: [
    n(110.00, 0, 0, 0, 0, 0, 0, 0, 146.83, 0, 0, 0, 0, 0, 0, 0),
    n(164.81, 0, 0, 0, 0, 0, 0, 0, 146.83, 0, 0, 0, 0, 0, 0, 0),
    n(110.00, 0, 0, 0, 0, 0, 0, 0, 98.00,  0, 0, 0, 0, 0, 0, 0),
    n(82.41,  0, 0, 0, 0, 0, 0, 0, 110.00, 0, 0, 0, 0, 0, 0, 0),
  ],
  DEFEAT: [
    n(110.00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    n(92.50,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    n(82.41,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    n(55.00,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  ],
  PAUSE: [
    n(110.00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    n(110.00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    n(92.50,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    n(110.00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
  ],
};

/** Slow pentatonic figures — A major / D / F#m / E. */
const ARP_CHORDS: Record<string, number[][]> = {
  MENU:    [[220.00, 277.18, 329.63, 369.99], [293.66, 369.99, 440.00, 329.63], [185.00, 220.00, 277.18, 329.63], [164.81, 246.94, 329.63, 293.66]],
  BUILD:   [[220.00, 277.18, 329.63], [293.66, 369.99, 440.00], [185.00, 220.00, 277.18], [164.81, 246.94, 329.63]],
  EARLY:   [[220.00, 277.18, 329.63], [293.66, 369.99, 440.00], [185.00, 220.00, 277.18], [164.81, 246.94, 329.63]],
  INTENSE: [[220.00, 277.18, 329.63, 440.00], [293.66, 369.99, 440.00, 554.37], [185.00, 220.00, 277.18, 329.63], [164.81, 246.94, 329.63, 369.99]],
  BOSS:    [[164.81, 196.00, 246.94], [146.83, 185.00, 220.00], [185.00, 220.00, 277.18], [123.47, 164.81, 196.00]],
  ARCHON:  [[155.56, 185.00, 233.08], [138.59, 174.61, 207.65], [164.81, 196.00, 246.94], [123.47, 155.56, 185.00]],
  VICTORY: [[277.18, 329.63, 440.00], [293.66, 369.99, 440.00], [246.94, 329.63, 392.00], [220.00, 277.18, 329.63]],
  DEFEAT:  [[220.00, 261.63, 329.63], [196.00, 246.94, 293.66], [174.61, 220.00, 261.63], [146.83, 185.00, 220.00]],
  PAUSE:   [[220.00, 277.18, 329.63], [220.00, 277.18, 329.63], [185.00, 246.94, 329.63], [220.00, 277.18, 329.63]],
};

function n(...xs: number[]): number[] { return xs; }

/**
 * Ambient sequencer. Long filtered tones, almost no percussion on the
 * theme — tempo is independent of game speed.
 */
export class MusicSequencer {
  running = false;
  private step = 0;
  private nextNote = 0;
  private timer = 0;
  private arr: Arrangement | null = null;
  private pending: Arrangement | null = null;
  private switchAt = 0;
  private quality: 'low' | 'standard' | 'high' = 'high';
  private drone: DroneRack | null = null;
  private defeatMuteUntil = 0;
  private lastState: MusicState | null = null;
  private delayNodes: AudioNode[] = [];

  constructor(private syn: Synthesizer, private buses: BusMap) {}

  setQuality(q: 'low' | 'standard' | 'high') { this.quality = q; }

  start() {
    if (this.running) return;
    this.running = true;
    this.step = 0;
    this.nextNote = this.syn.now() + 0.06;
    this.attachDelay();
    this.drone = new DroneRack(this.syn, this.buses);
    this.drone.start();
    this.pump();
    this.timer = window.setInterval(() => this.pump(), 40);
  }

  stop() {
    this.running = false;
    if (this.timer) { clearInterval(this.timer); this.timer = 0; }
    this.drone?.stop();
    this.drone = null;
    for (const n of this.delayNodes) {
      try { n.disconnect(); } catch { /* */ }
    }
    this.delayNodes = [];
  }

  onContextResume() {
    this.nextNote = this.syn.now() + 0.05;
  }

  setArrangement(arr: Arrangement) {
    if (!this.arr) {
      this.arr = arr;
      this.applyLayers(arr, 0.6);
      this.lastState = arr.state;
      return;
    }
    if (arr.state !== this.arr.state) {
      const immediate = arr.state === 'PAUSE' || arr.state === 'VICTORY' || arr.state === 'DEFEAT' || arr.state === 'BOSS'
        || this.arr.state === 'PAUSE';
      if (immediate) {
        this.arr = arr;
        this.pending = null;
        this.applyLayers(arr, arr.state === 'PAUSE' ? 0.18 : 0.7);
        if (arr.state === 'DEFEAT') this.defeatMuteUntil = this.syn.now() + 1.7;
        this.lastState = arr.state;
        return;
      }
      this.pending = arr;
      const bar = BEAT * 4;
      const now = this.syn.now();
      const elapsed = Math.max(0, now - (this.nextNote - (this.step % 16) * (BEAT / 4)));
      const into = elapsed % bar;
      this.switchAt = now + (bar - into) + 0.001;
      return;
    }
    this.arr = arr;
    this.applyLayers(arr, 1.0);
  }

  private attachDelay() {
    try {
      const ctx = this.syn.ctx;
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.47;
      const wet = ctx.createGain();
      wet.gain.value = 0.22;
      const fb = ctx.createGain();
      fb.gain.value = 0.18;
      this.buses.musicAmbient.connect(delay);
      delay.connect(wet);
      wet.connect(this.buses.music);
      wet.connect(fb);
      fb.connect(delay);
      this.delayNodes = [delay, wet, fb];
    } catch { /* delay optional */ }
  }

  private applyLayers(arr: Arrangement, seconds: number) {
    const t = this.syn.now();
    const q = this.quality;
    const amp = q === 'low' ? 0.75 : 1;
    ramp(this.buses.musicAmbient.gain, arr.ambient * amp, t, seconds);
    ramp(this.buses.musicRhythm.gain, arr.rhythm * amp, t, seconds);
    ramp(this.buses.musicBass.gain, arr.bass * amp, t, seconds);
    ramp(this.buses.musicIntensity.gain, arr.intensityLayer * amp, t, seconds);
    this.drone?.set(arr, q, t, seconds);
  }

  private pump() {
    if (!this.running || !this.syn.ctx) return;
    if (this.syn.ctx.state === 'suspended') return;
    if (this.pending && this.syn.now() >= this.switchAt) {
      this.arr = this.pending;
      this.pending = null;
      this.applyLayers(this.arr, 0.7);
      this.lastState = this.arr.state;
    }
    const ahead = this.syn.now() + 0.22;
    let guard = 0;
    while (this.nextNote < ahead && guard++ < 24) {
      if (this.arr) this.scheduleStep(this.step, this.nextNote, this.arr);
      this.nextNote += BEAT / 4;
      this.step++;
    }
    if (this.nextNote < this.syn.now() - 0.5) this.nextNote = this.syn.now() + 0.05;
  }

  private scheduleStep(step: number, time: number, arr: Arrangement) {
    if (arr.state === 'DEFEAT' && time < this.defeatMuteUntil) return;
    const s: Step16 = ((step % 16) + 16) % 16;
    const bar = Math.floor(step / 16) % 4;
    const key = arr.boss === 'archon' && arr.state === 'BOSS' ? 'ARCHON' : arr.state;
    const q = this.quality;
    const calm = arr.state === 'MENU' || arr.state === 'BUILD' || arr.state === 'PAUSE' || arr.state === 'VICTORY' || arr.state === 'DEFEAT';

    if (!calm && arr.rhythm > 0.05 && q !== 'low') {
      const kickPat = KICK[arr.state] || KICK.BUILD;
      const kv = kickPat[s] * arr.percussionDensity;
      if (kv > 0.08) this.kick(time, kv * 0.14);
      const hatPat = HAT[arr.state] || HAT.BUILD;
      const hv = hatPat[s] * arr.rhythm;
      if (hv > 0.1) this.hat(time, hv * 0.028);
      const snPat = SNARE[arr.state] || SNARE.BUILD;
      const sv = snPat[s] * arr.rhythm;
      if (sv > 0.15) this.snare(time, sv * 0.04);
    } else if (!calm && arr.rhythm > 0.05 && q === 'low') {
      const kickPat = KICK[arr.state] || KICK.BUILD;
      if (kickPat[s] > 0.6) this.kick(time, 0.1 * arr.percussionDensity);
    }

    if (arr.bass > 0.05) {
      const grid = BASS[key] || BASS[arr.state] || BASS.BUILD;
      const freq = grid[bar][s];
      if (freq > 0) this.bass(time, freq, arr.bass * (calm ? 0.1 : 0.11), calm);
    }

    if (arr.arp > 0.05 && q !== 'low') {
      const div = calm ? 8 : (arr.state === 'INTENSE' || arr.state === 'BOSS' ? 4 : 4);
      if (s % div === 0) {
        const chords = ARP_CHORDS[key] || ARP_CHORDS[arr.state] || ARP_CHORDS.MENU;
        const chord = chords[bar];
        const note = chord[Math.floor(s / div) % chord.length];
        this.arp(time, note, arr.arp * (calm ? 0.038 : 0.032), calm);
      }
    }

    if (arr.intensityLayer > 0.25 && q === 'high' && s === 0) {
      this.accent(time, arr.intensityLayer * 0.03);
    }

    const cycle = arr.state === 'MENU' ? 8 : arr.state === 'VICTORY' ? 4 : arr.state === 'BUILD' ? 8 : 6;
    if (arr.motif > 0.1 && bar === 0 && s === 0 && (Math.floor(step / 16) % cycle === 0)) {
      this.motif(time, arr);
    }
  }

  private kick(t: number, g: number) {
    this.syn.osc({ type: 'sine', freq: 72, freqEnd: 36, t, dur: 0.22, gain: g, attack: 0.006, dest: this.buses.musicRhythm, filterFreq: 180 });
  }

  private hat(t: number, g: number) {
    this.syn.noise({ t, dur: 0.04, gain: g, filterType: 'bandpass', filterFreq: 4200, filterQ: 0.8, dest: this.buses.musicRhythm });
  }

  private snare(t: number, g: number) {
    this.syn.noise({ t, dur: 0.1, gain: g, filterType: 'bandpass', filterFreq: 1400, filterQ: 0.8, dest: this.buses.musicRhythm, pink: true });
    this.syn.osc({ type: 'sine', freq: 160, freqEnd: 90, t, dur: 0.08, gain: g * 0.35, dest: this.buses.musicRhythm });
  }

  private bass(t: number, freq: number, g: number, calm: boolean) {
    const dur = calm ? 1.8 : 0.55;
    this.syn.osc({
      type: 'sine', freq, t, dur, gain: g, attack: calm ? 0.08 : 0.03,
      dest: this.buses.musicBass, filterFreq: 220,
    });
    this.syn.osc({
      type: 'sine', freq: freq * 2, t, dur: dur * 0.85, gain: g * 0.18, attack: calm ? 0.1 : 0.04,
      dest: this.buses.musicBass, filterFreq: 340,
    });
  }

  private arp(t: number, freq: number, g: number, calm: boolean) {
    const dur = calm ? 1.15 : 0.38;
    this.syn.osc({
      type: 'sine', freq, t, dur, gain: g, attack: calm ? 0.12 : 0.04,
      dest: this.buses.musicAmbient, filterFreq: 1400,
    });
    this.syn.osc({
      type: 'triangle', freq: freq * 2, t, dur: dur * 0.7, gain: g * 0.12, attack: calm ? 0.14 : 0.05,
      dest: this.buses.musicAmbient, filterFreq: 1800,
    });
  }

  private accent(t: number, g: number) {
    this.syn.osc({ type: 'sine', freq: 55, t, dur: 0.4, gain: g, attack: 0.04, dest: this.buses.musicIntensity, filterFreq: 140 });
  }

  private motif(t: number, arr: Arrangement) {
    const g = 0.048 * arr.motif;
    let notes: number[] = [...REACTOR_MOTIF];
    if (arr.state === 'VICTORY') notes = [220.0, 277.18, 329.63, 440.0];
    if (arr.state === 'DEFEAT') notes = [220.0, 164.81, 146.83, 110.0];
    if (arr.boss === 'archon') notes = notes.map(f => f * 0.5);
    const dest = this.buses.musicAmbient;
    const gap = arr.state === 'DEFEAT' ? 0.55 : arr.state === 'MENU' || arr.state === 'BUILD' ? 0.62 : 0.42;
    notes.forEach((f, i) => {
      const when = t + i * gap;
      this.syn.osc({ type: 'sine', freq: f, t: when, dur: 1.15, gain: g, attack: 0.08, dest, filterFreq: 1600 });
      this.syn.osc({ type: 'sine', freq: f * 2.003, t: when, dur: 0.7, gain: g * 0.16, attack: 0.1, dest, filterFreq: 2200 });
      this.syn.osc({ type: 'triangle', freq: f * 0.5, t: when, dur: 1.3, gain: g * 0.22, attack: 0.12, dest, filterFreq: 600 });
    });
  }
}

function ramp(param: AudioParam, value: number, t: number, seconds: number) {
  try {
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(Math.max(0, value), t + Math.max(0.05, seconds));
  } catch {
    param.value = value;
  }
}

/** Warm sine bed — no sawtooths. */
class DroneRack {
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  private oscC: OscillatorNode | null = null;
  private padA: OscillatorNode | null = null;
  private padB: OscillatorNode | null = null;
  private air: AudioBufferSourceNode | null = null;
  private filt: BiquadFilterNode | null = null;
  private padFilt: BiquadFilterNode | null = null;
  private lfo: OscillatorNode | null = null;
  private padGain: GainNode | null = null;
  private stopped = false;

  constructor(private syn: Synthesizer, private buses: BusMap) {}

  start() {
    const ctx = this.syn.ctx;
    const t = ctx.currentTime;
    try {
      this.filt = ctx.createBiquadFilter();
      this.filt.type = 'lowpass';
      this.filt.frequency.value = 320;
      this.oscA = ctx.createOscillator();
      this.oscB = ctx.createOscillator();
      this.oscC = ctx.createOscillator();
      this.oscA.type = 'sine'; this.oscB.type = 'sine'; this.oscC.type = 'sine';
      this.oscA.frequency.value = 110.0;
      this.oscB.frequency.value = 164.81;
      this.oscC.frequency.value = 110.4;
      const g = ctx.createGain();
      g.gain.value = 0.16;
      this.lfo = ctx.createOscillator();
      this.lfo.frequency.value = 0.04;
      const lg = ctx.createGain(); lg.gain.value = 35;
      this.lfo.connect(lg); lg.connect(this.filt.frequency);
      this.oscA.connect(this.filt); this.oscB.connect(this.filt); this.oscC.connect(this.filt);
      this.filt.connect(g); g.connect(this.buses.musicAmbient);

      this.padFilt = ctx.createBiquadFilter();
      this.padFilt.type = 'lowpass';
      this.padFilt.frequency.value = 720;
      this.padFilt.Q.value = 0.4;
      this.padA = ctx.createOscillator();
      this.padB = ctx.createOscillator();
      this.padA.type = 'triangle'; this.padB.type = 'sine';
      this.padA.frequency.value = 220.0;
      this.padB.frequency.value = 277.18;
      this.padA.detune.value = -4; this.padB.detune.value = 5;
      this.padGain = ctx.createGain();
      this.padGain.gain.value = 0.028;
      this.padA.connect(this.padFilt); this.padB.connect(this.padFilt);
      this.padFilt.connect(this.padGain); this.padGain.connect(this.buses.musicAmbient);

      this.air = ctx.createBufferSource();
      this.air.buffer = this.syn.pink;
      this.air.loop = true;
      const airF = ctx.createBiquadFilter();
      airF.type = 'lowpass';
      airF.frequency.value = 380;
      const airG = ctx.createGain();
      airG.gain.value = 0.012;
      this.air.connect(airF); airF.connect(airG); airG.connect(this.buses.musicAmbient);

      this.oscA.start(t); this.oscB.start(t); this.oscC.start(t);
      this.lfo.start(t);
      this.padA.start(t); this.padB.start(t);
      this.air.start(t);
    } catch { this.stopped = true; }
  }

  set(arr: Arrangement, quality: string, t: number, seconds: number) {
    if (!this.filt || !this.padFilt || !this.padA || !this.padB) return;
    const calm = arr.state === 'MENU' || arr.state === 'BUILD' || arr.state === 'PAUSE' || arr.state === 'VICTORY';
    const dark = arr.state === 'BOSS' || arr.state === 'DEFEAT';
    ramp(this.filt.frequency, dark ? 220 : calm ? 380 : 300, t, seconds);
    ramp(this.padFilt.frequency, quality === 'low' ? 400 : (dark ? 480 : calm ? 880 : 640), t, seconds);
    if (this.padGain) ramp(this.padGain.gain, calm ? 0.034 : dark ? 0.02 : 0.026, t, seconds);
    try {
      const a = arr.state === 'VICTORY' ? 246.94 : dark ? 185.0 : 220.0;
      const b = arr.state === 'VICTORY' ? 329.63 : dark ? 220.0 : 277.18;
      this.padA.frequency.linearRampToValueAtTime(a, t + seconds);
      this.padB.frequency.linearRampToValueAtTime(b, t + seconds);
    } catch { /* */ }
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.syn.ctx.currentTime;
    try {
      this.oscA?.stop(t + 0.4);
      this.oscB?.stop(t + 0.4);
      this.oscC?.stop(t + 0.4);
      this.padA?.stop(t + 0.4);
      this.padB?.stop(t + 0.4);
      this.lfo?.stop(t + 0.4);
      this.air?.stop(t + 0.4);
    } catch { /* */ }
  }
}

export const MUSIC_BPM = BPM;
