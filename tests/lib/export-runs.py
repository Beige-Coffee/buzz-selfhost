#!/usr/bin/env python3
"""Copy agent test runs out of Claude Code's session history into tests/runs/, as Markdown.

Claude Code keeps a sub-agent's transcript next to its session
(~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl) and deletes it after 30 days.
Each run becomes one file: the agent's own report on top, then the task it was given and every
command it ran with the start and end of its output. lib/redact.py masks secrets and personal
details throughout.

Usage: python3 tests/lib/export-runs.py <session folder or agent .jsonl>... [--out tests/runs]
"""
import argparse
import datetime
import glob
import json
import os
import re
import sys
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from redact import redact  # noqa: E402


def scrub(text):
    return redact(text, private=True)

ZONE = ZoneInfo("America/Los_Angeles")
OUTPUT_LINES = 15  # lines kept from each end of a command's output


def text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text")
    return ""


def clip(text, keep=OUTPUT_LINES):
    lines = text.rstrip("\n").split("\n")
    if len(lines) <= 2 * keep + 1:
        return "\n".join(lines)
    return "\n".join(lines[:keep] + [f"[... {len(lines) - 2 * keep} lines ...]"] + lines[-keep:])


def fence(text, lang=""):
    ticks = "```"
    while ticks in text:
        ticks += "`"
    return f"{ticks}{lang}\n{text}\n{ticks}"


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "run"


def relay_version(prompt, tools):
    """The image the run installed, then any it upgraded to; else the tag it mentions most."""
    text = prompt + "\n" + "\n".join(f"{body}\n{output or ''}" for _, _, body, output in tools)
    installed = []
    for m in re.finditer(r"ghcr\.io/block/buzz:(sha-[0-9a-f]{7})|\btag: (sha-[0-9a-f]{7})|\bimage\.tag=(sha-[0-9a-f]{7})", text):
        tag = next(g for g in m.groups() if g)
        if tag not in installed:
            installed.append(tag)
    if installed:
        return ", then ".join(installed)
    mentioned = re.findall(r"sha-[0-9a-f]{7}", text)
    return max(set(mentioned), key=mentioned.count) if mentioned else "unknown"


def load(path):
    rows = [json.loads(line) for line in open(path) if line.strip()]
    meta = {}
    meta_path = path[: -len(".jsonl")] + ".meta.json"
    if os.path.exists(meta_path):
        try:
            meta = json.load(open(meta_path))
        except ValueError:
            pass
    return rows, meta


def export(path, meta, rows, out_dir):
    times = [datetime.datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00")) for r in rows if r.get("timestamp")]
    start, end = min(times).astimezone(ZONE), max(times).astimezone(ZONE)
    prompt = next((r["message"]["content"] for r in rows
                   if r.get("type") == "user" and isinstance(r.get("message", {}).get("content"), str)), "")
    title = meta.get("description") or " ".join(prompt.split())[:60]
    events, uses, report, commands = [], {}, "", 0
    for r in rows:
        content = (r.get("message") or {}).get("content")
        if not isinstance(content, list):
            continue
        for c in content:
            if r.get("type") == "assistant" and c.get("type") == "text" and c.get("text", "").strip():
                events.append(("note", c["text"].strip()))
                report = c["text"].strip()
            elif c.get("type") == "tool_use":
                inp = c.get("input", {})
                if c.get("name") == "Bash":
                    commands += 1
                    label = inp.get("description") or "command"
                    body = inp.get("command", "")
                else:
                    label = c.get("name")
                    body = json.dumps(inp, indent=1)[:2000]
                uses[c["id"]] = len(events)
                events.append(("tool", label, body, None))
            elif c.get("type") == "tool_result" and c.get("tool_use_id") in uses:
                i = uses[c["tool_use_id"]]
                kind, label, body, _ = events[i]
                events[i] = (kind, label, body, text_of(c.get("content")))
    tag = relay_version(prompt, [e for e in events if e[0] == "tool"])
    minutes = (end - start).total_seconds() / 60
    agent = os.path.basename(path)[len("agent-"): -len(".jsonl")]
    session = os.path.basename(os.path.dirname(os.path.dirname(path)))

    lines = [
        f"# {scrub(title)}",
        "",
        f"- **When:** {start:%Y-%m-%d %H:%M %Z}, {minutes:.0f} minutes",
        f"- **Relay version:** `{tag}`",
        f"- **Commands run:** {commands}",
        f"- **Source:** Claude Code session `{session}`, agent `{agent}`, exported {datetime.date.today()}",
        "",
        "## The agent's report",
        "",
        scrub(report) or "(no report)",
        "",
        "<details><summary>The task it was given</summary>",
        "",
        fence(scrub(prompt), "text"),
        "",
        "</details>",
        "",
        "<details><summary>Everything it did, in order</summary>",
        "",
    ]
    for n, event in enumerate(events[:-1] if events and events[-1][0] == "note" else events):
        if event[0] == "note":
            lines += [scrub(event[1]), ""]
        else:
            _, label, body, output = event
            lines += [f"**{scrub(label)}**", "", fence(scrub(body), "bash")]
            if output:
                lines += [fence(scrub(clip(output)))]
            lines += [""]
    lines += ["</details>", ""]
    name = f"{start:%Y-%m-%d-%H%M}-agent-{slug(title)}.md"
    with open(os.path.join(out_dir, name), "w") as f:
        f.write("\n".join(lines))
    return name, start, minutes, tag, title


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("paths", nargs="+")
    parser.add_argument("--out", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "runs"))
    args = parser.parse_args()
    files = []
    for p in args.paths:
        files += sorted(glob.glob(os.path.join(p, "subagents", "agent-*.jsonl"))) if os.path.isdir(p) else [p]
    os.makedirs(args.out, exist_ok=True)
    seen = {}
    for path in files:  # a continued session repeats its parent's agents; keep one, with its description
        agent = os.path.basename(path)
        rows, meta = load(path)
        if agent not in seen or (meta and not seen[agent][1]):
            seen[agent] = (path, meta, rows)
    for path, meta, rows in seen.values():
        name, start, minutes, tag, title = export(path, meta, rows, args.out)
        print(f"{start:%Y-%m-%d %H:%M}  {minutes:5.1f} min  {tag:12}  {title}  ->  {name}")


if __name__ == "__main__":
    main()
