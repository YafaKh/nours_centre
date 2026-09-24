#!/usr/bin/env bash
# Phase 8 (PLAN.md): proves the documented one-command path
# (`npm install && npm run setup && npm run dev`) actually boots the app with sample data
# loaded, starting from a genuinely clean checkout rather than this working tree's
# node_modules/.env/dev.db. Run it from the repo root:
#
#   bash scripts/smoke-test.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && { pwd -W 2>/dev/null || pwd; })"
TMP_DIR="$(mktemp -d)"
LOG_FILE="$TMP_DIR/dev.log"
DEV_PID=""

cleanup() {
  if [ -n "$DEV_PID" ] && kill -0 "$DEV_PID" 2>/dev/null; then
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "==> Cloning a fresh checkout of the current branch into a temp dir"
git clone --quiet "$REPO_ROOT" "$TMP_DIR/repo"
cd "$TMP_DIR/repo"

# Pick free ports rather than assuming 4000/5173 are free: this machine may already have its
# own dev server running (that's a fact about this machine, not about whether the documented
# command works on a clean one), and the smoke test should not give a false failure because of it.
echo "==> Picking free ports for this isolated run"
PORTS="$(node -e "
const net = require('net');
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}
(async () => {
  const a = await freePort();
  const b = await freePort();
  console.log(a + ' ' + b);
})();
")"
SERVER_PORT="${PORTS%% *}"
CLIENT_PORT="${PORTS##* }"
echo "    server: $SERVER_PORT, client: $CLIENT_PORT"

cp server/.env.example server/.env
sed -i.bak "s/^PORT=.*/PORT=$SERVER_PORT/" server/.env && rm -f server/.env.bak
sed -i.bak "s/port: 5173/port: $CLIENT_PORT/" client/vite.config.ts && rm -f client/vite.config.ts.bak

echo "==> npm install"
npm install --silent

echo "==> npm run setup (migrate + seed sample data)"
npm run setup

echo "==> npm run dev (backgrounded; log at $LOG_FILE)"
npm run dev > "$LOG_FILE" 2>&1 &
DEV_PID=$!

echo "==> Waiting for the server and client to come up..."
SERVER_HEALTH_URL="http://localhost:$SERVER_PORT/api/health"
CLIENT_URL="http://localhost:$CLIENT_PORT/"
up=0
for _ in $(seq 1 60); do
  if curl -sf "$SERVER_HEALTH_URL" >/dev/null 2>&1 && curl -sf "$CLIENT_URL" >/dev/null 2>&1; then
    up=1
    break
  fi
  sleep 1
done

if [ "$up" -ne 1 ]; then
  echo "FAIL: server/client did not come up within 60s. Last dev output:"
  tail -n 80 "$LOG_FILE"
  exit 1
fi

echo "==> Checking a documented sample login works end to end through the real API"
LOGIN_STATUS="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://localhost:$SERVER_PORT/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"nour@nourscentre.test","password":"password123"}')"

if [ "$LOGIN_STATUS" != "200" ]; then
  echo "FAIL: documented admin sample login returned HTTP $LOGIN_STATUS, expected 200"
  tail -n 80 "$LOG_FILE"
  exit 1
fi

echo "==> PASS: fresh checkout booted with 'npm install && npm run setup && npm run dev', sample data seeded, documented admin login works."
