import { OP_ASKS, OP_DETAILS, OP_FLOWS, OP_TASKS, OP_WHERE, opSetup, type AskKey, type FlowStep, type OpStep, type OpTask } from "../data/agent";
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

const askOf = (t: Track, key: AskKey) => `${OP_WHERE[t]} Use the self-host-buzz skill to ${OP_ASKS[key]} The skill is at {{SKILL_URL}}.`;
/** One change for your agent, as a prompt to copy, under the menu that says which setup it's for. */
export function askHTML(track: Track, key: AskKey): string {
  const html = blanksHTML(esc(askOf(track, key)));
  const text = fillRich(hasDomain() ? html : html.replace("{{DOMAIN}}", gap(track)));
  return `${setupSwitchHTML(track)}<div class="mode-agent"><div class="ag-prompt opx-prompt"><p class="ag-prompt-text">${text}</p><div class="opx-foot"><button type="button" class="ag-copy" data-ask="${key}">Copy prompt</button></div></div></div>`;
}
/** That prompt as plain text, for its copy button. */
export function askText(t: Track, key: AskKey): string {
  const text = fillBlanks(askOf(t, key));
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
const ic = (d: string) => svg(d);
const BK_ICON = {
  db: ic(`<path d="M12 6m-8 0a8 3 0 1 0 16 0a8 3 0 1 0 -16 0"/><path d="M4 6v6a8 3 0 0 0 16 0v-6"/><path d="M4 12v6a8 3 0 0 0 16 0v-6"/>`),
  files: ic(`<path d="M15 8h.01"/><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z"/><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"/><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"/>`),
  git: ic(`<path d="M7 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M7 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M17 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M7 8l0 8"/><path d="M9 18h6a2 2 0 0 0 2 -2v-5"/><path d="M14 14l3 -3l3 3"/>`),
  key: ic(`<path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0z"/><path d="M15 9h.01"/>`),
  lock: ic(`<path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z"/><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0"/><path d="M8 11v-4a4 4 0 1 1 8 0v4"/>`),
  folder: ic(`<path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2"/>`),
};
const item = (i: string, t: string) => `<p class="opx-bk-i">${i}<span>${t}</span></p>`;
const BACKUP_VIS = `<div class="fq-vis fq-keyhome opx-bk">
  <div class="fq-card"><p class="fq-card-h">${SERVER}Your server</p>
    ${item(BK_ICON.db, "The database: messages, members and channels")}${item(BK_ICON.files, "Uploaded files")}${item(BK_ICON.git, "Git repositories")}${item(BK_ICON.key, "The relay's settings, with its key and passwords")}
  </div>
  <span class="fq-arrow">copy</span>
  <div class="fq-card dark"><p class="fq-card-h">${BK_ICON.folder}One backup folder</p><p class="opx-bk-l"><code>~/buzz-backup/2026-11-23</code></p><p class="opx-bk-l"><span class="fq-dim">One folder for each backup</span></p></div>
  <span class="fq-arrow">encrypt</span>
  <div class="fq-card opx-bk-safe"><p class="fq-card-h">${BK_ICON.lock}Off the server</p><p class="opx-bk-l">Your computer, or storage you control</p><p class="opx-bk-badge">${BK_ICON.lock}Encrypted copy</p></div>
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
