import type { Pos } from './types';

/** Lightweight stereo placement relative to the camera. Avoids extreme L/R. */
export class AudioSpatializer {
  camX = 0;
  camY = 0;
  zoom = 1;
  enabled = true;

  setCamera(x: number, y: number, zoom: number) {
    this.camX = x;
    this.camY = y;
    this.zoom = zoom;
  }

  panFor(pos?: Pos): number {
    if (!this.enabled || !pos) return 0;
    const dx = pos.x - this.camX;
    return Math.max(-0.55, Math.min(0.55, dx / 440));
  }

  distGain(pos?: Pos): number {
    if (!this.enabled || !pos) return 1;
    const d = Math.hypot(pos.x - this.camX, pos.y - this.camY);
    return 1 - Math.min(0.42, d / 980);
  }
}
