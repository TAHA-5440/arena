/** Reusable Web Audio synthesis primitives. One shared noise buffer, ADSR-style envelopes, FM. */

export interface OscOpts {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  detune?: number;
  t: number;
  dur: number;
  gain: number;
  attack?: number;
  dest: AudioNode;
  pan?: number;
  dist?: number;
  filterFreq?: number;
  filterType?: BiquadFilterType;
}

export interface NoiseOpts {
  t: number;
  dur: number;
  gain: number;
  attack?: number;
  filterType?: BiquadFilterType;
  filterFreq?: number;
  filterFreqEnd?: number;
  filterQ?: number;
  dest: AudioNode;
  pink?: boolean;
  pan?: number;
  dist?: number;
}

export class Synthesizer {
  ctx: AudioContext;
  white: AudioBuffer;
  pink: AudioBuffer;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.white = makeWhite(ctx, 1.6);
    this.pink = makePink(ctx, 1.6);
  }

  now() {
    return this.ctx.currentTime;
  }

  private outlet(dest: AudioNode, pan?: number, dist?: number): { node: AudioNode; extras: AudioNode[] } {
    const extras: AudioNode[] = [];
    let node = dest;
    if (pan && Math.abs(pan) > 0.02) {
      try {
        const p = this.ctx.createStereoPanner();
        p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), this.ctx.currentTime);
        p.connect(node);
        extras.push(p);
        node = p;
      } catch { /* StereoPanner not supported — stay mono */ }
    }
    if (dist !== undefined && dist < 0.995) {
      const g = this.ctx.createGain();
      g.gain.value = Math.max(0.2, dist);
      g.connect(node);
      extras.push(g);
      node = g;
    }
    return { node, extras };
  }

  private envelope(g: GainNode, t: number, dur: number, gain: number, attack = 0.008) {
    const peak = Math.max(0.0001, gain);
    const atk = Math.max(0.002, Math.min(attack, dur * 0.45));
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  osc(o: OscOpts): OscillatorNode | null {
    try {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const { node, extras } = this.outlet(o.dest, o.pan, o.dist);
      osc.type = o.type || 'sine';
      const f0 = Math.max(1, o.freq);
      osc.frequency.setValueAtTime(f0, o.t);
      if (o.freqEnd !== undefined) {
        const f1 = Math.max(1, o.freqEnd);
        try { osc.frequency.exponentialRampToValueAtTime(f1, o.t + o.dur); }
        catch { osc.frequency.linearRampToValueAtTime(f1, o.t + o.dur); }
      }
      if (o.detune) osc.detune.setValueAtTime(o.detune, o.t);
      this.envelope(g, o.t, o.dur, o.gain, o.attack);
      let tail: AudioNode = g;
      let filt: BiquadFilterNode | null = null;
      if (o.filterFreq) {
        filt = ctx.createBiquadFilter();
        filt.type = o.filterType || 'lowpass';
        filt.frequency.setValueAtTime(Math.max(40, o.filterFreq), o.t);
        g.connect(filt);
        tail = filt;
      }
      osc.connect(g); tail.connect(node);
      osc.start(o.t);
      osc.stop(o.t + o.dur + 0.03);
      osc.onended = () => {
        try {
          osc.disconnect(); g.disconnect(); filt?.disconnect();
          extras.forEach(n => n.disconnect());
        } catch { /* */ }
      };
      return osc;
    } catch {
      return null;
    }
  }

  noise(o: NoiseOpts): AudioBufferSourceNode | null {
    try {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = o.pink ? this.pink : this.white;
      src.loop = true;
      const filt = ctx.createBiquadFilter();
      filt.type = o.filterType || 'lowpass';
      const ff = Math.max(40, o.filterFreq || 1400);
      filt.frequency.setValueAtTime(ff, o.t);
      if (o.filterFreqEnd) {
        try { filt.frequency.exponentialRampToValueAtTime(Math.max(40, o.filterFreqEnd), o.t + o.dur); }
        catch { filt.frequency.linearRampToValueAtTime(Math.max(40, o.filterFreqEnd), o.t + o.dur); }
      }
      if (o.filterQ) filt.Q.value = o.filterQ;
      const g = ctx.createGain();
      const { node, extras } = this.outlet(o.dest, o.pan, o.dist);
      this.envelope(g, o.t, o.dur, o.gain, o.attack ?? 0.004);
      src.connect(filt); filt.connect(g); g.connect(node);
      src.start(o.t);
      src.stop(o.t + o.dur + 0.02);
      src.onended = () => {
        try { src.disconnect(); filt.disconnect(); g.disconnect(); extras.forEach(n => n.disconnect()); } catch { /* */ }
      };
      return src;
    } catch {
      return null;
    }
  }

  fm(opts: {
    carrier: number; carrierEnd?: number; modFreq: number; modGain: number;
    type?: OscillatorType; t: number; dur: number; gain: number; attack?: number;
    dest: AudioNode; pan?: number; dist?: number;
  }): void {
    try {
      const ctx = this.ctx;
      const car = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modG = ctx.createGain();
      const g = ctx.createGain();
      const { node, extras } = this.outlet(opts.dest, opts.pan, opts.dist);
      car.type = opts.type || 'sine';
      car.frequency.setValueAtTime(Math.max(1, opts.carrier), opts.t);
      if (opts.carrierEnd) {
        try { car.frequency.exponentialRampToValueAtTime(Math.max(1, opts.carrierEnd), opts.t + opts.dur); }
        catch { car.frequency.linearRampToValueAtTime(Math.max(1, opts.carrierEnd), opts.t + opts.dur); }
      }
      mod.frequency.setValueAtTime(Math.max(1, opts.modFreq), opts.t);
      modG.gain.setValueAtTime(opts.modGain, opts.t);
      modG.gain.exponentialRampToValueAtTime(0.0001, opts.t + opts.dur);
      this.envelope(g, opts.t, opts.dur, opts.gain, opts.attack ?? 0.006);
      mod.connect(modG); modG.connect(car.frequency);
      car.connect(g); g.connect(node);
      car.start(opts.t); mod.start(opts.t);
      car.stop(opts.t + opts.dur + 0.03); mod.stop(opts.t + opts.dur + 0.03);
      car.onended = () => {
        try {
          car.disconnect(); mod.disconnect(); modG.disconnect(); g.disconnect();
          extras.forEach(n => n.disconnect());
        } catch { /* */ }
      };
    } catch { /* */ }
  }

  /** Bell-like additive partials (cryo, amplifier, UI flourishes). */
  partials(opts: {
    freqs: number[]; gains?: number[]; t: number; dur: number; gain: number;
    dest: AudioNode; pan?: number; dist?: number; slide?: number;
  }): void {
    const n = opts.freqs.length;
    for (let i = 0; i < n; i++) {
      const f = opts.freqs[i];
      const g = (opts.gains ? opts.gains[i] : 1 / (i + 1)) * opts.gain;
      this.osc({
        type: 'sine',
        freq: f,
        freqEnd: opts.slide ? Math.max(1, f + opts.slide) : undefined,
        t: opts.t,
        dur: opts.dur * (1 - i * 0.08),
        gain: g,
        attack: 0.006,
        dest: opts.dest,
        pan: opts.pan,
        dist: opts.dist,
      });
    }
  }
}

function makeWhite(ctx: AudioContext, seconds: number): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Paul Kellet refined pink-noise filter. */
function makePink(ctx: AudioContext, seconds: number): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}
