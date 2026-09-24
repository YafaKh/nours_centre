# Nour's Centre — Online Quiz System

A web app for a tutoring centre in Amman to run timed multiple-choice quizzes online instead of on paper. Students log in, take a timed quiz once, and see their score; teachers create quizzes and view results; the admin oversees everything and imports spreadsheets of students/teachers.

Full requirements and reasoning live in [SPEC.md](SPEC.md); the tech stack and phased build order live in [PLAN.md](PLAN.md).

## Status

All 8 phases in [PLAN.md](PLAN.md) are complete: auth + roles, quiz authoring, student quiz-taking, auto-submit/deadline enforcement, scoring + results + CSV export, spreadsheet import, Arabic/RTL + mobile polish, and a final hardening pass (full test suite, access-control matrix, clean-checkout smoke test, and this documentation).

See [DECISIONS.md](DECISIONS.md) for every assumption made on the brief's gaps, what was built beyond the brief, what was left out, and what's next. See [AI_USAGE.md](AI_USAGE.md) for how this project was built with Claude Code and how its output was checked. See [CLAUDE.md](CLAUDE.md) for repo conventions and gotchas if you're extending this codebase.

## Prerequisites

- Node.js `20.11.x` (pinned in [.nvmrc](.nvmrc) and `engines` in [package.json](package.json)). If you use nvm: `nvm use`.
- No Docker and no external database needed — this project uses SQLite, so the steps below are the full one-command-per-step setup on a clean machine.

## Quick start

From the repository root:

```bash
cp server/.env.example server/.env
npm install
npm run setup
npm run dev
```

- `npm install` installs both the `server` and `client` workspaces.
- `npm run setup` runs the Prisma migrations and seeds the SQLite database with sample data (see below).
- `npm run dev` starts the backend (Express, [http://localhost:4000](http://localhost:4000)) and the frontend (Vite/React, [http://localhost:5173](http://localhost:5173)) together. The frontend proxies `/api` requests to the backend, so just open:

  **http://localhost:5173**

Stop both with `Ctrl+C`.

## Sample logins

`npm run setup` seeds the full sample data set from SPEC.md section 6 (60 students across 3 classes, 4 teachers, 1 admin, and a mix of quizzes). These three documented logins all share the same password:

| Role    | Username                    | Password      |
|---------|------------------------------|---------------|
| Student | `1001`                       | `password123` |
| Teacher | `teacher@nourscentre.test`   | `password123` |
| Admin   | `nour@nourscentre.test`      | `password123` |

Students log in with their student ID; teachers and the admin log in with email (see [SPEC.md](SPEC.md) FR-002).

## Running tests

```bash
npm test         # server: Vitest + Supertest against one freshly-seeded ephemeral SQLite DB
npm run test:e2e # Playwright: RTL rendering, 360px mobile layout, name display (starts the dev stack if needed)
npm run test:smoke # clones the current branch into a temp dir and proves the one-command path above works from scratch
```

See [PLAN.md](PLAN.md) for what each phase's named tests cover.

## Project structure

```
server/           Express + TypeScript API, Prisma ORM, SQLite
  prisma/         schema, migrations, seed script
  src/            app entry, auth, and role-scoped routes
  tests/          Vitest + Supertest tests
client/           React + TypeScript + Vite, Tailwind CSS
  src/            pages, components, auth context, API client
e2e/              Playwright end-to-end tests (RTL, mobile layout, name display)
scripts/          smoke-test.sh — clean-checkout verification of the one-command path
SPEC.md           what the system does and why, with decisions on every gap in the brief
PLAN.md           tech stack choices and the phased build plan
DECISIONS.md      assumptions, extras built, what was left out, what's next
AI_USAGE.md       how this project was built with AI and how its output was checked
CLAUDE.md         repo conventions and gotchas for future Claude Code sessions
```

## Notes

- The database is a local SQLite file (`server/prisma/dev.db`), created by `npm run setup` and ignored by git. Re-run `npm run setup` at any time to reset it to the seeded sample data.
- `server/.env` is your local config (copied from `server/.env.example`) and is git-ignored — never commit it.
