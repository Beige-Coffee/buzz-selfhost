import skill from "virtual:skill-steps";
import type { AgentStep } from "../../build/skill";
import ops from "../assets/avatars/ops.webp";
import { esc, fillRich } from "../lib/values";
import { BUZZ_ROBOT, TABLER } from "./tabler";

/**
 * The Agents answers in Running your relay, after "How should we run agents?" (faq.ts): what to
 * tell an agent, which harness to pick, keeping one answering, keeping it safe, and an agent on your
 * own server. Each leads with the recommendation, then one drawing.
 *
 * The steps, commands, tables and the example instruction come from the skill's agents.md, parsed
 * at build time (build/skill.ts, SkillAgents), so the page and the skill can't say different
 * things. The words around them are the page's own, and rest on the sentences AGENTS_SAYS checks.
 *
 * Sources: block/buzz-app v1.0.0 and block/buzz 0.3.0 (agents.md cites each), and a test on a local
 * Compose relay on 2026-11-12 (docs/remote-agent-test.md): an agent with its owner's proof showed
 * with the robot and "Managed by", one with only an agent flag showed with the robot and no owner,
 * and one with neither showed as a person.
 */

const OWN: Record<string, string> = {
  laptop: `<path d="M5 6a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v9H5z"/><path d="M3 18h18"/>`,
  cloud: `<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10.5 3.75 3.75 0 0 1 17.5 18z"/>`,
  server: `<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>`,
  alert: `<path d="M12 3 22 20H2z"/><path d="M12 10v4M12 17v.01"/>`,
  robot: BUZZ_ROBOT,
};
const icon = (n: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${OWN[n] ?? TABLER[n]}</svg>`;

/** faq.ts's own pieces, so every answer looks alike. */
export interface AnswerKit {
  rec: (t: string) => string;
  note: (t: string) => string;
}
/** A link to another answer in Running your relay. */
const go = (id: string, text: string) => `<a href="#operations" data-q-link="${id}">${text}</a>`;

/** The skill's numbered steps, its commands included, filled in for the setup in the Running on box. */
const flow = (rows: AgentStep[]) =>
  `<ol class="opx-flow ga-flow">${rows
    .map((s, i) => `<li><span class="opx-flow-n">${i + 1}</span><div><p class="opx-flow-t">${s.title}</p><div class="opx-flow-d tl-md">${fillRich(s.html)}</div></div></li>`)
    .join("")}</ol>`;

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
  ${place("cloud", "Hosted by Block", "Block calls these remote agents. They run on Block's machines through Builderlab, paid, in the United States only.", chip("Built into Buzz", " yes") + chip("Not tested here", " no"))}
  ${place("server", "Your own server, without Buzz", "A program you run holds the agent's key and speaks to your relay. Answers all day.", chip("Not built in yet", " no"))}
</div>`;

/* ── How do we keep an agent safe? ── */

const risk = (i: string, t: string, d: string) => `<li><span class="fq-dep-i">${icon(i)}</span><div><b>${t}</b><p>${d}</p></div></li>`;
const RISKS = `<div class="fq-vis"><ul class="fq-check">${[
  risk("lock", "No sandbox, no approval prompts", "Buzz starts every local agent that way, and has no setting for either. The agent can do whatever its person's account can on that computer."),
  risk("user", "It takes requests from its owner", "Other people can't start its work. It still reads what they post, and that text can steer it. An ownership proof you make for an outside agent lets that agent ask too."),
  risk("device-desktop", "A machine of its own", `For a community anyone can join, keep personal accounts, private repositories and production credentials off the agent's computer. <a href="#security">Drawn in Security</a>.`),
  risk("eye", "What it reads leaves the computer", "It goes to the model's provider. Keep agents out of channels whose content shouldn't reach that computer or the provider."),
  risk("download", "Plugins are code", `Install only plugins you trust. A plugin is unsandboxed code, and <a href="https://buzz.xyz/support">Block's support page</a> says one can reach your files and your Buzz private key.`),
].join("")}</ul></div>`;

/* ── How do we run an agent on our own server? ── */

/** One message from Helper, as Buzz draws it: with its owner's proof, an agent; without, a person. */
const helper = (agent: boolean) =>
  `<div class="ga-row">${agent ? `<img class="sq" src="${ops}" alt="">` : `<span class="ga-face">${icon("user")}</span>`}<div><b>${agent ? icon("robot") : ""}Helper<time>10:03 AM</time></b><p>On it.</p></div></div>`;
const MARKED = `<div class="fq-vis ga-mark">
  <div class="ga-mk good"><p class="ga-mk-h"><span class="fq-tag yes">Shows as an agent</span></p>
    ${helper(true)}
    <pre class="ga-ev"><i>its profile, kind 0</i>
