import { describe, it, expect } from 'vitest';
import { HexBoard } from '../src/grid/HexBoard';
import { hexDistance } from '../src/grid/HexMath';

// The official battlefield: CENTRAL REACTOR FORTRESS
// Route A portal (-6,0), Route B portal (6,-6), Route C portal (0,6), reactor (0,0)

describe('battlefield: CENTRAL REACTOR FORTRESS', () => {
  const board = new HexBoard();

  it('has radius 6 with 127 hexes', () => {
    expect(board.radius).toBe(6);
    expect(board.allTiles().length).toBe(127);
  });

  it('places the reactor at (0,0) and marks it non-buildable', () => {
    const core = board.tile(0, 0)!;
    expect(core.type).toBe('CORE');
    expect(board.isBuildable(0, 0)).toBe(false);
  });

  it('places the three portals at the designed coordinates', () => {
    expect(board.portals).toEqual([
      { q: -6, r: 0 },   // Route A — Western approach
      { q: 6, r: -6 },   // Route B — Northeast approach
      { q: 0, r: 6 },    // Route C — Southeast approach
    ]);
    for (const p of board.portals) {
      expect(board.tile(p.q, p.r)!.type).toBe('PORTAL');
      expect(board.isBuildable(p.q, p.r)).toBe(false);
    }
  });

  describe('routes', () => {
    const expected: { name: string; cells: [number, number][] }[] = [
      {
        name: 'ROUTE A — WESTERN APPROACH',
        cells: [[-6,0],[-5,0],[-4,-1],[-3,-1],[-3,0],[-2,0],[-2,1],[-1,1],[-1,0],[0,0]],
      },
      {
        name: 'ROUTE B — NORTHEAST APPROACH',
        cells: [[6,-6],[5,-5],[5,-4],[4,-3],[3,-3],[3,-2],[2,-2],[2,-1],[1,-1],[0,0]],
      },
      {
        name: 'ROUTE C — SOUTHEAST APPROACH',
        cells: [[0,6],[0,5],[1,4],[1,3],[0,3],[-1,3],[-1,2],[0,2],[0,1],[0,0]],
      },
    ];

    it('matches the designed path cells exactly', () => {
      expect(board.routes.length).toBe(3);
      board.routes.forEach((route, i) => {
        expect(route.map(c => [c.q, c.r])).toEqual(expected[i].cells);
      });
    });

    it('every route cell exists on the board', () => {
      for (const route of board.routes) {
        for (const c of route) {
          expect(board.inBounds(c.q, c.r)).toBe(true);
        }
      }
    });

    it('consecutive route cells are adjacent (9 movement segments)', () => {
      for (const route of board.routes) {
        expect(route.length).toBe(10);
        for (let i = 1; i < route.length; i++) {
          expect(hexDistance(route[i - 1], route[i]), `segment ${i}`).toBe(1);
        }
      }
    });

    it('all routes terminate at the reactor and start at their portal', () => {
      board.routes.forEach((route, i) => {
        expect(route[0]).toEqual(board.portals[i]);
        expect(route[route.length - 1]).toEqual({ q: 0, r: 0 });
      });
    });

    it('routes converge only at the reactor (no shared intermediate cells)', () => {
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          const a = new Set(board.routes[i].slice(0, -1).map(c => `${c.q},${c.r}`));
          const shared = board.routes[j].slice(0, -1).filter(c => a.has(`${c.q},${c.r}`));
          expect(shared, `routes ${i} and ${j} overlap`).toEqual([]);
        }
      }
    });

    it('route tiles are permanently non-buildable', () => {
      for (const route of board.routes) {
        for (const c of route) {
          expect(board.isBuildable(c.q, c.r), `(${c.q},${c.r})`).toBe(false);
        }
      }
    });
  });

  it('keeps plenty of buildable tiles in inner/middle/outer zones', () => {
    const buildable = board.allTiles().filter(t => t.type === 'NORMAL');
    // 127 - 1 core - 3 portals - 24 route-only cells (27 route cells - 1 core - 2 portals already counted)
    expect(buildable.length).toBe(127 - 1 - 3 - 24);
    // inner ring next to the reactor has buildable cells
    const inner = buildable.filter(t => hexDistance({ q: t.q, r: t.r }, { q: 0, r: 0 }) === 1);
    expect(inner.length).toBeGreaterThan(0);
  });

  it('the recommended first-tower cell (-1,-1) is buildable and covers route A', () => {
    expect(board.isBuildable(-1, -1)).toBe(true);
    const distToRouteA = board.routes[0].map(c => hexDistance({ q: -1, r: -1 }, c));
    expect(Math.min(...distToRouteA)).toBe(1);
  });
});
