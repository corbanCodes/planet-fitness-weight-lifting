/* Lift Log -- all of the front end. Vanilla JS, no build step. */

const BOOT = window.BOOTSTRAP;
const MACHINES = Object.fromEntries(BOOT.machines.map((m) => [m.slug, m]));

let STATE = null;          // whatever /api/state last said
let HISTORY = null;        // lazily loaded
let TAB = "today";
const INPUTS = {};         // slug -> {weight, reps} typed but not yet logged
const OPEN_HOWTO = new Set();
let NOTES = "";

/* --- tiny helpers ------------------------------------------------------ */

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
const icon = (name, cls = "") =>
  `<svg class="${cls}"><use href="#i-${name}"/></svg>`;
const num = (n) =>
  n === null || n === undefined ? "-" : Number.isInteger(+n) ? String(+n) : (+n).toFixed(1);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function toast(msg, bad = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast show" + (bad ? " bad" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.className = "toast"), 2600);
}

async function api(path, opts = {}) {
  const res = await fetch("/api" + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    /* empty body is fine */
  }
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}

async function act(path, opts) {
  try {
    const data = await api(path, opts);
    if (data.state) {
      STATE = data.state;
      HISTORY = null;
      render();
    }
    return data;
  } catch (err) {
    toast(err.message, true);
    throw err;
  }
}

/* --- today ------------------------------------------------------------- */

function renderToday() {
  const s = STATE;
  const day = s.up_next;
  const active = s.active;
  const machines = day.machines;

  const loggedCount = active
    ? machines.filter((m) => (active.logged[m.slug] || []).length > 0).length
    : 0;

  let html = `<div class="hero">
    <div class="eyebrow">${active ? "Workout in progress" : "Up next"} &middot; Day ${day.day} of ${BOOT.total_days}</div>
    <h1>${esc(day.title)}</h1>
    <div class="focus">${esc(day.focus)}</div>`;

  if (active) {
    html += `<div class="chips">
      <span class="chip">${icon("check")}${loggedCount} of ${machines.length} machines done</span>
      <span class="chip">${plural(active.total_sets, "set")} logged</span>
      <button class="chip" data-act="change-date" title="Change the date this workout counts for">
        ${icon("calendar")}${esc(active.date_label)}</button>
    </div>`;
  } else {
    html += `<div class="stat-row">
      <div class="stat"><b>${s.stats.streak}</b><span>Day streak</span></div>
      <div class="stat"><b>${s.stats.last_7_days}</b><span>Last 7 days</span></div>
      <div class="stat"><b>${s.stats.total_workouts}</b><span>All time</span></div>
    </div>
    <div class="chips">${machines
      .map((m) => `<span class="chip">${esc(m.name)}</span>`)
      .join("")}</div>`;
  }
  html += `</div>`;

  html += rampNotice(s.stats.total_workouts);

  if (!active) {
    html += `<button class="btn btn-primary btn-block btn-lg" data-act="start">
      ${icon("plus")}Start Day ${day.day}</button>
      <div style="text-align:center;margin-top:10px">
        <button class="btn btn-ghost" data-act="go-schedule">Wrong day? Fix the rotation</button>
      </div>
      <div class="section-title">Today's machines</div>`;
  }

  html += machines.map((m, i) => machineCard(m, i, active)).join("");

  if (active) {
    html += `<div class="card card-pad">
      <div class="field">
        <label for="notes">Notes on this workout (optional)</label>
        <textarea class="input" id="notes" placeholder="How it felt, what to change next time...">${esc(NOTES || active.notes)}</textarea>
      </div>
      <button class="btn btn-primary btn-block btn-lg" style="margin-top:12px" data-act="finish">
        ${icon("check")}Finish &amp; log Day ${day.day}</button>
      <div style="text-align:center;margin-top:6px">
        <button class="btn btn-ghost btn-danger" data-act="discard">Throw this workout away</button>
      </div>
      <p class="tiny faint" style="margin:10px 0 0">Every set saves the moment you log it, so you can close
      this and come back mid-workout. Finishing is what moves the rotation forward.</p>
    </div>`;
  }

  $("#panel-today").innerHTML = html;
}

/* The full plan is ~20 sets a day. Going straight to that from nothing is how
   people end up too sore to walk by day four, so ease in over two weeks. */
