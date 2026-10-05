# Sourced by the smoke tests. run_logged reruns the calling script with everything it prints saved to
# tests/runs/<date>-<time>-<setup>-<tag>.log, after lib/redact.py masks anything shaped like a secret
# (and, in the saved copy, personal details such as emails and the tailnet's name).
# NO_LOG=1 turns it off.

# run_logged SETUP TAG SCRIPT ARGS...: call it after the script reads its arguments, with "$0" "$@".
run_logged() {
  [[ -n ${NO_LOG:-} || -n ${SMOKE_LOGGING:-} ]] && return 0
  local setup=$1 tag=$2 script=$3
  shift 3
  local here log status changes=
  here=$(cd "$(dirname "$script")" && pwd)
  mkdir -p "$here/runs"
  log=$here/runs/$(date +%Y-%m-%d-%H%M)-$setup-$tag.log
  [[ -n $(git -C "$here" status --porcelain 2>/dev/null) ]] && changes=", plus uncommitted changes"
  {
    echo "# $setup on $tag, $(date '+%Y-%m-%d %H:%M %Z')"
    echo "# skill and tests at $(git -C "$here" rev-parse --short HEAD 2>/dev/null || echo 'no commit')$changes"
    echo "# $(basename "$script") $*"
    SMOKE_LOGGING=1 bash "$script" "$@"
  } 2>&1 | python3 -u "$here/lib/redact.py" | tee "$log.tmp"
  status=${PIPESTATUS[0]}
  # the committed copy also drops personal details the screen needs (lib/redact.py --private)
  python3 "$here/lib/redact.py" --private <"$log.tmp" >"$log" && rm -f "$log.tmp"
  echo "saved tests/runs/$(basename "$log")"
  exit "$status"
}
