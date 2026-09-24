import dotenv from 'dotenv';
import { createApp } from './app.js';
import { startAutoSubmitSweep } from './quiz/finalize.js';

// override:true because the dev-server harness sets a PORT env var of its own (matching
// launch.json's client port), and dotenv otherwise never overrides an already-set env var.
dotenv.config({ override: true });

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

// DECISIONS.md §2 #1: best-effort sweep for dashboard freshness, on top of the
// finalize-on-read/write that already runs on every relevant request. Not run inside
// createApp()/tests, which finalize deterministically via direct calls instead.
startAutoSubmitSweep();