function rampNotice(workouts) {
  if (workouts >= 14) return "";
  const week1 = workouts < 7;
  return `<div class="card card-pad ramp">
    <div class="eyebrow">${icon("info")}${week1 ? "Week one" : "Week two"} &middot; ease in</div>
    <p class="small muted" style="margin:7px 0 0">
      Do <b>${week1 ? "2 sets" : "3 sets"}</b> per machine instead of the full 4, at a weight you
      could clearly do more reps with. ${
        week1
          ? "Everything will feel too easy. That's correct &mdash; the soreness from week one shows up two days later."
          : "One more week of this, then the full plan."
      }
      <span class="faint">(${workouts} of 14 workouts in.)</span>
    </p>
  </div>`;
}

function machineCard(m, i, active) {
  const logged = active ? active.logged[m.slug] || [] : [];
  const done = logged.length >= m.target_sets;
  const open = OPEN_HOWTO.has(m.slug);

  let html = `<div class="card machine-card ${done ? "done" : ""}">
    <div class="machine-head">
      <div class="machine-num">${done ? icon("check") : i + 1}</div>
      <div style="min-width:0">
        <div class="machine-name">${esc(m.name)}</div>
        <div class="machine-meta">${esc(m.muscles)}</div>
      </div>
      <div class="target"><b>${m.target_sets} sets</b>${m.rep_low}&ndash;${m.rep_high} reps</div>
    </div>

    <div class="coach">${icon("bulb")}
      <div><b>${esc(m.suggestion.headline)}</b><p>${esc(m.suggestion.detail)}</p></div>
    </div>

    <div class="lastline effortline"><span class="k">How hard</span>
      <span>Sets 1&ndash;${m.target_sets - 1}: stop with about <b>2 reps left</b> in you.
      Last set: stop with <b>1</b>. Going to total failure every set isn't the goal.</span>
    </div>`;

  if (m.last) {
    html += `<div class="lastline"><span class="k">Last time</span>
      <span>${esc(m.last.date_label)} &mdash; ${m.last.sets
        .map((x) => `${num(x.weight)}&nbsp;lb &times; ${x.reps}`)
        .join(", ")}</span></div>`;
  }

  if (logged.length) {
    html += `<div class="sets">${logged
      .map(
        (x, n) => `<div class="setrow">
          <span class="idx">${n + 1}</span>
          <span class="val"><b>${num(x.weight)} lb</b> &times; ${x.reps} reps</span>
          <button class="btn btn-ghost btn-danger x" data-act="del-set" data-id="${x.id}"
            aria-label="Delete set ${n + 1}">${icon("x")}</button>
        </div>`
      )
      .join("")}</div>`;
  }

  if (active) {
    const pre = INPUTS[m.slug] || {};
    const lastLogged = logged[logged.length - 1];
    const weight =
      pre.weight !== undefined
        ? pre.weight
        : lastLogged
        ? num(lastLogged.weight)
        : m.suggestion.weight !== null
        ? num(m.suggestion.weight)
        : "";
    const reps =
      pre.reps !== undefined ? pre.reps : lastLogged ? lastLogged.reps : m.rep_high;

    html += `<div class="entry">
      <div class="entry-grid">
        <div class="field"><label>Weight (lb)</label>
          <div class="stepper">
            <button data-act="bump" data-slug="${m.slug}" data-f="weight" data-by="-${m.jump}" aria-label="Less weight">&minus;</button>
            <input type="number" inputmode="decimal" step="any" data-in="weight" data-slug="${m.slug}" value="${weight}" placeholder="0">
            <button data-act="bump" data-slug="${m.slug}" data-f="weight" data-by="${m.jump}" aria-label="More weight">+</button>
          </div>
        </div>
        <div class="field"><label>Reps</label>
          <div class="stepper">
            <button data-act="bump" data-slug="${m.slug}" data-f="reps" data-by="-1" aria-label="Fewer reps">&minus;</button>
            <input type="number" inputmode="numeric" step="1" data-in="reps" data-slug="${m.slug}" value="${reps}" placeholder="0">
            <button data-act="bump" data-slug="${m.slug}" data-f="reps" data-by="1" aria-label="More reps">+</button>
          </div>
        </div>
      </div>
      <button class="btn btn-block" data-act="log-set" data-slug="${m.slug}">
        ${icon("plus")}Log set ${logged.length + 1}${
      logged.length + 1 > m.target_sets ? " (bonus)" : ` of ${m.target_sets}`
    }</button>
    </div>`;
  }

  html += `<details class="howto" data-slug="${m.slug}" ${open ? "open" : ""}>
    <summary>${icon("info")}How to set it up</summary>
    <div class="howto-body">
      <p><span class="k">Setup</span>${esc(m.setup)}</p>
      <p><span class="k">Doing the reps</span>${esc(m.cue)}</p>
      ${
        m.best !== null
          ? `<p><span class="k">Your heaviest ever</span>${num(m.best)} lb</p>`
          : ""
      }
    </div>
  </details></div>`;

  return html;
}

