import skill from "virtual:skill-steps";
import type { AgentStep } from "../../build/skill";
import { linkButton } from "../lib/permalink";
import { blanksHTML, fillBlanks } from "../lib/blanks";
import { esc, fill, fillRich, getValues, trackOf } from "../lib/values";
import { BUZZ_ROBOT, TABLER } from "./tabler";

/**
 * The Agents answers in Running your relay: how to run agents (who each works for), what to tell an
 * agent, which harness to pick, keeping one answering, keeping it safe, and an agent on your own
 * server. Each leads with the recommendation, then one drawing.
 *
 * The steps, commands, tables and the example instruction come from the skill's agents.md, parsed
 * at build time (build/skill.ts, SkillAgents), so the page and the skill can't say different
 * things. The words around them are the page's own, and rest on the sentences AGENTS_SAYS checks.
 *
 * Sources: block/buzz-app v1.0.0 and block/buzz 0.3.0 (agents.md cites each), a test on a local
 * Compose relay on 2026-11-12, and one of 2026-11-19 with Buzz 1.0.5's own Authorize external
 * identity dialog and an agent on a cloud server set up by the prompt (docs/remote-agent-test.md).
 */

const OWN: Record<string, string> = {
  laptop: `<path d="M5 6a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v9H5z"/><path d="M3 18h18"/>`,
  cloud: `<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10.5 3.75 3.75 0 0 1 17.5 18z"/>`,
  server: `<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>`,
  alert: `<path d="M12 3 22 20H2z"/><path d="M12 10v4M12 17v.01"/>`,
  robot: BUZZ_ROBOT,
  login: `<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l4-4-4-4"/><path d="M14 12H4"/>`,
  tag: `<path d="M4 7.5V12a2 2 0 0 0 .6 1.4l6.8 6.8a2 2 0 0 0 2.8 0l5-5a2 2 0 0 0 0-2.8L12.4 5.6A2 2 0 0 0 11 5H6.5A2.5 2.5 0 0 0 4 7.5z"/><path d="M8.5 9.5h.01"/>`,
  // Tabler's world
  world: `<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M3.6 9h16.8"/><path d="M3.6 15h16.8"/><path d="M11.5 3a17 17 0 0 0 0 18"/><path d="M12.5 3a17 17 0 0 1 0 18"/>`,
};
const icon = (n: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${OWN[n] ?? TABLER[n]}</svg>`;

/** A part of a long answer: a heading with its own link, #<answer>-<part>, which faq.ts opens. */
const part = (id: string, title: string) => `<h4 class="ga-h" id="${id}">${title}${linkButton(`#${id}`, "Copy a link to this part")}</h4>`;

/** faq.ts's own pieces, so every answer looks alike: ct places one of its click-throughs of Buzz. */
export interface AnswerKit {
  rec: (t: string, cases?: [label: string, text: string][]) => string;
  note: (t: string) => string;
  ct: (name: string) => string;
}
/** A link to another answer in Running your relay. */
const go = (id: string, text: string) => `<a href="#operations" data-q-link="${id}">${text}</a>`;

/** The skill's numbered steps, its commands included, filled in for the setup in the Running on box. */
const flow = (rows: AgentStep[]) =>
  `<ol class="opx-flow ga-flow">${rows
    .map((s, i) => `<li><span class="opx-flow-n">${i + 1}</span><div><p class="opx-flow-t">${s.title}</p><div class="opx-flow-d tl-md">${fillRich(s.html)}</div></div></li>`)
    .join("")}</ol>`;

/* ── How should we run agents? ── */

/**
 * Three agents, by who they work for, as agents.md's opening list has them: where each runs, who can
 * ask it, how it gets in and where it belongs, with the answer that says how.
 */
const WHO_ROWS = ["Where it runs", "Who can ask it", "How it gets in", "Which channels"];
const who = (i: string, title: string, cells: string[], link: string, cls = "") =>
  `<div class="ga-who-c${cls}"><p class="ga-who-h"><i>${icon(i)}</i>${title}</p><dl>${cells
    .map((c, n) => `<div><dt>${WHO_ROWS[n]}</dt><dd>${c}</dd></div>`)
    .join("")}</dl>${link}</div>`;
const WHO = () => `<div class="fq-vis ga-who">
  ${who("user", "For you", ["A computer that stays on, with Buzz open", "Only you", "It uses your membership", "The channels you add it to"], go("agent-on", "Keep it answering →"))}
  ${who("users", "For your team", ["A server of its own", "The people you list", "It uses your membership, with an ownership proof you make in Buzz", "Your team's channels"], go("agent-remote", "Run one on your server →"))}
  ${who("world", "For the public", ["A machine with nothing private on it", "Anyone who mentions it", "You add its key as a member on the server", "Open channels only"], go("agent-safe", "Keep it safe →"), " open")}
</div>`;

/* ── What should we tell an agent? ── */

/** What each line of the skill's example is for, in its order (the build checks there are five). */
const JOBS = ["Who it works for", "What it works from", "What it checks with you first", "How it reports back", "What it never posts"];
/** Buzz's own rules for every agent (agents.md, from base_prompt.md). */
const SAID = [
  "It acts only when someone mentions it or sends it a direct message.",
  "It replies in the thread where it was asked.",
  "It keeps its messages to the channel brief.",
  "It stays quiet when it has nothing to add.",
];
const INSTRUCTIONS = () => `<div class="fq-vis ga-ins-vis">
  <div class="ga-ins"><p class="ga-ins-h">Instructions <em>Optional</em></p>
    <div class="ga-ins-box">${skill.agents.instruction.map((line, i) => `<p class="ga-ins-l"><span class="ga-ins-t">${esc(line)}</span><span class="ga-ins-j">${JOBS[i]}</span></p>`).join("")}</div>
  </div>
  <div class="fq-card dark ga-said"><p class="fq-card-h">${icon("message-circle")}Buzz already gives every agent these rules</p><ul>${SAID.map((s) => `<li>${s}</li>`).join("")}</ul></div>
</div>`;

/* ── Which harness and model should we pick? ── */

const HARNESS = () => `<div class="fq-vis"><table class="fq-roles ga-har">
  <thead><tr><th>Harness</th><th>What you need</th><th>Runs on</th></tr></thead>
  <tbody>${skill.agents.harness.map(([h, need, on]) => `<tr><td>${h}</td><td>${need}</td><td>${on}</td></tr>`).join("")}</tbody></table></div>`;

/* ── How do we keep an agent answering? ── */

const chip = (t: string, cls = "") => `<span class="ga-chip${cls}">${t}</span>`;
const place = (i: string, title: string, text: string, chips: string, pick = false) =>
  `<div class="ga-on-row${pick ? " pick" : ""}"><span class="ga-on-i">${icon(i)}</span><div><b>${title}</b><p>${text}</p></div><div class="ga-on-s">${chips}</div></div>`;
const PLACES = `<div class="fq-vis ga-on">
  ${place("laptop", "Your laptop", "The agent answers only while Buzz is open and the lid is up.", chip("Built into Buzz", " yes"))}
  ${place("device-desktop", "A computer that stays on", "Keep Buzz open on a spare computer, or on a virtual machine with a desktop. The agent then answers all day.", chip("Recommended", " rec") + chip("Built into Buzz", " yes"), true)}
  ${place("cloud", "Hosted by Block", "Block calls these remote agents. Builderlab, a Block service, runs them on Block's machines. The paid ones are available only in the United States.", chip("Built into Buzz", " yes"))}
  ${place("server", "Your own server, without Buzz", "You give an agent on a small server one prompt, and it sets itself up with Block's Sprig. The agent then answers all day.", chip("Not built into Buzz yet", " no"))}
</div>`;

/* ── How do we keep an agent safe? ── */

const risk = (i: string, t: string, d: string) => `<li><span class="fq-dep-i">${icon(i)}</span><div><b>${t}</b><p>${d}</p></div></li>`;
const RISKS = `<div class="fq-vis"><ul class="fq-check">${[
  risk("lock", "It has no sandbox and no approval prompts", "Buzz starts every local agent this way, and has no setting to change it. The agent can do anything your user account can do on that computer."),
  risk("user", "It takes requests from its owner", "Mentions and direct messages from other people don't start its work. The agent still reads what they post, and their words can steer it. If you make an ownership proof for an agent outside Buzz, that agent can give it requests too."),
  risk("device-desktop", "Give it a machine of its own", `If anyone can join your community, keep personal accounts, private repositories and production credentials off the agent's computer. <a href="#security">The Security section</a> shows this in a drawing.`),
  risk("eye", "What it reads leaves the computer", "The agent sends what it reads to its model's provider. Keep agents out of channels whose content shouldn't reach that computer or that provider."),
  // security.md: Give each audience its own agent (block/buzz-app docs/practical-information-flow-for-buzz-agents.md is a draft)
  risk("users", "Give each audience its own agent", "An agent that reads a private channel can repeat what it read in an open channel or a direct message. It can do that when someone asks it plainly, or when someone tricks it. Buzz doesn't stop that yet. Keep the agent that serves an open channel out of private channels."),
  risk("download", "A plugin is code", `Install only plugins you trust. A plugin runs as code with no sandbox. <a href="https://buzz.xyz/support">Block's support page</a> says a plugin can reach your files and your Buzz private key.`),
].join("")}</ul></div>`;

/* ── How do we run an agent on our own server? ── */

/** What happens, in the order the reader sees it: their chat with the agent, then Buzz, then Buzz again. */
const THREE: [string, string, string][] = [
  ["message-circle", "Paste the prompt to your agent", "Paste it into the chat you already use with your agent. The agent sets itself up on its server. It then replies in that chat with its public key."],
  ["shield", "Approve the key in Buzz", "In Buzz, open Settings, then Security, then Authorize external identity. Paste the key there, and copy the ownership proof that Buzz makes. Then paste the proof back to your agent."],
  ["robot", "Talk to it in Buzz", "The agent sends you a direct message in Buzz. Reply to that message, or mention the agent in a channel."],
];
const OVERVIEW = `<ol class="ga-three">${THREE.map(([i, t, d]) => `<li><span class="ga-three-h">${icon(i)}</span><b>${t}</b><p>${d}</p></li>`).join("")}</ol>`;

/**
 * agents.md's prompt for the agent itself. The community's address comes from the Running on box;
 * until a domain is typed there, or on a local test (a server can't reach it), it's a blank too.
 */
const withOrigin = (prompt: string) =>
  trackOf() === "practice" || !getValues().domain.trim() ? prompt.replace("{{HTTP_ORIGIN}}", "<community address>") : prompt;
/** The prompt as plain text, for its copy button. */
export const remotePrompt = () => fill(fillBlanks(withOrigin(skill.agents.prompt)).replace("<instructions>", "none"), false);
/** Beside the instructions blank: the example from agents.md's "Tell an agent its job", and a way to use it. */
const INFO = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>`;
const TIP = () => `<span class="ga-tip"><button type="button" class="ga-tip-b" aria-label="Example instructions" aria-expanded="false">${INFO}</button><span class="ga-tip-pop" role="note"><b>For example</b>${skill.agents.instruction
  .map((l) => `<span>${esc(l)}</span>`)
  .join("")}<em>Change the names to your own. Don't put passwords or keys in the instructions.</em><button type="button" class="ga-tip-use">Use this example</button></span></span>`;
/** "Use this example": the example goes into every instructions blank, as if typed. */
export function useExampleInstructions(): void {
  document.querySelectorAll<HTMLInputElement>('input[data-blank="instructions"]').forEach((i, n) => {
    i.value = skill.agents.instruction.join(" ");
    if (n === 0) i.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
/** The lines to fill in, then its steps folded: Copy takes all of it. */
const PROMPT = () => {
  const text = withOrigin(skill.agents.prompt);
  const cut = text.indexOf("\n\nNever print");
  const head = text.slice(0, cut);
  const steps = text.slice(cut + 2);
  return `<div class="ag-prompt opx-prompt ga-prompt">
    <p class="ag-prompt-text ga-prompt-head">${fillRich(blanksHTML(esc(head))).replace(/(data-blank="instructions"[\s\S]*?<\/span><\/span>)/, `$1${TIP()}`)}</p>
    <details class="ga-prompt-more"><summary>The steps it follows</summary><pre>${esc(steps)}</pre></details>
    <div class="opx-foot"><button type="button" class="ag-copy" data-prompt="agent-remote">Copy prompt</button></div>
  </div>`;
};

const SYMPTOMS = () => `<div class="ga-fold-wrap"><details class="ga-fold" id="agent-remote-fixes"><summary>If it doesn't work</summary>
  <div class="fq-vis ga-sym">${skill.agents.symptoms.map(([s, f]) => `<div class="ga-sym-row"><b>${icon("alert")}<span>${s}</span></b><p>${f}</p></div>`).join("")}</div>
</details></div>`;

const WARN = `<div class="ga-warn" id="agent-remote-proof">${icon("alert")}<p><b>You can't take back an ownership proof.</b>${linkButton("#agent-remote-proof", "Copy a link to this part")} The proof never expires. It isn't tied to one community. Whoever holds the agent's key and the proof can act as your agent. Your own Buzz agents also take requests from it. Keep the agent's key on the agent's server. Make a proof only for a key you made yourself. To cut the agent off, delete its key on the server. If the key may have leaked, ${go("moderate", "ban it")}.</p></div>`;

export function agentQuestions({ rec, note, ct }: AnswerKit) {
  return [
    {
      id: "agents",
      icon: "robot",
      q: "How should you run agents?",
      a: () =>
        rec("Start by deciding who the agent works for. That tells you where it should run, who can give it requests, and which channels it should join.") +
        WHO() +
        note("<b>Give each audience its own agent.</b> An agent that reads a private channel can repeat what it read anywhere it posts. Buzz doesn't stop that yet.") +
        // block/buzz 0.3.0 crates/buzz-relay/src/handlers/auth.rs: an agent with its owner's proof is admitted ViaOwner, not as a member
        note("<b>Your own agents don't appear in Membership.</b> An agent that gets in through its owner uses the owner's membership. It has no membership of its own. The member list doesn't show it.") +
        // block/buzz-app v1.0.5, src/features/agents/owner-attestation.ts: only the owner's messages start an agent's work
        note(`An agent you make in Buzz answers only you. A helper that other people can ask has to be a program you run yourself, such as ${go("agent-remote", "an agent on your own server")}. Buzz has no built-in helper like that yet. Next, read ${go("agent-brief", "what to tell an agent")} and ${go("agent-model", "which harness and model to pick")}.`),
    },
    {
      id: "agent-brief",
      icon: "message-circle",
      q: "What should you tell an agent?",
      a: () =>
        rec("In the agent's Instructions, write a few plain sentences: what the agent is for, what it should check with you before doing, and how it should report back. You don't need to explain how to behave in a channel, because Buzz already tells every agent that.") +
        ct("agents") +
        INSTRUCTIONS() +
        note("Instructions shape how the agent answers. They don't give it tools, logins or permissions.") +
        note("You can write them when you create the agent. To change them later, open <b>Agents</b>, choose the agent, and open its <b>Identity</b> tab.") +
        note("The model's provider receives the instructions with every request. Keep passwords and keys out of them."),
    },
    {
      id: "agent-model",
      icon: "brain",
      q: "Which harness and model should you pick?",
      a: () =>
        rec("Use the harness your team already has an account for and has approved. Keep Model and Thinking on their defaults until you have a reason to change them.") +
        HARNESS() +
        note("Block doesn't recommend one harness or model over another in its README or its help and support pages.") +
        note("An agent sends what it reads to its model's provider, such as Anthropic for Claude or OpenAI for Codex. Use a provider your team has approved. You can also run a model on your own computer through Goose.") +
        note("Each agent has its own harness, model and Thinking setting."),
    },
    {
      id: "agent-on",
      icon: "bolt",
      q: "How do you keep an agent answering?",
      a: () =>
        rec("An agent only answers while it's running.", [
          ["On a computer", "Keep Buzz open on a computer that stays on and doesn't go to sleep. Buzz runs the agent on that computer."],
          ["On a server", `Follow ${go("agent-remote", "the server setup")}. The agent then runs all day without Buzz open.`],
        ]) +
        PLACES +
        part("agent-on-steps", "Set it up") +
        flow(skill.agents.stayOn) +
        note(`This setup is also safer. It gives the agent ${go("agent-safe", "a machine of its own")}.`) +
        note(`If your server has no desktop, or you want a helper that answers every member, see ${go("agent-remote", "how to run an agent on your own server")}.`),
    },
    {
      id: "agent-safe",
      icon: "shield",
      q: "How do you keep an agent safe?",
      a: () =>
        rec("An agent can do anything the account it runs under can do, like a person signed in as you.", [
          ["Private team", "It's best to give the agent its own machine. If it runs on your computer, give it only the files it needs and keep secrets off it."],
          ["Open community", "Always run it on a separate computer with nothing private on it, and don't connect it to your email, drives or code. Anyone who joins can post messages written to trick it."],
        ]) +
        RISKS +
        note("Builderlab, a Block service, runs hosted agents on Block's machines. Those machines process what the agents read. A hosted agent can't open your files. By default, all of one person's hosted agents share one cloud computer.") +
        // block/buzz-app v1.0.0: docs/agent-protection.md
        note(`Buzz has an <a href="https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/docs/agent-protection.md">experimental protection feature</a> for macOS. It limits who can approve an agent's actions. It doesn't put the agent in a sandbox.`),
    },
    {
      id: "agent-remote",
      icon: "server",
      q: "How do you run an agent on your own server?",
      a: () =>
        `<p class="ga-status">${icon("alert")}Not built into Buzz yet</p>` +
        rec("You give your agent one prompt, and it sets itself up and messages you in Buzz. It keeps running on its own server. You do three things:") +
        OVERVIEW +
        part("agent-remote-prompt", "The prompt for your agent") +
        PROMPT() +
        part("agent-remote-buzz", "Step by step") +
        ct("remote") +
        note(`The agent answers only you. To have it answer your team, ask it to set <code>BUZZ_ACP_RESPOND_TO=allowlist</code> and put your team's public keys in <code>BUZZ_ACP_RESPOND_TO_ALLOWLIST</code>. Before you let the public use it, read ${go("agent-safe", "how to keep an agent safe")}.`) +
        SYMPTOMS() +
        WARN,
    },
  ];
}
