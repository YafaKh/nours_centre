# CLAUDE.md

Guidance for Claude Code (or any future contributor) working in this repo.

## What this is

An online quiz system for a tutoring centre (students, teachers, admin). The full requirements
and every judgment call on an ambiguous brief live in [SPEC.md](SPEC.md); the tech stack and the
phased build order live in [PLAN.md](PLAN.md); the reasoning behind every decision, what was left
out, and what's next live in [DECISIONS.md](DECISIONS.md). Read SPEC.md and PLAN.md before making
non-trivial changes — most design questions ("should this be 403 or 404," "per-quiz or
per-question," "who can see what") are already answered there with a stated reason.

## Running things

```bash
cp server/.env.example server/.env   # first time only
npm install
npm run setup                        # prisma migrate deploy + seed
npm run dev                          # server on :4000, client on :5173
npm test                             # server test suite (Vitest + Supertest)
npm run test:e2e                     # Playwright, needs the dev stack (starts it if not running)
npm run test:smoke                   # from-scratch clean-checkout check, see below
```

Sample logins (all `password123`): student `1001`, teacher `teacher@nourscentre.test`, admin
`nour@nourscentre.test`.

## Project structure

```
server/src/
  auth/        login, sessions, bcrypt hashing, role/auth middleware
  routes/      student.ts, teacher.ts, admin.ts — one router per role, requireRole'd at the top
  quiz/        deadline math, scoring, results/CSV, lock rule, finalize (auto-submit)
  import/      shared CSV/XLSX column-definition-driven validator, used by both import and
               "download template"
  lib/         small cross-cutting helpers (e.g. displayName)
server/prisma/ schema, migrations, seedData.ts (sample data), seed.ts (thin CLI wrapper)
server/tests/  Vitest + Supertest, one file per named test in PLAN.md; tests/helpers/ has shared
               fixtures (quizFixtures.ts, importFixtures.ts)
client/src/    React + TS + Vite + Tailwind; pages/ per route, api/client.ts for fetch calls
e2e/           Playwright specs for what only a real browser can prove (RTL, 360px layout,
               sticky timer)
scripts/       smoke-test.sh — see "Verifying the one-command path" below
```

## Conventions worth preserving

- **404, not 403, for "not yours."** A teacher hitting another teacher's quiz, or a student
  hitting a quiz outside their class, gets 404 — existence is never confirmed to someone who
  doesn't own/target it. See `loadOwnedQuiz` in `routes/teacher.ts` and `loadClassQuiz` in
  `routes/student.ts`. Keep this pattern for any new per-owner or per-class resource.
- **The server clock is the only clock.** Deadline/grace-period checks
  (`quiz/deadline.ts` + `finalizeIfExpired`) never trust a client-supplied timestamp. Don't add a
  code path that does.
- **Lazy finalize-on-read/write, not a queue.** Expired attempts are finalized inline wherever
  they're read or written (dashboard list, attempt fetch, answer write, submit, results roster),
  plus a best-effort `setInterval` sweep for dashboard freshness between requests. There's no
  external job runner — don't introduce one for this at this scale (see DECISIONS.md §2 #1 and #11).
- **The single-attempt guarantee is a DB constraint, not an application check.**
  (`@@unique([studentId, quizId])` on Attempt). The `create` → catch `P2002` → re-fetch pattern in
  `routes/student.ts` is how a losing concurrent request turns into a normal 200; don't replace it
  with a `findFirst`-then-`create` check, which would reintroduce the race.
- **Import templates and the validator share one column-definition source**
  (`import/columns.ts` + per-type column lists), so a template can never drift from what the
  validator actually accepts. Add new import types the same way.
- **Test fixtures**: use `server/tests/helpers/quizFixtures.ts` (classes/teachers/students/
  published quizzes) and `importFixtures.ts` rather than hand-rolling Prisma creates in a new
  test — every existing test does this, and it also keeps cleanup (`cleanupQuizFixtures`)
  consistent, which matters because all test files share one ephemeral SQLite DB run
  sequentially (`fileParallelism: false` in `vitest.config.ts`) — a test that doesn't clean up
  after itself can break an unrelated later test file.

## Gotchas discovered the hard way

- **`prisma migrate deploy` does not regenerate the Prisma client** (unlike `migrate dev`).
  `server/package.json` has `"postinstall": "prisma generate"` specifically so a plain
  `npm install` on a machine that's never seen this repo actually works. If you ever see
  `@prisma/client did not initialize yet`, this is almost certainly why — check that postinstall
  script is still there before debugging further.
- **Vite's default host binding doesn't always answer on `127.0.0.1`** on Windows — use
  `localhost` in anything that curls the dev client (see `scripts/smoke-test.sh`), not
  `127.0.0.1`, or you'll see spurious connection-refused errors even though the server is up.
- **A "clean git status" at the start of a session may be stale.** The environment's git-status
  snapshot is taken once, at conversation start, and does not update — always re-run `git status`
  yourself before trusting what's staged/committed versus still local-only.

## Verifying the one-command path

`scripts/smoke-test.sh` (`npm run test:smoke`) clones the current branch's committed state into a
throwaway temp directory, picks two free ports so it doesn't collide with a dev server you
already have running, and runs the exact documented sequence
(`npm install && npm run setup && npm run dev`) against it, then checks `/api/health`, the client
root, and a real login. Run it before believing "works on a clean machine" about any change that
touches install/build/setup — it only tests what's actually committed, not your working tree, so
commit first (or use `git archive $(git stash create)` into a temp dir for a quick uncommitted
check, which is how this script's own postinstall bug was found and fixed without a throwaway
commit).

## Adding a new phase-shaped feature

If asked to extend this system, follow the same shape the existing phases use: state the
requirement (or a **[DECISION]** if the ask is ambiguous) in SPEC.md, note the plan for it in
PLAN.md if it's substantial, implement it, and write the named test(s) up front rather than after
the fact — every existing feature in this repo was built that way, and the test files are named
directly after what they prove (see PLAN.md's "Tests" line per phase) so a reviewer never has to
guess what a test file is for.
