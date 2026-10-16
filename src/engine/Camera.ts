import type { Vec2 } from '../types/game';

export class Camera {
  x = 0; y = 0; zoom = 1; targetZoom = 1;
  shakeX = 0; shakeY = 0; shakeMag = 0; shakeDecay = 8;
  width = 0; height = 0;
  constructor(w:number,h:number){ this.width=w; this.height=h; }
  resize(w:number,h:number){ this.width=w; this.height=h; }
  setZoom(z:number){ this.targetZoom = Math.max(0.6, Math.min(2.2, z)); }
  update(dt:number){
    this.zoom += (this.targetZoom - this.zoom)*Math.min(1, dt*6);
    if (this.shakeMag > 0.01) {
      this.shakeMag *= Math.exp(-this.shakeDecay*dt);
      this.shakeX = (Math.random()*2-1)*this.shakeMag;
      this.shakeY = (Math.random()*2-1)*this.shakeMag;
    } else { this.shakeMag=0; this.shakeX=0; this.shakeY=0; }
  }
  shake(mag:number){ this.shakeMag = Math.max(this.shakeMag, mag); }
  worldToScreen(p:Vec2): Vec2 {
    return { x: (p.x - this.x)*this.zoom + this.width/2 + this.shakeX,
             y: (p.y - this.y)*this.zoom + this.height/2 + this.shakeY };
  }
  screenToWorld(p:Vec2): Vec2 {
    return { x: (p.x - this.width/2 - this.shakeX)/this.zoom + this.x,
             y: (p.y - this.height/2 - this.shakeY)/this.zoom + this.y };
  }
  apply(ctx:CanvasRenderingContext2D) {
    ctx.translate(this.width/2 + this.shakeX, this.height/2 + this.shakeY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }
}
