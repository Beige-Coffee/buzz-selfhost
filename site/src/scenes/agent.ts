import { AGENT_TRACKS, DAY_TWO_PROMPTS, type RunLine } from "../data/agent";
import { copyText, enhanceCode } from "../lib/code";
import { derived, esc, fill, fillRich, getValues, onValues, renderTemplates, setValues, trackOf, type Track } from "../lib/values";

const AGENT_KEY = "buzz-selfhost-agent-v1";
type AgentKind = "claude" | "agents";
const INSTALL: Record<AgentKind, { label: string; dir: string; note: string }> = {
  claude: { label: "Claude Code", dir: "~/.claude/skills", note: "Goose reads this folder too." },
  agents: { label: "Goose, Codex and others", dir: "~/.agents/skills", note: "The shared skills folder Goose and Codex read." },
};

const loadKind = (): AgentKind => {
  try {
    return localStorage.getItem(AGENT_KEY) === "agents" ? "agents" : "claude";
  } catch {
    return "claude";
  }
};
const saveKind = (k: AgentKind) => {
  try {
    localStorage.setItem(AGENT_KEY, k);
  } catch {
    /* ignore */
  }
};

/** Attribute-safe: templates ride along in data-rich and data-copy. */
const attr = (t: string) => esc(t).replace(/"/g, "&quot;");

const installCmd = (k: AgentKind) => `mkdir -p ${INSTALL[k].dir} && \\
  curl -fsSL {{SKILL_ARCHIVE}} | tar -xz -C ${INSTALL[k].dir}`;

/** What's missing from the panel for this track's prompt. */
function missing(track: Track): string[] {
  const v = getValues();
  const out: string[] = [];
  if (track !== "practice" && !v.domain.trim()) out.push("domain");
  if (!derived().OWNER_HEX.match(/^[0-9a-f]{64}$/)) out.push("npub");
  return out;
}

/** Light highlighting for the raw SKILL.md: headings, code fences and front matter. */
function highlight(md: string): string {
  let inFence = false;
  let inFront = false;
  return md
    .split("\n")
    .map((line, i) => {
      const e = esc(line);
      if (i === 0 && line === "---") inFront = true;
      else if (inFront && line === "---") {
        inFront = false;
        return `<span class="md-dim">${e}</span>`;
      }
      if (inFront) return `<span class="md-dim">${e}</span>`;
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return `<span class="md-dim">${e}</span>`;
      }
      if (inFence) return `<span class="md-code">${e}</span>`;
      if (/^#{1,3} /.test(line)) return `<span class="md-h">${e}</span>`;
      return e;
    })
    .join("\n");
}

function runLineHTML(l: RunLine, i: number, delay: number): string {
  const d = `style="--d:${delay}ms" data-i="${i}"`;
  switch (l.k) {
    case "you":
      return `<li class="ln you" ${d}><span class="ln-k">›</span><span class="ln-t" data-rich="${attr(l.t)}"></span></li>`;
    case "ok":
      return `<li class="ln ok" ${d}><span class="ln-k">✓</span><span class="ln-n">${l.n}</span><span class="ln-t">${l.t}</span><span class="ln-d" data-rich="${attr(l.d)}"></span></li>`;
    case "ask":
      return `<li class="ln ask" ${d}><span class="ln-k">?</span><span class="ln-t"><b>Asks you</b> <span data-rich="${attr(l.t)}"></span></span></li>`;
    case "turn":
      return `<li class="ln turn" ${d}><span class="ln-k">→</span><span class="ln-t"><b>Your turn</b> <span data-rich="${attr(l.t)}"></span></span></li>`;
  }
}

/** Delays for the run: a steady beat, with a pause while the agent waits on you. */
function delays(lines: RunLine[]): number[] {
  let t = 250;
  return lines.map((l, i) => {
    const at = t;
    const prev = lines[i - 1];
    t += l.k === "ask" ? 950 : prev?.k === "ask" ? 460 : l.k === "you" && i === 0 ? 620 : 340;
    return at;
  });
}

/** The agent path: get ready, install the skill, ask, and a replay of what a run looks like. */
export function mountAgent(host: HTMLElement): void {
  let kind = loadKind();
  let track: Track = trackOf();
  let fileText: string | null = null;
  let io: IntersectionObserver | null = null;

  const refill = () => {
    host.querySelectorAll<HTMLElement>("[data-rich]").forEach((el) => (el.innerHTML = fillRich(el.dataset.rich!)));
    const p = AGENT_TRACKS[track];
    const prompt = host.querySelector<HTMLElement>(".ag-prompt-text");
    if (prompt) prompt.innerHTML = fillRich(esc(p.prompt));
    const miss = missing(track);
    const hint = host.querySelector<HTMLElement>(".ag-hint");
    if (hint)
      hint.textContent = miss.length
        ? `Add your ${miss.join(" and ")} in the panel and ${miss.length > 1 ? "they" : "it"} will appear here.`
        : "Filled in from the panel.";
    host.querySelector(".ag-prompt")?.classList.toggle("incomplete", miss.length > 0);
    renderTemplates(host);
  };

  const renderInstall = () => {
    const box = host.querySelector<HTMLElement>(".ag-install")!;
    box.innerHTML = `<pre class="cmd" data-tpl>${esc(installCmd(kind))}</pre>`;
    renderTemplates(box);
    enhanceCode(box);
    host.querySelector<HTMLElement>(".ag-kind-note")!.textContent = INSTALL[kind].note;
  };

  const play = (run: HTMLElement) => {
    run.classList.remove("play");
    void run.offsetWidth;
    run.classList.add("play");
  };

  function render(): void {
    track = trackOf();
    const t = AGENT_TRACKS[track];
    const ds = delays(t.run);
    host.innerHTML = `
      <ol class="tl ag">
        <li class="tl-step ag-step">
          <span class="tl-n" aria-hidden="true"><span>1</span></span>
          <div class="tl-body">
            <h3>Get ready</h3>
            <ul class="ag-ready">${t.ready
              .map(
                (r) =>
                  `<li><span data-rich="${attr(r.t)}"></span>${r.goto ? ` <button type="button" class="ag-how" data-goto="${r.goto}">How</button>` : ""}</li>`,
              )
              .join("")}</ul>
          </div>
        </li>
        <li class="tl-step ag-step">
          <span class="tl-n" aria-hidden="true"><span>2</span></span>
          <div class="tl-body">
            <h3>Install the skill</h3>
            <p class="tl-why">Once, on the machine your agent runs on. It's a folder of Markdown instructions and three small scripts: nothing runs until your agent does.</p>
            <div class="ag-tabs" role="tablist" aria-label="Your agent">${(Object.keys(INSTALL) as AgentKind[])
              .map((k) => `<button type="button" role="tab" data-kind="${k}" aria-selected="${k === kind}">${INSTALL[k].label}</button>`)
              .join("")}</div>
            <div class="ag-install"></div>
            <p class="ag-under">
              <span class="ag-kind-note"></span>
              <span class="ag-links">
                <button type="button" class="ag-read" aria-expanded="false">Read the skill</button>
                <a href="skills/self-host-buzz.tar.gz" download="self-host-buzz.tar.gz">Download</a>
              </span>
            </p>
            <div class="ag-file" hidden>
              <div class="ag-file-bar"><span>self-host-buzz/SKILL.md</span><span class="ag-file-meta"></span></div>
              <pre class="ag-file-body">Loading…</pre>
            </div>
          </div>
        </li>
        <li class="tl-step ag-step">
          <span class="tl-n" aria-hidden="true"><span>3</span></span>
          <div class="tl-body">
            <h3>Ask your agent</h3>
            <div class="ag-prompt">
              <p class="ag-prompt-text"></p>
              <div class="ag-prompt-foot">
                <span class="ag-hint"></span>
                <button type="button" class="ag-copy">Copy prompt</button>
              </div>
            </div>
          </div>
        </li>
        <li class="tl-step ag-step">
          <span class="tl-n" aria-hidden="true"><span>4</span></span>
          <div class="tl-body">
            <h3>Watch it work</h3>
            <p class="tl-why">It shows you every check as it goes, and hands back to you for the parts that are yours.</p>
            <div class="ag-run armed">
              <div class="ag-run-bar"><i></i><i></i><i></i><span>your agent</span><button type="button" class="ag-replay">Replay</button></div>
              <ol class="ag-lines" aria-label="An example run">${t.run.map((l, i) => runLineHTML(l, i, ds[i])).join("")}</ol>
            </div>
          </div>
        </li>
      </ol>`;
    renderInstall();
    refill();

    const run = host.querySelector<HTMLElement>(".ag-run")!;
    io?.disconnect();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      run.classList.remove("armed");
    } else {
      io = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            if (e.isIntersecting) {
              play(run);
              io?.disconnect();
            }
          }),
        { threshold: 0.35 },
      );
      io.observe(run);
    }
  }

  host.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const tab = t.closest<HTMLButtonElement>("[data-kind]");
    if (tab) {
      kind = tab.dataset.kind as AgentKind;
      saveKind(kind);
      host.querySelectorAll<HTMLButtonElement>("[data-kind]").forEach((b) => b.setAttribute("aria-selected", String(b === tab)));
      renderInstall();
      return;
    }
    const read = t.closest<HTMLButtonElement>(".ag-read");
    if (read) {
      const file = host.querySelector<HTMLElement>(".ag-file")!;
      const open = file.hidden;
      file.hidden = !open;
      read.setAttribute("aria-expanded", String(open));
      read.textContent = open ? "Hide the skill" : "Read the skill";
      if (open && fileText === null) {
        fetch(derived().SKILL_URL)
          .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
          .then((text) => {
            fileText = text;
            host.querySelector<HTMLElement>(".ag-file-body")!.innerHTML = highlight(text);
            host.querySelector<HTMLElement>(".ag-file-meta")!.textContent = `${text.split("\n").length} lines`;
          })
          .catch(() => (host.querySelector<HTMLElement>(".ag-file-body")!.textContent = "Couldn't load the file. Use Download instead."));
      }
      return;
    }
    const copy = t.closest<HTMLButtonElement>(".ag-copy");
    if (copy) {
      copyText(fill(AGENT_TRACKS[track].prompt, false), () => {
        copy.textContent = "Copied";
        window.setTimeout(() => (copy.textContent = "Copy prompt"), 1600);
      });
      return;
    }
    const replay = t.closest<HTMLButtonElement>(".ag-replay");
    if (replay) {
      play(host.querySelector<HTMLElement>(".ag-run")!);
      return;
    }
    const how = t.closest<HTMLButtonElement>("[data-goto]");
    if (how) {
      setValues({ mode: "steps" });
      // Scroll once the swap has settled; if the smooth scroll didn't land (a hidden tab doesn't animate), jump.
      const step = () => document.getElementById(`step-${how.dataset.goto}`);
      window.setTimeout(() => step()?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      window.setTimeout(() => {
        const el = step();
        if (el && Math.abs(el.getBoundingClientRect().top - 84) > 40) el.scrollIntoView({ behavior: "instant", block: "start" });
      }, 800);
    }
  });

  render();
  onValues(() => (trackOf() !== track ? render() : refill()));
}

/** Operations as prompts to paste: `data-asks` names the row. */
export function mountAsks(host: HTMLElement): void {
  const items = DAY_TWO_PROMPTS[host.dataset.asks ?? ""] ?? [];
  host.classList.add("asks");
  host.innerHTML = `<span class="asks-l">Ask your agent</span>${items
    .map(
      (it) => `<div class="ask"><p>${esc(it.prompt)}</p><button type="button" class="ask-copy" data-copy="${attr(it.prompt)}">Copy</button></div>
        <p class="fine">${it.note}</p>`,
    )
    .join("")}`;
  host.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".ask-copy");
    if (!b) return;
    copyText(b.dataset.copy!, () => {
      b.textContent = "Copied";
      window.setTimeout(() => (b.textContent = "Copy"), 1400);
    });
  });
}
