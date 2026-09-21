'use client';
import { useEffect, useRef } from 'react';

/**
 * The enclosure assembling itself out of cells and wiring.
 *
 * Isometric, drawn on a 2D canvas rather than in three.js so the first page of the site stays
 * light: the 3D studio's bundle is not pulled in until somebody opens it.
 *
 * The sequence is deterministic — cells settle, busbars run, the coolant loop closes, the envelope
 * draws, a scan passes — so the reveal lands on the same frame every time. Anyone who has asked
 * their system not to animate gets the finished assembly immediately.
 */

const COLUMNS = 14, BANKS = 2, LEVELS = 4, CELLS_PER_PACK = 7;
const PHASE = {
  cells: [0, 1500], bus: [1150, 2500], coolant: [1600, 2850], shell: [2050, 3150],
  scan: [2700, 3700],
  // Once the assembly is complete it recedes, handing the frame to the wordmark.
  recede: [2900, 4300],
};

type Pack = { x: number; y: number; z: number; bank: number; column: number; level: number; delay: number };

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const span = (now: number, [from, to]: number[]) => Math.min(1, Math.max(0, (now - from) / (to - from)));

export function BessWireframe({ onReveal, className }: { onReveal?: () => void; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const revealed = useRef(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const L = 300, W = 96, H = 108, cos = Math.cos(Math.PI / 6), sin = Math.sin(Math.PI / 6);
    const pitch = L / COLUMNS, packW = pitch * 0.72, packH = (H - 16) / LEVELS, packD = W * 0.34;

    // One pass to lay the fleet out; the frame loop then only interpolates it.
    const packs: Pack[] = [];
    for (let column = 0; column < COLUMNS; column++) {
      for (let bank = 0; bank < BANKS; bank++) {
        for (let level = 0; level < LEVELS; level++) {
          packs.push({
            x: 8 + column * pitch, y: 10 + level * packH, z: bank === 0 ? W * 0.08 : W * 0.58,
            bank, column, level,
            // Settling runs left to right and bottom to top, so the assembly reads as being built.
            delay: (column / COLUMNS) * 0.55 + (level / LEVELS) * 0.25 + bank * 0.08,
          });
        }
      }
    }

    let width = 0, height = 0, scale = 1, ox = 0, oy = 0, raf = 0, start = 0;
    let pointer = 0, pointerTarget = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width; height = rect.height;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Fit the projected bounding box, then sit the model slightly above centre.
      const projW = (L + W) * cos, projH = (L + W) * sin + H;
      scale = Math.min(width / (projW * 1.5), height / (projH * 1.95));
      ox = width / 2 + ((W - L) / 2) * cos * scale;
      oy = height / 2 - ((L + W) / 2 * sin - H / 2) * scale;
    };

    const px = (x: number, z: number) => ox + (x - z) * cos * scale;
    const py = (x: number, y: number, z: number) => oy + ((x + z) * sin - y) * scale;

    const edge = (a: [number, number, number], b: [number, number, number]) => {
      ctx.moveTo(px(a[0], a[2]), py(a[0], a[1], a[2]));
      ctx.lineTo(px(b[0], b[2]), py(b[0], b[1], b[2]));
    };

    const frame = (now: number) => {
      if (!start) start = now;
      const t = reduced ? 4000 : now - start;
      pointer += (pointerTarget - pointer) * 0.06;

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      const recede = easeOut(span(t, PHASE.recede));
      ctx.globalAlpha = 1 - 0.56 * recede;
      ctx.translate(pointer * 16, pointer * -6 + recede * height * 0.06);

      const cells = span(t, PHASE.cells), bus = span(t, PHASE.bus);
      const coolant = span(t, PHASE.coolant), shell = span(t, PHASE.shell), scan = span(t, PHASE.scan);
      const settled = easeOut(cells);

      // Ground grid, a faint datum the assembly sits on.
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(255,255,255,${0.05 * settled})`;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        edge([-20 + (i * (L + 40)) / 6, 0, -20], [-20 + (i * (L + 40)) / 6, 0, W + 20]);
        edge([-20, 0, -20 + (i * (W + 40)) / 6], [L + 20, 0, -20 + (i * (W + 40)) / 6]);
      }
      ctx.stroke();

      // Packs. Each settles from below into its slot, then its cells become legible.
      for (const p of packs) {
        const local = Math.min(1, Math.max(0, (settled - p.delay) / (1 - p.delay || 1)));
        if (local <= 0) continue;
        const e = easeOut(local), drop = (1 - e) * 34, alpha = e;
        const x0 = p.x, x1 = p.x + packW, y0 = p.y - drop, y1 = y0 + packH * 0.74;
        const z0 = p.z, z1 = p.z + packD;

        ctx.strokeStyle = `rgba(150,186,212,${0.5 * alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        edge([x0, y0, z0], [x1, y0, z0]); edge([x1, y0, z0], [x1, y1, z0]);
        edge([x1, y1, z0], [x0, y1, z0]); edge([x0, y1, z0], [x0, y0, z0]);
        edge([x0, y0, z0], [x0, y0, z1]); edge([x0, y1, z0], [x0, y1, z1]);
        edge([x0, y0, z1], [x0, y1, z1]); edge([x1, y1, z0], [x1, y1, z1]);
        ctx.stroke();

        // The cells themselves, as the stack of plates inside each pack.
        ctx.strokeStyle = `rgba(90,150,196,${0.42 * alpha})`;
        ctx.beginPath();
        for (let c = 1; c < CELLS_PER_PACK; c++) {
          const zc = z0 + (c / CELLS_PER_PACK) * packD;
          edge([x0, y0, zc], [x1, y0, zc]);
          edge([x0, y0, zc], [x0, y1, zc]);
        }
        ctx.stroke();
      }

      // Busbars along the top of each bank, drawn progressively left to right.
      if (bus > 0) {
        const reach = 8 + easeOut(bus) * (L - 8);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = `rgba(232,142,63,${0.85 * bus})`;
        ctx.beginPath();
        for (let bank = 0; bank < BANKS; bank++) {
          const z = (bank === 0 ? W * 0.08 : W * 0.58) + packD * 0.5;
          edge([8, 10 + LEVELS * packH - 2, z], [reach, 10 + LEVELS * packH - 2, z]);
        }
        ctx.stroke();

        // Droppers from the bar into each column that the bar has reached.
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(232,142,63,${0.4 * bus})`;
        ctx.beginPath();
        for (const p of packs) {
          if (p.level !== LEVELS - 1 || p.x > reach) continue;
          const z = p.z + packD * 0.5;
          edge([p.x + packW / 2, 10 + LEVELS * packH - 2, z], [p.x + packW / 2, p.y + packH * 0.74, z]);
        }
        ctx.stroke();
      }

      // Coolant supply and return, running the length of the aisle.
      if (coolant > 0) {
        const reach = 8 + easeOut(coolant) * (L - 8);
        ctx.lineWidth = 1.4;
        for (const [offset, colour] of [[0, '79,168,218'], [4, '226,104,94']] as const) {
          ctx.strokeStyle = `rgba(${colour},${0.75 * coolant})`;
          ctx.beginPath();
          edge([8, 6 + offset, W * 0.5], [reach, 6 + offset, W * 0.5]);
          ctx.stroke();
        }
      }

      // Envelope, drawn last so it reads as the shell closing around the assembly.
      if (shell > 0) {
        const e = easeOut(shell);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = `rgba(255,255,255,${0.5 * e})`;
        ctx.beginPath();
        const corners: [number, number, number][] = [[0, 0, 0], [L, 0, 0], [L, 0, W], [0, 0, W]];
        for (let i = 0; i < 4; i++) {
          const a = corners[i], b = corners[(i + 1) % 4];
          edge(a, b);
          edge([a[0], H, a[2]], [b[0], H, b[2]]);
          edge(a, [a[0], H, a[2]]);
        }
        ctx.stroke();
      }

      // A single scan sweep across the model at the moment of the reveal.
      if (scan > 0 && scan < 1) {
        const at = scan * (L + W);
        ctx.lineWidth = 2;
        const gradient = ctx.createLinearGradient(px(at, 0), 0, px(at - 40, 0), 0);
        gradient.addColorStop(0, `rgba(147,190,73,${0.55 * (1 - scan)})`);
        gradient.addColorStop(1, 'rgba(147,190,73,0)');
        ctx.strokeStyle = gradient;
        ctx.beginPath();
        edge([Math.min(at, L), 0, Math.max(0, at - L)], [Math.min(at, L), H, Math.max(0, at - L)]);
        ctx.stroke();
      }

      ctx.restore();

      if (!revealed.current && t >= PHASE.scan[0]) { revealed.current = true; onReveal?.(); }
      if (!reduced || t < 4000) raf = requestAnimationFrame(frame);
    };

    const onPointer = (e: PointerEvent) => { pointerTarget = (e.clientX / window.innerWidth - 0.5) * 2; };

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointer);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('pointermove', onPointer); };
  }, [onReveal]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
