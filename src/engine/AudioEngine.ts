export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfxGain: GainNode | null = null;
  musicGain: GainNode | null = null;
  musicNodes: AudioNode[] = [];
  musicPlaying = false;
  enabled = true;
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.7;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.35;
      this.musicGain.connect(this.master);
    } catch(e) { this.ctx = null; }
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setSfx(v:number){ if(this.sfxGain) this.sfxGain.gain.value = v; }
  setMusic(v:number){ if(this.musicGain) this.musicGain.gain.value = v; }
  private now(){ return this.ctx ? this.ctx.currentTime : 0; }

  tone(freq:number, dur:number, type:OscillatorType='sine', gain=0.2, slide=0, dest?:AudioNode) {
    if (!this.ctx || !this.sfxGain) return;
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(1, freq+slide), c.currentTime+dur);
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(gain, c.currentTime+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime+dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(); o.stop(c.currentTime+dur+0.05);
  }
  noise(dur:number, gain=0.15, filterFreq=1000) {
    if (!this.ctx || !this.sfxGain) return;
    const c = this.ctx;
    const bufSize = Math.floor(c.sampleRate*dur);
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<bufSize;i++) data[i] = (Math.random()*2-1);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime+dur);
    src.connect(filt); filt.connect(g); g.connect(this.sfxGain);
    src.start(); src.stop(c.currentTime+dur);
  }

  // named sounds
  click(){ this.tone(660,0.06,'square',0.12); }
  place(){ this.tone(440,0.08,'triangle',0.18); this.tone(880,0.12,'sine',0.12,0); }
  upgrade(){ this.tone(523,0.1,'sine',0.18); setTimeout(()=>this.tone(784,0.12,'sine',0.18),80); setTimeout(()=>this.tone(1046,0.15,'sine',0.16),160); }
  sell(){ this.tone(330,0.1,'sawtooth',0.14,-100); }
  noEnergy(){ this.tone(220,0.12,'square',0.16,-80); }
  bolt(){ this.tone(1200,0.05,'square',0.08,-400); }
  arc(){ this.tone(300,0.12,'sawtooth',0.14,600); this.noise(0.1,0.06,2000); }
  cryo(){ this.tone(900,0.1,'sine',0.12,-300); }
  railCharge(){ this.tone(200,0.6,'sawtooth',0.1,800); }
  railFire(){ this.tone(150,0.15,'square',0.2,-100); this.noise(0.12,0.1,800); }
  plasma(){ this.noise(0.25,0.22,1200); this.tone(180,0.2,'sine',0.16,-120); }
  enemyHit(){ this.tone(500,0.04,'square',0.06,-200); }
  enemyDeath(){ this.noise(0.18,0.14,900); this.tone(180,0.12,'sawtooth',0.1,-120); }
  waveStart(){ this.tone(440,0.12,'sine',0.16); setTimeout(()=>this.tone(660,0.12,'sine',0.16),120); setTimeout(()=>this.tone(880,0.18,'sine',0.18),240); }
  bossWarn(){ for(let i=0;i<3;i++) setTimeout(()=>this.tone(150,0.2,'sawtooth',0.22), i*250); }
  reactorHit(){ this.tone(120,0.25,'sawtooth',0.25,-60); this.noise(0.2,0.18,600); }
  victory(){ [523,659,784,1046].forEach((f,i)=>setTimeout(()=>this.tone(f,0.2,'sine',0.18),i*120)); }
  gameOver(){ [330,262,196,131].forEach((f,i)=>setTimeout(()=>this.tone(f,0.25,'sawtooth',0.2),i*180)); }
  ability(){ this.tone(700,0.15,'sine',0.16,400); this.noise(0.15,0.1,2500); }
  unlock(){ [392,523,659,880].forEach((f,i)=>setTimeout(()=>this.tone(f,0.14,'triangle',0.14),i*90)); }
  portalActivate(){ this.tone(120,0.7,'sawtooth',0.14,500); this.noise(0.5,0.08,400); }
  disruptPulse(){ this.tone(90,0.25,'square',0.16,-30); this.noise(0.2,0.1,3000); }
  disruptWarn(){ this.tone(1400,0.08,'square',0.05,-200); }
  bossDeath(){ this.noise(0.9,0.3,700); this.tone(70,0.9,'sawtooth',0.28,-40); setTimeout(()=>this.noise(0.5,0.2,500),300); setTimeout(()=>this.tone(520,0.4,'sine',0.2,-300),450); }
  finalWarning(){ [220,220,175].forEach((f,i)=>setTimeout(()=>this.tone(f,0.3,'sawtooth',0.2),i*350)); }
  critical(){ this.tone(880,0.3,'square',0.16,-500); this.tone(440,0.5,'sawtooth',0.14,-200); }
  celebrate(){ [523,659,784,1046,1318].forEach((f,i)=>setTimeout(()=>this.tone(f,0.25,'sine',0.16),i*110)); }

  startMusic() {
    if (this.musicPlaying || !this.ctx || !this.musicGain) return;
    this.musicPlaying = true;
    const c = this.ctx;
    // simple ambient arpeggio loop
    const notes = [220, 261.6, 329.6, 392, 440];
    let i = 0;
    const loop = () => {
      if (!this.musicPlaying || !this.ctx) return;
      const f = notes[i % notes.length];
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.06, c.currentTime+0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime+0.45);
      o.connect(g); g.connect(this.musicGain!);
      o.start(); o.stop(c.currentTime+0.5);
      i++;
      setTimeout(loop, 480);
    };
    loop();
  }
  stopMusic(){ this.musicPlaying = false; }
}
