# PLAN: Tech Stack and Phased Build Plan

This document describes HOW the system in SPEC.md gets built: the tech stack and the order of work. Each phase ends with something the client can click through in a browser, plus named automated tests that prove the phase's riskiest behavior.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (backend + frontend) | One language/toolchain for a solo dev on a deadline; strong typing across the authoring/taking API boundary. |
| Backend | Node.js + Express, TypeScript | Boring, well-supported, easy to unit/integration test (Supertest) without framework magic getting in the way of precise timing logic. |
| Frontend | React + TypeScript + Vite | Fast dev loop; plain SPA is sufficient (internal, login-gated tool, no SEO/SSR need); easiest path to a genuinely mobile-first UI. |
| Styling | Tailwind CSS, using logical properties (`ps-*`, `pe-*`, `text-start`) | Fast 360px-first layouts; logical properties make mixed RTL/LTR content work without a separate RTL stylesheet. |
| Data fetching | TanStack Query | Clean model for autosave-on-pick answers, attempt resume, periodic server-time resync for the countdown. |
| Database | SQLite (dev + default deploy) | Spec explicitly allows "SQLite with exact documented steps" as the one-command path; single file, trivial to reset for tests, no external DB service. |
| ORM | Prisma | Composite unique constraint `@@unique([studentId, quizId])` on Attempt maps directly to the race-safe single-attempt requirement; migrations + seed script give a clean one-command sample-data loader. |
| Auth | bcrypt password hashes + DB-backed session table + httpOnly signed cookie | No self-signup/OAuth needed, so JWT statelessness buys nothing; a DB session row lets "admin resets password" also invalidate existing sessions. |
| Rate limiting | `express-rate-limit` on the login route, in-memory | Single-process deploy at this scale (300 students); no Redis needed. |
| i18n / RTL | No framework — native `dir="auto"` per text block + Tailwind logical properties + a small Unicode-range regex for name_ar/name_en validation | Spec requires per-block auto-direction for content, not full UI translation; `dir="auto"` does exactly this natively. |
| CSV/XLSX import | SheetJS (`xlsx`) | One library parses both formats into one shape, so row-validation logic is format-agnostic; the same per-type column definition drives both the validator and the "download template" generator, so they can't drift apart. |
| CSV export | Hand-rolled writer with UTF-8 BOM + proper quoting | Full control over BOM placement/quoting, since Excel+Arabic correctness is a named success criterion. |
| Testing | Vitest (unit + Supertest integration against real ephemeral SQLite) + Playwright (E2E incl. 360px mobile viewport) | TS-native and fast for the scoring engine and race-condition tests; Playwright is the only realistic way to automate "no horizontal scroll at 360px" and "timer stays visible while scrolling." |
| Run/deploy | `npm install && npm run setup && npm run dev` as the one-command path against SQLite — no Docker, per the decided stack | Fastest path to a working demo by Thursday; Node-version drift on the evaluator's machine is handled by pinning the version (`.nvmrc`/`engines` in package.json) and stating it in the README, not by containerizing. |
| Auto-submit trigger | No queue/worker infra. Lazy evaluation at every Attempt read/write (finalize if `now > deadline`) + in-process `setInterval` sweep (~30s) for dashboard freshness | Spec flags this needs an explicit decision and mentions no queue infra; an external worker (Redis/BullMQ) would be overkill for 300 students and risks the one-command constraint. |

---

## Phased build plan

**Phase 1 — Auth + roles skeleton**
Build: User/Student/Teacher/Class schema (Session table included from the start; Student includes an optional `email` column, captured now per spec for future automated password delivery but unused for login/notifications in v1), bcrypt+session-cookie login (student ID or email), role middleware, empty role-appropriate dashboards, a working `npm run setup` (migrate + seed) and `npm run dev`, plus a pinned Node version (`.nvmrc`/`engines` in package.json), committed from the first commit, tiny hand-written seed (1 user per role).
Client sees: log in as seeded student/teacher/admin, correct empty dashboard per role, blocked on wrong-role URLs, log out.
Tests: `auth.test` (correct/incorrect password, rate-limit after N failures), `roles.test` (student blocked from `/api/teacher/*` and `/api/admin/*` with 403, teacher blocked from `/api/admin/*`), `session.test` (missing/expired/tampered session cookie rejected).

