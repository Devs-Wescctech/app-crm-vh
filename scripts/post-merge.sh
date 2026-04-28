#!/bin/bash
set -eo pipefail

if [ -f .git/index.lock ]; then
  echo "Removing stale .git/index.lock"
  rm -f .git/index.lock
fi

REMOTE_URL=$(grep -oE 'https://[^@]+@github\.com/[^[:space:]]+' .git/config | head -1)

if [ -z "$REMOTE_URL" ]; then
  echo "ERROR: no authenticated GitHub remote URL found in .git/config"
  exit 1
fi

CURRENT_HEAD=$(git rev-parse HEAD)
echo "Local HEAD: $CURRENT_HEAD"

git fetch "$REMOTE_URL" main:refs/remotes/origin/main 2>&1 | sed -E 's#https://[^@]+@#https://***@#g'
REMOTE_HEAD=$(git rev-parse origin/main)
echo "Remote main: $REMOTE_HEAD"

if [ "$CURRENT_HEAD" = "$REMOTE_HEAD" ]; then
  echo "Already in sync with origin/main. Nothing to push."
  exit 0
fi

echo "Pushing HEAD to origin/main (this triggers the GitHub Actions Docker build & deploy)"

PUSH_LOG=$(mktemp)
trap 'rm -f "$PUSH_LOG"' EXIT

PUSH_STATUS=0
git push "$REMOTE_URL" HEAD:main >"$PUSH_LOG" 2>&1 || PUSH_STATUS=$?
sed -E 's#https://[^@]+@#https://***@#g' "$PUSH_LOG"

if [ "$PUSH_STATUS" -ne 0 ]; then
  if grep -q "non-fast-forward\|rejected" "$PUSH_LOG"; then
    echo ""
    echo "ERROR: Push was REJECTED by GitHub (non-fast-forward)."
    echo "       Local main has diverged from origin/main."
    echo "       Production will NOT receive these changes until this is resolved."
    echo "       Ask the main agent to force-push (with user approval) to align them."
  else
    echo ""
    echo "ERROR: git push failed with exit code $PUSH_STATUS. See log above."
  fi
  exit "$PUSH_STATUS"
fi

NEW_REMOTE_HEAD=$(git ls-remote "$REMOTE_URL" main 2>/dev/null | awk '{print $1}')
if [ -n "$NEW_REMOTE_HEAD" ] && [ "$NEW_REMOTE_HEAD" != "$CURRENT_HEAD" ]; then
  echo ""
  echo "ERROR: Push reported success but origin/main is at $NEW_REMOTE_HEAD, not $CURRENT_HEAD."
  echo "       Production will NOT receive these changes."
  exit 1
fi

echo "Push complete. CI will build ghcr.io/devs-wescctech/app-crm-vh:latest and the server will pull it."
