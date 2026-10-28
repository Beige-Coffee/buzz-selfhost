import { OP_DETAILS, OP_FLOWS, OP_TASKS, OP_WHERE, opSetup, type FlowStep, type OpStep, type OpTask } from "../data/agent";
import { OPS } from "../data/steps";
import { blanksHTML, fillBlanks } from "../lib/blanks";
import { esc, fill, fillRich, getValues, isPrivate, type Track } from "../lib/values";
import { ICONS } from "./agent";
import { PICK } from "./panel";

/**
 * The answers that depend on the setup, for the relay the Running on box describes (faq.ts): backing
 * up and restoring are operations.md's commands, to run yourself; upgrading is a prompt for your
 * agent, its commands folded.
 */

const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const SERVER = svg(`<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>`);

const promptOf = (t: Track, task: OpTask) => `${OP_WHERE[t]} Use the self-host-buzz skill to ${OP_TASKS[task].ask}`;

/** The domain is the Running on box's. Until it's typed there, it shows as a gap that jumps to its field. */
const hasDomain = () => Boolean(getValues().domain.trim());
const gapName = (t: Track) => (isPrivate(t) ? "your Tailscale name" : "your domain");
const gap = (t: Track) => `<span class="v unset" data-k="DOMAIN">${gapName(t)}</span>`;

function promptHTML(t: Track, task: OpTask): string {
  const html = blanksHTML(esc(promptOf(t, task)));
  return fillRich(hasDomain() ? html : html.replace("{{DOMAIN}}", gap(t)));
}
/** The prompt as plain text, for its copy button. */
export function promptText(t: Track, task: OpTask): string {
  const text = fillBlanks(promptOf(t, task));
  return fill(hasDomain() ? text : text.replace("{{DOMAIN}}", `<${gapName(t)}>`), false);
}

/** What happens: the agent's own steps carry its icon, in gray; where it stops for you, in chartreuse. */
const stepsHTML = (rows: OpStep[]) =>
  `<ol class="opx-steps">${rows
    .map((r) => `<li data-who="${r.who}"><span class="opx-dot">${ICONS[r.icon]}</span><span><span class="sr">${r.who === "agent" ? "Your agent: " : "Stops for you: "}</span>${r.t}</span></li>`)
    .join("")}</ol>`;

/** A VPS can also be rolled back from the provider's own backups. */
const HOST_BACKUPS =
  "Also turn on your provider's automatic backups: DigitalOcean, Hetzner, AWS and Google Cloud all have them. They copy the whole server, so you can roll it back.";

/** The Running on box: which setup, at which address, the commands below are for. */
export function runningOnHTML(track: Track): string {
  // a practice relay has a fixed address; Railway names its own unless you bring a domain
  const at = track === "practice" || (track === "railway" && !hasDomain()) ? "" : ` at ${hasDomain() ? fillRich("{{DOMAIN}}") : gap(track)}`;
  return `<div class="opx-ctx">${SERVER}<span class="opx-ctx-l">Running on</span><span class="opx-ctx-v"><b>${PICK[track]}</b>${at}</span><a class="opx-ctx-a" href="#where">Change</a></div>`;
}

/**
 * Backing up, restoring or upgrading one setup: why, then numbered steps with the skill's own commands
 * (backing up and restoring), or a prompt for your agent with its commands folded (upgrading).
 */
export function taskHTML(task: OpTask, track: Track): string {
  const d = OP_DETAILS[opSetup(track)][task];
  const ops = OPS.filter((o) => o.kind === task && o.tracks.includes(track));
  const commands = ops.map((o) => `${ops.length > 1 ? `<h4 class="opx-h">${o.title}</h4>` : ""}<div class="tl-md op-md">${fillRich(o.html)}</div>`).join("");
  const note = task === "backup" && (track === "vps" || track === "vps-private") ? `<p class="opx-note">${HOST_BACKUPS}</p>` : "";
  const why = `<p class="opx-why">${d.why}</p>${note}`;
  const flow = task === "backup" || task === "restore" ? OP_FLOWS[opSetup(track)][task] : undefined;
  if (flow && !d.manual) {
    const blocks = ops.flatMap((o) => o.html.match(/<pre[\s\S]*?<\/pre>/g) ?? []);
    const stepHTML = (f: FlowStep, n: number) =>
      `<li><span class="opx-flow-n">${n + 1}</span><div><p class="opx-flow-t">${f.t}</p><p class="opx-flow-d">${fillRich(f.d)}</p>${
        f.code !== undefined && blocks[f.code] ? fillRich(blocks[f.code]) : ""
      }</div></li>`;
    return `${why}<ol class="opx-flow">${flow.map(stepHTML).join("")}</ol>`;
  }
  if (task !== "upgrade" || d.manual) return why;
  return `${why}
    <div class="mode-agent">
      <div class="ag-prompt opx-prompt">
        <p class="ag-prompt-text">${promptHTML(track, task)}</p>
        <div class="opx-foot"><button type="button" class="ag-copy">Copy prompt</button></div>
      </div>
      <p class="opx-k">What happens</p>
      ${stepsHTML(d.steps ?? [])}
    </div>
    ${commands ? `<details class="ref ref-op"><summary><span class="ref-t">See the commands</span></summary>${commands}</details>` : ""}`;
}
