"""Reference plates for the first lesson, drawn with matplotlib.

The lesson's own charts run in the browser and must: §15.1 requires a changed input to produce a
run, and a picture rendered on somebody's laptop last Tuesday is not a simulation result. What a
plotting library can honestly do here is what the PySAM harness already does for the sizing — take
the same engine's output and render a fixed reference the repository carries, so a reader without
the application can see what the card claims, and so the claim can be argued with.

The plate that matters is the second one. The lesson's two gauges — charge level above, cell voltage
below — rest on one property of this chemistry: the voltage is nearly flat across the middle of the
range, so a voltmeter is a bad fuel gauge. That is measured here and printed, and
`src/tests/plateau.test.ts` holds the interface copy to the number this prints.

    python3 validation/plates.py     (after `npm run plates` has written lesson1.json)
"""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

HERE = Path(__file__).parent
PLATES = HERE.parent / 'docs' / 'plates'
INK, SLATE, LINE = '#1A1F1C', '#5C6B63', '#D8DEDA'
COLOURS = {'dc': '#78A134', 'ac': '#3E93C8', 'asked': '#9478CE',
           'conv': '#B58621', 'batt': '#E2685E', 'aux': '#21A087'}


def style(ax, xlabel, ylabel):
    ax.set_xlabel(xlabel, fontsize=8, color=SLATE)
    ax.set_ylabel(ylabel, fontsize=8, color=SLATE)
    ax.tick_params(labelsize=7.5, colors=SLATE)
    for side in ('top', 'right'):
        ax.spines[side].set_visible(False)
    for side in ('left', 'bottom'):
        ax.spines[side].set_color(LINE)
    ax.grid(True, linewidth=.4, color=LINE, alpha=.7)
    ax.set_axisbelow(True)


def plate_converter(runs) -> Path:
    """What was asked, what crossed the battery terminals, and what reached the connection."""
    fig, axes = plt.subplots(2, 2, figsize=(9.5, 5.6), constrained_layout=True)
    for ax, run in zip(axes.flat, runs):
        m = run['minutes']
        ax.plot(m, run['requestedKW'], color=COLOURS['asked'], lw=1.1, ls='--', label='Asked for')
        ax.plot(m, run['dcKW'], color=COLOURS['dc'], lw=1.4, label='Battery side')
        ax.plot(m, run['acKW'], color=COLOURS['ac'], lw=1.4, label='At the connection')
        ax.set_title(run['label'], fontsize=9, color=INK, loc='left')
        style(ax, 'Minute', 'kW')
        ax.legend(fontsize=7, frameon=False)
    fig.suptitle('Lesson 1 — the converter, four occasions', fontsize=11, color=INK, x=.01, ha='left')
    out = PLATES / 'lesson-1-converter.png'
    fig.savefig(out, dpi=150)
    plt.close(fig)
    return out


def plate_plateau(run) -> tuple[Path, float, float, float, float, float]:
    """Cell voltage against charge level — the reason the card draws two gauges and not one."""
    soc = [v * 100 for v in run['soc']]
    volts = run['cellV']
    # The closing sample dispatches nothing, so the terminal voltage rebounds to open circuit: a
    # real effect and not part of the plateau, so it is drawn and excluded rather than smoothed.
    under_load = list(zip(soc[:-1], volts[:-1]))
    lo_soc, hi_soc = min(s for s, _ in under_load), max(s for s, _ in under_load)
    spread = max(v for _, v in under_load) - min(v for _, v in under_load)

    fig, (ax, bx) = plt.subplots(1, 2, figsize=(9.5, 3.4), constrained_layout=True)
    ax.plot([s for s, _ in under_load], [v for _, v in under_load], color=COLOURS['dc'], lw=1.6)
    ax.plot(soc[-2:], volts[-2:], color=COLOURS['batt'], lw=1.2, ls=':')
    ax.annotate('current stops;\nterminal voltage\nrebounds to open circuit',
                xy=(soc[-1], volts[-1]), xytext=(soc[-1] + 6, volts[-1] + .004),
                fontsize=6.5, color=SLATE,
                arrowprops=dict(arrowstyle='-', color=SLATE, lw=.6))
    ax.axvspan(lo_soc, hi_soc, color='#78A134', alpha=.08)
    ax.invert_xaxis()
    style(ax, 'Charge level (%)', 'V per cell')
    ax.set_title(f'Flat under load: {spread * 1000:.0f} mV across {hi_soc:.0f}% to {lo_soc:.0f}% charge',
                 fontsize=9, color=INK, loc='left')

    m = run['minutes']
    bx.plot(m, soc, color=COLOURS['dc'], lw=1.5, label='Charge level (%)')
    bx2 = bx.twinx()
    bx2.plot(m, volts, color=COLOURS['ac'], lw=1.5, label='V per cell')
    bx2.tick_params(labelsize=7.5, colors=SLATE)
    bx2.set_ylabel('V per cell', fontsize=8, color=SLATE)
    style(bx, 'Minute', 'Charge level (%)')
    bx.set_title('One empties; the other barely moves', fontsize=9, color=INK, loc='left')

    out = PLATES / 'lesson-1-plateau.png'
    fig.savefig(out, dpi=150)
    plt.close(fig)
    return (out, spread, min(v for _, v in under_load), max(v for _, v in under_load),
            lo_soc, hi_soc)


def main() -> int:
    PLATES.mkdir(parents=True, exist_ok=True)
    runs = json.loads((HERE / 'lesson1.json').read_text())['runs']
    by_id = {r['id']: r for r in runs}
    print('wrote', plate_converter(runs).relative_to(HERE.parent))
    out, spread, lo, hi, lo_soc, hi_soc = plate_plateau(by_id['evening'])
    print('wrote', out.relative_to(HERE.parent))
    print(f'plateau: {spread * 1000:.1f} mV under load across {hi_soc:.0f}%-{lo_soc:.0f}% '
          f'charge ({lo:.3f}-{hi:.3f} V per cell)')
    (HERE / 'plateau.json').write_text(json.dumps(
        {'spreadV': spread, 'lowV': lo, 'highV': hi,
         'fromSoc': hi_soc / 100, 'toSoc': lo_soc / 100}, indent=1))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
