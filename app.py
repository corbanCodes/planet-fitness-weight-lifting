"""Planet Fitness lifting tracker -- a one-person app.

Run locally:   python app.py
On Railway:    gunicorn app:app   (see Procfile)
"""

import json
import os
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from flask import Flask, jsonify, render_template, request

import db
import plan

TZ = ZoneInfo(os.environ.get("TZ_NAME", "America/New_York"))

app = Flask(__name__)
db.init()


# --- helpers --------------------------------------------------------------

def now():
    return datetime.now(TZ)


def today_str():
    return now().date().isoformat()


def parse_date(value, fallback=None):
    try:
        return date.fromisoformat(value).isoformat()
    except (TypeError, ValueError):
        return fallback or today_str()


def friendly_date(iso):
    """'2026-10-19' -> 'Today', 'Yesterday', or 'Sun, Oct 12'."""
    if not iso:
        return ""
    try:
        d = date.fromisoformat(iso)
    except ValueError:
        return iso
    delta = (now().date() - d).days
    if delta == 0:
        return "Today"
    if delta == 1:
        return "Yesterday"
    if 2 <= delta <= 6:
        return f"{d.strftime('%A')} ({delta} days ago)"
    return f"{d.strftime('%a, %b')} {d.day}"


def machine_payload(slug, conn):
    """A machine plus how it went last time and what to do about it."""
    m = plan.MACHINES_BY_SLUG[slug]
    out = dict(m)

    row = conn.execute(
        """SELECT s.id, s.workout_date FROM sessions s
           JOIN sets t ON t.session_id = s.id
           WHERE t.machine_slug = ? AND s.finished_at IS NOT NULL
           GROUP BY s.id
           ORDER BY s.workout_date DESC, s.id DESC LIMIT 1""",
        (slug,),
    ).fetchone()

    last = None
    if row:
        sets = conn.execute(
            "SELECT weight, reps FROM sets WHERE session_id = ? AND machine_slug = ? "
            "ORDER BY id",
            (row["id"], slug),
        ).fetchall()
        last = {
            "date": row["workout_date"],
            "date_label": friendly_date(row["workout_date"]),
            "sets": [{"weight": s["weight"], "reps": s["reps"]} for s in sets],
            "volume": sum(s["weight"] * s["reps"] for s in sets),
        }

    out["last"] = last
    out["suggestion"] = suggest(m, last)
    out["best"] = best_ever(slug, conn)
    return out


def suggest(m, last):
    """Progressive overload in one sentence of plain English."""
    if not last or not last["sets"]:
        return {
            "weight": None,
            "headline": "First time on this one",
            "detail": "Pick a weight you can move 10 times with clean, controlled "
                      "form. Starting too light is free -- starting too heavy costs "
                      "you a week.",
        }

    weight = max(s["weight"] for s in last["sets"])
    reps = [s["reps"] for s in last["sets"]]
    enough_sets = len(last["sets"]) >= m["target_sets"]
    maxed = all(r >= m["rep_high"] for r in reps)

    if maxed and enough_sets:
        new = weight + m["jump"]
        return {
            "weight": new,
            "headline": f"Go up to {fmt_weight(new)} lb",
            "detail": f"You hit {m['rep_high']} reps on every set at "
                      f"{fmt_weight(weight)} lb, so you've earned the jump. Expect "
                      f"the reps to drop at first -- that's normal.",
        }

    if min(reps) < m["rep_low"]:
        return {
            "weight": weight,
            "headline": f"Stay at {fmt_weight(weight)} lb",
            "detail": f"One of your sets came in under {m['rep_low']} reps. Hold this "
                      f"weight until you can get {m['rep_low']} on all "
                      f"{m['target_sets']} sets.",
        }

    return {
        "weight": weight,
        "headline": f"Stay at {fmt_weight(weight)} lb",
        "detail": f"Try to squeeze out a rep or two more than last time. Once every "
                  f"set hits {m['rep_high']}, you go up {m['jump']} lb.",
    }


