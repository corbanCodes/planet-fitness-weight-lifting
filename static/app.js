/* Lift Log -- all of the front end. Vanilla JS, no build step. */

const BOOT = window.BOOTSTRAP;
const MACHINES = Object.fromEntries(BOOT.machines.map((m) => [m.slug, m]));

let STATE = null;          // whatever /api/state last said
let HISTORY = null;        // lazily loaded
let WEIGHT = null;
let FOOD = null;
let TAB = "today";
const INPUTS = {};         // slug -> {weight, reps} typed but not yet logged
const OPEN_HOWTO = new Set();
const RAMP_DISABLED = true;
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
  // Corban did six straight days at full sets and felt fine, so the ramp
  // never applied. Left in place in case the plan is ever restarted from zero.
  if (workouts >= 14 || RAMP_DISABLED) return "";
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
        <div class="machine-name">${esc(m.name)}${
          m.assisted ? `<span class="assist-tag">assisted</span>` : ""
        }</div>
        <div class="machine-meta">${esc(m.muscles)}${
          m.assisted ? " &middot; lower number = harder" : ""
        }</div>
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
        <div class="field"><label>${m.assisted ? "Assist (lb)" : "Weight (lb)"}</label>
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
          ? `<p><span class="k">${m.assisted ? "Least help ever" : "Your heaviest ever"}</span>${num(m.best)} lb</p>`
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
      Push, pull and legs, each twice a week, plus a core day. Five machines a day &mdash; about
      <b>19 sets, or 50 minutes</b> with rests. Every one of the 19 machines is in the week, so no
      muscle gets skipped, and <b>no big muscle is ever trained on back-to-back days</b>: chest,
      back and legs always get a day between. The only things that land on consecutive days are
      abs, rear delts, biceps and hip abductors &mdash; small muscles that recover overnight, on
      the lighter core day.
    </p>
    <p class="small muted" style="margin:0 0 10px">
      The hour is deliberate, not a ceiling you should push past. At seven days a week the thing
      that limits you is recovery, not time. Past roughly 20 sets per muscle per week you pile up
      fatigue faster than you clear it and the extra work stops paying.
    </p>
    <p class="small muted" style="margin:0 0 10px">
      Direct sets per week: chest, back and quads 16; rear delts and biceps 12; shoulders, triceps,
      hamstrings, glutes and calves 8 direct, plus everything they get indirectly from the big
      presses, pulls and leg press. Back extension is retired &mdash; glute kickback trains the same
      hip-hinge muscles without the machine you don't fit.
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
    </div></div>` + backupCard();
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
  html += backupCard();
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
  if (TAB === "weight") renderWeight();
  if (TAB === "food") renderFood();
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
  if (tab === "weight") renderWeight();
  if (tab === "food") renderFood();
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


/* --- backup ------------------------------------------------------------ */

function backupCard() {
  return `<div class="card card-pad">
    <div class="eyebrow">${icon("download")} Your data</div>
    <p class="small muted" style="margin:7px 0 12px">
      Everything lives in one file on a Railway volume that survives every deploy. These pull a
      copy down to your phone or laptop any time you want one in your own hands.
    </p>
    <div class="backup">
      <a class="btn" href="/api/export.db" download>${icon("download")}Database file</a>
      <a class="btn" href="/api/export" download="lift-log-export.json">${icon("download")}JSON</a>
    </div>
  </div>`;
}

/* --- weight -------------------------------------------------------------- */

function weightHeadline(st) {
  if (!st.count) return "";
  const lbs = (n) => `${Math.abs(n).toFixed(1)} lb`;
  const since = `since ${esc(friendlyShort(st.start_date))}`;
  let main, sub;

  if (st.days_tracked < 7) {
    main = `<b>${st.latest.toFixed(1)} lb</b> today.`;
    sub = `${7 - st.days_tracked} more ${st.days_tracked === 6 ? "day" : "days"} and the 7-day average takes over from the daily number. Daily weight swings 2&ndash;4 lb on water alone; the average is the one that tells the truth.`;
  } else if (st.change < -0.4) {
    main = `Down <b>${lbs(st.change)}</b> (${Math.abs(st.pct)}%) ${since}.`;
    sub = st.rate !== null && st.rate < 0
      ? `Losing about ${lbs(st.rate)} a week on the 7-day average. ${st.eta ? `At this pace you reach ${st.goal} lb around ${esc(friendlyShort(st.eta.date))}.` : ""}`
      : `7-day average ${st.current.toFixed(1)} lb. The trend is the number that matters, not any one morning.`;
  } else if (st.change > 0.4) {
    main = `7-day average <b>${st.current.toFixed(1)} lb</b>, up ${lbs(st.change)} ${since}.`;
    sub = `A week or two of this is noise &mdash; water, salt, a big meal, a hard leg day. Three weeks of it is a signal: check the Food tab.`;
  } else {
    main = `Holding at <b>${st.current.toFixed(1)} lb</b> ${since}.`;
    sub = `Flat on the scale while lifting hard usually means muscle coming on as fat comes off. Give it another two weeks before changing anything.`;
  }
  return `<div class="headline">${main}<span class="sub">${sub}</span></div>`;
}

function friendlyShort(iso) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function sparkline(entries, goal) {
  if (entries.length < 2) return "";
  const W = 600, H = 150, PL = 34, PR = 10, PT = 10, PB = 20;
  const t0 = Date.parse(entries[0].date);
  const span = Math.max(864e5, Date.parse(entries[entries.length - 1].date) - t0);
  const avg = entries.map((e) => {
    const end = Date.parse(e.date);
    const win = entries.filter((x) => {
      const t = Date.parse(x.date);
      return t > end - 7 * 864e5 && t <= end;
    });
    return { date: e.date, lbs: win.reduce((a, x) => a + x.lbs, 0) / win.length };
  });
  const vals = [...entries.map((e) => e.lbs), ...avg.map((e) => e.lbs)];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 3) { hi += 1.5; lo -= 1.5; }
  const showGoal = goal && goal > lo - 15 && goal < hi + 15;
  if (showGoal) { lo = Math.min(lo, goal - 1); hi = Math.max(hi, goal + 1); }
  const x = (d) => PL + ((Date.parse(d) - t0) / span) * (W - PL - PR);
  const y = (v) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
  const dots = entries.map((e) => `<circle cx="${x(e.date).toFixed(1)}" cy="${y(e.lbs).toFixed(1)}" r="3.2"/>`).join("");
  const line = avg.map((e, i) => `${i ? "L" : "M"}${x(e.date).toFixed(1)},${y(e.lbs).toFixed(1)}`).join(" ");
  const goalLine = showGoal ? `<line class="goal" x1="${PL}" x2="${W - PR}" y1="${y(goal).toFixed(1)}" y2="${y(goal).toFixed(1)}"/>` : "";
  return `<div class="spark-wrap">
    <svg class="spark" viewBox="0 0 ${W} ${H}" aria-label="Weight trend">
      <text x="${PL - 6}" y="${y(hi) + 4}" text-anchor="end">${hi.toFixed(0)}</text>
      <text x="${PL - 6}" y="${y(lo) + 4}" text-anchor="end">${lo.toFixed(0)}</text>
      <text x="${PL}" y="${H - 4}">${esc(friendlyShort(entries[0].date))}</text>
      <text x="${W - PR}" y="${H - 4}" text-anchor="end">${esc(friendlyShort(entries[entries.length - 1].date))}</text>
      ${goalLine}
      <g class="dots">${dots}</g>
      <path d="${line}"/>
    </svg>
    <div class="spark-legend">
      <span><i style="background:var(--text-faint)"></i>Daily weigh-in</span>
      <span><i style="background:var(--gold)"></i>7-day average</span>
      ${showGoal ? `<span><i style="background:var(--green)"></i>Goal ${goal}</span>` : ""}
    </div>
  </div>`;
}

async function renderWeight() {
  const el = $("#panel-weight");
  if (!WEIGHT) {
    el.innerHTML = `<div class="empty">Loading...</div>`;
    try { WEIGHT = await api("/weight"); } catch (err) {
      el.innerHTML = `<div class="empty">${esc(err.message)}</div>`; return;
    }
  }
  const { entries, stats: st, goal } = WEIGHT;
  const today = STATE ? STATE.today : new Date().toISOString().slice(0, 10);
  const todays = entries.find((e) => e.date === today);

  let html = `<div class="card">
    <div class="entry-form">
      <div class="grid-2">
        <div class="field"><label for="w-date">Date</label>
          <input class="input" type="date" id="w-date" value="${today}" max="${today}"></div>
        <div class="field"><label for="w-lbs">Weight (lb)</label>
          <input class="input" type="number" inputmode="decimal" step="0.1" id="w-lbs"
            placeholder="${st.count ? st.latest.toFixed(1) : "e.g. 243.0"}" value="${todays ? todays.lbs : ""}"></div>
      </div>
      <button class="btn btn-primary btn-block" data-act="save-weight">${icon("check")}${todays ? "Update today" : "Log weigh-in"}</button>
      <p class="tiny faint" style="margin:10px 0 0">Same time every day, same conditions &mdash; first thing in the morning, after the bathroom, before coffee. Logging a date twice replaces it.</p>
    </div>
  </div>`;

  if (!st.count) {
    html += `<div class="card"><div class="empty">${icon("scale")}
      <div>No weigh-ins yet.</div>
      <div class="tiny" style="margin-top:6px">Log the first one above. You can back-fill earlier dates too.</div>
    </div></div>`;
    el.innerHTML = html;
    return;
  }

  const rateCell = st.rate === null
    ? `<b>&ndash;</b><span>Per week</span><small>needs 10+ days</small>`
    : `<b class="${st.rate < 0 ? "good" : ""}">${st.rate > 0 ? "+" : ""}${st.rate.toFixed(1)}</b><span>lb / week</span><small>7-day avg trend</small>`;

  html += `<div class="card">
    ${weightHeadline(st)}
    <div class="stat-row in-card">
      <div class="stat"><b class="gold">${st.current.toFixed(1)}</b><span>7-day avg</span><small>${st.window} weigh-in${st.window === 1 ? "" : "s"}</small></div>
      <div class="stat"><b class="${st.change < 0 ? "good" : ""}">${st.change > 0 ? "+" : ""}${st.change.toFixed(1)}</b><span>lb since start</span><small>${st.pct > 0 ? "+" : ""}${st.pct}%</small></div>
      <div class="stat">${rateCell}</div>
    </div>
    ${sparkline(entries, goal)}
    <div class="goal-line">${icon("trend")}
      <span>Goal <b>${goal} lb</b>${st.to_goal > 0 ? ` &middot; ${st.to_goal.toFixed(1)} to go` : st.to_goal !== null && st.to_goal <= 0 ? " &middot; you're there" : ""}</span>
      <button class="btn btn-ghost" data-act="set-goal">Change</button>
    </div>
    <div class="rows">${[...entries].reverse().slice(0, 30).map((e) => `
      <div class="setrow">
        <span class="val"><b>${e.lbs.toFixed(1)} lb</b><span class="meta">${esc(e.date_label)}${e.note ? " &middot; " + esc(e.note) : ""}</span></span>
        <button class="btn btn-ghost btn-danger x" data-act="del-weight" data-id="${e.id}" aria-label="Delete">${icon("x")}</button>
      </div>`).join("")}</div>
    ${entries.length > 30 ? `<p class="tiny faint" style="padding:0 16px 12px">Showing the last 30 of ${entries.length}. Everything is in the backup.</p>` : ""}
  </div>`;
  el.innerHTML = html;
}

/* --- food ---------------------------------------------------------------- */

async function renderFood() {
  const el = $("#panel-food");
  if (!FOOD) {
    el.innerHTML = `<div class="empty">Loading...</div>`;
    try { FOOD = await api("/food"); } catch (err) {
      el.innerHTML = `<div class="empty">${esc(err.message)}</div>`; return;
    }
  }
  const { entries, stats: st, target } = FOOD;
  const today = STATE ? STATE.today : new Date().toISOString().slice(0, 10);
  const todays = entries.find((e) => e.date === today) || {};
  const v = (k) => (todays[k] === null || todays[k] === undefined ? "" : todays[k]);

  let html = `<div class="card">
    <div class="entry-form">
      <div class="field"><label for="f-date">Date</label>
        <input class="input" type="date" id="f-date" value="${today}" max="${today}"></div>
      <div class="field"><label>What you counted &mdash; leave anything blank</label>
        <div class="grid-4">
          <div class="field"><label for="f-cal">Calories</label><input class="input" type="number" inputmode="numeric" id="f-cal" placeholder="&ndash;" value="${v("calories")}"></div>
          <div class="field"><label for="f-pro">Protein</label><input class="input" type="number" inputmode="numeric" id="f-pro" placeholder="&ndash;" value="${v("protein")}"></div>
          <div class="field"><label for="f-carb">Carbs</label><input class="input" type="number" inputmode="numeric" id="f-carb" placeholder="&ndash;" value="${v("carbs")}"></div>
          <div class="field"><label for="f-fat">Fat</label><input class="input" type="number" inputmode="numeric" id="f-fat" placeholder="&ndash;" value="${v("fat")}"></div>
        </div>
      </div>
      <div class="field"><label for="f-note">Note (optional)</label>
        <input class="input" type="text" id="f-note" placeholder="e.g. ate out, guessed the burrito" value="${esc(todays.note || "")}"></div>
      <button class="btn btn-primary btn-block" data-act="save-food">${icon("check")}${todays.id ? "Update today" : "Log the day"}</button>
    </div>
  </div>`;

  if (!st.count) {
    html += `<div class="card"><div class="empty">${icon("food")}
      <div>Nothing logged yet.</div>
      <div class="tiny" style="margin-top:6px">Add up the day and drop the totals in. Protein is the one that matters most.</div>
    </div></div>`;
    el.innerHTML = html;
    return;
  }

  const hit = st.protein_days ? `${st.protein_hits} of ${st.protein_days}` : "&ndash;";
  html += `<div class="card">
    <div class="stat-row in-card">
      <div class="stat"><b>${st.avg_calories ?? "&ndash;"}</b><span>Avg calories</span><small>last 7 days</small></div>
      <div class="stat"><b class="gold">${st.avg_protein ?? "&ndash;"}</b><span>Avg protein</span><small>g, last 7 days</small></div>
      <div class="stat"><b class="${st.protein_days && st.protein_hits === st.protein_days ? "good" : ""}">${hit}</b><span>Days &ge; ${target}g</span><small>protein target</small></div>
    </div>
    <div class="goal-line">${icon("trend")}
      <span>Protein target <b>${target} g</b> a day</span>
      <button class="btn btn-ghost" data-act="set-protein">Change</button>
    </div>
    <div class="rows">${entries.slice(0, 30).map((e) => `
      <div class="setrow">
        <span class="val">
          <div class="macro-line">${[
            e.calories !== null ? `<span><b>${e.calories}</b> cal</span>` : "",
            e.protein !== null ? `<span><b>${e.protein}</b>g protein</span>` : "",
            e.carbs !== null ? `<span><b>${e.carbs}</b>g carbs</span>` : "",
            e.fat !== null ? `<span><b>${e.fat}</b>g fat</span>` : "",
          ].filter(Boolean).join("")}</div>
          <span class="meta" style="margin:0">${esc(e.date_label)}${e.note ? " &middot; " + esc(e.note) : ""}</span>
        </span>
        <button class="btn btn-ghost btn-danger x" data-act="del-food" data-id="${e.id}" aria-label="Delete">${icon("x")}</button>
      </div>`).join("")}</div>
  </div>`;
  el.innerHTML = html;
}

/* --- weight & food actions ---------------------------------------------- */

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const a = btn.dataset.act;
  const val = (id) => ($(id) ? $(id).value.trim() : "");

  try {
    if (a === "save-weight") {
      if (val("#w-lbs") === "") return toast("Enter a weight.", true);
      WEIGHT = await api("/weight", { method: "POST", body: { date: val("#w-date"), lbs: val("#w-lbs") } });
      renderWeight();
      return toast("Weigh-in saved.");
    }
    if (a === "del-weight") {
      if (!confirm("Delete this weigh-in?")) return;
      WEIGHT = await api(`/weight/${btn.dataset.id}`, { method: "DELETE" });
      renderWeight();
      return toast("Removed.");
    }
    if (a === "set-goal") {
      const cur = WEIGHT ? WEIGHT.goal : "";
      const answer = prompt("Goal weight, in lb:", cur);
      if (!answer || +answer === cur) return;
      await api("/settings", { method: "POST", body: { goal_weight: answer } });
      WEIGHT = null; renderWeight();
      return toast("Goal updated.");
    }
    if (a === "save-food") {
      FOOD = await api("/food", {
        method: "POST",
        body: {
          date: val("#f-date"), calories: val("#f-cal"), protein: val("#f-pro"),
          carbs: val("#f-carb"), fat: val("#f-fat"), note: val("#f-note"),
        },
      });
      renderFood();
      return toast("Day logged.");
    }
    if (a === "del-food") {
      if (!confirm("Delete this day's food log?")) return;
      FOOD = await api(`/food/${btn.dataset.id}`, { method: "DELETE" });
      renderFood();
      return toast("Removed.");
    }
    if (a === "set-protein") {
      const cur = FOOD ? FOOD.target : "";
      const answer = prompt("Daily protein target, in grams:", cur);
      if (!answer || +answer === cur) return;
      await api("/settings", { method: "POST", body: { protein_target: answer } });
      FOOD = null; renderFood();
      return toast("Target updated.");
    }
  } catch (err) {
    toast(err.message, true);
  }
});
