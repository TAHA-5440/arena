export type PointerHandler = (x:number,y:number,button:number) => void;

/**
 * Pointer input with tap-vs-drag detection, camera panning and pinch zoom.
 * Clicks are reported on pointer-UP only when the pointer did not drag,
 * which prevents accidental tower placement while panning.
 */
export class InputManager {
  canvas: HTMLCanvasElement;
  onPointerDown: PointerHandler | null = null;
  onPointerMove: ((x:number,y:number)=>void) | null = null;
  onPointerUp: ((x:number,y:number,button:number,dragged:boolean)=>void) | null = null;
  onWheel: ((delta:number)=>void) | null = null;
  onKeyDown: ((key:string)=>void) | null = null;
  onPan: ((dx:number,dy:number)=>void) | null = null;
  onPinch: ((scale:number)=>void) | null = null;

  private downX = 0; downY = 0;
  private lastX = 0; lastY = 0;
  private held = false;
  private dragged = false;
  private dragThreshold = 10;
  private pinchDist = 0;
  private multiTouch = false;
  private touches = new Map<number, {x:number;y:number}>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    canvas.addEventListener('mousedown', e => {
      const p = this.pos(e);
      this.begin(p.x, p.y, e.button);
    });
    window.addEventListener('mousemove', e => {
      const p = this.pos(e);
      this.move(p.x, p.y);
    });
    window.addEventListener('mouseup', e => {
      const p = this.pos(e);
      this.end(p.x, p.y, e.button);
    });

    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      if (e.touches.length >= 2) {
        this.multiTouch = true;
        this.held = false;
        this.dragged = true;
        this.pinchDist = this.touchDist(e);
        for (const t of e.touches) this.touches.set(t.identifier, this.pos(t));
        return;
      }
      const t = e.touches[0];
      const p = this.pos(t);
      this.touches.set(t.identifier, p);
      this.begin(p.x, p.y, 0);
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length >= 2) {
        const d = this.touchDist(e);
        if (this.pinchDist > 0 && d > 0) this.onPinch?.(d / this.pinchDist);
        this.pinchDist = d;
        return;
      }
      const t = e.touches[0];
      const p = this.pos(t);
      this.touches.set(t.identifier, p);
      this.move(p.x, p.y);
    }, { passive: false });
    canvas.addEventListener('touchend', e => {
      e.preventDefault();
      if (this.multiTouch) {
        if (e.touches.length === 0) { this.multiTouch = false; this.dragged = false; }
        return;
      }
      const t = e.changedTouches[0];
      const p = this.pos(t);
      this.end(p.x, p.y, 0);
    }, { passive: false });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.onWheel?.(e.deltaY);
    }, { passive: false });

    window.addEventListener('keydown', e => {
      this.onKeyDown?.(e.key);
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    });
  }

  private begin(x: number, y: number, button: number) {
    this.held = true;
    this.dragged = false;
    this.downX = x; this.downY = y;
    this.lastX = x; this.lastY = y;
    this.onPointerDown?.(x, y, button);
  }

  private move(x: number, y: number) {
    if (this.held) {
      if (!this.dragged && Math.hypot(x - this.downX, y - this.downY) > this.dragThreshold) {
        this.dragged = true;
      }
      if (this.dragged) {
        this.onPan?.(x - this.lastX, y - this.lastY);
      }
    }
    this.lastX = x; this.lastY = y;
    this.onPointerMove?.(x, y);
  }

  private end(x: number, y: number, button: number) {
    if (this.held) {
      this.onPointerUp?.(x, y, button, this.dragged);
    }
    this.held = false;
    this.dragged = false;
  }

  private touchDist(e: TouchEvent): number {
    if (e.touches.length < 2) return 0;
    const a = this.pos(e.touches[0]);
    const b = this.pos(e.touches[1]);
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  isDragging(): boolean { return this.held && this.dragged; }

  pos(e: any): {x:number;y:number} {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
}
