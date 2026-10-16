import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';

describe('smoke', () => {
  it('instantiates and runs', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><canvas id="c"></canvas><div id="u"></div></body></html>', { url: 'http://localhost' });
    (globalThis as any).window = dom.window;
    (globalThis as any).document = dom.window.document;
    (globalThis as any).HTMLCanvasElement = dom.window.HTMLCanvasElement;
    (globalThis as any).CanvasRenderingContext2D = dom.window.CanvasRenderingContext2D;
    const canvas = dom.window.document.getElementById('c') as any;
    // mock getContext
    canvas.getContext = () => ({
      setTransform(){}, clearRect(){}, fillRect(){}, strokeRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, closePath(){}, fill(){}, stroke(){}, arc(){}, fillText(){}, save(){}, restore(){}, translate(){}, rotate(){}, scale(){}, createLinearGradient(){return{addColorStop(){}};}, createRadialGradient(){return{addColorStop(){}};}, drawImage(){},
    });
    canvas.getBoundingClientRect = () => ({left:0,top:0,width:800,height:600});
    const { Game } = await import('../src/Game');
    const uiRoot = dom.window.document.getElementById('u') as any;
    const g = new Game(canvas, uiRoot);
    // run a few updates
    for (let i=0;i<5;i++) g.update(1/60);
    g.startRun('COMMANDER' as any);
    for (let i=0;i<10;i++) g.update(1/60);
    expect(g.state).toBeDefined();
  });
});
