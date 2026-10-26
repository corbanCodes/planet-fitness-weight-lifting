"""Sanity checks on the workout plan itself. Run: .venv/bin/python test_plan.py

These are the rules a trainer would check a split against. If plan.py is edited
and one of these fails, the rotation has a real problem, not a style nit.
"""

from collections import defaultdict

import plan

# Which muscle a machine primarily trains. "Big" muscles need ~48h between hard
# sessions; small ones recover in about a day and may land on consecutive days.
PRIMARY = {
    "seated-leg-press": "Quads", "leg-extension": "Quads",
    "seated-leg-curl": "Hamstrings", "calf-extension": "Calves",
    "glute-kickback": "Glutes", "hip-abduction": "Hip abductors",
    "chest-press": "Chest", "pectoral-fly": "Chest", "assisted-dip": "Chest",
    "pull-down": "Back", "row-press": "Back", "assisted-pull-up": "Back",
    "shoulder-press": "Shoulders", "rear-deltoid-fly": "Rear delts",
    "biceps-curl": "Biceps", "triceps-extension": "Triceps", "triceps-press": "Triceps",
    "ab-crunch": "Abs", "torso-rotation": "Obliques",
    "back-extension": "Lower back",
}
BIG = {"Quads", "Hamstrings", "Chest", "Back", "Shoulders", "Triceps", "Glutes"}

MIN_MACHINES, MAX_MACHINES = 3, 5
MIN_FREQ, MAX_FREQ = 1, 3          # times per week a muscle is trained
MIN_SETS_BIG, MIN_SETS_SMALL, MAX_SETS = 8, 4, 20   # weekly sets per muscle


def check():
    failures = []
    active = {m["slug"] for m in plan.MACHINES if not m.get("retired")}
    retired = {m["slug"] for m in plan.MACHINES if m.get("retired")}
    used = [s for d in plan.ROTATION for s in d["machines"]]

    # every machine in the plan is a real one, and nothing retired is scheduled
    for s in set(used) - set(plan.MACHINES_BY_SLUG):
        failures.append(f"rotation references unknown machine '{s}'")
    for s in set(used) & retired:
        failures.append(f"rotation still schedules retired machine '{s}'")
    for s in active - set(used):
        failures.append(f"machine '{s}' is never used -- a muscle is being neglected")
    for s in active - set(PRIMARY):
        failures.append(f"machine '{s}' has no entry in PRIMARY (add it to this test)")

    # 3-5 machines a day
    for d in plan.ROTATION:
        n = len(d["machines"])
        if not MIN_MACHINES <= n <= MAX_MACHINES:
            failures.append(f"day {d['day']} has {n} machines (want {MIN_MACHINES}-{MAX_MACHINES})")
        if len(set(d["machines"])) != n:
            failures.append(f"day {d['day']} lists the same machine twice")

    # weekly sets and frequency per muscle
    sets, days = defaultdict(int), defaultdict(set)
    for d in plan.ROTATION:
        for s in d["machines"]:
            muscle = PRIMARY[s]
            sets[muscle] += plan.MACHINES_BY_SLUG[s]["target_sets"]
            days[muscle].add(d["day"])
    for muscle, ds in days.items():
        if not MIN_FREQ <= len(ds) <= MAX_FREQ:
            failures.append(f"{muscle} trained {len(ds)}x/week (want {MIN_FREQ}-{MAX_FREQ})")
        floor = MIN_SETS_BIG if muscle in BIG else MIN_SETS_SMALL
        if muscle != "Lower back" and not floor <= sets[muscle] <= MAX_SETS:
            failures.append(f"{muscle} gets {sets[muscle]} sets/week (want {floor}-{MAX_SETS})")

    # big muscles never on consecutive days (day 7 wraps to day 1)
    total = len(plan.ROTATION)
    for muscle, ds in days.items():
        if muscle not in BIG:
            continue
        for a in ds:
            b = a % total + 1
            if b in ds:
                failures.append(f"{muscle} on day {a} AND day {b} -- big muscles need a day between")

    return failures, sets, days


def report():
    failures, sets, days = check()
    print("PER DAY")
    for d in plan.ROTATION:
        n = sum(plan.MACHINES_BY_SLUG[s]["target_sets"] for s in d["machines"])
        print(f"  Day {d['day']}: {len(d['machines'])} machines, {n:2} sets, ~{round(n * 2.5) + 5} min   {d['title']}")
    print("\nWEEKLY SETS PER MUSCLE")
    for muscle, n in sorted(sets.items(), key=lambda x: -x[1]):
        tag = "big  " if muscle in BIG else "small"
        print(f"  {muscle:14} {n:2} sets  {len(days[muscle])}x/week  {tag}  {'#' * n}")
    print()
    if failures:
        print("FAILED:")
        for f in failures:
            print("  -", f)
        return 1
    print("OK -- every rule passes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(report())
