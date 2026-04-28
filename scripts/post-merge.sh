#!/bin/bash
set -e

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
git push "$REMOTE_URL" HEAD:main 2>&1 | sed -E 's#https://[^@]+@#https://***@#g'

echo "Push complete. CI will build ghcr.io/devs-wescctech/app-crm-vh:latest and the server will pull it."
