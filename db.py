"""SQLite storage.

On Railway the database lives on a mounted volume so it survives deploys and
restarts. Locally it drops into ./data. Set DATA_DIR to move it.

Every schema change here is additive and idempotent -- CREATE IF NOT EXISTS, or
ALTER TABLE ADD COLUMN guarded by a check. Nothing ever drops, renames or
rewrites existing rows except to fill a brand-new column. That's the contract
that keeps a redeploy from costing data.
"""

import os
import sqlite3

DATA_DIR = os.environ.get("DATA_DIR") or os.path.join(os.path.dirname(__file__), "data")
DB_PATH = os.path.join(DATA_DIR, "workouts.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    day          INTEGER NOT NULL,
    workout_date TEXT    NOT NULL,
    started_at   TEXT    NOT NULL,
    finished_at  TEXT,
    notes        TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sets (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    machine_slug TEXT    NOT NULL,
    weight       REAL    NOT NULL,
    reps         INTEGER NOT NULL,
    created_at   TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sets_session ON sets(session_id);
CREATE INDEX IF NOT EXISTS idx_sets_machine ON sets(machine_slug);
CREATE INDEX IF NOT EXISTS idx_sessions_finished ON sessions(finished_at);

CREATE TABLE IF NOT EXISTS state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- one row per calendar day; logging again for the same day replaces it
CREATE TABLE IF NOT EXISTS bodyweight (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT    NOT NULL UNIQUE,
    lbs        REAL    NOT NULL,
    note       TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL
);

-- one row per day; every macro is optional, log whatever you counted
CREATE TABLE IF NOT EXISTS nutrition (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT    NOT NULL UNIQUE,
    calories   INTEGER,
    protein    INTEGER,
    carbs      INTEGER,
    fat        INTEGER,
    note       TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL
);
"""

# Titles as they were when these day numbers were logged. A session keeps the
# title it was done under, so reshuffling the rotation can't rewrite history.
LEGACY_TITLES = {
    1: "Push: Chest, Shoulders, Triceps",
    2: "Pull: Back, Rear Delts, Biceps",
    3: "Legs & Lower Back",
    4: "Push: Round Two",
    5: "Pull: Round Two",
    6: "Legs: Hamstring Lead",
    7: "Catch-Up Day",
}


def connect():
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _columns(conn, table):
    return {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}


def _add_column(conn, table, column, decl):
    """ALTER TABLE ADD COLUMN, only if it isn't there yet."""
    if column not in _columns(conn, table):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")
        return True
    return False


def init():
    with connect() as conn:
        conn.executescript(SCHEMA)

        # sessions.title: snapshot of the day's name at the time it was logged
        if _add_column(conn, "sessions", "title", "TEXT"):
            for day, title in LEGACY_TITLES.items():
                conn.execute(
                    "UPDATE sessions SET title = ? WHERE day = ? AND title IS NULL",
                    (title, day),
                )


def get_state(key, default=None):
    with connect() as conn:
        row = conn.execute("SELECT value FROM state WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_state(key, value):
    with connect() as conn:
        conn.execute(
            "INSERT INTO state (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, str(value)),
        )
