import type { Particle } from '../types/game';

export class ParticleSystem {
  particles: Particle[] = [];
  budget = 1200;
  constructor(budget:number){ this.budget = budget; }
  setBudget(b:number){ this.budget = b; }
  spawn(p: Partial<Particle> & {x:number;y:number}) {
    if (this.particles.length >= this.budget) {
      // drop oldest
      this.particles.shift();
    }
    const life = p.life ?? 0.6;
    this.particles.push({
      x: p.x, y: p.y,
      vx: p.vx ?? 0, vy: p.vy ?? 0,
      life, maxLife: life,
      size: p.size ?? 2,
      color: p.color ?? '#ffffff',
      alpha: p.alpha ?? 1,
      drag: p.drag ?? 0.92,
      gravity: p.gravity ?? 0,
      rot: p.rot ?? 0,
      rotSpeed: p.rotSpeed ?? 0,
      shape: p.shape ?? 'circle',
    });
  }
  burst(x:number,y:number,color:string,count:number,speed=80,size=2,life=0.6,shape:'circle'|'rect'|'spark'|'ring'='circle') {
    for (let i=0;i<count;i++){
      const a = Math.random()*Math.PI*2;
      const s = Math.random()*speed;
      this.spawn({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,color,size: size*(0.6+Math.random()*0.8),life,shape,drag:0.9});
    }
  }
  ring(x:number,y:number,color:string,r0=0) {
    this.spawn({x,y,vx:0,vy:0,color,size:4,life:0.5,shape:'ring',alpha:1});
  }
  update(dt:number) {
    const arr = this.particles;
    let write = 0;
    for (let i=0;i<arr.length;i++){
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vx *= Math.pow(p.drag, dt*60);
      p.vy *= Math.pow(p.drag, dt*60);
      p.vy += p.gravity*dt;
      p.x += p.vx*dt;
      p.y += p.vy*dt;
      p.rot += p.rotSpeed*dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
      arr[write++] = p;
    }
    arr.length = write;
  }
  clear() { this.particles.length = 0; }
}
