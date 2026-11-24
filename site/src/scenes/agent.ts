import { AGENT_TRACKS, type AgentTrack, type Expect, type ExpectIcon } from "../data/agent";
import { blanksHTML, fillBlanks } from "../lib/blanks";
import { copyText, enhanceCode } from "../lib/code";
import { esc, fill, fillRich, getValues, isPrivate, npubToHex, onValues, renderTemplates, trackOf, type Track } from "../lib/values";

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

/**
 * The line under the prompt: what it still needs from the Running on box. The npub is optional, since
 * the skill makes the owner's key when there's none, but a mistyped one has to be fixed.
 */
function promptHint(track: Track): { text: string; incomplete: boolean } {
  const v = getValues();
  const name = isPrivate(track) ? "Tailscale name" : "domain";
  const npub = v.npub.trim();
  if (npub && !npubToHex(npub)) return { text: "That npub isn't valid: fix it in the Running on box, or clear it and the skill makes your key.", incomplete: true };
  if (track !== "practice" && !v.domain.trim()) return { text: `Type your ${name} into the Running on box to fill it in.`, incomplete: true };
  if (!npub) return { text: "No npub yet: the skill makes your key. Have one? Type it into the Running on box.", incomplete: false };
  return { text: track === "practice" ? "Your npub comes from the Running on box." : `Your ${name} and npub come from the Running on box.`, incomplete: false };
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
  lock: icon(`<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`),
};

