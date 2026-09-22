import { describe, expect, it } from 'vitest';
import { planSite, sitePrimitives, type SiteSpec } from '../geometry/site';
import { buildModel } from '../domain/model';
import { defaults } from '../config/schema';
import { defaultSizingInput, sizeSystem } from '../sizing/engine';
import { byId, enclosures } from '../catalog/products';

const enclosure = buildModel(structuredClone(defaults)).dimensions.enclosure;
const spec = (over: Partial<SiteSpec> = {}): SiteSpec => ({
  units: 7, laterUnits: 0, model: 'SWESLC1331.2V314Ah', enclosure, modelled: true,
  pcsCount: 4, pcsModel: 'PCS 2507.5 kW', pcsKW: 2507.5,
  transformerCount: 2, transformerMVA: 6.3, energyMWh: 35.11, powerMW: 8, ...over,
});

describe('the site layout', () => {
  it('places every unit and every piece of conversion kit', () => {
    const plan = planSite(spec());
    expect(plan.placements.filter(p => p.kind === 'container')).toHaveLength(7);
    expect(plan.placements.filter(p => p.kind === 'pcs')).toHaveLength(4);
    expect(plan.placements.filter(p => p.kind === 'transformer')).toHaveLength(2);
    expect(new Set(plan.placements.map(p => p.id)).size).toBe(plan.placements.length);
  });

  it('never overlaps two containers', () => {
    for (const units of [2, 5, 7, 12, 22, 40]) {
      const boxes = planSite(spec({ units })).placements.filter(p => p.kind === 'container');
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const apart = Math.abs(a.position[0] - b.position[0]) >= (a.size[0] + b.size[0]) / 2 - 1e-9
          || Math.abs(a.position[2] - b.position[2]) >= (a.size[2] + b.size[2]) / 2 - 1e-9;
        expect(apart, `${units} units: ${a.id} overlaps ${b.id}`).toBe(true);
      }
    }
  });

  it('keeps the separations the layout claims to leave', () => {
    const plan = planSite(spec({ units: 12 }));
    const units = plan.placements.filter(p => p.kind === 'container');
    // Neighbours within a row are a side gap apart; neighbouring rows are an access road apart.
    const zs = [...new Set(units.map(p => Number(p.position[2].toFixed(4))))].sort((a, b) => a - b);
    for (let i = 1; i < zs.length; i++) expect(zs[i] - zs[i - 1]).toBeCloseTo(enclosure[2] + plan.sideGap, 6);
    const xs = [...new Set(units.map(p => Number(p.position[0].toFixed(4))))].sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(enclosure[0] + plan.rowGap, 6);
  });

  it('holds everything inside the fenced plot, and wastes no side of it', () => {
    for (const units of [1, 3, 9, 30]) {
      const plan = planSite(spec({ units }));
      let marginX = Infinity, marginZ = Infinity;
      for (const p of plan.placements) {
        const outX = plan.plot[0] / 2 - (Math.abs(p.position[0]) + p.size[0] / 2);
        const outZ = plan.plot[1] / 2 - (Math.abs(p.position[2]) + p.size[2] / 2);
        expect(outX, `${units} units: ${p.id} is outside the plot in X`).toBeGreaterThanOrEqual(-1e-6);
        expect(outZ, `${units} units: ${p.id} is outside the plot in Z`).toBeGreaterThanOrEqual(-1e-6);
        marginX = Math.min(marginX, outX); marginZ = Math.min(marginZ, outZ);
      }
      // The conversion bay hangs off one end. Centring the containers alone would leave the far
      // side of the plot empty, so the smallest setback has to be the intended one on every side.
      expect(marginX, `${units} units`).toBeCloseTo(5, 6);
      expect(marginZ, `${units} units`).toBeCloseTo(5, 6);
      expect(plan.areaM2).toBeCloseTo(plan.plot[0] * plan.plot[1], 6);
    }
  });

  it('draws a site far more cheaply than a fleet of full assemblies', () => {
    // One container is 4,992 cells. Drawing twenty-two of those would be a quarter of a million
    // boxes; the site has to stay a shell per unit or it will not hold a frame rate.
    const plan = planSite(spec({ units: 22 }));
    expect(sitePrimitives(plan, '').length).toBeLessThan(1000);
  });

  it('lays out the product the project chose, not the one the studio can draw inside', () => {
    // Three of the catalogue's five systems have no modelled interior. The plot still has to be
    // right for them, or a site of 1.4 m cabinets is drawn as a site of 20-foot containers.
    const cabinet = byId(enclosures, 'enc-261-ci');
    const size: [number, number, number] = [cabinet.lengthMm / 1000, cabinet.heightMm / 1000, cabinet.widthMm / 1000];
    const plan = planSite(spec({ units: 20, model: cabinet.model, enclosure: size, modelled: false }));
    for (const unit of plan.placements.filter(p => p.kind === 'container')) expect(unit.size).toEqual(size);
    expect(plan.plot[0]).toBeLessThan(planSite(spec({ units: 20 })).plot[0]);
    expect(cabinet.studioPreset).toBeNull();
  });

  it('reserves a pad for every unit the augmentation schedule will add', () => {
    // The fence goes up once. A project that augments in year eight has to have leased the ground
    // on day one, so the field is laid out for the fleet it ends with.
    const plan = planSite(spec({ units: 7, laterUnits: 3 }));
    expect(plan.placements.filter(p => p.kind === 'container')).toHaveLength(7);
    expect(plan.placements.filter(p => p.kind === 'reserved')).toHaveLength(3);
    const day1 = planSite(spec({ units: 7, laterUnits: 0 }));
    expect(plan.areaM2).toBeGreaterThan(day1.areaM2);
    // Reserved pads are laid out on the same grid as the units, not squeezed in beside them.
    const all = plan.placements.filter(p => p.kind === 'container' || p.kind === 'reserved');
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      expect(Math.abs(a.position[0] - b.position[0]) >= (a.size[0] + b.size[0]) / 2 - 1e-9
        || Math.abs(a.position[2] - b.position[2]) >= (a.size[2] + b.size[2]) / 2 - 1e-9,
        `${a.id} overlaps ${b.id}`).toBe(true);
    }
  });

  it('agrees with what the sizing said the project needs', () => {
    const sized = sizeSystem({ ...defaultSizingInput(), powerMW: 8, durationH: 4 });
    const plan = planSite(spec({ units: sized.units, pcsCount: sized.pcsCount }));
    expect(plan.placements.filter(p => p.kind === 'container')).toHaveLength(sized.units);
    expect(plan.placements.filter(p => p.kind === 'pcs')).toHaveLength(sized.pcsCount);
  });
});
