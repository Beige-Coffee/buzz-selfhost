#!/usr/bin/env python3
"""Mask secrets in test output. As a filter (stdin to stdout) it guards the logs in tests/runs/;
export-runs.py imports redact() for the agent transcripts. With --private it also masks personal
details that aren't secrets (emails, home folders, the tailnet's name), for files that get committed.

Masks what looks like a credential and keeps everything else readable: Tailscale keys and client
IDs, cloud and API tokens, JWTs, Nostr nsec keys, private key blocks, passwords inside URLs, labeled
secret hex, and the value of NAME=value when NAME says SECRET, PASSWORD, TOKEN, PRIVATE_KEY and the
like. Public keys, npubs, hashes and IDs stay as they are. Values that are variable references
($TOKEN, "$sk") stay too, so commands still read.
"""
import re
import sys

MASK = "[redacted]"
KEEP_SUFFIXES = ("_FILE", "_PATH", "_DIR")

PEM = re.compile(r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----.*?-----END [A-Z0-9 ]*PRIVATE KEY-----", re.S)
FIXED = [
    (re.compile(r"\btskey-[A-Za-z0-9_-]+"), "tskey-" + MASK),
    (re.compile(r"\b[A-Za-z0-9]{6,}CNTRL\b"), MASK),  # Tailscale key and OAuth client IDs
    (re.compile(r"\bdo[a-z]_v1_[0-9a-f]{16,}"), MASK),  # DigitalOcean
    (re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})"), MASK),
    (re.compile(r"\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}"), MASK),
    (re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"), MASK),
    (re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"), MASK),  # JWTs
    (re.compile(r"\bnsec1[02-9ac-hj-np-z]{20,}"), "nsec1" + MASK),
    (re.compile(r"(?i)\b(authorization:\s*(?:bearer|basic)\s+)\S+"), r"\1" + MASK),
    (re.compile(r"(\b[a-z][a-z0-9+.-]*://[^\s:/@]+:)([^\s@/]+)(@)"), r"\1" + MASK + r"\3"),
    (re.compile(r"(?i)((?:secret|private)[ _-]?key\b[^0-9a-f\n]{0,20})\b[0-9a-f]{64}\b"), r"\1" + MASK),
    (re.compile(r'(?i)("[a-z0-9_]*(?:secret|password|private_?key|privkey|token|api_?key|access_?key|auth_?key|nsec)[a-z0-9_]*"\s*:\s*")([^"$][^"]*)(")'),
     r"\1" + MASK + r"\3"),
]
# NAME=value or NAME: value, upper-case names as in .env files and shell variables.
ENV = re.compile(r"\b([A-Z][A-Z0-9_]*(?:(?:SECRET|PASSWORD|PASSWD|PRIVATE_KEY|PRIVKEY|TOKEN|API_KEY|ACCESS_KEY|AUTHKEY|AUTH_KEY)[A-Z0-9_]*|_SK))"
                 r"(\s*[=:]\s*)(['\"]?)(?![$'\"<\[(])([^\s'\"]+)")
# --flag=value or --flag value
FLAG = re.compile(r"(?i)(--?[a-z0-9-]*(?:secret|password|token|auth-?key|api-?key|private-key)[a-z0-9-]*[= ])(['\"]?)(?![$'\"<\[(-])([^\s'\"]+)")


# --private, for what gets committed: personal details that aren't secrets. Not for the screen, where
# the operator needs the real tailnet name to join.
PRIVATE = [
    (re.compile(r"(?<![\w.])(?!(?:git|root|ubuntu|noreply)@)[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "[email]"),
    (re.compile(r"(?<![\w.@-])[A-Za-z0-9._%+]+@(?=\s)"), "[email]"),  # `tailscale status` shortens logins to name@
    (re.compile(r"/(?:Users|home)/[^/\s'\"]+"), "~"),
    (re.compile(r"-Users-[A-Za-z0-9._]+-"), "-Users-user-"),  # Claude Code's per-project folder names
    (re.compile(r"^([dl-][rwxsStT@+.-]{9,11}\s+\d+\s+)(?!root\b)[A-Za-z0-9._-]+", re.M), r"\1user"),  # ls -l owner
    (re.compile(r"\btail[0-9a-f]{6}\.ts\.net\b"), "tail1234.ts.net"),
]


def _env(m):
    if m.group(1).endswith(KEEP_SUFFIXES):
        return m.group(0)
    return m.group(1) + m.group(2) + m.group(3) + MASK


def redact(text, private=False):
    text = PEM.sub("-----[redacted private key]-----", text)
    for pattern, repl in FIXED + (PRIVATE if private else []):
        text = pattern.sub(repl, text)
    text = ENV.sub(_env, text)
    return FLAG.sub(lambda m: m.group(1) + m.group(2) + MASK, text)


def main():
    private = "--private" in sys.argv[1:]
    in_key = False
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        if "-----BEGIN" in line and "PRIVATE KEY-----" in line:
            in_key = True
        if in_key:
            if "-----END" in line and "PRIVATE KEY-----" in line:
                in_key = False
                sys.stdout.write("-----[redacted private key]-----\n")
            continue
        sys.stdout.write(redact(line, private))
        sys.stdout.flush()


if __name__ == "__main__":
    main()