**Phase 2 — Quiz authoring: teacher CRUD, draft/lock rules**
Build: Quiz/Question/Option schema (with `order` columns), teacher create/edit/publish flow, admin can edit any teacher's quiz, class targeting is many-to-many.
Client sees: teacher builds a full quiz (title, classes, timing, negative marking, 15 questions × 4 options), publishes it; a second teacher can't see/access it; admin can edit teacher A's quiz.
Tests: `quiz-crud.test` (exactly 4 options, exactly 1 correct, required fields), `teacher-isolation.test` (teacher B gets 403/404 on teacher A's quiz, admin succeeds), `lock-rule.test` (once an Attempt exists, editing questions/options/points/correct-answer/close-date is rejected — the lock has no exceptions).

**Phase 3 — Student quiz-taking: attempt, timer, autosave, race-safe single attempt**
Build: student's "open quizzes for my class" list, start-attempt endpoint (server start time, deadline = `min(start+timeLimit, quizClose)`), autosave-per-click answer endpoint (with the deadline/grace check wired in from the start, not retrofitted later), resume-on-refresh, a quiz-taking payload that never includes correctness data.
Client sees (core demo): student starts an open quiz, watches the countdown, answers are autosaved, refreshing mid-quiz returns to the same attempt with the same deadline and saved answers.
Tests: `single-attempt-race.test` (N concurrent start-attempt requests for the same student+quiz → exactly one Attempt row, via the DB unique constraint), `deadline-window.test` (can't start before open/after close), `no-leak.test` (quiz-taking response never contains correctness data pre-submission), `resume.test` (reload returns same attempt id, deadline, and prior answers).

**Phase 4 — Auto-submit + deadline/grace enforcement**
Build: shared deadline-check helper used by both the answer-write and submit endpoints (10s grace, server-received time only, ignoring any client timestamp), manual submit with confirm-before-submit UI, lazy finalize-on-read/write for expired attempts, best-effort sweep for dashboard freshness.
Client sees: a short test quiz (e.g. 1-minute limit) expires untouched; reloading the teacher's results page shows it auto-submitted with a score, no student action taken.
Tests: `auto-finalize-on-read.test` (expired attempt finalized the instant it's read, before the sweep runs), `sweep-job.test` (sweep finalizes expired attempts with zero client requests), `clock-tamper.test` (spoofed client timestamps ignored), `grace-period.test` (answer at +10s accepted, past it rejected), `no-double-submit.test` (resubmitting a finalized attempt is a no-op/rejected).

**Phase 5 — Scoring (negative marking + total-level floor) + results + CSV export**
Build: scoring engine as a pure, independently unit-tested function (sum signed per-question contributions, then floor once at the quiz total — not per-question), results roster per quiz, summary stats, per-question % correct, CSV export with UTF-8 BOM.
Client sees: teacher opens results for the closed sample quiz — roster with scores/status, aggregate stats, downloads CSV that opens correctly in Excel with Arabic names intact.
Tests: `scoring.test` (table-driven: all correct; all wrong w/ negative off; all wrong w/ negative on; mixed where negative nets against positive *before* the single total-level floor; unanswered always 0), `results-roster.test` (not-attempted/in-progress/submitted/auto-submitted states), `csv-export.test` (BOM present, Arabic round-trips exactly, column layout matches spec).

**Phase 6 — Spreadsheet import (students/teachers/quiz questions) + sample data loader**
Build: SheetJS-based import pipeline for three import types — students, teachers, and quiz questions — sharing one column-definition-driven validator; per-row field-level validation (Arabic/Latin regex check on name_ar/name_en treated as a hard error, consistent with other field validation), all-or-nothing transaction, upsert-by-student-id on re-import for students; a "download template" endpoint per import type, generated from the same column definitions, giving a CSV with the exact header row plus one or two example rows. Quiz-question import targets an existing quiz shell (title/classes/timing/negative-marking already created via the Phase 2 web form, per FR-055) with column layout `question_no, question_text, option_a, option_b, option_c, option_d, correct, points` (`correct` ∈ {A,B,C,D}); it reuses Phase 2's question/option validator (exactly 4 options, exactly 1 correct) rather than duplicating that logic, is blocked by the same lock rule as manual editing once an attempt exists, and — since there's no natural row identity to upsert against — a re-import fully replaces the quiz's question set inside one transaction rather than merging. One-command sample-data loader using the shipped sample files (60 students/3 classes, 4 teachers+admin, ≥4 quizzes spanning open/closed/upcoming/draft with one fully-Arabic and one negative-marking/one non-negative-marking, plus some completed attempts). Admin also gets a simple student list (name, class, username) with a per-row "reset password" action: generates a new temporary password, invalidates that student's existing session(s), and shows the new password once for the admin to hand out (FR-054/A4).
Client sees: admin uploads a students file with one bad row, sees the exact row+error, nothing saved; fixes and re-imports successfully; re-imports the same file again with no duplicates; a teacher creates a quiz shell in the form, downloads the question-import template, fills it in, and imports 15 questions in one shot; re-importing questions into a quiz that already has an attempt is rejected; admin resets a student's password from the student list — that student's old session stops working immediately and they can log in with the new one; a fresh clone boots fully seeded with one command and documented sample logins work.
Tests: `import-validation.test` (bad field/class/name/duplicate ID → whole import rejected, zero rows persisted, error names row+field), `import-upsert.test` (re-import updates only the changed student row, no duplicates), `import-quiz-questions.test` (row missing an option or with `correct` outside A–D rejected; valid file replaces the quiz's full question set; import into a quiz with an existing attempt is rejected, same as manual edits), `import-template.test` (downloaded template's header row matches the validator's expected columns for each of the three types; the template's own example rows pass validation unmodified), `import-arabic.test` (Arabic content exact through both CSV and XLSX), `password-reset.test` (admin resets a student's password; the student's existing session cookie is rejected on the next request; the student can log in with the new password), `seed-smoke.test` (fresh DB + seed → expected row counts, every documented sample login works).

**Phase 7 — Arabic/RTL + mobile polish**
Build: audit `dir="auto"` across quiz-taking/authoring/results for genuinely mixed content, sticky timer, large tap targets, confirm-before-submit wording about unanswered questions, 360px layout audit.
Client sees: the fully-Arabic sample quiz at 360px with correct RTL layout and a timer that stays visible while scrolling; a mixed Arabic/English question where each block independently renders in its own direction.
Tests (Playwright): `rtl-render.test` (Arabic block renders RTL, English block in the same question renders LTR), `mobile-viewport.test` (no horizontal scroll at 360px on login/quiz-taking/results; timer stays in viewport on scroll), `name-display.test` (admin/teacher tables show both name columns; other views show name_en else name_ar; search/sort match spec).

**Phase 8 — Hardening, full priority-test pass, docs finalization**
Build: no new features — close gaps found assembling the full priority-test suite (especially the access-control matrix), write README.md (run steps, sample-data load, per-role sample credentials), DECISIONS.md, AI_USAGE.md, CLAUDE.md; verify the one-command path on a genuinely clean checkout.
Client sees: complete, unaided journeys for all three roles from `npm install && npm run setup && npm run dev` on a machine that's never seen the repo, with only the documented Node version installed.
Tests: `access-matrix.test`, scoped by priority rather than a full cartesian sweep — (1) student blocked from every teacher/admin route and from any quiz/result outside their own class, (2) teacher A blocked from teacher B's quiz and results on both read and write, (3) admin succeeds everywhere teachers and students are blocked; a true exhaustive cartesian (every endpoint × every role × every ownership combination) is a next step if time remains, not a v1 requirement — the three cases above are what priority test #5 is actually about. Also: a full CI run of every named test from phases 3–6 together against one freshly-seeded DB as a regression net, and a scripted clean-checkout smoke test proving the documented one command actually boots the app with sample data loaded.

The architecture and build decisions this plan relies on are listed in [DECISIONS.md](DECISIONS.md) §2.