/* --- schedule ---------------------------------------------------------- */

function renderSchedule() {
  const s = STATE;
  const nextDay = s.up_next.day;
  const last = s.last_completed_day;

  let html = `<div class="card card-pad">
    <div class="eyebrow">${icon("rotate")} Where you are</div>
    <h2 style="font-size:19px;margin:7px 0 8px">Up next is Day ${nextDay}: ${esc(s.up_next.title)}</h2>
    <p class="small muted" style="margin:0 0 14px">
      The rotation is a queue, not a calendar. It always serves up the day after the last one you
      finished, so missing a day &mdash; or three &mdash; never knocks it out of order. Use this only
      if the app and real life disagree.
    </p>
    <div class="field">
      <label for="fix-day">The last day I actually finished was</label>
      <select class="input" id="fix-day">
        <option value="0"${last === null ? " selected" : ""}>Nothing yet &mdash; start me at Day 1</option>
        ${BOOT.rotation
          .map(
            (d) =>
              `<option value="${d.day}"${last === d.day ? " selected" : ""}>Day ${d.day} &mdash; ${esc(d.title)}</option>`
          )
          .join("")}
      </select>
    </div>
    <button class="btn btn-primary btn-block" style="margin-top:12px" data-act="fix-rotation">
      ${icon("check")}Set the rotation</button>
  </div>

  <div class="section-title">The 7-day rotation</div>
  <div class="card">`;

  html += BOOT.rotation
    .map((d) => {
      const hist = s.day_history[String(d.day)];
      return `<div class="dayrow ${d.day === nextDay ? "next" : ""}">
        <div class="daynum">${d.day}</div>
        <div style="min-width:0;flex:1">
          <h3>${esc(d.title)}</h3>
          <div class="daymachines">${d.machines.map((x) => esc(MACHINES[x].name)).join(" &middot; ")}</div>
          <div class="daywhen">${
            hist ? `Last done ${esc(hist.label)}` : "Not logged yet"
          }${d.day === nextDay ? " &middot; up next" : ""}</div>
        </div>
        ${
          STATE.active
            ? ""
            : `<div class="go"><button class="btn btn-ghost" data-act="start-day" data-day="${d.day}">Start</button></div>`
        }
      </div>`;
    })
    .join("");

  html += `</div>
  <div class="card card-pad">
    <div class="eyebrow">Why this split</div>
    <p class="small muted" style="margin:7px 0 10px">
      Push, pull and legs, each twice a week, plus a lighter catch-up day for the small muscles.
      Four or five machines a day at four sets each &mdash; about <b>20 sets, or an hour</b> with
      rests. Every muscle lands between <b>12 and 16 sets per week</b>, which is the range where
      growth actually happens.
    </p>
    <p class="small muted" style="margin:0 0 10px">
      The hour is deliberate, not a ceiling you should push past. At seven days a week the thing
      that limits you is recovery, not time. Past roughly 20 sets per muscle per week you pile up
      fatigue faster than you clear it and the extra work stops paying.
    </p>
    <p class="small muted" style="margin:0">
      Spreading sets across two or three days beats cramming them into one &mdash; late sets in a
      long session are done tired and count for less. Doing cardio? Afterward, or later in the day.
      Never before.
    </p>
  </div>`;

  $("#panel-schedule").innerHTML = html;
}

/* --- history ----------------------------------------------------------- */