def best_ever(slug, conn):
    row = conn.execute(
        """SELECT MAX(t.weight) AS w FROM sets t
           JOIN sessions s ON s.id = t.session_id
           WHERE t.machine_slug = ? AND s.finished_at IS NOT NULL""",
        (slug,),
    ).fetchone()
    return row["w"] if row and row["w"] is not None else None


def fmt_weight(w):
    if w is None:
        return "-"
    return str(int(w)) if float(w).is_integer() else f"{w:g}"


def active_session(conn):
    row = conn.execute(
        "SELECT * FROM sessions WHERE finished_at IS NULL ORDER BY id DESC LIMIT 1"
    ).fetchone()
    if not row:
        return None
    sets = conn.execute(
        "SELECT id, machine_slug, weight, reps FROM sets WHERE session_id = ? ORDER BY id",
        (row["id"],),
    ).fetchall()
    logged = {}
    for s in sets:
        logged.setdefault(s["machine_slug"], []).append(
            {"id": s["id"], "weight": s["weight"], "reps": s["reps"]}
        )
    return {
        "id": row["id"],
        "day": row["day"],
        "workout_date": row["workout_date"],
        "date_label": friendly_date(row["workout_date"]),
        "notes": row["notes"],
        "logged": logged,
        "total_sets": len(sets),
        "volume": sum(s["weight"] * s["reps"] for s in sets),
    }


def last_completed_day(conn):
    """Where the rotation stands. The reset screen writes straight to state."""
    stored = db.get_state("last_completed_day")
    if stored is not None:
        try:
            value = int(stored)
            return value if 1 <= value <= plan.TOTAL_DAYS else None
        except ValueError:
            return None
    row = conn.execute(
        "SELECT day FROM sessions WHERE finished_at IS NOT NULL "
        "ORDER BY workout_date DESC, id DESC LIMIT 1"
    ).fetchone()
    return row["day"] if row else None


def streak(conn):
    """Consecutive calendar days worked out, counting back from today."""
    rows = conn.execute(
        "SELECT DISTINCT workout_date FROM sessions WHERE finished_at IS NOT NULL "
        "ORDER BY workout_date DESC"
    ).fetchall()
    days = {r["workout_date"] for r in rows}
    if not days:
        return 0
    cursor = now().date()
    if cursor.isoformat() not in days:
        cursor -= timedelta(days=1)  # today isn't over yet; don't break the streak
        if cursor.isoformat() not in days:
            return 0
    count = 0
    while cursor.isoformat() in days:
        count += 1
        cursor -= timedelta(days=1)
    return count


def day_history(conn):
    """When each of the 7 rotation days was last finished."""
    rows = conn.execute(
        "SELECT day, MAX(workout_date) AS d FROM sessions "
        "WHERE finished_at IS NOT NULL GROUP BY day"
    ).fetchall()
    out = {r["day"]: {"date": r["d"], "label": friendly_date(r["d"])} for r in rows}
    return {str(k): v for k, v in out.items()}


def build_state():
    with db.connect() as conn:
        active = active_session(conn)
        last_day = last_completed_day(conn)
        up_next_day = active["day"] if active else plan.next_day_after(last_day)
        day_def = plan.ROTATION_BY_DAY[up_next_day]

        totals = conn.execute(
            "SELECT COUNT(*) AS n FROM sessions WHERE finished_at IS NOT NULL"
        ).fetchone()["n"]
        week_ago = (now().date() - timedelta(days=6)).isoformat()
        this_week = conn.execute(
            "SELECT COUNT(DISTINCT workout_date) AS n FROM sessions "
            "WHERE finished_at IS NOT NULL AND workout_date >= ?",
            (week_ago,),
        ).fetchone()["n"]

        return {
            "today": today_str(),
            "up_next": {
                "day": day_def["day"],
                "title": day_def["title"],
                "focus": day_def["focus"],
                "machines": [machine_payload(s, conn) for s in day_def["machines"]],
            },
            "active": active,
            "last_completed_day": last_day,
            "day_history": day_history(conn),
            "stats": {
                "streak": streak(conn),
                "total_workouts": totals,
                "last_7_days": this_week,
            },
        }


