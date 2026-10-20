# Lift Log

A private lifting tracker for the Planet Fitness machine circuit. One user, no
accounts, no login. Open it on your phone at the gym, log sets as you do them,
close it whenever.

## What it does

- **A 7-day rotation over all 14 machines** — push, pull and legs twice a week
  each, plus a lighter catch-up day for the small muscles. Four or five machines
  a day at four sets each: about 20 sets, or an hour with rests. Every muscle
  lands at 12–16 sets per week, trained 2–3× a week. Defined in [`plan.py`](plan.py).
- **An effort target on every machine**, not just sets and reps: stop about 2 reps
  short of failure on the working sets, 1 short on the last. Training every set to
  failure costs recovery without buying growth.
- **A two-week ramp** for the first 14 workouts — 2 sets per machine, then 3, then
  the full plan — so going from nothing to 20 sets a day doesn't end the experiment
  in week one.
- **The rotation is a queue, not a calendar.** It always serves the day after the
  last one you finished, so missing a day never throws it out of order. If the
  app and real life disagree, the Schedule tab resets it in two taps.
- **Logs weight and reps per set**, and every set saves the instant you log it —
  you can close the tab mid-workout and pick up where you left off.
- **Tells you when to add weight.** Hit the top of the rep range on every set and
  the next session says to go up, in plain English.
- **Shows last session's numbers** on every machine, and pre-fills the weight
  box with them so logging is two taps when nothing changed.
- **A glossary tab** that defines every piece of gym jargon the app uses.

## Running it locally

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Then open http://localhost:5055. The database lands in `./data/workouts.db`
(gitignored).

## Deploying to Railway

Railway builds this straight from GitHub — push to `main` and it redeploys.

1. **New Project → Deploy from GitHub repo** → pick this repo. Nixpacks detects
   Python from `requirements.txt` and runs the `Procfile`.
2. **Add a volume** (service → Settings → Volumes) with mount path `/data`.
   Without it, the SQLite file lives on the container's disk and every deploy
   wipes your history.
3. **Set these variables** (service → Variables):

   | Variable   | Value              | Why |
   |------------|--------------------|-----|
   | `DATA_DIR` | `/data`            | Puts the database on the volume |
   | `TZ_NAME`  | `America/New_York` | So "Today" means your today |

   `PORT` is injected by Railway; don't set it.
4. **Generate a domain** (Settings → Networking → Generate Domain) and bookmark
   it on your phone's home screen.

Health check path, if you want one: `/healthz`.

### Backing up your log

The whole history is one SQLite file. From the Railway CLI:

```bash
railway run cat /data/workouts.db > workouts-backup.db
```

## Changing the plan

Everything about the workout itself lives in [`plan.py`](plan.py) — the machine
list, the rotation, the rep targets, the coaching text, the glossary. Edit it and
push; nothing in the database depends on it except the machine `slug` values, so
rename a machine freely but don't change its slug once you've logged workouts on
it.

## Files

| File | What's in it |
|------|--------------|
| `plan.py` | Machines, the 7-day rotation, glossary. The only file worth editing. |
| `app.py` | Flask routes, the JSON API, the "add weight?" logic |
| `db.py` | SQLite schema and connection |
| `templates/index.html` | Page shell and SVG icon set |
| `static/app.js` | The whole front end |
| `static/styles.css` | Styling |
