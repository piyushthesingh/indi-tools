/* ===============================================================
   Built-in programmes. These are templates: on first run each is
   copied into the store, and the copy is what you edit. "Reset to
   original" in the split editor copies the template again.

   Item fields: ex = catalogue id (js/catalog.js), n = display name,
   opts = alternatives the ⇄ button cycles through (images come from the
   catalogue mapping in js/images.js), p/s = primary/assisting muscles, type overrides the
   catalogue's logging type.
=============================================================== */

const TEMPLATES = [
  {
    id: "ps", name: "Sushi", emoji: "🍣",
    days: [
      { id: "push-1", name: "Push 1", title: "Push 1", focus: "Chest heavy, triceps, front and side delts",
        items: [
          {"ex": 62, "n": "Barbell bench press", "tag": "heavy", "sets": 3, "reps": "5-8", "p": ["chest"], "s": ["triceps", "delts"], "cue": "Shoulder blades pinned back and down, feet driving into the floor. Bar to the lower chest, not the throat."},
          {"ex": 64, "n": "Incline dumbbell press", "sets": 3, "reps": "8-12", "p": ["chest"], "s": ["delts", "triceps"], "cue": "Bench at about 30 degrees. Steeper turns it into a shoulder press."},
          {"opts": [{"ex": 74, "n": "Pec deck"}, {"ex": 75, "n": "Cable fly"}], "sets": 3, "reps": "12-15", "p": ["chest"], "s": ["delts"], "cue": "Slight elbow bend held constant. You are hugging, not pressing."},
          {"ex": 110, "n": "Seated dumbbell shoulder press", "sets": 3, "reps": "8-12", "p": ["delts"], "s": ["triceps", "traps"], "cue": "Ribs down, do not arch the lower back to get the weight up."},
          {"ex": 115, "n": "Lateral raise", "sets": 3, "reps": "12-20", "p": ["delts"], "s": ["traps"], "cue": "Lead with the elbows, stop at shoulder height. Light weight beats swinging."},
          {"ex": 141, "n": "Tricep pushdown", "sets": 3, "reps": "10-15", "p": ["triceps"], "s": [], "cue": "Elbows glued to your sides, only the forearms move."},
          {"ex": 144, "n": "Overhead tricep extension", "sets": 3, "reps": "10-15", "p": ["triceps"], "s": [], "cue": "Full stretch at the bottom. This is where the long head does its work."},
          {"opts": [{"ex": 126, "n": "Cable external rotation"}, {"ex": 126, "n": "Band external rotation"}], "sets": 3, "reps": "15-20 per side", "p": ["rotator"], "s": ["delts-rear"], "cue": "Elbow tucked to your side at 90 degrees. Light weight, slow return. Injury insurance, not size work."},
          {"ex": 208, "n": "Incline treadmill walk", "type": "cardio", "sets": 1, "reps": "15-20 min", "p": [], "s": ["calves", "quads", "glutes"], "cue": "12-15 percent incline at 4-4.5 km/h. No holding the handrails."}
        ] },
      { id: "pull-1", name: "Pull 1", title: "Pull 1", focus: "Back width, biceps, rear delts, grip",
        items: [
          {"ex": 121, "n": "Rear delt fly", "sets": 2, "reps": "12-14", "p": ["delts-rear"], "s": ["traps", "midback"], "cue": "Thumbs down, arc the arms out and back. Small muscle, small weight."},
          {"ex": 87, "n": "Pull-ups", "tag": "add weight past 12 clean reps", "sets": 3, "reps": "8-12", "p": ["lats"], "s": ["biceps", "midback", "forearms"], "cue": "Full hang at the bottom, chest toward the bar at the top. Rep count should climb as you lean out."},
          {"ex": 95, "n": "Seated cable row", "tag": "primary horizontal pull", "sets": 3, "reps": "8-12", "p": ["midback", "lats"], "s": ["biceps", "delts-rear", "forearms"], "cue": "Torso still. Pull to the navel and squeeze the shoulder blades together, do not rock."},
          {"ex": 94, "n": "Straight-arm lat pulldown", "sets": 3, "reps": "12-15", "p": ["lats"], "s": ["abs"], "cue": "Elbows locked. This is shoulder extension, so nothing should bend."},
          {"ex": 123, "n": "Face pull", "sets": 3, "reps": "15-20", "p": ["delts-rear"], "s": ["traps", "rotator", "midback"], "cue": "Pull toward the forehead and finish with elbows above shoulder height. That angle also picks up lower traps."},
          {"ex": 131, "n": "Hammer curl", "sets": 3, "reps": "10-12", "p": ["biceps"], "s": ["forearms"], "cue": "Neutral grip throughout. The only movement in the programme hitting brachialis directly."},
          {"ex": 179, "n": "Reverse wrist curl", "sets": 3, "reps": "15-20", "p": ["forearms"], "s": [], "cue": "Light. Extensors only, and they protect against tennis elbow from racket volume."},
          {"ex": 167, "n": "Hanging leg raise", "sets": 3, "reps": "near failure", "p": ["abs"], "s": ["obliques"], "cue": "Curl the pelvis up rather than just swinging the legs. No momentum."},
          {"ex": 209, "n": "Stairs", "type": "cardio", "sets": 1, "reps": "10 min", "p": [], "s": ["quads", "glutes", "calves"], "cue": "Steady pace. This is fat loss support, not a conditioning session."}
        ] },
      { id: "legs-1", name: "Legs 1", title: "Legs 1", focus: "Quads, hamstrings, adductors, calves",
        items: [
          {"ex": 1, "n": "Barbell back squat", "sets": 3, "reps": "5-8", "p": ["quads", "glutes"], "s": ["adductors", "erectors", "abs"], "cue": "Brace before you unrack. Break at the hips and knees together, depth to at least parallel."},
          {"ex": 5, "n": "Leg press", "sets": 3, "reps": "8-12", "p": ["quads"], "s": ["glutes", "adductors"], "cue": "Do not let the lower back round off the pad at the bottom. Stop short of that point."},
          {"ex": 6, "n": "Leg extension", "sets": 3, "reps": "12-15", "p": ["quads"], "s": [], "cue": "Pause a beat at the top. This is the one place quads get a hard squeeze."},
          {"ex": 18, "n": "Walking lunges", "sets": 3, "reps": "10-12 per leg", "p": ["quads", "glutes"], "s": ["hamstrings", "adductors"], "cue": "Longer stride shifts work to glutes, shorter stride to quads. Pick one and stay consistent."},
          {"ex": 43, "n": "Seated leg curl", "sets": 3, "reps": "10-15", "p": ["hamstrings"], "s": ["calves"], "cue": "Added here so hamstrings get trained twice a week rather than once."},
          {"ex": 52, "n": "Adductor machine", "sets": 3, "reps": "12-15", "p": ["adductors"], "s": [], "cue": "Control the return. The stretched position is where groin strains happen in football."},
          {"ex": 56, "n": "Standing calf raise", "tag": "straight foot, heavy", "sets": 3, "reps": "12-15", "p": ["calves"], "s": [], "cue": "Knee straight means gastrocnemius. Full stretch at the bottom, pause at the top."},
          {"ex": 57, "n": "Seated calf raise", "tag": "bench and dumbbell on knees", "sets": 3, "reps": "15-20", "p": ["calves"], "s": [], "cue": "Knee bent means soleus. Different muscle from the standing version, not a repeat."},
          {"ex": 61, "n": "Heel walks", "type": "dist", "tag": "toes lifted", "sets": 3, "reps": "20-30 m", "p": ["tibialis"], "s": [], "cue": "Can be done during rest periods. Balances 14 weekly sets of calf work."},
          {"ex": 208, "n": "Incline treadmill walk", "type": "cardio", "sets": 1, "reps": "15-20 min", "p": [], "s": ["calves", "glutes"], "cue": "Legs are already cooked. Keep the incline and drop the speed if needed."}
        ] },
      { id: "push-2", name: "Push 2", title: "Push 2", focus: "Chest light and lower, triceps, shoulders",
        items: [
          {"ex": 63, "n": "Flat dumbbell press", "tag": "light", "sets": 3, "reps": "10-12", "p": ["chest"], "s": ["triceps", "delts"], "cue": "Deeper stretch than the barbell. Let the dumbbells travel below chest level."},
          {"opts": [{"ex": 66, "n": "Decline press"}, {"ex": 84, "n": "Weighted dips"}], "sets": 3, "reps": "8-12", "p": ["chest"], "s": ["triceps", "delts"], "cue": "Decline press keeps the shoulders comfortable. On weighted dips, lean the torso forward to bias the chest."},
          {"ex": 76, "n": "Low-to-high cable crossover", "sets": 3, "reps": "12-15", "p": ["chest"], "s": ["delts"], "cue": "Hands finish high and together. This one biases the upper chest."},
          {"ex": 111, "n": "Machine shoulder press", "sets": 3, "reps": "8-12", "p": ["delts"], "s": ["triceps"], "cue": "Front delts already get heavy indirect work from every press. Three sets is enough here."},
          {"ex": 115, "n": "Dumbbell lateral raise", "sets": 3, "reps": "12-20", "p": ["delts"], "s": ["traps"], "cue": "Lean away from a rack and go single-arm, or add partial reps at the top after failure."},
          {"ex": 144, "n": "Overhead tricep extension", "sets": 3, "reps": "10-15", "p": ["triceps"], "s": [], "cue": "Use a different implement from Day 1 if you want variety. Rope one day, single dumbbell the other."},
          {"ex": 142, "n": "Rope pushdown", "sets": 3, "reps": "12-15", "p": ["triceps"], "s": [], "cue": "Spread the rope apart at the bottom."},
          {"ex": 153, "n": "Weighted plank", "sets": 3, "reps": "30-45 sec", "p": ["abs"], "s": ["obliques", "erectors"], "cue": "Add weight over time rather than adding seconds. Glutes squeezed, ribs down."},
          {"ex": 208, "n": "Incline treadmill walk", "type": "cardio", "sets": 1, "reps": "15-20 min", "p": [], "s": ["calves", "quads", "glutes"], "cue": "12-15 percent incline at 4-4.5 km/h."}
        ] },
      { id: "pull-2", name: "Pull 2", title: "Pull 2", focus: "Back thickness, biceps, traps, rear delts",
        items: [
          {"ex": 121, "n": "Rear delt fly", "sets": 3, "reps": "12-14", "p": ["delts-rear"], "s": ["traps", "midback"], "cue": "Second rear delt session of the week, different movement from the face pull."},
          {"ex": 90, "n": "Wide-grip lat pulldown", "sets": 3, "reps": "10-12", "p": ["lats"], "s": ["biceps", "midback"], "cue": "Drive the elbows down toward the hips, do not just pull with the hands."},
          {"ex": 27, "n": "Rack pull", "tag": "preferred over deadlift", "sets": 3, "reps": "4-6", "p": ["traps", "erectors", "lats"], "s": ["glutes", "hamstrings", "forearms"], "cue": "Bar starts just below the knee. Chosen over a full deadlift so the lower back is fresh for RDLs on Day 6."},
          {"ex": 98, "n": "Single-arm dumbbell row", "sets": 3, "reps": "10-12 per side", "p": ["lats", "midback"], "s": ["biceps", "obliques", "forearms"], "cue": "Resist the twist. That anti-rotation demand is why the programme skips direct oblique work."},
          {"ex": 94, "n": "Straight-arm lat pulldown", "sets": 3, "reps": "12-15", "p": ["lats"], "s": ["abs"], "cue": "Elbows locked, focus on the stretch at the top rather than the load."},
          {"ex": 108, "n": "Shrugs", "sets": 3, "reps": "10-15", "p": ["traps"], "s": ["forearms"], "cue": "Hold the top for a beat. Bouncing turns this into nothing."},
          {"opts": [{"ex": 132, "n": "Incline dumbbell curl"}, {"ex": 133, "n": "Standing dumbbell curl"}], "sets": 3, "reps": "10-12", "p": ["biceps"], "s": ["forearms"], "cue": "Incline puts the long head on stretch before the rep starts, which is the better version."},
          {"opts": [{"ex": 134, "n": "Preacher curl"}, {"ex": 135, "n": "Cable curl"}], "sets": 3, "reps": "10-12", "p": ["biceps"], "s": [], "cue": "Shortened-position emphasis, pairing with the stretched position above."},
          {"ex": 209, "n": "Stairs", "type": "cardio", "sets": 1, "reps": "10 min", "p": [], "s": ["quads", "glutes", "calves"], "cue": "Legs work tomorrow, so keep this easy rather than pushing the pace."}
        ] },
      { id: "legs-2", name: "Legs 2", title: "Legs 2", focus: "Hamstrings, glutes, abductors, calves",
        items: [
          {"ex": 29, "n": "Romanian deadlift", "sets": 3, "reps": "8-10", "p": ["hamstrings", "glutes"], "s": ["erectors", "forearms", "lats"], "cue": "Push the hips back, soft knees, bar close to the legs. Stop when the hamstrings run out of stretch."},
          {"ex": 43, "n": "Seated leg curl", "sets": 3, "reps": "10-15", "p": ["hamstrings"], "s": ["calves"], "cue": "Slow on the way back. The lengthening phase is where hamstrings grow."},
          {"ex": 35, "n": "Hip thrust", "tag": "pause at the top", "sets": 3, "reps": "10-12", "p": ["glutes"], "s": ["hamstrings"], "cue": "The pause is the exercise. Without it you skip the shortened position nothing else trains."},
          {"ex": 7, "n": "Bulgarian split squat", "sets": 3, "reps": "10-12 per leg", "p": ["quads", "glutes"], "s": ["hamstrings", "adductors"], "cue": "Brutal but effective. First thing to cut if the day runs long or fatigue is building."},
          {"ex": 51, "n": "Abductor machine", "sets": 3, "reps": "12-15", "p": ["abductors"], "s": ["glutes"], "cue": "Glute medius work. Matters for knee tracking when you cut and change direction."},
          {"ex": 56, "n": "Standing calf raise", "tag": "straight foot, heavy", "sets": 3, "reps": "12-15", "p": ["calves"], "s": [], "cue": "Foot angle changes almost nothing. Knee angle is what matters, so skip the toe-in and toe-out sets."},
          {"ex": 57, "n": "Seated calf raise", "tag": "bench and dumbbell on knees", "sets": 3, "reps": "15-20", "p": ["calves"], "s": [], "cue": "Plate under the balls of the feet, dumbbell above the knees. No machine needed."},
          {"ex": 167, "n": "Hanging leg raise", "sets": 3, "reps": "near failure", "p": ["abs"], "s": ["obliques"], "cue": "Controlled lowering, no swinging."},
          {"ex": 61, "n": "Heel walks", "type": "dist", "tag": "toes lifted", "sets": 3, "reps": "20-30 m", "p": ["tibialis"], "s": [], "cue": "Second tibialis session of the week. Shin splint prevention."},
          {"ex": 208, "n": "Incline treadmill walk", "type": "cardio", "sets": 1, "reps": "15-20 min", "p": [], "s": ["calves", "glutes"], "cue": "Last thing of the week. Keep it easy."}
        ] }
    ],
    notes: [
      ["Why there is no barbell row", "Horizontal pulling is covered by seated cable row on Day 2 and single-arm dumbbell row on Day 5. Two sessions a week is enough, and leaving it out keeps the spinal erectors fresh for Day 3 squats."],
      ["How to progress", "Hit the top of the rep range on every set, add the smallest available increment next session, then drop back to the bottom of the range. For pull-ups, add reps until 12, then add weight. Without a rule you will drift toward the same weight for eight weeks, which in a deficit means losing ground."],
      ["Deload at week 5", "Same exercises, roughly half the sets, same weight. Fatigue builds faster in a deficit and stays invisible until performance drops sharply. A deload week costs nothing in fat loss because the deficit comes from food."],
      ["If fatigue starts building", "Cut in this order: cardio sessions first, then leg press on Day 3, then one chest exercise on Day 4. Never cut lifting intensity before cutting volume. Heavy load is what tells the body to keep muscle when calories are short."],
      ["What to expect in Phase 1", "Holding your lifts steady while losing 6 kg is a good outcome. Bench and squat may stall or dip slightly in the final weeks. RDL, hip thrust and Bulgarian split squat are the most likely to keep climbing."],
      ["What to track", "Waist at the navel weekly, a 7-day rolling weight average, and photos every two weeks in the same light. Skip the watch body fat reading, since wrist bioimpedance has an error range wide enough to make the number meaningless."]
    ]
  },
  {
    id: "gb", name: "Wasabi", emoji: "🥟",
    days: [
      { id: "legs", name: "Legs", title: "Legs", focus: "Quads, adductors, hamstrings, calves. Core finisher.",
        items: [
          {"ex": 4, "n": "Hack squat", "tag": "machine", "sets": 3, "reps": "8-10", "p": ["quads"], "s": ["glutes", "adductors", "hamstrings"], "cue": "Priority lift of the week, done first while fresh. Use a weight you could manage for 11-12 reps and stop with about two left."},
          {"ex": 3, "n": "Goblet squat", "tag": "dumbbell", "sets": 3, "reps": "10-12", "p": ["quads"], "s": ["glutes", "adductors", "abs"], "cue": "Dumbbell held at the chest, elbows inside the knees at the bottom, torso upright."},
          {"opts": [{"ex": 19, "n": "Cossack squat"}, {"ex": 14, "n": "Wide-stance goblet squat"}], "tag": "dumbbell", "sets": 3, "reps": "10-12 per side", "p": ["adductors"], "s": ["quads", "glutes"], "cue": "Sink to one side with the other leg straight. The stretched inner thigh is the point, and groin strength protects against strains."},
          {"ex": 43, "n": "Seated leg curl", "tag": "machine", "sets": 3, "reps": "12-15", "p": ["hamstrings"], "s": ["calves"], "cue": "Slow on the way back. The lengthening phase is where hamstrings grow."},
          {"ex": 56, "n": "Standing calf raise", "tag": "machine", "sets": 3, "reps": "12-15", "p": ["calves"], "s": [], "cue": "Knee straight for the gastrocnemius. Full stretch at the bottom, pause at the top."},
          {"ex": 57, "n": "Seated calf raise", "tag": "machine", "sets": 2, "reps": "15-20", "p": ["calves"], "s": [], "cue": "Knee bent shifts the work to the soleus. A different muscle from the standing version, not a repeat."},
          {"ex": 167, "n": "Hanging leg raise", "tag": "bar", "sets": 3, "reps": "12-15", "p": ["abs"], "s": ["obliques"], "cue": "Curl the pelvis up rather than swinging the legs. No momentum."},
          {"ex": 178, "n": "Dead hang", "tag": "bar", "sets": 2, "reps": "max time", "p": ["forearms"], "s": ["lats"], "cue": "Just hang, shoulders relaxed. Log the seconds every week; it is an early signal for the pull-up."},
          {"ex": 61, "n": "Heel walks", "type": "dist", "tag": "during rest periods", "sets": 2, "reps": "20-30 m", "p": ["tibialis"], "s": [], "cue": "Toes lifted, walk on the heels. Fits into rest periods at no time cost. Matters for gait, ankle control and balance."}
        ] },
      { id: "chest-delts", name: "Chest & Delts", title: "Chest, Shoulders & Triceps", focus: "Chest, front and side delts, triceps. Core finisher.",
        items: [
          {"opts": [{"ex": 74, "n": "Pec deck"}, {"ex": 75, "n": "Cable fly"}], "tag": "machine or cable", "sets": 2, "reps": "12-15", "p": ["chest"], "s": ["delts"], "cue": "Done first as a pre-exhaust, so the press weight afterwards will drop. That is intended. Track progress on the fly here, not the press."},
          {"ex": 63, "n": "Dumbbell chest press", "tag": "dumbbell", "sets": 3, "reps": "8-12", "p": ["chest"], "s": ["triceps", "delts"], "cue": "Dumbbells mean a failed rep can be set down safely. Lower to chest level, press up and slightly together."},
          {"ex": 64, "n": "Incline dumbbell press", "tag": "dumbbell", "sets": 3, "reps": "10-12", "p": ["chest"], "s": ["delts", "triceps"], "cue": "Bench at about 30 degrees. Steeper turns it into a shoulder press."},
          {"ex": 110, "n": "Seated dumbbell shoulder press", "tag": "dumbbell", "sets": 3, "reps": "8-12", "p": ["delts"], "s": ["triceps", "traps"], "cue": "Ribs down, do not arch the lower back to move the weight up."},
          {"ex": 115, "n": "Lateral raise", "tag": "dumbbell", "sets": 3, "reps": "12-15", "p": ["delts"], "s": ["traps"], "cue": "Lead with the elbows, stop at shoulder height. Light weight beats swinging."},
          {"ex": 142, "n": "Tricep rope pushdown", "tag": "cable", "sets": 3, "reps": "12-15", "p": ["triceps"], "s": [], "cue": "Elbows glued to your sides, spread the rope apart at the bottom."},
          {"ex": 152, "n": "Plank", "tag": "bodyweight", "sets": 3, "reps": "30-45 sec", "p": ["abs"], "s": ["obliques", "erectors"], "cue": "Glutes squeezed, ribs down. Add a small plate on the back over time rather than adding seconds."},
          {"ex": 167, "n": "Hanging leg raise", "tag": "bar", "sets": 2, "reps": "12-15", "p": ["abs"], "s": ["obliques"], "cue": "Controlled lowering, no swinging."}
        ] },
      { id: "back-biceps", name: "Back & Biceps", title: "Back & Biceps", focus: "Lats, mid back, rear delts, biceps, grip. Treadmill finisher.",
        items: [
          {"opts": [{"ex": 88, "n": "Assisted pull-up"}, {"ex": 1001, "n": "Pull-up negatives"}], "tag": "bar or machine", "sets": 3, "reps": "5-8", "p": ["lats"], "s": ["biceps", "midback", "forearms"], "cue": "Progression order: dead hang, scapular pulls, negatives, assisted, then full. Full hang at the bottom of every rep."},
          {"ex": 90, "n": "Lat pulldown", "tag": "cable", "sets": 3, "reps": "8-12", "p": ["lats"], "s": ["biceps", "midback"], "cue": "Drive the elbows down toward the hips. Do not lean back and turn it into a row."},
          {"ex": 95, "n": "Seated cable row", "tag": "cable", "sets": 3, "reps": "10-12", "p": ["midback", "lats"], "s": ["biceps", "delts-rear", "forearms"], "cue": "Torso still. Pull to the navel and squeeze the shoulder blades together."},
          {"ex": 123, "n": "Face pull", "tag": "cable", "sets": 3, "reps": "15-20", "p": ["delts-rear"], "s": ["traps", "rotator", "midback"], "cue": "Pull toward the forehead and finish with the elbows above shoulder height."},
          {"ex": 98, "n": "One arm dumbbell row", "tag": "dumbbell", "sets": 3, "reps": "10-12 per side", "p": ["lats", "midback"], "s": ["biceps", "obliques", "forearms"], "cue": "Resist the twist. Pull the dumbbell to the hip with no torso rotation."},
          {"ex": 129, "n": "Dumbbell bicep curl", "tag": "dumbbell", "sets": 2, "reps": "12-15", "p": ["biceps"], "s": ["forearms"], "cue": "No swing. Only the forearms move."},
          {"ex": 131, "n": "Hammer curl", "tag": "dumbbell", "sets": 2, "reps": "12-15", "p": ["biceps"], "s": ["forearms"], "cue": "Neutral grip throughout. The one movement here that hits brachialis directly."},
          {"ex": 208, "n": "Incline treadmill", "type": "cardio", "sets": 1, "reps": "10 min", "p": [], "s": ["calves", "glutes", "quads"], "cue": "Ten minute finisher. An easy incline walk, not a conditioning session."}
        ] },
      { id: "glutes-hams", name: "Glutes & Hams", title: "Glutes & Hamstrings", focus: "Glutes, hamstrings, abductors, calves. Treadmill finisher.",
        items: [
          {"ex": 36, "n": "Dumbbell hip thrust", "tag": "dumbbell", "sets": 3, "reps": "10-12", "p": ["glutes"], "s": ["hamstrings"], "cue": "Dumbbell across the hips on a pad. Pause at the top with the ribs down."},
          {"ex": 28, "n": "Dumbbell Romanian deadlift", "tag": "dumbbell", "sets": 3, "reps": "8-10", "p": ["hamstrings", "glutes"], "s": ["erectors", "forearms"], "cue": "Push the hips back, soft knees, dumbbells close to the legs. Only trained today, so load it."},
          {"ex": 7, "n": "Bulgarian split squat", "tag": "dumbbell", "sets": 3, "reps": "10-12 per leg", "p": ["quads", "glutes"], "s": ["hamstrings", "adductors"], "cue": "Rear foot on a bench. A slight forward lean biases the glute. Only trained today."},
          {"ex": 43, "n": "Seated leg curl", "tag": "machine", "sets": 3, "reps": "12-15", "p": ["hamstrings"], "s": ["calves"], "cue": "Slow on the way back."},
          {"ex": 56, "n": "Standing calf raise", "tag": "machine", "sets": 2, "reps": "12-15", "p": ["calves"], "s": [], "cue": "Knee straight, full stretch at the bottom."},
          {"ex": 57, "n": "Seated calf raise", "tag": "machine", "sets": 2, "reps": "15-20", "p": ["calves"], "s": [], "cue": "Knee bent for the soleus."},
          {"ex": 53, "n": "Cable hip abduction", "tag": "cable, ankle strap", "sets": 3, "reps": "15-20 per side", "p": ["abductors"], "s": ["glutes"], "cue": "Ankle strap, drive the leg out and slightly back. Glute medius work that matters for knee tracking."},
          {"ex": 61, "n": "Heel walks", "type": "dist", "tag": "during rest periods", "sets": 2, "reps": "20-30 m", "p": ["tibialis"], "s": [], "cue": "Toes lifted, walk on the heels. Second tibialis session of the week."},
          {"ex": 208, "n": "Incline treadmill", "type": "cardio", "sets": 1, "reps": "10 min", "p": [], "s": ["calves", "glutes"], "cue": "Ten minute finisher. Keep it easy."}
        ] },
      { id: "upper-core", name: "Upper & Core", title: "Upper Body & Core", focus: "Deliberately lighter. Pull-up work, shoulders, back, core.",
        items: [
          {"opts": [{"ex": 88, "n": "Assisted pull-up"}, {"ex": 1001, "n": "Pull-up negatives"}], "tag": "bar or machine", "sets": 3, "reps": "5-8", "p": ["lats"], "s": ["biceps", "midback", "forearms"], "cue": "Second pull-up session of the week. Same progression ladder, kept lighter today."},
          {"ex": 110, "n": "Seated dumbbell shoulder press", "tag": "dumbbell", "sets": 3, "reps": "10-12", "p": ["delts"], "s": ["triceps", "traps"], "cue": "Ribs down, controlled tempo. Lighter than the chest day."},
          {"ex": 1002, "n": "Bent over dumbbell row", "tag": "dumbbell", "sets": 3, "reps": "10-12 per side", "p": ["midback", "lats"], "s": ["biceps", "delts-rear", "erectors", "forearms"], "cue": "Hinge to about 45 degrees with a flat back. Pull to the ribs."},
          {"ex": 115, "n": "Lateral raise", "tag": "dumbbell", "sets": 2, "reps": "12-15", "p": ["delts"], "s": ["traps"], "cue": "Lead with the elbows, stop at shoulder height."},
          {"ex": 121, "n": "Rear delt fly", "tag": "dumbbell", "sets": 2, "reps": "12-15", "p": ["delts-rear"], "s": ["traps", "midback"], "cue": "Thumbs down, arc the arms out and back. Small muscle, small weight."},
          {"opts": [{"ex": 143, "n": "Overhead dumbbell extension"}, {"ex": 84, "n": "Dips"}], "tag": "dumbbell", "sets": 2, "reps": "12-15", "p": ["triceps"], "s": ["chest"], "cue": "Full stretch at the bottom for the long head. Switch to dips if the elbows complain."},
          {"ex": 79, "n": "Push-ups", "tag": "bodyweight", "sets": 3, "reps": "12-15", "p": ["chest"], "s": ["triceps", "delts", "abs"], "cue": "These get easier as bodyweight drops. Once 15 stops being hard, elevate the feet or add a plate."},
          {"ex": 152, "n": "Plank", "tag": "bodyweight", "sets": 3, "reps": "30-45 sec", "p": ["abs"], "s": ["obliques", "erectors"], "cue": "Glutes squeezed, ribs down."},
          {"ex": 178, "n": "Dead hang", "tag": "bar", "sets": 2, "reps": "max time", "p": ["forearms"], "s": ["lats"], "cue": "Log the seconds. This is the metric that keeps moving when the scale stalls."}
        ] },
      { id: "full-body", name: "Full Body", title: "Full Body", focus: "Moderate loads. The flex day. Treadmill finisher.",
        items: [
          {"ex": 3, "n": "Goblet squat", "tag": "dumbbell", "sets": 3, "reps": "12", "p": ["quads"], "s": ["glutes", "adductors"], "cue": "Moderate load today. Upright torso, elbows inside the knees."},
          {"opts": [{"ex": 36, "n": "Dumbbell hip thrust"}, {"ex": 37, "n": "Glute bridge"}], "tag": "dumbbell", "sets": 3, "reps": "12-15", "p": ["glutes"], "s": ["hamstrings"], "cue": "Pause at the top. A floor glute bridge works if the benches are taken."},
          {"ex": 18, "n": "Walking lunges with dumbbells", "tag": "dumbbell", "sets": 3, "reps": "12 per leg", "p": ["quads", "glutes"], "s": ["hamstrings", "adductors"], "cue": "Long stride for glutes, short stride for quads. Pick one and stay consistent."},
          {"ex": 98, "n": "Dumbbell row", "tag": "dumbbell", "sets": 3, "reps": "12 per side", "p": ["lats", "midback"], "s": ["biceps", "forearms"], "cue": "Flat back, pull to the hip."},
          {"ex": 110, "n": "Seated dumbbell shoulder press", "tag": "dumbbell", "sets": 2, "reps": "12", "p": ["delts"], "s": ["triceps", "traps"], "cue": "Ribs down. Moderate weight, clean reps."},
          {"ex": 79, "n": "Push-ups", "tag": "bodyweight", "sets": 3, "reps": "12-15", "p": ["chest"], "s": ["triceps", "delts", "abs"], "cue": "Elevate the feet once 15 stops being hard."},
          {"ex": 152, "n": "Plank", "tag": "bodyweight", "sets": 3, "reps": "30-45 sec", "p": ["abs"], "s": ["obliques", "erectors"], "cue": "Glutes squeezed, ribs down."},
          {"ex": 208, "n": "Incline treadmill", "type": "cardio", "sets": 1, "reps": "10 min", "p": [], "s": ["calves", "glutes", "quads"], "cue": "Ten minute finisher to close out the week."}
        ] }
    ],
    notes: [
      ["Heavier is the point", "There is no basis for prescribing lighter, higher-rep work to women. Muscle responds to mechanical tension the same in both sexes, and with a 550-calorie deficit accidentally bulking up does not happen. Heavy loading is what preserves muscle during weight loss and builds bone density, which is the long-term goal."],
      ["What heavy means here", "A set of 8-10 uses a weight you could probably manage for 11 or 12. Stop with about two reps left, and the last rep should look like the first. This is nothing like a max attempt."],
      ["Exercises are grouped by equipment", "Dumbbell work runs together, then cable, then machines, which saves walking and waiting in a busy gym. The exception is the hack squat on Day 1, kept first because it is the priority lift of the week and needs to be done fresh."],
      ["The fly comes first on Day 2 on purpose", "It is a pre-exhaust, so the chest press weight afterwards will drop. That is the technique working, not lost strength. Track progress on the fly that day rather than the press."],
      ["Nothing loaded hard twice inside 48 hours", "Romanian deadlift and Bulgarian split squat only on Day 4, hack squat only on Day 1. Hamstrings trained in a stretched position recover slowly, so a second heavy session inside 48 hours lands on tissue that has not repaired."],
      ["Progression rule", "Hit the top of the rep range on every set, then add the smallest available increment next session and drop back to the bottom of the range. Without a rule, weights drift and stay flat for months, which in a deficit means going backwards."],
      ["The pull-up is realistic within five months", "Losing weight removes a large share of what you have to pull, and the pattern is trained twice a week. Progression order: dead hang, scapular pull-ups, negatives, assisted, then full. Log dead hang seconds weekly as an early signal."],
      ["Push-ups will need progressing", "As bodyweight drops, push-ups get easier for reasons unrelated to strength. Once 15 reps stops being hard, elevate the feet or add a small plate rather than chasing higher reps."],
      ["Heel walks and Cossack squats are not trivial", "Tibialis strength affects gait, ankle control and balance. Adductor strength is a common weak point behind groin strains. Both are directly relevant to the long-term leg goal and cost almost no time."],
      ["Watch for low-energy signals, not just the scale", "Cycle changes, persistently cold hands and feet, poor sleep, or strength dropping across consecutive sessions. Any two together means eat more rather than push harder."],
      ["More cardio is not the fix for a stall", "Weight loss will plateau at some point. The answer is patience or a small food adjustment, not extra sessions, which raise fatigue and appetite together."],
      ["Nutrition", "Around 1450 calories a day: 125 g protein, 128 g carbs with most placed around training, 49 g fat as a floor, 28-30 g fibre. That targets roughly 0.5 kg of loss per week. Review at week 4: faster than 0.6 kg a week, eat 100 more; slower than 0.3, drop 100."]
    ]
  }
];