async function renderHistory() {
  const el = $("#panel-history");
  if (!HISTORY) {
    el.innerHTML = `<div class="empty">Loading...</div>`;
    try {
      HISTORY = (await api("/history")).sessions;
    } catch (err) {
      el.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
      return;
    }
  }

  if (!HISTORY.length) {
    el.innerHTML = `<div class="card"><div class="empty">${icon("history")}
      <div>No finished workouts yet.</div>
      <div class="tiny" style="margin-top:6px">Log one on the Today tab and it shows up here.</div>
    </div></div>`;
    return;
  }

  const totalVolume = HISTORY.reduce((a, x) => a + x.volume, 0);
  let html = `<div class="stat-row" style="margin-bottom:16px">
      <div class="stat"><b>${HISTORY.length}</b><span>Workouts</span></div>
      <div class="stat"><b>${HISTORY.reduce((a, x) => a + x.total_sets, 0)}</b><span>Sets</span></div>
      <div class="stat"><b>${Math.round(totalVolume / 1000)}k</b><span>Pounds moved</span></div>
    </div>
    <div class="card">`;

  html += HISTORY.map(
    (h) => `<div class="hist">
      <div class="hist-top">
        <h3>Day ${h.day} &middot; ${esc(h.title)}</h3>
        <span class="when">${esc(h.date_label)}</span>
      </div>
      <div class="hist-body">${h.machines
        .map(
          (m) =>
            `<div><span class="nm">${esc(m.name)}</span> &mdash; ${m.sets
              .map((x) => `${num(x.weight)} lb &times; ${x.reps}`)
              .join(", ")}</div>`
        )
        .join("")}</div>
      ${h.notes ? `<div class="hist-note">${esc(h.notes)}</div>` : ""}
      <div style="margin-top:8px">
        <button class="btn btn-ghost btn-danger tiny" data-act="del-session" data-id="${h.id}">Delete</button>
      </div>
    </div>`
  ).join("");

  html += `</div><p class="tiny faint" style="text-align:center">Pounds moved = weight &times; reps &times; sets, added up.</p>`;
  el.innerHTML = html;
}

/* --- glossary ---------------------------------------------------------- */

function renderGlossary() {
  const html = `<div class="card card-pad">
      <div class="eyebrow">${icon("book")} Plain English</div>
      <p class="small muted" style="margin:7px 0 0">Every bit of gym jargon this app uses, and
      nothing it doesn't. If a word in here still doesn't make sense, it's the explanation's fault.</p>
    </div>
    <div class="card">${BOOT.glossary
      .map(
        (g) => `<div class="term">
          <h3>${esc(g.term)}</h3>
          <div class="short">${esc(g.short)}</div>
          <p>${esc(g.long)}</p>
        </div>`
      )
      .join("")}</div>
    <div class="card card-pad">
      <div class="eyebrow">The 60-second version</div>
      <p class="small muted" style="margin:7px 0 0">
        Pick a weight you can move 10 times with good form. Do that 3 times, resting a minute or so
        between. Write down what you did. When all 3 rounds hit the top of the rep range, add the
        smallest amount of weight the machine allows and repeat. That's the whole game.
      </p>
    </div>`;
  $("#panel-glossary").innerHTML = html;
}

/* --- render + tabs ----------------------------------------------------- */

function render() {
  const y = window.scrollY;
  if (STATE) {
    renderToday();
    renderSchedule();
    $("#head-sub").textContent = STATE.active
      ? `Day ${STATE.active.day} in progress`
      : `Up next: Day ${STATE.up_next.day} of ${BOOT.total_days}`;
  }
  if (TAB === "history") renderHistory();
  if (TAB === "glossary") renderGlossary();
  window.scrollTo(0, y);
}

function selectTab(tab) {
  TAB = tab;
  document.querySelectorAll("nav.tabs button").forEach((b) =>
    b.setAttribute("aria-selected", String(b.dataset.tab === tab))
  );
  document.querySelectorAll(".panel").forEach((p) =>
    p.classList.toggle("active", p.id === "panel-" + tab)
  );
  if (tab === "history") renderHistory();
  if (tab === "glossary") renderGlossary();
  window.scrollTo(0, 0);
}

/* --- events ------------------------------------------------------------ */