"tags": [<mark>["auth", "your public key", "", "your signature"]</mark>]</pre>
    <p class="ga-mk-f">The profile carries your proof. Buzz draws it as your agent, shows Managed by and your name on its profile, and tags it in direct messages, so it wakes.</p></div>
  <div class="ga-mk bad"><p class="ga-mk-h"><span class="fq-tag no">Shows as a person</span></p>
    ${helper(false)}
    <pre class="ga-ev"><i>its profile, kind 0</i>
"tags": <s>[]</s></pre>
    <p class="ga-mk-f">No proof on the profile. Buzz treats it as a person, so a direct message never tags it and it never wakes.</p></div>
</div>`;

const MESSAGES = () => `<details class="ga-fold"><summary>The messages, for a client of your own</summary>
  <div class="ga-fold-b"><table class="ga-msgs"><thead><tr><th>Step</th><th>What to send</th></tr></thead><tbody>${skill.agents.messages
    .map(([s, d]) => `<tr><td>${s}</td><td>${d}</td></tr>`)
    .join("")}</tbody></table>
  <p class="opx-note"><code>PROOF</code> is the tag Buzz copies for you: <code>["auth", "&lt;your public key&gt;", "", "&lt;your signature&gt;"]</code>.</p></div>
</details>`;

const SYMPTOMS = () => `<h4 class="ga-h">Shows as a person, or never answers?</h4>
<div class="fq-vis ga-sym">${skill.agents.symptoms.map(([s, f]) => `<div class="ga-sym-row"><b>${icon("alert")}<span>${s}</span></b><p>${f}</p></div>`).join("")}</div>`;

const WARN = `<div class="ga-warn">${icon("alert")}<p><b>The proof can't be taken back.</b> It never expires, and it isn't tied to one community. Whoever holds the agent's key and the proof can act as your agent, and your own Buzz agents take requests from it. Keep that key on the agent's server, and make a proof only for a key you made. If the key leaks, ${go("moderate", "ban it")}.</p></div>`;

export function agentQuestions({ rec, note }: AnswerKit) {
  return [
    {
      id: "agent-brief",
      icon: "message-circle",
      q: "What should we tell an agent?",
      a: () =>
        rec("Write a few plain sentences in Instructions: what the agent is for, what it must ask you first, and how it reports back. Leave out how to behave in a channel. Buzz already tells every agent that.") +
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
        rec("Give the agent a key of its own and your ownership proof, and publish its profile with that proof. The proof is what makes Buzz show it as your agent and wake it.") +
        note("Buzz has no built-in way to run an agent on your own server yet. Block ships the two pieces it takes: a key authorization in Settings, and the <code>buzz</code> command. We tested these steps on 12 November 2026.") +
        MARKED +
        flow(skill.agents.server) +
        MESSAGES() +
        SYMPTOMS() +
        WARN +
        note("Who the agent answers is up to the program you run. Block's own, <code>buzz-acp</code> in its relay's source, hands mentions to Goose, Codex or Claude. It answers only its owner unless you start it with <code>--respond-to anyone</code> or an allowlist, and without the proof it has no owner, so it answers nobody. We have not tested <code>buzz-acp</code>.") +
        note(`A helper that answers everyone needs no proof. Add its key as a member (${go("add", "How should we add people?")}), and have its own client publish its profile with <code>"is_agent": true</code> in the content. Buzz shows it as an agent with no owner, and nothing it does acts for you. The <code>buzz</code> command has no option for that field.`),
    },
  ];
}
