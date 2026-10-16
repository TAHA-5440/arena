import type { Axial, Vec2 } from '../types/game';

export const HEX_RADIUS = 34; // pixels, pointy-top
/** Pixel distance between the centers of two adjacent hexes (pointy-top). */
export const HEX_STEP = Math.sqrt(3) * HEX_RADIUS;

export function axialToPixel(q: number, r: number, R: number = HEX_RADIUS): Vec2 {
  const x = Math.sqrt(3) * R * (q + r / 2);
  const y = 1.5 * R * r;
  return { x, y };
}

export function pixelToAxial(x: number, y: number, R: number = HEX_RADIUS): Axial {
  const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / R;
  const r = (2 / 3 * y) / R;
  return cubeRound(q, r);
}

export function cubeRound(q: number, r: number): Axial {
  let x = q;
  let z = r;
  let y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);
  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }
  return { q: rx, r: rz };
}

export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = (-a.q - a.r) - (-b.q - b.r);
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
}

export function hexNeighbors(a: Axial): Axial[] {
  const dirs = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
  ];
  return dirs.map(d => ({ q: a.q + d.q, r: a.r + d.r }));
}

export function hexCorners(cx: number, cy: number, R: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push({ x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) });
  }
  return pts;
}

export function pointInHex(px: number, py: number, cx: number, cy: number, R: number): boolean {
  // axial-ish: use distance in hex coords
  const a = pixelToAxial(px - cx + cx, py - cy + cy, R); // not right; do direct
  // simpler: check via cube distance <= 0.5? Use polygon raycast
  const corners = hexCorners(cx, cy, R);
  let inside = false;
  for (let i = 0, j = 5; i < 6; j = i++) {
    const xi = corners[i].x, yi = corners[i].y;
    const xj = corners[j].x, yj = corners[j].y;
    const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function hexKey(q: number, r: number): string { return `${q},${r}`; }
