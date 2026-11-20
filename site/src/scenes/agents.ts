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
  rec: (t: string) => string;
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
const WHO_ROWS = ["Runs on", "Who can ask", "Gets in", "Belongs in"];
const who = (i: string, title: string, cells: string[], link: string, cls = "") =>
  `<div class="ga-who-c${cls}"><p class="ga-who-h"><i>${icon(i)}</i>${title}</p><dl>${cells
    .map((c, n) => `<div><dt>${WHO_ROWS[n]}</dt><dd>${c}</dd></div>`)
    .join("")}</dl>${link}</div>`;
const WHO = () => `<div class="fq-vis ga-who">
  ${who("user", "For you", ["A computer that stays on, with Buzz open", "Only you", "Through your membership", "The channels you add it to"], go("agent-on", "Keep it answering →"))}
  ${who("users", "For your team", ["A server of its own", "The people you list", "Through your ownership proof", "Your team's channels"], go("agent-remote", "Run one on your server →"))}
  ${who("world", "For the public", ["A machine with nothing private on it", "Anyone who mentions it", "Added as a member, on the server", "Open channels only"], go("agent-safe", "Keep it safe →"), " open")}
</div>`;

/* ── What should we tell an agent? ── */

/** What each line of the skill's example is for, in its order (the build checks there are five). */
const JOBS = ["Who it is for", "What it works from", "What needs your yes", "How it reports", "What stays out"];
/** Buzz's own rules for every agent (agents.md, from base_prompt.md). */
const SAID = ["Act only when mentioned or messaged directly", "Reply in the thread", "Keep channel messages brief", "Stay quiet with nothing to add"];
const INSTRUCTIONS = () => `<div class="fq-vis ga-ins-vis">
  <div class="ga-ins"><p class="ga-ins-h">Instructions <em>Optional</em></p>
    <div class="ga-ins-box">${skill.agents.instruction.map((line, i) => `<p class="ga-ins-l"><span class="ga-ins-t">${esc(line)}</span><span class="ga-ins-j">${JOBS[i]}</span></p>`).join("")}</div>
  </div>
  <div class="fq-card dark ga-said"><p class="fq-card-h">${icon("message-circle")}Buzz already tells every agent</p><ul>${SAID.map((s) => `<li>${s}</li>`).join("")}</ul></div>
</div>`;

/* ── Which harness and model should we pick? ── */

const HARNESS = () => `<div class="fq-vis"><table class="fq-roles ga-har">
  <thead><tr><th>Harness</th><th>You need</th><th>Runs on</th></tr></thead>
  <tbody>${skill.agents.harness.map(([h, need, on]) => `<tr><td>${h}</td><td>${need}</td><td>${on}</td></tr>`).join("")}</tbody></table></div>`;

/* ── How do we keep an agent answering? ── */

const chip = (t: string, cls = "") => `<span class="ga-chip${cls}">${t}</span>`;
const place = (i: string, title: string, text: string, chips: string, pick = false) =>
  `<div class="ga-on-row${pick ? " pick" : ""}"><span class="ga-on-i">${icon(i)}</span><div><b>${title}</b><p>${text}</p></div><div class="ga-on-s">${chips}</div></div>`;
const PLACES = `<div class="fq-vis ga-on">
  ${place("laptop", "Your laptop", "Answers while Buzz is open and the lid is up.", chip("Built into Buzz", " yes"))}
  ${place("device-desktop", "A computer that stays on", "Buzz open on a spare computer, or a virtual machine with a desktop. Answers all day.", chip("Recommended", " rec") + chip("Built into Buzz", " yes"), true)}
  ${place("cloud", "Hosted by Block", "Block calls these remote agents. They run on Block's machines through Builderlab, paid, in the United States only.", chip("Built into Buzz", " yes"))}
  ${place("server", "Your own server, without Buzz", "Block's Sprig on a small server, set up by one prompt to your coding agent. Answers all day.", chip("Not built in yet", " no"))}
</div>`;

