'use client';
import { useEffect, useRef } from 'react';
import type { SizingResult } from '../../sizing/engine';

/**
 * The isometric scene behind the build sequence.
 *
 * One continuous camera move rather than five separate pictures: the duty cycle is read on an
 * empty pad, the camera flies into a single pack as its cells fill in, pulls back while the
 * enclosure assembles around that same pack, then pulls back again as the rest of the fleet lands
 * beside it. Nothing is re-staged between steps, so the plant the customer ends up looking at is
 * visibly the one that was built in front of them.
 *
 * Drawn on a 2D canvas, like the landing hero, so the 3D bundle stays out of the path between the
 * opening question and the workbench.
 */

export const STAGE_MS = 2200;
export const STAGE_COUNT = 5;
/** Beyond this the yard reads as a texture rather than a count, and the frame rate suffers. */
export const MAX_DRAWN = 18;

const L = 240, W = 82, H = 92;
const COS = Math.cos(Math.PI / 6), SIN = Math.sin(Math.PI / 6);
const GAP_X = 74, GAP_Z = 58;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const span = (now: number, from: number, to: number) => clamp01((now - from) / (to - from));

type Cam = { scale: number; fx: number; fy: number; fz: number };

export function BuildScene({ sizing, className }: { sizing: SizingResult; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // The scene reads the sizing once; re-sizing mid-sequence would restage the plant underfoot.
  const spec = useRef(sizing);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const s = spec.current;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Rack and pack counts come from the real enclosure, capped at what stays legible.
    const banks = 2;
    const columns = Math.max(3, Math.min(12, Math.round(s.enclosure.racks / banks) || 6));
    const levels = Math.max(2, Math.min(5, s.enclosure.packsPerRack || 4));
    const pitch = L / columns, packW = pitch * 0.72, packH = (H - 18) / levels * 0.76, packD = W * 0.32;
    const bankZ = [W * 0.09, W * 0.59];
    const packAt = (column: number, bank: number, level: number) => ({
      x: 8 + column * pitch, y: 11 + level * ((H - 18) / levels), z: bankZ[bank],
    });
    // The pack the camera flies into, and the one the enclosure is later built around.
    const hero = packAt(Math.floor(columns / 2), 0, Math.min(1, levels - 1));

    const drawn = Math.min(s.units, MAX_DRAWN);
    const perRow = Math.max(1, Math.min(drawn, Math.ceil(Math.sqrt(drawn * 1.7))));
    const rows = Math.ceil(drawn / perRow);
    const origin = (i: number) => ({ x: Math.floor(i / perRow) * (L + GAP_X), z: (i % perRow) * (W + GAP_Z) });
    const yardX = rows * (L + GAP_X) - GAP_X, yardZ = perRow * (W + GAP_Z) - GAP_Z;

    // The day the plant is being sized for, placed so charge and discharge do not overlap.
    const dischargeStart = 17, chargeStart = 8;
    const inWindow = (hour: number, start: number, length: number) =>
      length > 0 && (hour - start + 24) % 24 < Math.max(length, 0.5);

    let width = 0, height = 0, raf = 0, start = 0;
    const cam: Cam = { scale: 1, fx: 0, fy: 0, fz: 0 };
    let fitOne = 1, fitYard = 1, primed = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width; height = rect.height;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fit = (ex: number, ez: number, ey: number, margin: number) => Math.min(
        width / ((ex + ez) * COS * margin),
        height / (((ex + ez) * SIN + ey) * margin * 1.22),
      );
      fitOne = fit(L, W, H, 1.55);
      fitYard = fit(yardX, yardZ, H, 1.42);
      primed = false;
    };

    /** Where the camera wants to be for the stage that `t` falls in. */
    const target = (t: number): Cam => {
      const stage = Math.min(STAGE_COUNT - 1, Math.floor(t / STAGE_MS));
      if (stage === 0) return { scale: fitOne * 0.92, fx: L / 2, fy: H * 0.34, fz: W / 2 };
      if (stage === 1) return { scale: fitOne * 3.2, fx: hero.x + packW / 2, fy: hero.y + packH / 2, fz: hero.z + packD / 2 };
      if (stage === 2) return { scale: fitOne * 0.99, fx: L / 2, fy: H * 0.46, fz: W / 2 };
      return { scale: fitYard * (stage === 3 ? 1 : 0.94), fx: yardX / 2, fy: H * 0.5, fz: yardZ / 2 };
    };

    let ox = 0, oy = 0;
    const px = (x: number, z: number) => ox + (x - z) * COS * cam.scale;
    const py = (x: number, y: number, z: number) => oy + ((x + z) * SIN - y) * cam.scale;
    const edge = (a: number[], b: number[]) => {
      ctx.moveTo(px(a[0], a[2]), py(a[0], a[1], a[2]));
      ctx.lineTo(px(b[0], b[2]), py(b[0], b[1], b[2]));
    };
    /** Wireframe box, back faces omitted: the near three edges are enough to read the volume. */
    const box = (x: number, y: number, z: number, dx: number, dy: number, dz: number) => {
      const x1 = x + dx, y1 = y + dy, z1 = z + dz;
      edge([x, y, z], [x1, y, z]); edge([x1, y, z], [x1, y1, z]);
      edge([x1, y1, z], [x, y1, z]); edge([x, y1, z], [x, y, z]);
      edge([x, y, z], [x, y, z1]); edge([x, y1, z], [x, y1, z1]);
      edge([x, y, z1], [x, y1, z1]); edge([x1, y1, z], [x1, y1, z1]);
    };
    /** All twelve edges. Used only for the pack the camera sits inside, which needs to contain
        its cells rather than let them read as hanging below it. */
    const cage = (x: number, y: number, z: number, dx: number, dy: number, dz: number) => {
      const x1 = x + dx, y1 = y + dy, z1 = z + dz;
      for (const zz of [z, z1]) {
        edge([x, y, zz], [x1, y, zz]); edge([x1, y, zz], [x1, y1, zz]);
        edge([x1, y1, zz], [x, y1, zz]); edge([x, y1, zz], [x, y, zz]);
      }
      edge([x, y, z], [x, y, z1]); edge([x1, y, z], [x1, y, z1]);
      edge([x1, y1, z], [x1, y1, z1]); edge([x, y1, z], [x, y1, z1]);
    };

    const frame = (now: number) => {
      if (!start) start = now;
      const t = reduced ? STAGE_MS * STAGE_COUNT : now - start;
      const want = target(t);
      if (!primed) { Object.assign(cam, want); primed = true; }
      // Smoothed in log space so a fivefold change of scale paces like a single move.
      cam.scale = Math.exp(Math.log(cam.scale) + (Math.log(want.scale) - Math.log(cam.scale)) * 0.055);
      cam.fx += (want.fx - cam.fx) * 0.055;
      cam.fy += (want.fy - cam.fy) * 0.055;
      cam.fz += (want.fz - cam.fz) * 0.055;
      ox = width / 2 - (cam.fx - cam.fz) * COS * cam.scale;
      oy = height * 0.52 - ((cam.fx + cam.fz) * SIN - cam.fy) * cam.scale;

      ctx.clearRect(0, 0, width, height);

      const S = STAGE_MS;
      const grid = span(t, 120, 900);
      const duty = span(t, 240, 1000) * (1 - span(t, S + 150, S + 750));
      const cellFill = span(t, S + 150, 2 * S - 250);
      const packFill = span(t, 2 * S + 60, 3 * S - 520);
      const bus = span(t, 2 * S + 640, 3 * S - 260);
      const coolant = span(t, 2 * S + 860, 3 * S - 120);
      const shell = span(t, 2 * S + 1020, 3 * S);
      const yard = span(t, 3 * S + 80, 4 * S - 180);
      const skids = span(t, 3 * S + 760, 4 * S);
      const sweep = span(t, 4 * S + 240, 5 * S - 260);

      // Ground datum. It spans the whole yard once the fleet is on it.
      const padX = yard > 0 ? yardX : L, padZ = yard > 0 ? yardZ : W;
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(255,255,255,${0.055 * grid})`;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        edge([-26 + (i * (padX + 52)) / 8, 0, -26], [-26 + (i * (padX + 52)) / 8, 0, padZ + 26]);
        edge([-26, 0, -26 + (i * (padZ + 52)) / 8], [padX + 26, 0, -26 + (i * (padZ + 52)) / 8]);
      }
      ctx.stroke();

      // Step 1 — the duty cycle, read across a day on the empty pad.
      if (duty > 0.001) {
        const tall = H * 0.78, barW = (L / 24) * 0.56;
        for (let hour = 0; hour < 24; hour++) {
          const local = clamp01((duty - (hour / 24) * 0.55) / 0.45);
          if (local <= 0) continue;
          const charging = inWindow(hour, chargeStart, s.input.chargeDurationH);
          const discharging = inWindow(hour, dischargeStart, s.effectiveDurationH);
          const x = (hour / 24) * L + (L / 24 - barW) / 2;
          const h = (discharging ? tall : charging ? tall * 0.74 : tall * 0.07) * easeOut(local);
          ctx.strokeStyle = discharging ? `rgba(147,190,73,${0.85 * duty})`
            : charging ? `rgba(79,168,218,${0.8 * duty})` : `rgba(255,255,255,${0.14 * duty})`;
          ctx.lineWidth = discharging || charging ? 1.3 : 1;
          ctx.beginPath();
          box(x, 0, W * 0.42, barW, h, W * 0.16);
          ctx.stroke();
        }
      }

      // Step 2 — the hero pack, and the cells inside it.
      if (cellFill > 0.001 && shell < 1) {
        const alpha = 1 - 0.55 * span(t, 3 * S, 4 * S);
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = `rgba(214,234,247,${0.95 * alpha})`;
        ctx.beginPath();
        cage(hero.x, hero.y, hero.z, packW, packH, packD);
        ctx.stroke();
        const across = 8, deep = 5;
        ctx.lineWidth = 1.1;
        for (let c = 0; c < across; c++) {
          for (let d = 0; d < deep; d++) {
            const local = clamp01((cellFill - (c / across) * 0.5 - (d / deep) * 0.32) / 0.3);
            if (local <= 0) continue;
            const cw = packW / across;
            ctx.strokeStyle = `rgba(116,182,232,${0.8 * local * alpha})`;
            ctx.beginPath();
            box(hero.x + c * cw + cw * 0.14, hero.y + packH * 0.1, hero.z + (d / deep) * packD,
              cw * 0.72, packH * 0.8, packD / deep * 0.7);
            ctx.stroke();
          }
        }
      }

      /** One enclosure: its packs, its distribution, and the envelope that closes around them. */
      const container = (bx: number, bz: number, fill: number, close: number, alpha: number) => {
        if (fill > 0.001) {
          ctx.lineWidth = 1;
          for (let column = 0; column < columns; column++) {
            for (let bank = 0; bank < banks; bank++) {
              for (let level = 0; level < levels; level++) {
                const p = packAt(column, bank, level);
                const delay = (column / columns) * 0.5 + (level / levels) * 0.26 + bank * 0.08;
                const local = clamp01((fill - delay) / (1 - delay || 1));
                if (local <= 0) continue;
                const drop = (1 - easeOut(local)) * 30;
                ctx.strokeStyle = `rgba(150,186,212,${0.46 * local * alpha})`;
                ctx.beginPath();
                box(bx + p.x, p.y - drop, bz + p.z, packW, packH, packD);
                ctx.stroke();
              }
            }
          }
        }
        if (bus > 0.001) {
          const reach = 8 + easeOut(bus) * (L - 16);
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = `rgba(232,142,63,${0.8 * bus * alpha})`;
          ctx.beginPath();
          for (const z of bankZ) edge([bx + 8, H - 14, bz + z + packD / 2], [bx + reach, H - 14, bz + z + packD / 2]);
          ctx.stroke();
          ctx.lineWidth = 1;
          ctx.strokeStyle = `rgba(232,142,63,${0.34 * bus * alpha})`;
          ctx.beginPath();
          for (let column = 0; column < columns; column++) {
            const p = packAt(column, 0, levels - 1);
            if (p.x > reach) continue;
            for (const z of bankZ) edge([bx + p.x + packW / 2, H - 14, bz + z + packD / 2], [bx + p.x + packW / 2, p.y + packH, bz + z + packD / 2]);
          }
          ctx.stroke();
        }
        if (coolant > 0.001) {
          const reach = 8 + easeOut(coolant) * (L - 16);
          ctx.lineWidth = 1.4;
          for (const [offset, colour] of [[0, '79,168,218'], [5, '226,104,94']] as const) {
            ctx.strokeStyle = `rgba(${colour},${0.7 * coolant * alpha})`;
            ctx.beginPath();
            edge([bx + 8, 7 + offset, bz + W * 0.5], [bx + reach, 7 + offset, bz + W * 0.5]);
            ctx.stroke();
          }
        }
        if (close > 0.001) {
          const e = easeOut(close);
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = `rgba(255,255,255,${0.46 * e * alpha})`;
          ctx.beginPath();
          box(bx, 0, bz, L, H, W);
          ctx.stroke();
          // Door bays along the near side, the detail that makes it read as a container.
          const bays = Math.max(2, s.enclosure.doorBaysPerSide || 4);
          ctx.strokeStyle = `rgba(255,255,255,${0.2 * e * alpha})`;
          ctx.beginPath();
          for (let i = 1; i < bays; i++) edge([bx + (i / bays) * L, 4, bz + W], [bx + (i / bays) * L, H - 6, bz + W]);
          ctx.stroke();
        }
      };

      // Step 3 assembles the first enclosure; step 4 lands the rest of the fleet beside it.
      const units: number[] = [];
      if (packFill > 0.001) units.push(0);
      for (let i = 1; i < drawn; i++) if (yard > (i / drawn) * 0.85) units.push(i);
      // Painter's order: depth in this projection is x + z, so the far units are drawn first.
      units.sort((a, b) => {
        const oa = origin(a), ob = origin(b);
        return oa.x + oa.z - (ob.x + ob.z);
      });
      for (const i of units) {
        const o = origin(i);
        const local = i === 0 ? 1 : easeOut(clamp01((yard - (i / drawn) * 0.85) / 0.15));
        container(o.x, o.z - (1 - local) * 46, i === 0 ? packFill : local, i === 0 ? shell : local, local);
      }

      // Power conversion, one skid per enclosure, at the end of each row.
      if (skids > 0.001) {
        ctx.lineWidth = 1.2;
        for (let i = 0; i < units.length; i++) {
          const local = clamp01((skids - (i / Math.max(units.length, 1)) * 0.6) / 0.4);
          if (local <= 0) continue;
          const o = origin(units[i]);
          ctx.strokeStyle = `rgba(147,190,73,${0.5 * local})`;
          ctx.beginPath();
          box(o.x + L + 12, 0, o.z + W * 0.3, 34, H * 0.42, W * 0.42);
          ctx.stroke();
        }
      }

      // Step 5 — a single commissioning sweep across the finished plant.
      if (sweep > 0.001 && sweep < 1) {
        const at = sweep * (yardX + yardZ + 60) - 30;
        ctx.lineWidth = 2;
        const gradient = ctx.createLinearGradient(px(at, 0), 0, px(at - 60, 0), 0);
        gradient.addColorStop(0, `rgba(147,190,73,${0.5 * (1 - sweep)})`);
        gradient.addColorStop(1, 'rgba(147,190,73,0)');
        ctx.strokeStyle = gradient;
        ctx.beginPath();
        edge([Math.min(at, yardX), 0, Math.max(0, at - yardX)], [Math.min(at, yardX), H * 1.2, Math.max(0, at - yardX)]);
        ctx.stroke();
      }

      if (!reduced || t < STAGE_MS * STAGE_COUNT + 400) raf = requestAnimationFrame(frame);
    };

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
