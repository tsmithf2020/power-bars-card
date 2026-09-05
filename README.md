# Power Bars Card

[![hacs][hacs-badge]][hacs-url]
[![release][release-badge]][release-url]
[![license][license-badge]](LICENSE)

A Home Assistant Lovelace card that shows many numeric sensors as compact
horizontal bars — in the space three gauges used to take.

*[Leer en español](README.es.md)*

---

## Why this exists

I had 24 power sensors on a dashboard as gauges, three per row. Eighteen of them
read 0 W at any given moment. They took about 1000 px of height to say almost
nothing, and the interesting ones were below the fold.

The same 24 sensors now fit in about 300 px, sorted so whatever is actually
drawing power is at the top of its group.

## What makes it different

There are several good bar cards already (see [Prior art](#prior-art)). Three
things here that I could not find elsewhere:

**Groups have their own scale.** A 9900 W main breaker and an 8 W standby plug
can sit in the same card without the small one becoming an invisible sliver.

**The total can be an entity, not a sum.** If your circuits are nested — a main
meter and the sub-circuits hanging off it — summing every row counts the same
energy two or three times. Point `total` at the meter that actually knows.

**`sort: active` doesn't shuffle.** Every card I found either keeps config order
or sorts by value descending. Sorting by value re-shuffles the whole list every
time any reading moves a watt. `active` lifts the rows that are *on* (sorted
among themselves) and leaves the idle ones exactly where you wrote them, so only
a state change moves anything.

## Installation

### HACS (recommended)

1. HACS → Frontend → ⋮ → **Custom repositories**
2. Add `https://github.com/tsmithf2020/power-bars-card` as category **Dashboard**
3. Install **Power Bars Card**, then reload your browser

### Manual

Copy `power-bars-card.js` to `<config>/www/power-bars-card/` and add the resource:

```yaml
url: /local/power-bars-card/power-bars-card.js
type: module
```

## Quick start

```yaml
type: custom:power-bars-card
title: Consumption
entities:
  - sensor.main_power
  - sensor.first_floor_power
  - sensor.kitchen_power
```

There is a **visual editor**, including full group management — you never have
to touch YAML if you don't want to.

## Options

| Option | Default | Description |
|---|---|---|
| `title` | — | Card heading |
| `entities` | — | Flat list of entities |
| `groups` | — | List of `{name, max, entities, ...}` — see [Groups](#groups) |
| `sort` | `value` | `active`, `value`, `config` or `name` — see [Sorting](#sorting) |
| `columns` | `1` | `1` or `2`. Always falls back to 1 under 600 px |
| `hide_zero` | `false` | Hide rows below the threshold entirely |
| `zero_threshold` | `1` | Below this a row counts as *off* (greyed out) |
| `show_total` | `true` | Show the total in the top right |
| `total` | `sum` | Entity id of the meter that gives the total — see [Totals](#totals) |
| `max` | auto | Bar scale. Without it, the largest current value is used |
| `severity` | `{yellow: 0.5, red: 0.8}` | Colour thresholds — see [Thresholds](#thresholds) |
| `unit` | from entities | Override the displayed unit |
| `modes` | — | Header buttons that re-read the rows — see [Modes](#modes--the-same-rows-read-a-different-way) |
| `billing_day` | `1` | Day of month the billing cycle starts, for `period: billing` |
| `name_width` | `8.5em` | Width of the name column |

### Per entity

Instead of a plain string, use an object:

```yaml
entities:
  - entity: sensor.fryer_power
    name: Fryer                           # overrides friendly_name
    max: 2200                             # scale for this bar only
    color: "#8e44ad"                      # fixed colour, ignores severity
    severity: {yellow: 1000, red: 1800}   # its own thresholds
    zero_threshold: 10                    # when this row greys out
    energy: sensor.fryer_energy           # what a `key: energy` mode reads
```

## Groups

Each group gets its own heading **and its own scale**:

```yaml
type: custom:power-bars-card
title: Consumption
sort: active
columns: 2
total: sensor.main_power
groups:
  - name: Main
    max: 9900
    entities: [sensor.main_power]
  - name: Primary
    max: 5500
    entities: [sensor.first_floor, sensor.second_floor, sensor.terrace]
  - name: Secondary
    max: 2500
    entities: [sensor.fryer_power, sensor.microwave_power, sensor.dishwasher_power]
```

Group keys: `name`, `max`, `entities`, `severity`, `zero_threshold`, `in_total`.

`entities` and `groups` can coexist — loose entities render as a final unnamed
group.

## Totals

By default the total is the **sum of the rows**. That is only right when the
circuits are independent. For a nested tree:

```
Main  ──>  Primary  ──>  Secondary
```

the main meter already includes everything below it. Point the total at it:

```yaml
total: sensor.main_power
```

The total entity **does not have to be one of the rows** — it can be a sensor
that isn't displayed at all.

Alternatively, keep the sum but drop one group out of it:

```yaml
groups:
  - name: Primary
    entities: [...]
  - name: Secondary
    in_total: false     # these hang off Primary, don't count them twice
    entities: [...]
```

## Sorting

| Mode | Behaviour |
|---|---|
| `active` | Rows that are on rise to the top of their group, sorted by value. **Idle rows keep the order you wrote them in.** |
| `value` | Everything sorted by value, descending |
| `config` | Exactly the order you wrote |
| `name` | Alphabetical |

Sorting always happens **within a group**, never across groups.

`active` is usually what you want: with `value`, a fridge cycling on and off
re-orders half the card. With `active`, only the fridge moves.

## Thresholds

Two of them, and both can be set at **three levels — entity, group, card**. The
most specific one wins.

### `zero_threshold` — the grey

Below this value a row is drawn greyed out, and `hide_zero` removes it entirely.
Useful for ignoring the standby draw of smart plugs.

```yaml
zero_threshold: 5                 # whole card
groups:
  - name: Primary
    zero_threshold: 20            # this group
    entities:
      - entity: sensor.fridge
        zero_threshold: 2         # this row
```

### `severity` — the colours

Two ways to write it, and the card tells them apart on its own:

| Written as | Read as |
|---|---|
| `{yellow: 0.5, red: 0.8}` | **Fraction** of that bar's max |
| `{yellow: 1000, red: 1800}` | **Absolute** values |

The rule: **≤ 1 is a fraction, > 1 is absolute.** No option to pick. Nobody sets
a real threshold of 0.8 W, so there is no ambiguity in practice.

```yaml
severity: {yellow: 0.5, red: 0.8}           # card, as a fraction
groups:
  - name: Secondary
    severity: {yellow: 800, red: 1500}      # group, in watts
    entities:
      - entity: sensor.fryer_power
        severity: {yellow: 1200, red: 2000} # row, in watts
```

> **Note:** if `max` is automatic, the largest row is always at 100% of the
> scale and therefore always red. For colours to mean anything, either set a
> `max` or write `severity` in absolute values, which doesn't depend on scale.

## Modes — the same rows, read a different way

A mode puts a button in the header. Each mode resolves every row to a
**different entity**, so the same card can show live watts or kWh over a period.

```yaml
type: custom:power-bars-card
title: Consumption
billing_day: 10                  # billing cycle starts on the 10th
total: sensor.main_power
modes:
  - name: Now                    # no rule: reads the entity as written
  - name: Month
    period: billing              # sum over the current billing cycle
    key: energy                  # each row's `energy:` key
    unit: kWh
    max: auto
    total: sensor.main_energy
entities:
  - entity: sensor.fryer_power
    energy: sensor.fryer_energy
```

### Where a mode gets its entity

| Key | Behaviour |
|---|---|
| neither | Uses the row's own `entity` |
| `key: energy` | Uses the row's `energy:` key |
| `replace: ["_power", "_energy"]` | Derives it from the entity id |

`key` wins over `replace`. **If a mode has a rule and a row doesn't satisfy it,
the row shows as unavailable — it does not fall back to the base entity.**
Falling back would quietly put watts in a kWh column, which is worse than a
visible gap. The tooltip says which entity is missing.

### Periods

| `period` | Reads |
|---|---|
| *(unset)* | The entity's current state |
| `today` | Total since midnight |
| `month` | Total for the calendar month |
| `billing` | Total since the last `billing_day` |

A mode with a `period` doesn't read the entity's state. It sums long-term
statistics over the window, the same source the Energy dashboard uses — so it
works from day one, with no `utility_meter` per socket and no waiting for data
to accumulate.

`billing_day: 10` means the cycle runs from the 10th to the 10th. On the 5th of
a month, the cycle in progress started on the 10th of the *previous* month.

### A mode overrides everything

`max`, `unit`, `severity` and `zero_threshold` set on a mode **beat the card,
the group and the entity**. The quantity changed — a scale of 9900 W and a
threshold of 5 W are meaningless once the column is in kWh.

### Units are converted automatically

If a mode declares `unit: kWh` and a row's entity reports `Wh`, the value is
converted. Mixing them silently would show that row 1000× too large and it would
look like the biggest consumer in the house. Handled for `W`/`kW` and
`Wh`/`kWh`/`MWh`; anything else is left alone.

## Not just power

Nothing in the card is electricity-specific. Any numeric sensor works — water
pressure, disk usage, humidity, signal strength. The name is about the shape of
the output, not the input.

## Prior art

Cards I looked at before writing this one, and what each does well:

- **[bar-card](https://github.com/custom-cards/bar-card)** — the classic.
  Excellent per-bar styling and severity ranges. No groups, no sorting, no
  total, no visual editor; unmaintained since 2020.
- **[ha-live-power-dashboard](https://github.com/rusty4444/ha-live-power-dashboard)**
  — the closest in spirit. Per-circuit or global max, visual editor, auto-sorts
  by draw. No grouping with headings, no separate total entity.
- **[entity-progress-card](https://github.com/francois-le-ko4la/lovelace-entity-progress-card)**
  — very polished progress-bar rows, one entity per card.
- **[energy-devices-power-graph-card](https://github.com/hheimbuerger/lovelace-energy-devices-power-graph-card)**
  — configures itself from your Energy dashboard setup.
- **[ha-sankey-chart](https://github.com/MindFreeze/ha-sankey-chart)** — solves
  the nested-circuits problem properly, as a diagram rather than a compact list.

If one of those fits your case better, use it.

## Development

```bash
node test/smoke.js
```

337 assertions, no dependencies — there is a small DOM shim inside the test file
itself. `_render()` and `_update()` are called for real and the resulting HTML
is inspected, rather than simulated.

The suite is validated by deliberately breaking the card and checking that tests
fail. Two findings from that exercise worth writing down:

- **The colour tests were wrong at first.** They looked for `--pbc-yellow` with
  an `includes()` over the whole HTML — and that string already appears in the
  `<style>` block where the variables are defined, so they passed no matter
  what. They now read each bar's inline `style`.
- **`sort: active` needed a brute-force search.** Removing the line that
  separates on from off changed nothing in any test: in all of them everything
  that was on was worth more than everything that was off, so the broken
  comparator got the right answer by luck. A random search over 200,000 lists
  found they differ in 0.18% of cases, always with the same shape — an **active
  row with a low value**, which only exists because thresholds are per-entity.
  That case is test 38a.

The same exercise on the mode/period work caught six more: falling back to the
base entity when a rule doesn't match, a billing window that never steps back a
month, a mode `max` that doesn't beat the group's, statistics that overwrite
instead of summing, names taken from the energy sensor instead of the base one,
and a first mode that isn't neutral.

One known gap: computing the scale over visible rows instead of the whole group
is **not caught by any test**. It is currently indistinguishable — `hide_zero`
only removes small values, and the maximum is never one of them — and it is
annotated in test 14 so nobody mistakes it for a guarantee.

## License

MIT

[hacs-badge]: https://img.shields.io/badge/HACS-Custom-41BDF5.svg
[hacs-url]: https://github.com/hacs/integration
[release-badge]: https://img.shields.io/github/v/release/tsmithf2020/power-bars-card
[release-url]: https://github.com/tsmithf2020/power-bars-card/releases
[license-badge]: https://img.shields.io/badge/license-MIT-blue.svg