/* ── How do we keep an agent safe? ── */

const risk = (i: string, t: string, d: string) => `<li><span class="fq-dep-i">${icon(i)}</span><div><b>${t}</b><p>${d}</p></div></li>`;
const RISKS = `<div class="fq-vis"><ul class="fq-check">${[
  risk("lock", "No sandbox, no approval prompts", "Buzz starts every local agent that way, and has no setting for either. The agent can do whatever its person's account can on that computer."),
  risk("user", "It takes requests from its owner", "Other people can't start its work. It still reads what they post, and that text can steer it. An ownership proof you make for an outside agent lets that agent ask too."),
  risk("device-desktop", "A machine of its own", `For a community anyone can join, keep personal accounts, private repositories and production credentials off the agent's computer. <a href="#security">Drawn in Security</a>.`),
  risk("eye", "What it reads leaves the computer", "It goes to the model's provider. Keep agents out of channels whose content shouldn't reach that computer or the provider."),
  // security.md: Give each audience its own agent (block/buzz-app docs/practical-information-flow-for-buzz-agents.md is a draft)
  risk("users", "One agent per audience", "An agent that reads a private channel can repeat it in an open channel or a direct message, asked plainly or tricked. Buzz doesn't stop that yet. Keep the agent that serves an open channel out of private ones."),
  risk("download", "Plugins are code", `Install only plugins you trust. A plugin is unsandboxed code, and <a href="https://buzz.xyz/support">Block's support page</a> says one can reach your files and your Buzz private key.`),
].join("")}</ul></div>`;

/* ── How do we run an agent on our own server? ── */

/** What happens, in the order the reader sees it: their chat with the agent, then Buzz, then Buzz again. */
const THREE: [string, string, string][] = [
  ["message-circle", "Paste the prompt to your agent", "In the chat you already use with it. It sets itself up on its server and replies there with a key."],
  ["shield", "Approve the key in Buzz", "Settings, Security, Authorize external identity. Paste the key, copy the proof, and paste the proof back to your agent."],
  ["robot", "Talk to it in Buzz", "It sends you a direct message in Buzz. Reply there, or mention it in a channel."],
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
/** The lines to fill in, then its steps folded: Copy takes all of it. */
const PROMPT = () => {
  const text = withOrigin(skill.agents.prompt);
  const cut = text.indexOf("\n\nNever print");
  const head = text.slice(0, cut);
  const steps = text.slice(cut + 2);
  return `<div class="ag-prompt opx-prompt ga-prompt">
    <p class="ag-prompt-text ga-prompt-head">${fillRich(blanksHTML(esc(head)))}</p>
    <details class="ga-prompt-more"><summary>The steps it follows</summary><pre>${esc(steps)}</pre></details>
    <div class="opx-foot"><button type="button" class="ag-copy" data-prompt="agent-remote">Copy prompt</button></div>
  </div>`;
};

const SYMPTOMS = () => `<div class="ga-fold-wrap"><details class="ga-fold" id="agent-remote-fixes"><summary>If it doesn't work</summary>
  <div class="fq-vis ga-sym">${skill.agents.symptoms.map(([s, f]) => `<div class="ga-sym-row"><b>${icon("alert")}<span>${s}</span></b><p>${f}</p></div>`).join("")}</div>
