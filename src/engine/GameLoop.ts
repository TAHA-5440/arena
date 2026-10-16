export class GameLoop {
  private raf = 0;
  private running = false;
  private last = 0;
  private accumulator = 0;
  private readonly fixedDt = 1/60;
  private maxFrame = 0.25;
  constructor(private update: (dt:number)=>void, private render: (alpha:number)=>void) {}
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now:number) => {
      if (!this.running) return;
      let frame = (now - this.last)/1000;
      if (frame > this.maxFrame) frame = this.maxFrame;
      this.last = now;
      this.accumulator += frame;
      while (this.accumulator >= this.fixedDt) {
        this.update(this.fixedDt);
        this.accumulator -= this.fixedDt;
      }
      const alpha = this.accumulator / this.fixedDt;
      this.render(alpha);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  stop() { this.running = false; if (this.raf) cancelAnimationFrame(this.raf); }
  isRunning() { return this.running; }
  getFixedDt() { return this.fixedDt; }
}
