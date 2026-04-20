#!/usr/bin/env bash
# Scans the staged (or given) .replit file for values that look like real
# secrets and refuses the commit if any NEW ones are being introduced.
#
# Usage:
#   scripts/check-replit-secrets.sh                 # scan staged .replit (pre-commit)
#   scripts/check-replit-secrets.sh path/to/.replit # scan a specific file (all lines)
#
# Behavior in pre-commit mode:
#   - Only flags lines that are being ADDED or MODIFIED in this commit.
#     Pre-existing secret-looking lines already in HEAD's .replit are NOT
#     blocked (so a legacy value does not wedge all future commits).
#
# Bypass (not recommended): git commit --no-verify
#
# Rules:
#   1. Known provider patterns are ALWAYS flagged (Google/Stripe/OpenAI/AWS/
#      GitHub/Slack tokens, private-key blocks).
#   2. Inside [userenv.*] or [env] sections, keys ending in _SECRET / _KEY /
#      _TOKEN / _PASSWORD / _PASS / _APIKEY / _API_KEY whose value is long
#      (>= 20 chars), high-entropy (base64/hex/alphanumeric), and is not a
#      ${VAR} reference or a known placeholder get flagged.

set -u

TARGET="${1:-}"
CONTENT=""
OLD_CONTENT=""
PRECOMMIT_MODE=0

if [ -z "$TARGET" ]; then
  PRECOMMIT_MODE=1
  if ! git diff --cached --name-only 2>/dev/null | grep -qx ".replit"; then
    exit 0
  fi
  CONTENT=$(git show :.replit 2>/dev/null) || exit 0
  OLD_CONTENT=$(git show HEAD:.replit 2>/dev/null || true)
  TARGET=".replit (staged)"
else
  [ ! -f "$TARGET" ] && { echo "check-replit-secrets: file not found: $TARGET" >&2; exit 2; }
  CONTENT=$(cat "$TARGET")
fi

RED=$'\033[31m'; YEL=$'\033[33m'; RST=$'\033[0m'
findings=()

# Returns 0 if the given line text already exists somewhere in OLD_CONTENT
# (pre-existing). In standalone mode OLD_CONTENT is empty, so nothing is
# considered pre-existing — all matches are flagged.
is_preexisting() {
  local needle="$1"
  [ -z "$OLD_CONTENT" ] && return 1
  printf '%s\n' "$OLD_CONTENT" | grep -Fxq -- "$needle"
}

add_finding() {
  findings+=("$1")
}

# --- Rule 1: known provider patterns ---
# label::regex
patterns=(
  "Google OAuth Client ID::[0-9]{10,}-[a-z0-9]{20,}\.apps\.googleusercontent\.com"
  "Google OAuth Client Secret::GOCSPX-[A-Za-z0-9_-]{20,}"
  "Google API Key::AIza[A-Za-z0-9_-]{35}"
  "Stripe Live Secret Key::sk_live_[A-Za-z0-9]{20,}"
  "Stripe Test Secret Key::sk_test_[A-Za-z0-9]{20,}"
  "Stripe Restricted Key::rk_(live|test)_[A-Za-z0-9]{20,}"
  "Stripe Webhook Secret::whsec_[A-Za-z0-9]{20,}"
  "OpenAI API Key::sk-(proj-)?[A-Za-z0-9_-]{30,}"
  "AWS Access Key ID::AKIA[A-Z0-9]{16}"
  "GitHub Personal Token::gh[pousr]_[A-Za-z0-9]{30,}"
  "Slack Token::xox[baprs]-[A-Za-z0-9-]{10,}"
  "PEM Private Key Header::BEGIN (RSA |EC |OPENSSH |PGP |DSA |ENCRYPTED )?PRIVATE KEY"
)

for entry in "${patterns[@]}"; do
  label="${entry%%::*}"
  pat="${entry##*::}"
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    lineno="${hit%%:*}"
    linetext="${hit#*:}"
    if is_preexisting "$linetext"; then continue; fi
    add_finding "${RED}${label}${RST} detected on line ${lineno}"
  done < <(printf '%s\n' "$CONTENT" | grep -En -- "$pat" || true)
done

# --- Rule 2: suspicious sensitive-looking keys inside config blocks ---
section=""
lineno=0
while IFS= read -r line || [ -n "$line" ]; do
  lineno=$((lineno + 1))
  if [[ "$line" =~ ^\[([A-Za-z0-9_.-]+)\] ]]; then
    section="${BASH_REMATCH[1]}"
    continue
  fi
  case "$section" in
    userenv*|env) ;;
    *) continue ;;
  esac
  if [[ "$line" =~ ^[[:space:]]*([A-Z][A-Z0-9_]*)[[:space:]]*=[[:space:]]*\"(.*)\"[[:space:]]*$ ]]; then
    key="${BASH_REMATCH[1]}"; val="${BASH_REMATCH[2]}"
    case "$key" in
      *_SECRET|*_KEY|*_TOKEN|*_PASSWORD|*_PASS|*_APIKEY|*_API_KEY) ;;
      *) continue ;;
    esac
    [ -z "$val" ] && continue
    [[ "$val" =~ ^\$\{.+\}$ ]] && continue
    echo "$val" | grep -qiE '^(REDACTED_|CHANGE_ME|changeme|change-in-production|your-.*-here|example|placeholder|TBD|TODO)$' && continue
    echo "$val" | grep -qiE '(change-in-production|your-.*-here|placeholder|example-only)' && continue
    [ "${#val}" -lt 20 ] && continue
    if [[ "$val" =~ ^[A-Za-z0-9+/_=-]+$ ]]; then
      if is_preexisting "$line"; then continue; fi
      add_finding "${RED}Suspected secret${RST} at line ${lineno}: [${section}] ${key} = \"…(${#val} chars)…\""
    fi
  fi
done <<< "$CONTENT"

if [ ${#findings[@]} -eq 0 ]; then exit 0; fi

echo "" >&2
echo "${RED}✖ Refusing to commit ${TARGET}: possible NEW secrets detected${RST}" >&2
echo "" >&2
for f in "${findings[@]}"; do echo "  • $f" >&2; done
echo "" >&2
echo "${YEL}Secrets must live in Replit Secrets (Tools → Secrets), not in .replit${RST}" >&2
echo "${YEL}which is tracked by git.${RST}" >&2
echo "To bypass (not recommended): ${YEL}git commit --no-verify${RST}" >&2
echo "" >&2
exit 1
