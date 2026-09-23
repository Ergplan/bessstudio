"""Put the studio's own cases through NREL's System Advisor Model, via PySAM.

The point is not that SAM is right and the studio is wrong. It is that two implementations written
from different starting points should agree about the same physics, and wherever they do not, the
disagreement names an assumption somebody has to own. Every quantity here is one both models
genuinely compute; anything only one of them does is left out rather than guessed at.

SAM's battery is configured from the studio's own catalogue — the same cell, the same string
geometry, the same state-of-charge window, the same temperature — so the two are answering the same
question about the same equipment.

Run through `npm run validate`, which writes the cases first. Needs `pip install nrel-pysam`.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import PySAM.BatteryStateful as bs

HERE = Path(__file__).parent

# ------------------------------------------------------- declared assumptions --
#
# Everything SAM needs that the studio's catalogue does not carry. They are here, named, rather
# than buried in the harness, because a cross-check whose own inputs are invented is not a check.

# SAM's Thevenin model needs a DC internal resistance per cell, and the catalogue has no impedance
# field to give it one. This band used to run from 0.18 mOhm, described as the published AC
# impedance for the 314 Ah prismatic in this catalogue, which was not a figure the catalogue
# carried. The only externally published resistance for this cell format that we have is REPT's
# <= 0.3 mOhm for the 314 Ah CB71/CB75 (see `src/catalog/sources.ts`), so the band runs from that
# instead: the optimistic end reads the published ceiling as if it were already DC, and the
# realistic end doubles it, because a data sheet's internal resistance for an LFP prismatic is
# normally the 1 kHz AC impedance and DC resistance runs one and a half to two times it. Neither
# model can settle which it is, so the round-trip check runs at both ends and reports a band.
RESISTANCE_MOHM = {'optimistic': 0.30, 'realistic': 0.60}

# The discharge curve. The catalogue gives a cell's nominal, maximum and minimum voltage and no
# shape between them, and SAM's own `LFPGraphite` preset carries NREL's lifetime configuration
# beside a voltage curve that is NMC-shaped: 4.1 V full, 3.4 V nominal. Left at that it put the
# whole discharge at 3.57 V per cell and claimed a container delivers its entire nameplate across a
# 90% window. These place the Shepherd knees where a published LFP cell actually has them: a short
# drop off the top of charge, then a flat plateau a little above nominal for most of the discharge.
LFP_CURVE = {'vexp': 3.32, 'qexp_fraction': 0.08, 'vnom': 3.20, 'qnom_fraction': 0.88}

# SAM ships three lifetime models. They disagree with each other by more than either disagrees with
# the studio, which is itself the most useful thing this check reports.
LIFE_MODELS = {0: 'NREL cycle + calendar', 1: 'NMC/graphite physics', 2: 'LFP/graphite physics'}

SETTLING_STEPS = 2   # let the thermal and voltage states leave their initial values
MAX_HOURS = 60       # a discharge or charge that has not finished by here is not going to


@dataclass
class Pack:
    """One enclosure, as SAM needs it described."""
    nominal_energy_kwh: float
    nominal_voltage_v: float
    cells_in_series: int
    cell_ah: float
    cell_nominal_v: float
    cell_max_v: float
    cell_min_v: float
    resistance_ohm: float
    min_soc: float
    max_soc: float
    room_c: float


def pack_from_case(case: dict, resistance: str) -> Pack:
    p, c, cond = case['plant'], case['plant']['cell'], case['conditions']
    return Pack(
        nominal_energy_kwh=p['unitNominalKWh'],
        nominal_voltage_v=p['unitNominalVoltageV'],
        cells_in_series=p['cellsInSeries'],
        cell_ah=c['ah'], cell_nominal_v=c['nominalV'], cell_max_v=c['maxV'], cell_min_v=c['minV'],
        resistance_ohm=RESISTANCE_MOHM[resistance] / 1000,
        min_soc=cond['minSoc'], max_soc=cond['maxSoc'], room_c=cond['cellTempC'],
    )


def build(pack: Pack, life_model: int, dt_hr: float) -> bs.BatteryStateful:
    m = bs.default('LFPGraphite')
    c, p = m.ParamsCell, m.ParamsPack
    c.chem = 1                       # lithium iron phosphate
    c.life_model = life_model
    c.voltage_choice = 0             # the built-in Shepherd model, not a lookup table
    c.Qfull = pack.cell_ah
    c.Qexp = pack.cell_ah * LFP_CURVE['qexp_fraction']
    c.Qnom = pack.cell_ah * LFP_CURVE['qnom_fraction']
    c.Vfull = pack.cell_max_v
    c.Vexp = LFP_CURVE['vexp']
    c.Vnom = LFP_CURVE['vnom']
    c.Vnom_default = pack.cell_nominal_v
    c.Vcut = pack.cell_min_v
    c.resistance = pack.resistance_ohm
    c.C_rate = 0.2                   # the rate the capacity above is quoted at
    c.minimum_SOC, c.maximum_SOC, c.initial_SOC = pack.min_soc, pack.max_soc, pack.max_soc
    p.nominal_energy = pack.nominal_energy_kwh
    p.nominal_voltage = pack.nominal_voltage_v
    p.T_room_init = pack.room_c
    m.Controls.control_mode = 1      # dispatch by power, which is how a plant is asked for energy
    m.Controls.dt_hr = dt_hr
    m.Controls.input_power = 0.0
    m.setup()
    for _ in range(SETTLING_STEPS):
        m.Controls.input_power = 0.0
        m.execute(0)
    return m


def _run(m: bs.BatteryStateful, power_kw: float, dt: float, stop_soc: float, falling: bool):
    """Hold a power until the window runs out. Returns energy, hours, and the voltage envelope."""
    energy = hours = 0.0
    v_sum, steps = 0.0, 0
    v_min, v_max = float('inf'), 0.0
    for _ in range(int(MAX_HOURS / dt)):
        m.Controls.input_power = power_kw
        m.execute(0)
        moved = m.StatePack.P * dt * (1 if falling else -1)
        if moved <= 1e-9:
            break
        energy += moved
        hours += dt
        v_sum += m.StatePack.V
        v_min, v_max = min(v_min, m.StatePack.V), max(v_max, m.StatePack.V)
        steps += 1
        if (falling and m.StatePack.SOC <= stop_soc + 1e-6) or (not falling and m.StatePack.SOC >= stop_soc - 1e-6):
            break
    return {
        'kwh': energy, 'hours': hours,
        'meanV': v_sum / steps if steps else 0.0,
        'minV': 0.0 if v_min == float('inf') else v_min, 'maxV': v_max,
    }


# -------------------------------------------------------------------- checks --
def deliverable(pack: Pack, c_rate: float) -> dict:
    """Discharge from the top of the window to the bottom at the design rate.

    The studio computes this as nameplate x usable window x depth of discharge, with the nameplate
    struck at the cell's nominal voltage. SAM integrates the real discharge curve.
    """
    dt = 1 / 120
    m = build(pack, 2, dt)
    r = _run(m, c_rate * pack.nominal_energy_kwh, dt, pack.min_soc, falling=True)
    r['meanVPerCell'] = r['meanV'] / pack.cells_in_series
    r['minVPerCell'] = r['minV'] / pack.cells_in_series
    r['maxVPerCell'] = r['maxV'] / pack.cells_in_series
    return r


def round_trip(pack: Pack, c_rate: float) -> dict:
    """Empty the window and fill it again at the same rate, both measured at the DC terminals."""
    dt = 1 / 120
    m = build(pack, 2, dt)
    power = c_rate * pack.nominal_energy_kwh
    out = _run(m, power, dt, pack.min_soc, falling=True)
    back = _run(m, -power, dt, pack.max_soc, falling=False)
    return {
        'outKWh': out['kwh'], 'inKWh': back['kwh'],
        'dcRoundTrip': out['kwh'] / back['kwh'] if back['kwh'] > 0 else 0.0,
        'chargeMeanV': back['meanV'], 'chargeMaxV': back['maxV'],
    }


def retention(pack: Pack, life_model: int, years: list[int], efc_per_year: float,
              cycles_per_day: float) -> dict[str, float]:
    """Age the pack for the project life at the studio's own duty, and read the capacity back.

    Stepped hourly with a charge window and a discharge window, at a depth and a frequency chosen so
    the equivalent full cycles a year match what the studio's duty produces. Below one cycle a day
    the plant rests on the days between, which is what makes calendar ageing dominate a standby duty.
    """
    dt = 1.0
    m = build(pack, life_model, dt)
    span = max(years)
    per_cycling_day = max(1, round(cycles_per_day)) if cycles_per_day >= 1 else 1
    day_interval = max(1, round(1 / cycles_per_day)) if 0 < cycles_per_day < 1 else 1
    cycling_days_per_year = 365 / day_interval
    depth = min(1.0, efc_per_year / max(cycling_days_per_year * per_cycling_day, 1e-9))
    hours_each_way = 2
    power = depth * pack.nominal_energy_kwh / hours_each_way
    slot = 24 // per_cycling_day
    out: dict[str, float] = {}
    for day in range(365 * span):
        cycling = day % day_interval == 0
        for hour in range(24):
            p = 0.0
            if cycling:
                phase = hour % slot
                if 1 <= phase < 1 + hours_each_way:
                    p = -power                      # charge
                elif 1 + hours_each_way <= phase < 1 + 2 * hours_each_way:
                    p = power                       # discharge
            m.Controls.input_power = p
            m.execute(0)
        year = (day + 1) / 365
        if abs(year - round(year)) < 1e-9 and round(year) in years:
            out[str(round(year))] = m.StateCell.q_relative / 100
    # Only some of the lifetime models keep an equivalent-full-cycle counter; the rest report
    # cycles. Read whichever exists so the achieved duty can be checked against the one asked for.
    state = m.StateCell.export()
    out['_efcAchieved'] = float(state.get('EFC') or 0.0)
    out['_cycles'] = float(state.get('n_cycles') or 0.0)
    return out


def main() -> None:
    spec = json.loads((HERE / 'cases.json').read_text())
    results = []
    for case in spec['cases']:
        c_rate = max(case['conditions']['systemCRate'], 0.02)
        entry = {'id': case['id'], 'label': case['label'], 'deliverable': {}, 'roundTrip': {}, 'retention': {}}
        for band in RESISTANCE_MOHM:
            pack = pack_from_case(case, band)
            entry['deliverable'][band] = deliverable(pack, c_rate)
            entry['roundTrip'][band] = round_trip(pack, c_rate)
        pack = pack_from_case(case, 'realistic')
        for life_model, name in LIFE_MODELS.items():
            entry['retention'][name] = retention(
                pack, life_model, spec['years'],
                case['conditions']['efcPerYear'], case['duty']['cyclesPerDay'])
        results.append(entry)
        print(f"  ran {case['label']}")
    payload = {
        'engine': 'NREL SAM via PySAM',
        'version': __import__('PySAM').__version__,
        'assumptions': {'resistanceMilliOhmPerCell': RESISTANCE_MOHM, 'lfpCurve': LFP_CURVE},
        'results': results,
    }
    (HERE / 'sam.json').write_text(json.dumps(payload, indent=2) + '\n')
    print(f"wrote validation/sam.json — {len(results)} cases")


if __name__ == '__main__':
    main()