document.addEventListener("click", async (e) => {
  const tab = e.target.closest("nav.tabs button");
  if (tab) return selectTab(tab.dataset.tab);

  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const a = btn.dataset.act;

  if (a === "go-schedule") return selectTab("schedule");

  if (a === "start") {
    await act("/session/start", { method: "POST", body: {} });
    return toast("Workout started. Log sets as you go.");
  }

  if (a === "start-day") {
    await act("/session/start", { method: "POST", body: { day: +btn.dataset.day } });
    selectTab("today");
    return toast(`Day ${btn.dataset.day} started.`);
  }

  if (a === "bump") {
    const { slug, f } = btn.dataset;
    const input = document.querySelector(`input[data-in="${f}"][data-slug="${slug}"]`);
    const by = parseFloat(btn.dataset.by);
    const next = Math.max(0, (parseFloat(input.value) || 0) + by);
    input.value = f === "reps" ? Math.round(next) : next;
    INPUTS[slug] = { ...INPUTS[slug], [f]: input.value };
    return;
  }

  if (a === "log-set") {
    const slug = btn.dataset.slug;
    const w = document.querySelector(`input[data-in="weight"][data-slug="${slug}"]`).value;
    const r = document.querySelector(`input[data-in="reps"][data-slug="${slug}"]`).value;
    if (w === "" || r === "") return toast("Fill in both weight and reps.", true);
    delete INPUTS[slug];
    await act("/sets", { method: "POST", body: { machine: slug, weight: w, reps: r } });
    return toast(`Logged ${num(w)} lb x ${r} on ${MACHINES[slug].name}.`);
  }

  if (a === "del-set") {
    await act(`/sets/${btn.dataset.id}`, { method: "DELETE" });
    return toast("Set removed.");
  }

  if (a === "finish") {
    NOTES = $("#notes") ? $("#notes").value : "";
    const day = STATE.active.day;
    await act("/session/finish", { method: "POST", body: { notes: NOTES } });
    NOTES = "";
    Object.keys(INPUTS).forEach((k) => delete INPUTS[k]);
    return toast(`Day ${day} in the books. Next up: Day ${STATE.up_next.day}.`);
  }

  if (a === "discard") {
    if (!confirm("Delete this workout and everything logged in it?")) return;
    await act("/session/discard", { method: "POST" });
    NOTES = "";
    return toast("Workout discarded.");
  }

  if (a === "change-date") {
    const current = STATE.active.workout_date;
    const answer = prompt(
      "What date should this workout count for? (YYYY-MM-DD)\n\nUse this to log a day you did but didn't track at the time.",
      current
    );
    if (!answer || answer === current) return;
    await act("/session/date", { method: "POST", body: { workout_date: answer.trim() } });
    return toast("Date updated.");
  }

  if (a === "fix-rotation") {
    const day = +$("#fix-day").value;
    await act("/rotation", { method: "POST", body: { last_completed_day: day } });
    selectTab("today");
    return toast(`Rotation set. Up next: Day ${STATE.up_next.day}.`);
  }

  if (a === "del-session") {
    if (!confirm("Delete this logged workout for good?")) return;
    try {
      await api(`/history/${btn.dataset.id}`, { method: "DELETE" });
    } catch (err) {
      return toast(err.message, true);
    }
    HISTORY = null;
    STATE = await api("/state");
    render();
    renderHistory();
    return toast("Workout deleted.");
  }
});

/* keep typed-but-not-logged values through re-renders */
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.in) {
    INPUTS[el.dataset.slug] = { ...INPUTS[el.dataset.slug], [el.dataset.in]: el.value };
  }
  if (el.id === "notes") NOTES = el.value;
});

/* enter in a rep field logs the set */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !e.target.dataset || !e.target.dataset.in) return;
  e.preventDefault();
  const slug = e.target.dataset.slug;
  const btn = document.querySelector(`[data-act="log-set"][data-slug="${slug}"]`);
  if (btn) btn.click();
});

document.addEventListener("toggle", (e) => {
  const d = e.target.closest("details.howto");
  if (!d) return;
  d.open ? OPEN_HOWTO.add(d.dataset.slug) : OPEN_HOWTO.delete(d.dataset.slug);
}, true);

/* --- boot -------------------------------------------------------------- */

(async function start() {
  try {
    STATE = await api("/state");
    render();
  } catch (err) {
    $("#panel-today").innerHTML = `<div class="card"><div class="empty">
      Couldn't reach the server.<div class="tiny" style="margin-top:6px">${esc(err.message)}</div>
    </div></div>`;
  }
})();

/* coming back to the tab after a while? refresh so the date labels stay honest */
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !STATE) return;
  try {
    STATE = await api("/state");
    HISTORY = null;
    render();
  } catch (e) {
    /* offline is survivable; the page keeps working */
  }
});
