#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LIVE_MEMORY_DIR="${KINTSUGI_LIVE_MEMORY_DIR:-$HOME/.local/share/kintsugi/memory}"
MEMORY_DIR="${KINTSUGI_TEST_MEMORY_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/kintsugi-memory.XXXXXX")}"
WORKSPACE_DIR="${KINTSUGI_TEST_WORKSPACE:-$(mktemp -d "${TMPDIR:-/tmp}/kintsugi-workspace.XXXXXX")}"
KEY_FILE="${KINTSUGI_TEST_KEY_FILE:-$(mktemp "${TMPDIR:-/tmp}/kintsugi-key.XXXXXX")}"
EXPECTED_MEMORY_WARNINGS="${KINTSUGI_EXPECT_MEMORY_WARNINGS:-0}"

canonical_path() {
  node -e 'console.log(require("node:path").resolve(process.argv[1]))' "$1"
}

if [[ "$(canonical_path "$MEMORY_DIR")" == "$(canonical_path "$LIVE_MEMORY_DIR")" && "${KINTSUGI_ALLOW_LIVE_MEMORY_WRITE:-0}" != "1" ]]; then
  echo "Refusing to write smoke events into live Kintsugi memory: $LIVE_MEMORY_DIR" >&2
  echo "Use KINTSUGI_TEST_MEMORY_SOURCE=$LIVE_MEMORY_DIR for a staging copy, or set KINTSUGI_ALLOW_LIVE_MEMORY_WRITE=1 intentionally." >&2
  exit 1
fi

if [[ -n "${KINTSUGI_TEST_MEMORY_SOURCE:-}" ]]; then
  mkdir -p "$MEMORY_DIR"
  cp -a "$KINTSUGI_TEST_MEMORY_SOURCE"/. "$MEMORY_DIR"/
fi

cleanup() {
  if [[ -z "${KINTSUGI_TEST_MEMORY_DIR:-}" ]]; then
    rm -rf "$MEMORY_DIR"
  fi
  if [[ -z "${KINTSUGI_TEST_WORKSPACE:-}" ]]; then
    rm -rf "$WORKSPACE_DIR"
  fi
  if [[ -z "${KINTSUGI_TEST_KEY_FILE:-}" ]]; then
    rm -f "$KEY_FILE"
  fi
}
trap cleanup EXIT

export KINTSUGI_MEMORY_DIR="$MEMORY_DIR"
export KINTSUGI_WORKSPACE="$WORKSPACE_DIR"

echo "[kintsugi] runtime smoke"
echo "  memory:    $KINTSUGI_MEMORY_DIR"
echo "  workspace: $KINTSUGI_WORKSPACE"
if [[ -n "${KINTSUGI_TEST_MEMORY_SOURCE:-}" ]]; then
  echo "  source:    $KINTSUGI_TEST_MEMORY_SOURCE"
fi

echo
echo "[1/8] build"
npm run build

echo
echo "[2/8] unit + contract tests"
env \
  -u KINTSUGI_LIVE_SMOKE \
  -u KINTSUGI_API_KEY \
  -u KINTSUGI_KEY_FILE \
  -u KINTSUGI_PROVIDER \
  -u KINTSUGI_BASE_URL \
  -u KINTSUGI_MODEL \
  npm test

echo
echo "[3/8] OpenSpec validation"
npx openspec validate phase-7-shared-memory --strict
npx openspec validate phase-9-memory-migration-hardening --strict
npx openspec validate phase-10-model-configuration-live-smoke --strict

echo
echo "[4/8] config doctor with key-file auth"
printf 'test-key-from-file\n' > "$KEY_FILE"
KINTSUGI_PROVIDER=openai-chat \
KINTSUGI_MODEL=test-model \
KINTSUGI_KEY_FILE="$KEY_FILE" \
node dist/index.js config doctor

echo
echo "[5/8] boot reads memory state"
BOOT_OUTPUT="$(node dist/index.js boot --no-substrate)"
printf '%s\n' "$BOOT_OUTPUT"
test -s "$KINTSUGI_MEMORY_DIR/ops.log"
printf '%s\n' "$BOOT_OUTPUT" | grep -F "memory warnings: $EXPECTED_MEMORY_WARNINGS" >/dev/null

echo
echo "[6/8] remember filters and learned reconstruction"
printf '%s\n' \
  '{"id":"script-learn-1","kind":"learn","actor":"external","payload":{"key":"test.runtime.tone","value":"warm"},"at":"2026-05-24T00:00:00.000Z"}' \
  >> "$KINTSUGI_MEMORY_DIR/ops.log"
node dist/index.js remember --kind learn --actor external --limit 5
node dist/index.js remember --learned | grep -F 'test.runtime.tone: warm' >/dev/null

echo
echo "[7/8] mock ask smoke"
env \
  -u KINTSUGI_LIVE_SMOKE \
  -u KINTSUGI_API_KEY \
  -u KINTSUGI_KEY_FILE \
  -u KINTSUGI_PROVIDER \
  -u KINTSUGI_BASE_URL \
  -u KINTSUGI_MODEL \
  node dist/index.js ask --no-substrate "Say OK for runtime smoke."

if [[ "${KINTSUGI_LIVE_SMOKE:-0}" == "1" ]]; then
  echo
  echo "[8/8] live provider + runtime smoke"
  if [[ -z "${KINTSUGI_API_KEY:-}" && -z "${KINTSUGI_KEY_FILE:-}" ]]; then
    echo "KINTSUGI_LIVE_SMOKE=1 requires KINTSUGI_API_KEY or KINTSUGI_KEY_FILE" >&2
    exit 1
  fi
  if [[ -z "${KINTSUGI_PROVIDER:-}" || -z "${KINTSUGI_MODEL:-}" ]]; then
    echo "KINTSUGI_LIVE_SMOKE=1 requires KINTSUGI_PROVIDER and KINTSUGI_MODEL" >&2
    exit 1
  fi
  npx vitest run tests/live-provider-smoke.test.ts
  node dist/index.js ask --no-substrate "Say OK in one short sentence." >/dev/null
else
  echo
  echo "[8/8] live skipped; set KINTSUGI_LIVE_SMOKE=1 with provider/model/key to run it."
fi

echo
echo "[kintsugi] runtime smoke passed"
