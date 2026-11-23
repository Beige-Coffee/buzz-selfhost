import { OP_DETAILS, OP_FLOWS, OP_TASKS, OP_WHERE, opSetup, type FlowStep, type OpStep, type OpTask } from "../data/agent";
import { OPS } from "../data/steps";
import { blanksHTML, fillBlanks } from "../lib/blanks";
import { esc, fill, fillRich, getValues, isPrivate, type Track } from "../lib/values";
import { ICONS } from "./agent";
import { PICK } from "./panel";

/**
 * The three answers that depend on the setup (faq.ts), each with a menu that picks it: an overview, a
 * prompt for your agent, and operations.md's commands folded underneath to run yourself. The other
 * answers say what differs in a sentence, so they hold for every setup.
 */

const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const SERVER = svg(`<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>`);

const promptOf = (t: Track, task: OpTask) => `${OP_WHERE[t]} Use the self-host-buzz skill to ${OP_TASKS[task].ask} The skill is at {{SKILL_URL}}.`;

/** The domain is the guide's. Until it's typed there, it shows as a gap that jumps to its field. */
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
  "Also turn on your hosting provider's automatic backups. DigitalOcean, Hetzner, AWS and Google Cloud all offer them. They copy the whole server, and you can roll the server back to one of those copies.";

/** On a private network the community's address is the machine's Tailscale name, so it can't move. */
const PRIVATE_MOVE =
  "This guide doesn't cover restoring a private-network relay onto a new machine. The community's address is the old machine's Tailscale name. Restore onto the same machine.";

/** The setups in the menu's order: the server ones, then the local test. */
const ORDER: Track[] = ["vps", "vps-private", "own-public", "own-private", "k8s", "k8s-private", "practice"];
const CHEV = svg(`<path d="m6 9 6 6 6-6"/>`);

/** Which setup an answer's commands are for, as a menu. Picking one changes the guide's setup too. */
function setupSwitchHTML(track: Track): string {
  return `<div class="opx-for">${SERVER}<label class="opx-for-l" for="opx-for-sel">For</label><span class="opx-for-s"><select id="opx-for-sel" class="opx-for-sel">${ORDER.map(
    (t) => `<option value="${t}"${t === track ? " selected" : ""}>${PICK[t]}</option>`,
  ).join("")}</select>${CHEV}</span></div>`;
}

/**
 * What a backup holds and where it goes, for every setup: the server's data, one folder, an encrypted copy
 * off the server (operations.md's backup step).
 */
const box = (head: string, lines: string[], cls = "") =>
  `<div class="fq-card${cls}"><p class="fq-card-h">${head}</p>${lines.map((l) => `<p class="opx-bk-l">${l}</p>`).join("")}</div>`;
const BACKUP_VIS = `<div class="fq-vis fq-keyhome opx-bk">
  ${box(`${SERVER}Your server`, ["The database: messages, members and channels", "Uploaded files", "Git repositories", "The relay's settings, with its key and passwords"])}
  <span class="fq-arrow">copy</span>
  ${box("One backup folder", ["<code>~/buzz-backup/2026-11-23</code>", "<span class=\"fq-dim\">One folder for each backup</span>"], " dark")}
  <span class="fq-arrow">encrypt</span>
  ${box("Off the server", ["Your computer, or storage you control", "<span class=\"fq-dim\">Keep at least one copy here</span>"])}
</div>`;

/**
 * Backing up, restoring or upgrading one setup (owner's ask of 2026-11-23): a short overview, then a prompt
 * for your agent, with the steps to do it yourself folded underneath. A setup the skill has no steps for
 * gets only the overview.
 */
export function taskHTML(task: OpTask, track: Track): string {
  const d = OP_DETAILS[opSetup(track)][task];
  const ops = OPS.filter((o) => o.kind === task && o.tracks.includes(track));
  const commands = ops.map((o) => `${ops.length > 1 ? `<h4 class="opx-h">${o.title}</h4>` : ""}<div class="tl-md op-md">${fillRich(o.html)}</div>`).join("");
  const note =
    task === "backup" && (track === "vps" || track === "vps-private")
      ? `<p class="opx-note">${HOST_BACKUPS}</p>`
      : task === "restore" && isPrivate(track) && opSetup(track) === "compose"
        ? `<p class="opx-note">${PRIVATE_MOVE}</p>`
        : "";
  const why = `${setupSwitchHTML(track)}<p class="opx-why">${d.why}</p>${task === "backup" ? BACKUP_VIS : ""}`;
  if (d.manual) return `${why}${note}`;
  const prompt = `<div class="mode-agent">
      <div class="ag-prompt opx-prompt">
        <p class="ag-prompt-text">${promptHTML(track, task)}</p>
        <div class="opx-foot"><button type="button" class="ag-copy" data-task="${task}">Copy prompt</button></div>
      </div>
      ${d.steps ? `<p class="opx-k">What happens</p>${stepsHTML(d.steps)}` : ""}
    </div>`;
  const flow = task === "backup" || task === "restore" ? OP_FLOWS[opSetup(track)][task] : undefined;
  let byHand = commands;
  if (flow) {
    const blocks = ops.flatMap((o) => o.html.match(/<pre[\s\S]*?<\/pre>/g) ?? []);
    // the skill's block that runs this step's command
    const block = (cmd?: string) => (cmd ? blocks.find((b) => b.includes(cmd)) : undefined);
    const stepHTML = (f: FlowStep, n: number) =>
      `<li><span class="opx-flow-n">${n + 1}</span><div><p class="opx-flow-t">${f.t}</p><p class="opx-flow-d">${fillRich(f.d)}</p>${fillRich(block(f.code) ?? "")}</div></li>`;
    byHand = `<ol class="opx-flow">${flow.map(stepHTML).join("")}</ol>`;
  }
  return `${why}${prompt}${note}${byHand ? `<details class="ref ref-op"><summary><span class="ref-t">Do it yourself, step by step</span></summary>${byHand}</details>` : ""}`;
}