# --- pages ----------------------------------------------------------------

@app.get("/")
def index():
    return render_template(
        "index.html",
        bootstrap=json.dumps(
            {
                "rotation": plan.ROTATION,
                "machines": plan.MACHINES,
                "glossary": plan.GLOSSARY,
                "total_days": plan.TOTAL_DAYS,
            }
        ),
    )


@app.get("/healthz")
def healthz():
    return {"ok": True}


# --- api ------------------------------------------------------------------

@app.get("/api/state")
def api_state():
    return jsonify(build_state())


@app.post("/api/session/start")
def api_start():
    body = request.get_json(silent=True) or {}
    with db.connect() as conn:
        existing = active_session(conn)
        if existing:
            return jsonify({"error": "A workout is already in progress."}), 409

        day = body.get("day")
        if day is None:
            day = plan.next_day_after(last_completed_day(conn))
        day = int(day)
        if day not in plan.ROTATION_BY_DAY:
            return jsonify({"error": "That isn't one of the 7 days."}), 400

        workout_date = parse_date(body.get("workout_date"))
        cur = conn.execute(
            "INSERT INTO sessions (day, workout_date, started_at) VALUES (?, ?, ?)",
            (day, workout_date, now().isoformat(timespec="seconds")),
        )
        session_id = cur.lastrowid
    return jsonify({"ok": True, "session_id": session_id, "state": build_state()})


@app.post("/api/session/date")
def api_session_date():
    """Change the date on the workout in progress -- for backfilling a day you
    did but didn't log at the time."""
    body = request.get_json(silent=True) or {}
    with db.connect() as conn:
        active = active_session(conn)
        if not active:
            return jsonify({"error": "No workout in progress."}), 409
        conn.execute(
            "UPDATE sessions SET workout_date = ? WHERE id = ?",
            (parse_date(body.get("workout_date")), active["id"]),
        )
    return jsonify({"ok": True, "state": build_state()})


@app.post("/api/sets")
def api_add_set():
    body = request.get_json(silent=True) or {}
    slug = body.get("machine")
    if slug not in plan.MACHINES_BY_SLUG:
        return jsonify({"error": "Unknown machine."}), 400
    try:
        weight = float(body.get("weight"))
        reps = int(body.get("reps"))
    except (TypeError, ValueError):
        return jsonify({"error": "Weight and reps both need to be numbers."}), 400
    if weight < 0 or weight > 2000 or reps < 1 or reps > 200:
        return jsonify({"error": "That weight or rep count looks like a typo."}), 400

    with db.connect() as conn:
        active = active_session(conn)
        if not active:
            return jsonify({"error": "Start the workout first."}), 409
        conn.execute(
            "INSERT INTO sets (session_id, machine_slug, weight, reps, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (active["id"], slug, weight, reps, now().isoformat(timespec="seconds")),
        )
    return jsonify({"ok": True, "state": build_state()})


@app.delete("/api/sets/<int:set_id>")
def api_delete_set(set_id):
    with db.connect() as conn:
        active = active_session(conn)
        if not active:
            return jsonify({"error": "No workout in progress."}), 409
        conn.execute(
            "DELETE FROM sets WHERE id = ? AND session_id = ?", (set_id, active["id"])
        )
    return jsonify({"ok": True, "state": build_state()})


@app.post("/api/session/finish")
def api_finish():
    body = request.get_json(silent=True) or {}
    with db.connect() as conn:
        active = active_session(conn)
        if not active:
            return jsonify({"error": "No workout in progress."}), 409
        if active["total_sets"] == 0:
            return jsonify({"error": "Log at least one set before you finish."}), 400
        conn.execute(
            "UPDATE sessions SET finished_at = ?, notes = ? WHERE id = ?",
            (
                now().isoformat(timespec="seconds"),
                (body.get("notes") or "").strip()[:500],
                active["id"],
            ),
        )
        day = active["day"]
    db.set_state("last_completed_day", day)
    return jsonify({"ok": True, "state": build_state()})


