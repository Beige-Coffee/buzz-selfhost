import { OP_DETAILS, OP_ORDER, OP_TASKS, OP_WHERE, opSetup, type OpStep, type OpTask } from "../data/agent";
import { OPS } from "../data/steps";
import { blanksHTML, fillBlanks } from "../lib/blanks";
import { copyText, enhanceCode } from "../lib/code";
import { esc, fill, fillRich, getValues, isPrivate, onValues, trackOf, type Track } from "../lib/values";
import { ICONS } from "./agent";
import { PICK } from "./panel";

const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const SERVER = svg(`<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>`);
const TASK_ICONS: Record<OpTask, string> = {
  people: svg(`<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/>`),
  backup: svg(`<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>`),
  restore: svg(`<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>`),
  upgrade: svg(`<path d="M12 19V5M5 12l7-7 7 7"/>`),
};

const promptOf = (t: Track, task: OpTask) => `${OP_WHERE[t]} Use the self-host-buzz skill to ${OP_TASKS[task].ask}`;

/** The domain is the Running on box's. Until it's typed there, it shows as a gap that jumps to its field. */
const hasDomain = () => Boolean(getValues().domain.trim());
const gapName = (t: Track) => (isPrivate(t) ? "your Tailscale name" : "your domain");
const gap = (t: Track) => `<span class="v unset" data-k="DOMAIN">${gapName(t)}</span>`;

function promptHTML(t: Track, task: OpTask): string {
  const html = blanksHTML(esc(promptOf(t, task)));
  return fillRich(hasDomain() ? html : html.replace("{{DOMAIN}}", gap(t)));
}
function promptText(t: Track, task: OpTask): string {
  const text = fillBlanks(promptOf(t, task));
  return fill(hasDomain() ? text : text.replace("{{DOMAIN}}", `<${gapName(t)}>`), false);
}

/** What happens: the agent's own steps carry its icon, in gray; where it stops for you, in chartreuse. */
const stepsHTML = (rows: OpStep[]) =>
  `<ol class="opx-steps">${rows
    .map((r) => `<li data-who="${r.who}"><span class="opx-dot">${ICONS[r.icon]}</span><span><span class="sr">${r.who === "agent" ? "Your agent: " : "Stops for you: "}</span>${r.t}</span></li>`)
    .join("")}</ol>`;

/**
 * People, backups, restore, upgrades for the relay the Running on box describes: pick a task, then
 * copy its prompt (agent mode) or follow operations.md's steps (step-by-step mode).
 */
export function mountOperations(host: HTMLElement): void {
  let open: OpTask = "people";
  let track: Track = trackOf();

  const ctxHTML = () => {
    // a practice relay has a fixed address; Railway names its own unless you bring a domain
    const at = track === "practice" || (track === "railway" && !hasDomain()) ? "" : ` at ${hasDomain() ? fillRich("{{DOMAIN}}") : gap(track)}`;
    return `<div class="opx-ctx">${SERVER}<span class="opx-ctx-l">Running on</span><span class="opx-ctx-v"><b>${PICK[track]}</b>${at}</span><a class="opx-ctx-a" href="#where">Change</a></div>`;
  };

  const listHTML = () =>
    OP_ORDER.map((id) => {
      const manual = OP_DETAILS[opSetup(track)][id].manual;
      return `<button type="button" role="tab" class="opx-item" id="opx-tab-${id}" data-task="${id}" aria-controls="opx-pane" aria-selected="${id === open}" tabindex="${id === open ? 0 : -1}">
        <span class="opx-item-i">${TASK_ICONS[id]}</span>
        <span class="opx-item-t"><b>${OP_TASKS[id].name}</b><span>${manual ? "With your own tools" : OP_TASKS[id].sub}</span></span>
      </button>`;
    }).join("");

  const paneHTML = () => {
    const d = OP_DETAILS[opSetup(track)][open];
    const ops = OPS.filter((o) => o.kind === open && o.tracks.includes(track));
    const agentHTML = d.manual
      ? ""
      : `<div class="mode-agent">
          <div class="ag-prompt opx-prompt">
            <p class="ag-prompt-text">${promptHTML(track, open)}</p>
            <div class="opx-foot"><button type="button" class="ag-copy">Copy prompt</button></div>
          </div>
          <p class="opx-k">What happens</p>
          ${stepsHTML(d.steps)}
        </div>`;
    const stepsMode = ops.map((o) => `${ops.length > 1 ? `<h4 class="opx-h">${o.title}</h4>` : ""}<div class="tl-md op-md">${fillRich(o.html)}</div>`).join("");
    return `<p class="opx-why">${d.why}</p>
      ${agentHTML}
      ${stepsMode ? `<div class="mode-steps">${stepsMode}</div>` : ""}`;
  };

  const renderPane = () => {
    const pane = host.querySelector<HTMLElement>(".opx-pane")!;
    pane.setAttribute("aria-labelledby", `opx-tab-${open}`);
    pane.innerHTML = paneHTML();
    enhanceCode(pane);
  };
  const render = () => {
    track = trackOf();
    host.innerHTML = `${ctxHTML()}
      <div class="opx">
        <div class="opx-list" role="tablist" aria-label="Tasks">${listHTML()}</div>
        <div class="opx-pane" id="opx-pane" role="tabpanel"></div>
      </div>`;
    renderPane();
  };

  const select = (id: OpTask, focus = false) => {
    open = id;
    host.querySelectorAll<HTMLButtonElement>("[data-task]").forEach((b) => {
      const on = b.dataset.task === id;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    renderPane();
  };

  host.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const tab = t.closest<HTMLButtonElement>("[data-task]");
    if (tab) return select(tab.dataset.task as OpTask);
    const copy = t.closest<HTMLButtonElement>(".ag-copy");
    if (copy)
      copyText(promptText(track, open), () => {
        copy.textContent = "Copied";
        window.setTimeout(() => (copy.textContent = "Copy prompt"), 1600);
      });
  });
  // arrow keys move between tasks, as in any tab list
  host.addEventListener("keydown", (e) => {
    if (!(e.target as HTMLElement).closest("[data-task]")) return;
    const i = OP_ORDER.indexOf(open);
    const n = OP_ORDER.length;
    const next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(OP_ORDER[(next + n) % n], true);
  });

  render();
  // the Running on box changed: a new setup redraws the list too; a new domain only the text
  onValues(() => {
    if (trackOf() !== track) return render();
    host.querySelector(".opx-ctx")!.outerHTML = ctxHTML();
    renderPane();
  });
}