type ReadyItem = AgentTrack["ready"][number];
const CHEV = `<svg class="ag-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
const SERVER_ICON = icon(`<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>`);
const SSH_ICON = icon(`<path d="m5 8 4 4-4 4M12 16h7"/>`);
const APP_ICON = icon(`<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>`);
/** An item's chip icon, by its name: the server, SSH, the address, the app, the agent, the key, Tailscale. */
function prepIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("ssh")) return SSH_ICON;
  if (n.includes("key")) return ICONS.key;
  if (n.includes("domain") || n.includes("name") || n.includes("forwarding")) return ICONS.dns;
  if (n.startsWith("buzz")) return APP_ICON;
  if (n.includes("agent")) return ICONS.agent;
  if (n.includes("tailscale") || n.includes("https")) return ICONS.lock;
  return SERVER_ICON;
}
/** An item's bold name, without its closing punctuation, for its chip. */
const nameOf = (r: ReadyItem) => (/^<b>(.*?)<\/b>/.exec(r.t)?.[1] ?? "").replace(/[.:]$/, "");
/** What the chip opens to first: the item's own key facts, or the rest of its line. */
const topOf = (r: ReadyItem) => r.key ?? r.t.replace(/^<b>.*?<\/b>[.:]?\s*/, "");

/**
 * Before you start (the owner's pick of 2026-11-24, from three mockups): one chip per item. A chip
 * opens to the item's key facts, with any warning beside them, and the rest in folds inside it.
 */
function prepHTML(rs: ReadyItem[]): string {
  const chips = rs
    .map((r, i) => `<button type="button" class="ag-chip" data-prep="${i}" aria-expanded="false" aria-controls="ag-prep-${i}"><span class="ag-chip-i">${prepIcon(nameOf(r))}</span>${nameOf(r)}${CHEV}</button>`)
    .join("");
  const fold = (label: string, t: string) => `<details class="ag-pfold"><summary><span>${label}</span>${CHEV}</summary><div class="ag-pfold-b" data-rich="${attr(t)}"></div></details>`;
  const pops = rs
    .map((r, i) => {
      const folds = [r.more ? fold(r.more.label, r.more.t) : "", r.warn ? fold("Why it can't change", r.warn.t) : ""].join("");
      return `<div class="ag-pop-i" id="ag-prep-${i}" hidden>
        <p class="ag-pop-h"><b>${nameOf(r)}.</b> <span data-rich="${attr(topOf(r))}"></span></p>
        ${r.warn ? `<p class="ag-warn"><b>${r.warn.label}</b>, so pick one you're happy to keep.</p>` : ""}
        ${folds}
      </div>`;
    })
    .join("");
  return `<div class="ag-prep"><p class="ag-prep-k">Before you start</p><div class="ag-chips">${chips}</div><div class="ag-pop" hidden>${pops}</div></div>`;
}

/** Answer when it stops: everything the agent does, in order, each opening to what happens. */
function runHTML(rows: Expect[]): string {
  const who = (r: Expect) => (r.who === "agent" ? "Your agent" : r.ask ? "It asks you" : "You") + (r.note ? ` · ${r.note}` : "");
  return `<ol class="ag-run">${rows
    .map(
      (r) => `<li class="ag-run-row ${r.who}${r.note ? " soft" : ""}"><details>
        <summary><span class="ag-tl-dot">${ICONS[r.icon]}</span><span class="ag-run-t">${r.t}</span><span class="ag-tl-who">${who(r)}</span>${CHEV}</summary>
        <p class="ag-run-d" data-rich="${attr(r.d)}"></p>
      </details></li>`,
    )
    .join("")}</ol>`;
}

/** The agent path: get ready, install the skill, ask, and what to expect. */
export function mountAgent(host: HTMLElement): void {
  let kind = loadKind();
  let track: Track = trackOf();

  const refill = () => {
    host.querySelectorAll<HTMLElement>("[data-rich]").forEach((el) => (el.innerHTML = fillRich(el.dataset.rich!)));
    const p = AGENT_TRACKS[track];
    const prompt = host.querySelector<HTMLElement>(".ag-prompt-text");
    // blanks first: an unset npub fills in as "<your npub>", which is the panel's, not a blank
    if (prompt) prompt.innerHTML = fillRich(blanksHTML(esc(p.prompt)));
    const h = promptHint(track);
    const hint = host.querySelector<HTMLElement>(".ag-hint");
    if (hint) hint.textContent = h.text;
    host.querySelector(".ag-prompt")?.classList.toggle("incomplete", h.incomplete);
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
    // a prompt with blanks (<user>, <server IP>) asks the reader to fill them in first
    const blanks = /<[a-z][^>]*>/i.test(t.prompt);
    host.innerHTML = `
      <div class="ag ag-new">
        ${prepHTML(t.ready)}
        <ol class="ag-stack">
          <li class="ag-card">
            <h3 class="ag-card-h"><span class="ag-n">1</span>Install the skill</h3>
            <p class="ag-card-s">Run this once on the computer your agent runs on. It needs Node.js. Nothing runs until your agent uses the skill.</p>
            <div class="ag-npx"><pre class="cmd">${esc(NPX_CMD)}</pre></div>
            <details class="ag-alt">
              <summary>No Node.js? Download the skill into your agent's skills folder instead</summary>
              <div class="ag-tabs" role="tablist" aria-label="Your agent">${(Object.keys(INSTALL) as AgentKind[])
                .map((k) => `<button type="button" role="tab" data-kind="${k}" aria-selected="${k === kind}">${INSTALL[k].label}</button>`)
                .join("")}</div>
              <div class="ag-install"></div>
              <p class="ag-kind-note"></p>
            </details>
          </li>
          <li class="ag-card">
            <h3 class="ag-card-h"><span class="ag-n">2</span>Paste the prompt</h3>
            <p class="ag-card-s">${blanks ? "Fill in the blanks, then paste it" : "Paste it"} into Claude Code, Codex or Goose.</p>
            <div class="ag-prompt">
              <p class="ag-prompt-text"></p>
              <div class="ag-prompt-foot">
                <span class="ag-hint"></span>
                <button type="button" class="ag-copy">Copy prompt</button>
              </div>
            </div>
          </li>
          <li class="ag-card">
            <h3 class="ag-card-h"><span class="ag-n">3</span>Answer when it stops</h3>
            <p class="ag-card-s">Your agent's part usually takes 5 to 10 minutes. It stops for you at the highlighted steps. Open any step to see what happens.</p>
            ${runHTML(t.expect)}
          </li>
        </ol>
      </div>`;
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
    const chip = t.closest<HTMLButtonElement>("[data-prep]");
    if (chip) {
      const pop = host.querySelector<HTMLElement>(".ag-pop")!;
      const was = chip.getAttribute("aria-expanded") === "true";
      host.querySelectorAll("[data-prep]").forEach((c) => c.setAttribute("aria-expanded", "false"));
      pop.querySelectorAll<HTMLElement>(".ag-pop-i").forEach((p) => (p.hidden = true));
      pop.hidden = was;
      if (!was) {
        chip.setAttribute("aria-expanded", "true");
        document.getElementById(chip.getAttribute("aria-controls")!)!.hidden = false;
      }
      return;
    }
    const fold = t.closest<HTMLButtonElement>(".ag-fold");
    if (fold) {
      const body = document.getElementById(fold.getAttribute("aria-controls")!)!;
      body.hidden = !body.hidden;
      fold.setAttribute("aria-expanded", String(!body.hidden));
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
  });

  render();
  onValues(() => (trackOf() !== track ? render() : refill()));
}
