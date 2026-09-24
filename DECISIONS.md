# DECISIONS

This project was built from a one-page brief with a lot of gaps. Every gap is closed here with an
explicit decision and a reason, rather than left ambiguous. The full requirements text, with each
decision inline at the point it applies, is in [SPEC.md](SPEC.md); the tech stack and phase-by-phase
build order are in [PLAN.md](PLAN.md). This file collects everything in one place, plus what was
built beyond the brief, what was deliberately left out, and what would come next.

## 1. Assumptions and decisions (from the brief's gaps)

Copied from the **[DECISION]** markers in SPEC.md, grouped by area:

**Roles and access**
- Nour (the centre owner) gets a full Admin role: she sees results across every teacher's
  quizzes, not only her own. (SPEC §2)
- Teachers see and edit only their own quizzes and results; they cannot see another teacher's
  quiz exists at all (a second teacher's request for it 404s, not 403). Admin can see and edit
  any teacher's quiz. (SPEC §2, FR-007)
- No self sign-up. Every account is created by the admin, by hand or by spreadsheet import.
  (SPEC §2)
- Students log in with their student ID; teachers and the admin log in with email. (FR-002)

**Quizzes and timing**
- All dates/times are Asia/Amman. (FR-012)
- A quiz can target more than one class. (FR-015)
- Once any student has started a quiz, every field that affects scoring or timing (questions,
  options, correct answers, points, close date) is locked — no exceptions, including for the
  admin. This is what stops a score from changing or a running student's deadline from shifting
  after the fact. (FR-014)
- An attempt's deadline is `min(start + time limit, quiz close time)` — a student who starts 5
  minutes before closing only gets 5 minutes. (FR-022)
- Answers up to 10 seconds past the deadline are accepted (network-delay grace period); anything
  later is rejected. (FR-026)
- Question and option order is fixed and identical for every student in v1 — no shuffling.
  (FR-029)

**Scoring**
- Negative marking is a per-quiz setting (a penalty fraction of that question's points), not
  per-question — the brief says it "depends on the teacher and the quiz," which quiz-level
  covers. (FR-034)
- The floor at 0 is applied once, to the quiz total, after summing every question's signed
  contribution — not per question. This matters: a wrong answer's penalty can net against a
  correct answer's points elsewhere in the same quiz before the floor ever applies. (FR-035,
  §2 #2)
- Viewing correct answers after submission (exam review) is out of scope for v1. (FR-037 note)

**Import and passwords**
- Each import screen (students, teachers, quiz questions) has a "Download template" button
  producing a CSV with the exact expected header and one or two example rows, generated from the
  same column definitions the validator checks — so the template and the validator can never
  drift apart. (FR-052a, §2 #9)
- Imported students get an initial password the admin can see and hand out by hand; forcing a
  password change on first login is a next step, not built in v1. (FR-054)
- Quiz import carries only the question list (FR-055): the teacher creates the quiz shell
  (title, classes, timing, negative marking) in the web form first, then imports questions into
  it. Column layout: `question_no, question_text, option_a, option_b, option_c, option_d,
  correct, points`, `correct` ∈ {A, B, C, D}. A re-import fully replaces the question set (there's
  no stable row identity to diff against) and is blocked by the same lock rule as manual edits —
  it cannot be used to route around FR-014. (§2 #8)

**Arabic and names**
- Every person has two name fields, `name_ar` and `name_en`; at least one is required, not both —
  the centre's real spreadsheets sometimes only have one. (FR-065, FR-066)
- Direction is detected per text block (`dir="auto"`), not set once for the whole page, so a quiz
  can mix Arabic and English questions correctly. (FR-062)
- Display rule: teacher/admin tables (results, class lists) show both name columns; everywhere
  else shows `name_en` if set, else `name_ar`. (FR-067)
- The interface chrome itself (buttons, menus, labels) stays in English for v1; a full Arabic UI
  is a next step. (FR-063)

## 2. Architecture and build decisions

These are the decisions that shape how the system is built (the tech stack and phases in
[PLAN.md](PLAN.md)). Code comments and tests cite them as "DECISIONS.md §2 #N", so keep the
numbering stable.

1. **Auto-submit mechanism**: lazy evaluation on every Attempt read/write (finalize if
   `now > deadline`), plus a best-effort in-process `setInterval` sweep (~30s) for dashboard
   freshness. There's no external queue/worker, because none is needed at this scale and the
   brief flags this as a decision point.
2. **Negative-marking floor**: applied once, to the quiz total, after summing signed
   per-question contributions. It is not applied per question. (See also §1 "Scoring".)
3. **Session model**: DB-backed sessions, not JWT, specifically so a password reset can actually
   invalidate a student's existing session immediately (FR-054/A4).
4. **Grace period**: enforced by one shared deadline-check helper used by both the autosave and
   submit endpoints. It was decided at Phase 3 so Phase 4 didn't have to retrofit it into two
   places.
5. **Single-attempt constraint**: enforced by a composite unique DB constraint
   (`@@unique([studentId, quizId])`) that exists from the Attempt table's first migration and was
   not added later. Code-level checks alone can't survive two concurrent requests.
6. **One-command path**: `npm install && npm run setup && npm run dev` against SQLite, with no
   Docker, per the client's decided stack (Node/TypeScript + SQLite, simple one-command setup).
   It has been present since Phase 1's first commit rather than bolted on at the end.
7. **Import validation strictness**: the name_ar/name_en Arabic/Latin regex check is a hard
   per-row error, consistent with all other import field validation.
8. **Quiz-question import scope and re-import semantics**: import carries only the question list
   (per FR-055); the quiz shell is always created via the web form first. A re-import fully
   replaces the quiz's question set rather than diffing/merging, since spreadsheet rows have no
   stable identity to upsert against. It's gated by the same start-locks-editing rule as manual
   edits (FR-014), so it can't be used to bypass that lock. (See also §1 "Import and
   passwords".)
9. **Import templates share the validator's column definitions**: the "download template" file
   for each import type (FR-052a) is generated from the same schema the validator checks
   against, so the two can't silently drift apart.
10. **Node version pinning replaces Docker's version-drift protection**: since the decided stack
    has no Docker, "works the same on the evaluator's machine as on mine" comes from a pinned
    Node version (`.nvmrc` + `engines` in `package.json`) and the exact version stated in the
    README, not from a container.
11. **Scaling ceiling (documented, not built for)**: this architecture assumes a single Node
    process against a single SQLite file. That's correct at ~300 students, but it's not safe to
    run as multiple instances behind a load balancer without changes. Why it would break:
    - SQLite allows only one writer at a time, so concurrent processes writing autosave/submit
      requests would start hitting `SQLITE_BUSY` lock errors under real contention.
    - The login rate limiter is in-memory per process, so spreading requests across instances
      weakens or resets it per instance instead of enforcing one global limit.
    - The `setInterval` auto-submit sweep has no cross-process coordination, so N instances means
      N redundant, potentially racing sweeps.

    None of this matters at the current scale. It's recorded here so it's a documented tradeoff,
    not a silent assumption. If the centre ever needs more than one app instance: move to a
    multi-writer database (e.g. Postgres), a shared rate-limit store (e.g. Redis), and pull the
    sweep out into its own single scheduled job.

## 3. Extras built beyond the minimum brief

- **Admin teacher list** (mirrors the student list: name, email, username) — not explicitly
  requested, but a natural companion to FR-054's student list, and the admin has no other way to
  see who the teacher accounts are.
- **CSV *and* XLSX** for both import and the sample-data loader (FR-050 only requires "CSV or
  XLSX"), so the same validator and template generator are proven against both formats.
- **`npm run test:smoke`** ([scripts/smoke-test.sh](scripts/smoke-test.sh)): clones the current
  branch into a throwaway temp directory and runs the exact documented one-command path against
  it, on free ports chosen at runtime so it doesn't collide with a developer's own running dev
  server. This is what actually caught the gap described in section 4 below.
- **Full Playwright mobile/RTL suite** (Phase 7) beyond the brief's minimum: dedicated tests for
  360px layout, sticky timer visibility while scrolling, and independent per-block direction
  inside one mixed-language question.

## 4. Gaps closed in Phase 8 (hardening pass)

Phase 8's job was to assemble the full priority-test suite and see what broke. Two real gaps
turned up:

- **`npm install` alone never generated the Prisma client.** `npm run setup` calls
  `prisma migrate deploy`, which — unlike `prisma migrate dev` — does not regenerate the client.
  On a machine that already had a generated client sitting in `node_modules/.prisma` from earlier
  manual work, this was invisible; on a genuinely fresh `npm install`, `npm run setup` crashed
  immediately on `seed` with "`@prisma/client did not initialize yet`". Fixed by adding
  `"postinstall": "prisma generate"` to `server/package.json`, so a plain `npm install` now
  always leaves a real generated client behind. Caught by `scripts/smoke-test.sh` against a
  from-scratch clone — see [server/package.json](server/package.json).
- **Access-control matrix had no single test tying its three priority cases together.** Phases 1–7
  each tested role/ownership boundaries relevant to that phase's own feature (`roles.test.ts`,
  `teacher-isolation.test.ts`, etc.), but nothing exercised the specific three cases SPEC §8
  priority test #5 names end to end in one place — in particular, teacher A being blocked from
  teacher B's *results and results/export* routes (only quiz/question read-write was covered
  before), and a student being blocked from *starting an attempt* on a quiz outside their class
  (only the quiz list's filtering was covered before). Added
  [server/tests/access-matrix.test.ts](server/tests/access-matrix.test.ts) to close both gaps
  directly, and to prove the admin succeeds everywhere both are blocked.

## 5. Out of scope for v1

Per SPEC §9, left out on purpose:

- Password reset by email or SMS (admin hands out the new password directly instead)
- Question types other than single-answer multiple choice
- A notification system for new quizzes
- Images or formulas in questions
- A full Arabic interface (chrome stays English; content is fully bilingual)
- Parent accounts
- Anti-cheating beyond server-side timing (e.g. tab-switch detection)
- Student exam review (viewing correct answers after submission)
- Editing a quiz after any student has started it, including the close date — no exceptions, for
  anyone, including the admin

## 6. Next steps if another week were available

Per SPEC §10:

- Shuffle question and option order per student
- Force a password change on first login
- Let a teacher extend a quiz's close date after attempts exist, with clear rules for how that
  affects deadlines already in progress
- Email students their initial password automatically (student email is already captured in v1
  to make this a drop-in addition)
- A notification system for new quizzes (probably email)
- Full Arabic interface translation
- Per-student time extensions (special needs, connection problems)
- A question bank to reuse questions across quizzes
- Charts of student progress over time
- Student review of their own submitted answers and the correct answers
- A true exhaustive access-control cartesian sweep (every endpoint × every role × every ownership
  combination) beyond the three priority cases Phase 8 covers
