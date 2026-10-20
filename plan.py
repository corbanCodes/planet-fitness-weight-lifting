"""The gym plan: every machine, the 7-day rotation, and the plain-English glossary.

All of this is static data. Editing it here changes the app -- nothing is stored
in the database except the workouts you actually log.
"""

# --- Machines -------------------------------------------------------------
# "slug" is the permanent id used in the database. Never change a slug once
# you've logged workouts on it; change the "name" instead.
#
# target_sets / rep_low / rep_high are the default goal shown while logging.

MACHINES = [
    {
        "slug": "seated-leg-press",
        "name": "Seated Leg Press",
        "muscles": "Thighs, glutes",
        "target_sets": 4,
        "rep_low": 10,
        "rep_high": 12,
        "setup": "Back flat against the pad, feet about shoulder width on the plate, "
                 "knees tracking over your toes.",
        "cue": "Push until your legs are almost straight -- never snap the knees "
               "locked. Lower until your knees are around 90 degrees.",
        "jump": 10,
    },
    {
        "slug": "leg-extension",
        "name": "Leg Extension",
        "muscles": "Front of the thighs (quads)",
        "target_sets": 4,
        "rep_low": 10,
        "rep_high": 12,
        "setup": "Knees lined up with the machine's pivot point, shin pad just above "
                 "your ankles.",
        "cue": "Straighten your legs out in front of you, pause for a beat at the "
               "top, then lower slowly.",
        "jump": 5,
    },
    {
        "slug": "seated-leg-curl",
        "name": "Seated Leg Curl",
        "muscles": "Back of the thighs (hamstrings)",
        "target_sets": 4,
        "rep_low": 10,
        "rep_high": 12,
        "setup": "Thigh pad snug across your legs, pad resting on the back of your "
                 "ankles.",
        "cue": "Pull your heels down and under you. Let it back up slowly instead of "
               "letting the stack drop.",
        "jump": 5,
    },
    {
        "slug": "calf-extension",
        "name": "Calf Extension",
        "muscles": "Calves",
        "target_sets": 4,
        "rep_low": 15,
        "rep_high": 20,
        "setup": "Balls of your feet on the platform, heels hanging off the edge.",
        "cue": "Push all the way up onto your toes, then let your heels sink below "
               "the platform for a stretch. Calves like higher reps.",
        "jump": 10,
    },
    {
        "slug": "chest-press",
        "name": "Chest Press",
        "muscles": "Chest, front shoulders, triceps",
        "target_sets": 4,
        "rep_low": 8,
        "rep_high": 12,
        "setup": "Seat height so the handles sit at mid-chest, not up by your neck.",
        "cue": "Press straight out and bring the handles together slightly. Stop just "
               "short of locking your elbows.",
        "jump": 5,
    },
    {
        "slug": "pectoral-fly",
        "name": "Pectoral Fly",
        "muscles": "Chest",
        "target_sets": 4,
        "rep_low": 10,
        "rep_high": 12,
        "setup": "Elbows level with your shoulders on the arm pads, back flat against "
                 "the seat.",
        "cue": "Hug the pads together in front of you like closing a door. Open back "
               "up slowly until you feel a stretch, then stop.",
        "jump": 5,
    },
    {
        "slug": "rear-deltoid-fly",
        "name": "Rear Deltoid Fly",
        "muscles": "Back of the shoulders, upper back",
        "target_sets": 4,
        "rep_low": 12,
        "rep_high": 15,
        "setup": "Usually the same machine as the pectoral fly, flipped around -- chest "
                 "against the pad, arms out front.",
        "cue": "Sweep your arms out and back like opening curtains. Squeeze your "
               "shoulder blades together. Go light here.",
        "jump": 5,
    },
    {
        "slug": "pull-down",
        "name": "Pull Down",
        "muscles": "Back (lats), biceps",
        "target_sets": 4,
        "rep_low": 8,
        "rep_high": 12,
        "setup": "Thigh pad locked down so you don't lift off the seat. Wide grip on "
                 "the bar.",
        "cue": "Pull the bar to your upper chest, leading with your elbows. Let it "
               "rise all the way back up under control.",
        "jump": 10,
    },
    {
        "slug": "row-press",
        "name": "Row Press",
        "muscles": "Mid-back, biceps",
        "target_sets": 4,
        "rep_low": 8,
        "rep_high": 12,
        "setup": "Chest against the pad, handles at about belly-button height.",
        "cue": "Row the handles back toward your ribs and pinch your shoulder blades "
               "together. Don't shrug your shoulders up.",
        "jump": 10,
    },
    {
        "slug": "shoulder-press",
        "name": "Shoulder Press",
        "muscles": "Shoulders, triceps",
        "target_sets": 4,
        "rep_low": 8,
        "rep_high": 12,
        "setup": "Seat set so the handles start at about ear height.",
        "cue": "Press straight overhead without arching your lower back. Stop just "
               "short of locking out.",
        "jump": 5,
    },
    {
        "slug": "back-extension",
        "name": "Back Extension",
        "muscles": "Lower back, glutes",
        "target_sets": 3,
        "rep_low": 12,
        "rep_high": 15,
        "setup": "Pad across your upper back, hips against the seat pad.",
        "cue": "Lean back smoothly until your torso is in line with your hips -- no "
               "further, no bouncing. Lower back gets worked slow and light.",
        "jump": 10,
    },
    {
        "slug": "biceps-curl",
        "name": "Biceps Curl",
        "muscles": "Front of the upper arms",
        "target_sets": 4,
        "rep_low": 10,
        "rep_high": 12,
        "setup": "Upper arms flat on the pad, armpits snug against the top of it.",
        "cue": "Curl the handles up toward your shoulders, then lower all the way "
               "down until your arms are straight.",
        "jump": 5,
    },
    {
        "slug": "triceps-extension",
        "name": "Triceps Extension",
        "muscles": "Back of the upper arms",
        "target_sets": 4,
        "rep_low": 10,
        "rep_high": 12,
        "setup": "Elbows planted on the pad, hands on the handles up near your head.",
        "cue": "Straighten your arms out and away from you. Keep your elbows still -- "
               "only your forearms move.",
        "jump": 5,
    },
    {
        "slug": "triceps-press",
        "name": "Triceps Press",
        "muscles": "Back of the upper arms, chest",
        "target_sets": 4,
        "rep_low": 10,
        "rep_high": 12,
        "setup": "Seat set so the handles are at about chest height, elbows tucked in "
                 "at your sides.",
        "cue": "Press down and back until your arms are straight, elbows staying "
               "close to your ribs.",
        "jump": 5,
    },
]

