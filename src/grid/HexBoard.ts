import { hexDistance, hexNeighbors } from './HexMath';
import type { Axial, TileType } from '../types/game';
import { TileType as TT } from '../types/game';

export interface Tile { q:number; r:number; type: TileType; }

const RADIUS = 6;

export class HexBoard {
  radius = RADIUS;
  tiles: Map<string, Tile> = new Map();
  routes: Axial[][] = [];
  portals: Axial[] = [];
  constructor() { this.build(); }

  build() {
    this.tiles.clear();
    for (let q = -RADIUS; q <= RADIUS; q++) {
      for (let r = -RADIUS; r <= RADIUS; r++) {
        if (hexDistance({q,r},{q:0,r:0}) > RADIUS) continue;
        this.tiles.set(`${q},${r}`, { q, r, type: TT.NORMAL });
      }
    }
    // core
    const core = this.tiles.get('0,0'); if (core) core.type = TT.CORE;
    // portals
    const portalCoords = [{q:-6,r:0}, {q:6,r:-6}, {q:0,r:6}];
    this.portals = portalCoords;
    for (const p of portalCoords) {
      const t = this.tiles.get(`${p.q},${p.r}`); if (t) t.type = TT.PORTAL;
    }
    // routes (official level design)
    const routeA: Axial[] = [
      {q:-6,r:0},{q:-5,r:0},{q:-4,r:-1},{q:-3,r:-1},
      {q:-3,r:0},{q:-2,r:0},{q:-2,r:1},
      {q:-1,r:1},{q:-1,r:0},{q:0,r:0}
    ];
    const routeB: Axial[] = [
      {q:6,r:-6},{q:5,r:-5},{q:5,r:-4},{q:4,r:-3},
      {q:3,r:-3},{q:3,r:-2},{q:2,r:-2},
      {q:2,r:-1},{q:1,r:-1},{q:0,r:0}
    ];
    const routeC: Axial[] = [
      {q:0,r:6},{q:0,r:5},{q:1,r:4},{q:1,r:3},
      {q:0,r:3},{q:-1,r:3},{q:-1,r:2},
      {q:0,r:2},{q:0,r:1},{q:0,r:0}
    ];
    this.routes = [routeA, routeB, routeC];
    for (const route of this.routes) {
      for (const c of route) {
        const t = this.tiles.get(`${c.q},${c.r}`);
        if (t && t.type !== TT.CORE && t.type !== TT.PORTAL) t.type = TT.ROUTE;
      }
    }
    // restricted decorative: some outer ring non-route tiles? leave buildable
  }

  tile(q:number,r:number): Tile | undefined { return this.tiles.get(`${q},${r}`); }
  inBounds(q:number,r:number): boolean { return this.tiles.has(`${q},${r}`); }
  isBuildable(q:number,r:number): boolean {
    const t = this.tile(q,r);
    return !!t && t.type === TT.NORMAL;
  }
  allTiles(): Tile[] { return [...this.tiles.values()]; }
  neighbors(a: Axial): Axial[] { return hexNeighbors(a).filter(n => this.inBounds(n.q,n.r)); }
}
