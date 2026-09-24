# AI_USAGE

## Tools used

Claude Code (Anthropic's agentic CLI/IDE tool, Claude models) was used for the entire build:
turning the one-page brief into [SPEC.md](SPEC.md) and [PLAN.md](PLAN.md), writing the
application code, writing and running the automated test suites (Vitest/Supertest for the
server, Playwright for the browser), and writing this project's own documentation
(README.md, DECISIONS.md, this file, and CLAUDE.md).

## How it was directed

The brief was ambiguous in many places (roles, timing edge cases, negative marking, name
handling, import semantics — see DECISIONS.md). Rather than letting Claude Code guess silently
while writing code, the first step was to have it turn every ambiguity into an explicit
**[DECISION]** in SPEC.md, with a one-line reason, before any implementation started. SPEC.md and
PLAN.md were reviewed and adjusted by hand before building began; PLAN.md's phased breakdown then
became the actual work order.

From there, each of the eight phases in PLAN.md was run as its own directed session, one PR per
phase, mirroring the phase list exactly (see `git log` — one merged PR per `feat(...)` phase
commit). Each session was given:

- the relevant section(s) of SPEC.md (the *what* and *why*),
- the corresponding phase entry in PLAN.md (the *how* — what to build, what the client should be
  able to click through afterward, and which named tests must pass), and
- instruction to stop at the phase boundary rather than pull work forward from later phases.

This kept each PR reviewable on its own and kept "done" objectively defined by PLAN.md's own
acceptance criteria instead of by open-ended judgment.

Phase 8 (this hardening pass) was directed the same way, but its brief was explicitly
"no new features — find and close gaps," using the fully assembled test suite and a genuinely
clean checkout as the check, rather than any new user-facing behavior.

## How output was checked

- **Automated tests as the primary gate.** Every phase's "Tests" line in PLAN.md names specific
  test files up front; a phase wasn't considered complete until those named tests existed and
  passed. By Phase 8, `npm test` runs 26 server test files (101 tests) against one freshly
  migrated, freshly seeded ephemeral SQLite database in a single run — this is also the phases
  3–6 regression net Phase 8's plan calls for, since Vitest already runs every test file
  sequentially against the same shared database rather than in isolated per-file runs.
- **Browser-driven verification for anything a test can't see.** Phase 7's mobile/RTL work and
  Phase 8's final check were both verified by actually starting the dev server and driving it —
  Playwright for the repeatable RTL/mobile-layout assertions (`npm run test:e2e`, 10 tests), and
  direct interactive use for each phase's "Client sees" demo (logging in as each seeded role,
  clicking through the actual flow described in PLAN.md, not just reading the diff).
- **A from-scratch clean-checkout smoke test**, added in Phase 8
  ([scripts/smoke-test.sh](scripts/smoke-test.sh)), specifically to check the one thing none of
  the above can: whether `npm install && npm run setup && npm run dev`, run against a repo that
  has never had `npm install` run in it before, actually works. This is what caught a real bug —
  a fresh `npm install` never generated the Prisma client (only `prisma migrate dev`, not the
  `migrate deploy` the setup script uses, does that automatically), so `npm run setup` crashed on
  a truly clean machine despite every other test passing. The fix (`postinstall` script in
  `server/package.json`) was verified by re-running the smoke test against a fresh export of the
  repo until it passed end to end (health check, client page, and a real login all returning
  success) before being considered done. See DECISIONS.md section 4 for the full account.
- **Everything AI-generated was read, not just run.** Code review happened at the diff level for
  every phase before merging (see the PR history), with particular attention to the
  security-sensitive logic that tests alone can give false confidence in: the deadline/grace-period
  check being the *only* thing that decides lateness (never a client-supplied timestamp), the
  single-attempt DB constraint actually being what prevents a race rather than an
  easily-defeated application-level check, and the per-teacher ownership checks returning 404
  (not 403) so a second teacher can't even confirm another teacher's quiz exists.

## What AI did not decide alone

Every **[DECISION]** entry in SPEC.md/DECISIONS.md reflects a judgment call that a human would
normally make about the product (e.g. "does the admin see all results or just her own quizzes,"
"can negative marking push a score below 0"). Claude Code proposed a resolution with a reason for
each one so the spec had no unresolved gaps, but these were written up front, in the open, for
review — not decided implicitly deep inside implementation code where they'd be easy to miss.