MACHINES_BY_SLUG = {m["slug"]: m for m in MACHINES}


# --- The 7-day rotation ---------------------------------------------------
# Three or four machines a day, every muscle group hit about twice a week.
# The rotation is a sequence, not a calendar: it always picks up where you
# left off, so missing a day never throws it off.

ROTATION = [
    {
        "day": 1,
        "title": "Legs: Thighs & Calves",
        "focus": "Pushing with your legs",
        "machines": ["seated-leg-press", "leg-extension", "calf-extension"],
    },
    {
        "day": 2,
        "title": "Chest & Triceps",
        "focus": "Everything that pushes away from you",
        "machines": ["chest-press", "pectoral-fly", "triceps-press"],
    },
    {
        "day": 3,
        "title": "Back & Biceps",
        "focus": "Everything that pulls toward you",
        "machines": ["pull-down", "row-press", "rear-deltoid-fly", "biceps-curl"],
    },
    {
        "day": 4,
        "title": "Shoulders & Lower Back",
        "focus": "Overhead work plus the posture muscles",
        "machines": ["shoulder-press", "rear-deltoid-fly", "back-extension"],
    },
    {
        "day": 5,
        "title": "Legs: Hamstrings & Lower Back",
        "focus": "The whole back side of you, which day 1 mostly skips",
        "machines": ["seated-leg-curl", "seated-leg-press", "calf-extension",
                     "back-extension"],
    },
    {
        "day": 6,
        "title": "Arms",
        "focus": "Biceps and triceps on their own, nothing else competing",
        "machines": ["biceps-curl", "triceps-extension", "triceps-press"],
    },
    {
        "day": 7,
        "title": "Full Body, Light",
        "focus": "One of everything at an easy weight -- the recovery day you still show up for",
        "machines": ["chest-press", "pull-down", "seated-leg-curl", "shoulder-press"],
    },
]

ROTATION_BY_DAY = {d["day"]: d for d in ROTATION}
TOTAL_DAYS = len(ROTATION)


def next_day_after(day):
    """Day 7 wraps back around to day 1."""
    if not day:
        return 1
    return day % TOTAL_DAYS + 1


# --- Glossary -------------------------------------------------------------
# Plain-English definitions for every piece of gym jargon in the app.

