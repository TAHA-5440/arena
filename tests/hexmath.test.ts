import { describe, it, expect } from 'vitest';
import { axialToPixel, pixelToAxial, hexDistance, hexNeighbors } from '../src/grid/HexMath';

describe('hex math', () => {
  it('round trip', () => {
    for (let q=-6;q<=6;q++) for (let r=-6;r<=6;r++) {
      if (Math.abs(q)+Math.abs(r)+Math.abs(-q-r) > 12) continue;
      const p = axialToPixel(q,r);
      const a = pixelToAxial(p.x,p.y);
      expect(a).toEqual({q,r});
    }
  });
  it('distance', () => {
    expect(hexDistance({q:0,r:0},{q:1,r:0})).toBe(1);
    expect(hexDistance({q:0,r:0},{q:6,r:0})).toBe(6);
  });
  it('neighbors count', () => {
    expect(hexNeighbors({q:0,r:0}).length).toBe(6);
  });
});