@app.post("/api/session/discard")
def api_discard():
    with db.connect() as conn:
        active = active_session(conn)
        if not active:
            return jsonify({"error": "No workout in progress."}), 409
        conn.execute("DELETE FROM sets WHERE session_id = ?", (active["id"],))
        conn.execute("DELETE FROM sessions WHERE id = ?", (active["id"],))
    return jsonify({"ok": True, "state": build_state()})


@app.post("/api/rotation")
def api_rotation():
    """Put the rotation wherever you actually are. Pass day 0 to start over at day 1."""
    body = request.get_json(silent=True) or {}
    try:
        day = int(body.get("last_completed_day"))
    except (TypeError, ValueError):
        return jsonify({"error": "Pick a day."}), 400
    if day == 0:
        db.set_state("last_completed_day", plan.TOTAL_DAYS)  # so next up is day 1
    elif day in plan.ROTATION_BY_DAY:
        db.set_state("last_completed_day", day)
    else:
        return jsonify({"error": "That isn't one of the 7 days."}), 400
    return jsonify({"ok": True, "state": build_state()})


@app.get("/api/history")
def api_history():
    limit = min(int(request.args.get("limit", 40)), 200)
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT * FROM sessions WHERE finished_at IS NOT NULL "
            "ORDER BY workout_date DESC, id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        out = []
        for r in rows:
            sets = conn.execute(
                "SELECT machine_slug, weight, reps FROM sets WHERE session_id = ? ORDER BY id",
                (r["id"],),
            ).fetchall()
            by_machine = {}
            for s in sets:
                by_machine.setdefault(s["machine_slug"], []).append(
                    {"weight": s["weight"], "reps": s["reps"]}
                )
            out.append(
                {
                    "id": r["id"],
                    "day": r["day"],
                    "title": plan.ROTATION_BY_DAY[r["day"]]["title"],
                    "date": r["workout_date"],
                    "date_label": friendly_date(r["workout_date"]),
                    "notes": r["notes"],
                    "machines": [
                        {
                            "slug": slug,
                            "name": plan.MACHINES_BY_SLUG[slug]["name"],
                            "sets": s,
                        }
                        for slug, s in by_machine.items()
                    ],
                    "total_sets": len(sets),
                    "volume": sum(s["weight"] * s["reps"] for s in sets),
                }
            )
    return jsonify({"sessions": out})


@app.delete("/api/history/<int:session_id>")
def api_delete_session(session_id):
    with db.connect() as conn:
        conn.execute("DELETE FROM sets WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    return jsonify({"ok": True})


@app.get("/api/machines/<slug>")
def api_machine(slug):
    if slug not in plan.MACHINES_BY_SLUG:
        return jsonify({"error": "Unknown machine."}), 404
    with db.connect() as conn:
        rows = conn.execute(
            """SELECT s.workout_date AS d, t.weight, t.reps FROM sets t
               JOIN sessions s ON s.id = t.session_id
               WHERE t.machine_slug = ? AND s.finished_at IS NOT NULL
               ORDER BY s.workout_date DESC, t.id""",
            (slug,),
        ).fetchall()
    by_date = {}
    for r in rows:
        by_date.setdefault(r["d"], []).append({"weight": r["weight"], "reps": r["reps"]})
    return jsonify(
        {
            "machine": plan.MACHINES_BY_SLUG[slug],
            "sessions": [
                {
                    "date": d,
                    "date_label": friendly_date(d),
                    "sets": s,
                    "top_weight": max(x["weight"] for x in s),
                    "volume": sum(x["weight"] * x["reps"] for x in s),
                }
                for d, s in by_date.items()
            ],
        }
    )


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5055)),
        debug=bool(os.environ.get("FLASK_DEBUG")),
    )
