import { AGENT_TRACKS, type Expect, type ExpectIcon } from "../data/agent";
import { blanksHTML, fillBlanks } from "../lib/blanks";
import { copyText, enhanceCode } from "../lib/code";
import { derived, esc, fill, fillRich, getValues, onValues, renderTemplates, setValues, trackOf, type Track } from "../lib/values";

const AGENT_KEY = "buzz-selfhost-agent-v1";
type AgentKind = "claude" | "agents";
const INSTALL: Record<AgentKind, { label: string; dir: string; note: string }> = {
  claude: { label: "Claude Code", dir: "~/.claude/skills", note: "Claude Code reads its skills from this folder, and so does Goose." },
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

/** Where `npx skills add` finds the skill. Becomes block/buzz if the skill is merged there. */
const SKILL_REPO = "Beige-Coffee/buzz-selfhost";
// -g installs for the user, like the download, so the agent finds it from any folder
const NPX_CMD = `npx skills add ${SKILL_REPO} --skill self-host-buzz -g`;

/** What's missing from the panel for this track's prompt. */
function missing(track: Track): string[] {
  const v = getValues();
  const out: string[] = [];
  // Railway names the relay unless you bring a domain
  if (track !== "practice" && track !== "railway" && !v.domain.trim()) out.push("domain");
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

const icon = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
/** The timeline icons, shared with the operations section. */
export const ICONS: Record<ExpectIcon, string> = {
  ask: icon(`<path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5"/><path d="M12 18h.01"/>`),
  agent: icon(`<path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/>`),
  key: icon(`<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14 9l2.5 2.5"/>`),
  join: icon(`<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>`),
  phone: icon(`<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>`),
  dns: icon(`<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.6 5.6 3.6 9s-1.1 6.4-3.6 9c-2.5-2.6-3.6-5.6-3.6-9s1.1-6.4 3.6-9z"/>`),
  clock: icon(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`),
};

/** What to expect: in order, what the agent does and where it stops for you. */
function expectHTML(rows: Expect[]): string {
  const who = (r: Expect) => (r.who === "agent" ? "Your agent" : r.ask ? "It asks you" : "You") + (r.note ? ` · ${r.note}` : "");
  return `<ol class="ag-tl">${rows
    .map(
      (r) => `<li class="ag-tl-row ${r.who}${r.note ? " soft" : ""}">
        <span class="ag-tl-dot">${ICONS[r.icon]}</span>
        <div><p class="ag-tl-who">${who(r)}</p><p class="ag-tl-t">${r.t}</p><p class="ag-tl-d" data-rich="${attr(r.d)}"></p></div>
      </li>`,
    )
    .join("")}</ol>`;
}

/** The agent path: get ready, install the skill, ask, and what to expect. */
export function mountAgent(host: HTMLElement): void {
  let kind = loadKind();
  let track: Track = trackOf();
  let fileText: string | null = null;

  const refill = () => {
    host.querySelectorAll<HTMLElement>("[data-rich]").forEach((el) => (el.innerHTML = fillRich(el.dataset.rich!)));
    const p = AGENT_TRACKS[track];
    const prompt = host.querySelector<HTMLElement>(".ag-prompt-text");
    // blanks first: an unset npub fills in as "<your npub>", which is the panel's, not a blank
    if (prompt) prompt.innerHTML = fillRich(blanksHTML(esc(p.prompt)));
    const miss = missing(track);
    const hint = host.querySelector<HTMLElement>(".ag-hint");
    if (hint)
      hint.textContent = miss.length
        ? `Type your ${miss.join(" and ")} into the Running on box to fill ${miss.length > 1 ? "them" : "it"} in.`
        : p.prompt.includes("{{DOMAIN}}")
          ? "Your domain and npub come from the Running on box."
          : "Your npub comes from the Running on box.";
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

  function render(): void {
    track = trackOf();
    const t = AGENT_TRACKS[track];
    host.innerHTML = `
      <ol class="tl ag">
        <li class="tl-step ag-step">
          <span class="tl-n" aria-hidden="true"><span>1</span></span>
          <div class="tl-body">
            <h3>Get ready</h3>
            <ul class="ag-ready">${t.ready
              .map(
                (r) =>
                  `<li><span data-rich="${attr(r.t)}"></span>${r.goto ? ` <button type="button" class="ag-how" data-goto="${r.goto}">How</button>` : ""}${
                    r.warn ? `<details class="ag-more ag-warn"><summary>${r.warn.label}</summary><div class="ag-more-body" data-rich="${attr(r.warn.t)}"></div></details>` : ""
                  }${r.more ? `<details class="ag-more"><summary>${r.more.label}</summary><div class="ag-more-body" data-rich="${attr(r.more.t)}"></div></details>` : ""}</li>`,
              )
              .join("")}</ul>
          </div>
        </li>
        <li class="tl-step ag-step">
          <span class="tl-n" aria-hidden="true"><span>2</span></span>
          <div class="tl-body">
            <h3>Install the skill</h3>
            <p class="tl-why">Run this once in a terminal on the computer your agent runs on. It needs Node.js, for <code>npx</code>. It copies the skill into your agent's skills folder; nothing runs until your agent uses it.</p>
            <div class="ag-npx"><pre class="cmd">${esc(NPX_CMD)}</pre></div>
            <details class="ag-alt">
              <summary>No Node.js? Download the skill into your agent's skills folder instead</summary>
              <div class="ag-tabs" role="tablist" aria-label="Your agent">${(Object.keys(INSTALL) as AgentKind[])
                .map((k) => `<button type="button" role="tab" data-kind="${k}" aria-selected="${k === kind}">${INSTALL[k].label}</button>`)
                .join("")}</div>
              <div class="ag-install"></div>
              <p class="ag-kind-note"></p>
            </details>
            <p class="ag-under">
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
            <h3>What to expect</h3>
            <p class="tl-why">What happens after you send the prompt, in order. Steps marked Your agent run on their own; the others need you. Your agent's own messages will be worded differently.</p>
            ${expectHTML(t.expect)}
          </div>
        </li>
      </ol>`;
    enhanceCode(host.querySelector<HTMLElement>(".ag-npx")!);
    renderInstall();
    refill();
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
      copyText(fill(fillBlanks(AGENT_TRACKS[track].prompt), false), () => {
        copy.textContent = "Copied";
        window.setTimeout(() => (copy.textContent = "Copy prompt"), 1600);
      });
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