</details></div>`;

const WARN = `<div class="ga-warn" id="agent-remote-proof">${icon("alert")}<p><b>The proof can't be taken back.</b>${linkButton("#agent-remote-proof", "Copy a link to this part")} It never expires, and it isn't tied to one community. Whoever holds the agent's key and the proof can act as your agent, and your own Buzz agents take requests from it. Keep that key on the agent's server, and make a proof only for a key you made. To cut the agent off, delete its key. If the key may have leaked, ${go("moderate", "ban it")}.</p></div>`;

export function agentQuestions({ rec, note, ct }: AnswerKit) {
  return [
    {
      id: "agents",
      icon: "robot",
      q: "How should we run agents?",
      a: () =>
        rec("Decide who the agent works for first. That settles where it runs, who can ask it for things, and which channels it belongs in.") +
        WHO() +
        note("<b>One agent per audience.</b> An agent that reads a private channel can repeat it anywhere it posts, and Buzz doesn't stop that yet.") +
        // block/buzz-app v1.0.5, src/features/agents/owner-attestation.ts: only the owner's messages start an agent's work
        note(`An agent made in Buzz answers only its owner. A helper others can ask is a program you run: Buzz has no built-in one yet. Then: ${go("agent-brief", "what to tell it")} and ${go("agent-model", "which harness and model")}.`),
    },
    {
      id: "agent-brief",
      icon: "message-circle",
      q: "What should we tell an agent?",
      a: () =>
        rec("Write a few plain sentences in Instructions: what the agent is for, what it must ask you first, and how it reports back. Leave out how to behave in a channel. Buzz already tells every agent that.") +
        ct("agents") +
        INSTRUCTIONS() +
        note("Instructions shape how the agent answers. They don't give it tools, logins or permissions.") +
        note("Write them when you create the agent, or later: <b>Agents</b>, the agent, then its <b>Identity</b> tab.") +
        note("The model's provider receives the instructions with each request. Keep passwords and keys out of them."),
    },
    {
      id: "agent-model",
      icon: "brain",
      q: "Which harness and model should we pick?",
      a: () =>
        rec("Pick the harness your team already has an account for and has approved. Leave Model and Thinking on their defaults until you have a reason to change them.") +
        HARNESS() +
        note("Block's README, help and support pages don't recommend one harness or model over another.") +
        note("An agent sends what it reads to its model's provider, such as Anthropic for Claude or OpenAI for Codex. Use one your team has approved, or a model on your own computer through Goose.") +
        note("Each agent keeps its own harness, model and thinking."),
    },
    {
      id: "agent-on",
      icon: "bolt",
      q: "How do we keep an agent answering?",
      a: () =>
        rec("Run the agent on a computer that stays on, with Buzz open there. An agent answers only while Buzz is open on its computer and that computer is awake.") +
        PLACES +
        part("agent-on-steps", "Set it up") +
        flow(skill.agents.stayOn) +
        note(`This is also the safer place for an agent: ${go("agent-safe", "a machine of its own")}.`) +
        note(`For a server with no desktop, or a helper that answers every member, see ${go("agent-remote", "an agent on your own server")}.`),
    },
    {
      id: "agent-safe",
      icon: "shield",
      q: "How do we keep an agent safe?",
      a: () =>
        rec("Treat an agent like a person at that computer, signed in as you. Give it a machine of its own, only the files it needs, and no secrets.") +
        RISKS +
        note("Agents hosted by Builderlab, Block's service, run on Block's machines, where what they read is processed. They can't open your files, and by default one person's hosted agents share a cloud computer.") +
        // block/buzz-app v1.0.0: docs/agent-protection.md
        note(`Buzz's <a href="https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/docs/agent-protection.md">experimental protection feature</a> for macOS limits who can approve an agent's actions. It is not a sandbox.`),
    },
    {
      id: "agent-remote",
      icon: "server",
      q: "How do we run an agent on our own server?",
      a: () =>
        `<p class="ga-status">${icon("alert")}Not built into Buzz yet</p>` +
        rec("Your agent sets itself up from one prompt, then talks to you in Buzz. It keeps running on its own server, and you do three things:") +
        OVERVIEW +
        part("agent-remote-prompt", "The prompt") +
        PROMPT() +
        part("agent-remote-buzz", "Step by step") +
        ct("remote") +
        note(`It answers only you. For a team, ask it to set <code>BUZZ_ACP_RESPOND_TO=allowlist</code> with their public keys. For the public, read ${go("agent-safe", "keep it safe")} first.`) +
        SYMPTOMS() +
        WARN,
    },
  ];
}
