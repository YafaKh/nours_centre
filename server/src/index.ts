import dotenv from 'dotenv';
import { createApp } from './app.js';

// override:true because the dev-server harness sets a PORT env var of its own (matching
// launch.json's client port), and dotenv otherwise never overrides an already-set env var.
dotenv.config({ override: true });

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