GLOSSARY = [
    {
        "term": "Rep",
        "short": "One single movement",
        "long": "Short for repetition. One full push or pull and back to the start. "
                "Lifting the handles once and lowering them once is one rep.",
    },
    {
        "term": "Set",
        "short": "A batch of reps in a row",
        "long": "A group of reps done back to back without stopping. "
                "\"3 sets of 10\" means ten reps, rest, ten more, rest, ten more. "
                "Thirty reps total, in three batches.",
    },
    {
        "term": "Weight",
        "short": "The number on the stack",
        "long": "What the machine is set to, in pounds. On most Planet Fitness "
                "machines you move a pin in the weight stack to pick it. If the "
                "machine shows a plate number instead of pounds, just log the plate "
                "number and stay consistent -- what matters is that it goes up over time.",
    },
    {
        "term": "Rest",
        "short": "60 to 90 seconds between sets",
        "long": "The break between sets. About a minute to ninety seconds is right "
                "for what you're doing. Less and you're too gassed to hit your reps; "
                "much more and you're just sitting in the gym.",
    },
    {
        "term": "Rep range",
        "short": "The window you're aiming for, like 10 to 12",
        "long": "A target instead of an exact number. If the goal is 10-12 reps, the "
                "weight should be heavy enough that stopping at 10 feels earned, but "
                "light enough that you could reach 12. Hit 12 on every set and it's "
                "time to add weight.",
    },
    {
        "term": "Reps in reserve (RIR)",
        "short": "How many reps you had left",
        "long": "The most useful number in lifting, and it isn't written on the "
                "machine. At the end of a set, ask: could I have done 2 more good "
                "reps? If yes, that's 2 reps in reserve, and that's where most of "
                "your sets should land. Stop one rep short on the last set of each "
                "machine. Going all the way to zero on every set costs you a lot of "
                "recovery and buys you almost nothing.",
    },
    {
        "term": "Junk volume",
        "short": "Extra sets that don't do anything",
        "long": "Sets piled onto the same machine after you're already tired. Set "
                "six of a leg press is done with so much fatigue that it adds "
                "soreness without adding much growth. This is why the plan is 4 sets "
                "on a few machines instead of 6 sets on one -- and why extra work "
                "goes to a different day, not the end of today's.",
    },
    {
        "term": "Warm-up set",
        "short": "One easy set first",
        "long": "A set at roughly half your usual weight for 10 easy reps before you "
                "start for real. It wakes the muscle up and keeps you out of the "
                "physical therapist's office. It doesn't count toward your 3 sets, so "
                "don't log it.",
    },
    {
        "term": "Working weight",
        "short": "The real weight, after the warm-up",
        "long": "The weight you do your actual counted sets with. That's the number "
                "this app tracks.",
    },
    {
        "term": "Progressive overload",
        "short": "Slowly add weight over time",
        "long": "The whole point of lifting, in two words: ask your body for a little "
                "more than last time. Once you can hit the top of the rep range on "
                "every set, add the smallest jump the machine allows -- usually 5 or "
                "10 pounds -- and work back up. This app tells you when you've earned it.",
    },
    {
        "term": "Form",
        "short": "Doing the movement right",
        "long": "Controlled, full range, no swinging or jerking the weight. Good form "
                "with less weight beats bad form with more weight every time. If you "
                "have to heave it, drop the weight.",
    },
    {
        "term": "Failure",
        "short": "Can't do another rep",
        "long": "The point where you physically can't complete another clean rep. "
                "Training to failure on every set grows no more muscle than stopping "
                "a couple of reps short, but it costs far more recovery and carries "
                "more injury risk -- so it's a tool, not a default. Stay a rep or two "
                "away on most sets. Never chase it on the leg press.",
    },
    {
        "term": "Tempo",
        "short": "How fast you move",
        "long": "A good default: about one second to push, two to three seconds to "
                "lower. Lowering slowly is where a surprising amount of the growth "
                "comes from, and it's the part everyone rushes.",
    },
    {
        "term": "Push / pull",
        "short": "Two kinds of movement",
        "long": "Pushing moves weight away from you (chest press, shoulder press). "
                "Pulling brings it toward you (pull down, row). Splitting them across "
                "different days is why your rotation looks the way it does.",
    },
    {
        "term": "Split",
        "short": "Dividing the body across days",
        "long": "Instead of training everything every day, each day covers a few "
                "muscle groups so the others recover. Yours is a 7-day split, three "
                "to four machines a day.",
    },
    {
        "term": "Volume",
        "short": "Total work done",
        "long": "Sets times reps times weight. It's the number that tells you whether "
                "a workout was actually harder than the last one, even if the weight "
                "on one machine stayed put. This app totals it for you.",
    },
    {
        "term": "Weekly sets",
        "short": "How much a muscle gets per week",
        "long": "The number that actually drives growth: how many hard sets a muscle "
                "gets across the whole week, not in one session. Somewhere around 10 "
                "to 20 is the productive range. This rotation puts every muscle "
                "between 8 and 12, which is a sensible place to live for your first "
                "several months. If you want more later, add a set per machine "
                "before you add anything else.",
    },
    {
        "term": "Plateau",
        "short": "Progress stalls out",
        "long": "A few weeks where the weight stops going up. Normal. Usually fixed by "
                "sleeping more, eating more protein, or dropping the weight 20 percent "
                "and building back up with cleaner form.",
    },
]
