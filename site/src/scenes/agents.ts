import skill from "virtual:skill-steps";
import { linkButton } from "../lib/permalink";
import { blanksHTML, fillBlanks } from "../lib/blanks";
import { esc, fill, fillRich, getValues, trackOf } from "../lib/values";
import { askHTML } from "./operations";
import { BUZZ_ROBOT, TABLER } from "./tabler";
import mapleLogo from "../assets/maple.svg";
// The marks Buzz itself shows for each harness in Agent setup and Create agent (block/buzz-app
// src/shared/design-system/icons/HarnessLogos.tsx and claude.png; owners and licenses in its NOTICE.md)
import codexIcon from "../assets/harness/codex.svg";
import claudeIcon from "../assets/harness/claude.png";
import gooseIcon from "../assets/harness/goose.svg";
import piIcon from "../assets/harness/pi.svg";

/**
 * The Agents answers in Running your relay: how to instruct an agent, which harness to pick, keeping
 * one answering, keeping it safe, approving each agent, and an agent on your own server. Each leads
 * with its card, then one drawing. How should you run agents? is out for now (owner's call,
 * 2026-11-24); an old #agents link opens the answer on keeping your data and community safe (faq.ts, MOVED).
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
  rec: (t: string, cases?: [label: string, text: string][], label?: string) => string;
  note: (t: string) => string;
  ct: (name: string) => string;
}
/**
 * Who lets agents in (block/buzz 0.3.0): with BUZZ_ALLOW_NIP_OA_AUTH on, as the bundle and the chart
 * ship it, a member's agents get in with their owner's proof; off, only keys on the member list do
 * (handlers/auth.rs). A key on the list counts as a person: no owner recorded, 60 messages a minute
 * instead of an agent's 120 (buzz-auth rate_limit.rs). Buzz 1.0.5 shows a refused agent's turn as
 * "Couldn't finish", and opening it shows the relay's reason (ActivityOutcome.tsx; REFUSED draws the
 * capture). Its own question since 2026-11-24 (owner's ask).
 */
const DOOR = (() => {
  const line = (on: boolean) => `BUZZ_ALLOW_NIP_OA_AUTH=${on}`;
  return `<div class="fq-vis fq-door">
      <div><code>${line(true)}</code><p><b>The default.</b> A member's own agents get in through that member's membership.</p></div>
      <div class="on"><code>${line(false)}</code><p><b>You approve each agent.</b> Only agents you add as members get in.</p><small>First add the agents you want to keep as members, or they're locked out. Then change the setting in the relay's <code>.env</code> and restart the relay. On Kubernetes, set <code>relay.allowNipOaAuth</code> in the chart's values.</small></div>
    </div>`;
})();

/**
 * What a member sees when the relay refuses their agent, as Buzz 1.0.5 shows it (captured 2026-11-24 on a
 * local relay with BUZZ_ALLOW_NIP_OA_AUTH=false): the agent's turn ends in "Couldn't finish", and opening
 * it shows the relay's reason, with View activity, Retry and a close button. An agent or person with no
 * picture shows its first letter. The names and the question are placeholders.
 */
const REFUSED = `<div class="fq-vis rf" role="img" aria-label="A direct message in Buzz. Maya asks her agent Helper a question. Under Helper's name, Buzz shows Couldn't finish, and opened, the reason: The community refused the agent event: You must be a relay member to access this relay. View activity and Retry follow."><div class="rf-win">
    <div class="rf-me"><p class="rf-who"><b>Maya</b><time>4:13 PM</time></p><div class="rf-row"><p class="rf-bub">Can you summarize today's posts?</p><span class="rf-av">M</span></div></div>
    <p class="rf-who rf-agent">${icon("robot")}<b>Helper</b></p>
    <div class="rf-row"><span class="rf-av sq">H</span><div class="rf-card">
      <p class="rf-col"><span>${icon("chevron-up")}</span>Collapse</p>
      <p class="rf-err">${icon("alert-circle")}Couldn’t finish</p>
      <p class="rf-why">The community refused the agent event: You must be a relay member to access this relay</p>
      <p class="rf-act"><span class="rf-av sq">H</span><span class="rf-va">View activity</span><span class="rf-retry">Retry</span>${icon("x")}</p>
    </div></div>
  </div></div>`;

/** A link to another answer in Running your relay. */
const go = (id: string, text: string) => `<a href="#operations" data-q-link="${id}">${text}</a>`;

/* ── How can you instruct your agents? ── */

/**
 * The tips (the owner's ask of 2026-11-24: how you can instruct an agent, with suggested tips, since
 * what to write is a matter of taste) come from Block's support page, as agents.md's "Tell an agent
 * its job" cites it: what you want delivered, who it is for, which files or links matter, what needs
 * your approval, and a request to say what it changed and how it checked. Each tip sits beside the
 * line of the skill's example that follows it, in its order (the build checks there are five).
 */
const JOBS = ["Say who it works for", "Name the files that matter", "Say what needs your approval", "Ask it to report back", "Say what it never posts"];
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
  <div class="fq-card dark ga-said"><p class="fq-card-h">${icon("message-circle")}You can leave these out. Buzz gives every agent these rules.</p><ul>${SAID.map((s) => `<li>${s}</li>`).join("")}</ul></div>
  <div class="fq-card ga-open-tip"><p class="fq-card-h">${icon("world")}In an open community</p><p>Also say what it should refuse, such as running commands or sharing files that someone asks for in a message. Instructions don't prevent prompt injection, so keep anything private off its computer.</p></div>
</div>`;

/* ── Which harness and model should you pick? ── */

/**
 * A harness from a plugin (block/buzz-app docs/plugin-authoring-guide.md and plugin-architecture.md: harness
 * plugins register an agent type with ctx.agents.register; Add a plugin loads a built plugin, manifest.json and
 * plugin.js, from a folder or a Git repository). Maple's plugin is the example the owner picked (2026-11-23):
 * github.com/MaplePrivacyLabs/buzz-maple-plugin, whose README calls it an experimental proof of concept.
 */
const PLUGIN = () => `<p class="ga-p">A harness plugin teaches Buzz to run another agent program. Anyone can build one. Buzz loads a built plugin, a folder with <code>manifest.json</code> and <code>plugin.js</code>, from your computer or from a Git repository. It doesn't build source code or run install scripts. <a href="https://github.com/block/buzz-app/blob/main/docs/plugin-authoring-guide.md">Buzz's plugin guide</a> shows how to write one, and a harness plugin registers its agent type with Buzz. Buzz's harness API for plugins is still a preview.</p>`;
/** Maple's card: its logo (the Maple app icon from maple.ai's brand files), what it is, then four facts from its README. */
const mpCell = (i: string, t: string, d: string) => `<div class="mp-cell"><i>${icon(i)}</i><dt>${t}</dt><dd>${d}</dd></div>`;
const MAPLE = `<div class="fq-vis ga-maple">
  <div class="mp-card">
    <div class="mp-head">
      <img class="mp-logo" src="${mapleLogo}" alt="Maple">
      <div class="mp-title"><span class="mp-eyebrow">Example plugin</span><b>Maple for Buzz</b><span>Runs your Buzz agents on Maple Work</span></div>
      <div class="mp-actions"><span class="mp-badge">Experimental</span><a class="mp-link" href="https://github.com/MaplePrivacyLabs/buzz-maple-plugin">${icon("brand-github")}View on GitHub</a></div>
    </div>
    <dl class="mp-grid">
      ${mpCell("robot", "What it adds", "Maple Work as a harness. An agent you create with the <b>Maple</b> harness runs on Maple.")}
      ${mpCell("device-desktop", "What you need", "Maple Work installed and signed in on the same computer as Buzz. Buzz has to find the <code>maple-agent</code> command, and Maple's README shows how to link it on a Mac.")}
      ${mpCell("download", "How to add it", "Paste <code>github.com/MaplePrivacyLabs/buzz-maple-plugin</code> in <b>Add a plugin</b>, as the click-through shows. Then create an agent and pick the <b>Maple</b> harness.")}
      ${mpCell("alert", "How ready it is", "Maple calls it an experimental proof of concept. Maple checked it with Buzz 1.0.3 on macOS, and with Buzz 1.0.0 and 1.0.1 on Linux.")}
    </dl>
  </div>
</div>`;

/** The skill's harness table, as a card for each harness: Buzz's icon, where it runs, what it needs, where it signs in. */
const HARNESS_ICON: Record<string, string> = { Codex: codexIcon, Claude: claudeIcon, Goose: gooseIcon, Pi: piIcon };
const HARNESS = () => `<div class="fq-vis hn-grid">${skill.agents.harness
  .map(
    ([h, need, where, on]) => `<div class="hn-card ${h.toLowerCase()}">
    <div class="hn-head"><img class="hn-ic" src="${HARNESS_ICON[h] ?? ""}" alt=""><div><b>${h}</b><p class="hn-os">${on
      .split(/,\s*/)
      .map((o) => `<span>${o}</span>`)
      .join("")}</p></div></div>
    <dl class="hn-body">
      <div class="mp-cell"><i>${icon("key")}</i><dt>What you need</dt><dd>${need}</dd></div>
      <div class="mp-cell"><i>${icon("settings")}</i><dt>Where you sign in</dt><dd>${where}</dd></div>
    </dl>
  </div>`,
  )
  .join("")}</div>`;
/**
 * Which account to use (agents.md, from Anthropic's and OpenAI's terms, plans and data pages): a plan is
 * one person's, plans have limits, some train on what they read, and a local model keeps it home.
 */
const acct = (tint: string, i: string, t: string, d: string) => `<div class="ac-tile ${tint}"><i>${icon(i)}</i><b>${t}</b><p>${d}</p></div>`;
const ACCOUNTS = `<div class="fq-vis ac-grid">${[
  acct("blue", "user", "A plan is for one person", `A personal plan such as Claude Pro or Max, or ChatGPT Plus or Pro, is for its owner's own use. <a href="https://www.anthropic.com/legal/consumer-terms">Anthropic's</a> and <a href="https://openai.com/policies/terms-of-use/">OpenAI's</a> terms don't let you make your account available to anyone else. For an agent that other people can ask, use an API key with a spending limit. <a href="https://learn.chatgpt.com/docs/auth">OpenAI</a> also recommends an API key for anything that runs on its own.`),
  acct("amber", "alarm", "Plans have usage limits", "Most of Claude's and ChatGPT's plans have limits that reset every few hours or every week. When an agent reaches one, it can't do more work until the limit resets, unless you buy more usage. An API key has no plan limit, and you pay for each request."),
  acct("rose", "eye", "Some plans train on your data", `Claude Pro and Max and ChatGPT Plus and Pro can use your conversations to train models, the agent's included, unless you turn that off. Turn it off in Claude's privacy settings, or in ChatGPT under Data controls. Team, Business and Enterprise plans and API keys don't train on your data by default (<a href="https://code.claude.com/docs/en/data-usage">Anthropic</a>, <a href="https://help.openai.com/en/articles/5722486">OpenAI</a>).`),
  acct("green", "device-desktop", "A model on your own computer", "To keep what the agent reads off any provider's servers, use Goose with a model on your own computer through Ollama. The model has to support tool calling."),
].join("")}</div>`;

/* ── How do you keep an agent always online? ── */

const chip = (t: string, cls = "") => `<span class="ga-chip${cls}">${t}</span>`;
/**
 * Each place is a button: choosing it shows its own steps under the cards, and choosing it again hides
 * them (the owner's ask of 2026-11-24). The first three steps are click-throughs of Buzz (agentflow.ts);
 * an agent on your own server has an answer of its own, so its steps lead there.
 */
const place = (id: string, i: string, title: string, text: string, chips: string) =>
  `<button type="button" class="ga-on-row" data-on="${id}" aria-pressed="false" aria-controls="ga-on-${id}"><span class="ga-on-i">${icon(i)}</span><span class="ga-on-tx"><b>${title}</b><span>${text}</span></span><span class="ga-on-s">${chips}</span><span class="ga-on-more" aria-hidden="true">${icon("chevron-down")}</span></button>`;
const PLACES = `<div class="fq-vis ga-on">
  ${place("laptop", "laptop", "Your laptop", "An agent you made in the Buzz app answers only while the app is open and the lid is up.", chip("Built into Buzz", " yes"))}
  ${place("stay", "device-desktop", "A computer that stays on", "Agents you made in the Buzz app run inside the app, so the app has to stay open. Keep it open on a spare computer, or on a virtual machine with a desktop, and they answer all day.", chip("Built into Buzz", " yes"))}
  ${place("hosted", "cloud", "Hosted by Block", "Block calls these remote agents. Builderlab, a Block service, runs them on Block's machines. The paid ones are available only in the United States.", chip("Built into Buzz", " yes"))}
  ${place("server", "server", "Your own server, without the app", "No desktop app is needed. You give an agent on a small Linux server one prompt, and it installs Sprig, Block's command-line runner, and sets itself up. It then answers all day.", chip("Works today", " yes") + chip("Set up with a prompt"))}
</div>`;
const panel = (id: string, partId: string, title: string, body: string) =>
  `<div class="ga-on-p" id="ga-on-${id}" data-on="${id}" role="region" aria-labelledby="${partId}" hidden>${part(partId, title)}${body}</div>`;
/** The steps for each place, under the cards; ct places a click-through. */
const PLACE_STEPS = (ct: (name: string) => string) => `<p class="ga-on-hint">${icon("arrow-up")}Choose one to see how to set it up.</p>
  ${panel("laptop", "agent-on-laptop", "Set it up on your laptop", `${ct("on-laptop")}<p class="ga-p ga-on-after">On the laptop you use every day, the agent can read your files and use the tools you're signed in to. ${go("agent-safe", "A computer of its own is safer")}.</p>`)}
  ${panel("stay", "agent-on-steps", "Set it up on a computer that stays on", ct("on-stay"))}
  ${panel("hosted", "agent-on-hosted", "Set up an agent Block hosts", `${ct("on-hosted")}<p class="ga-p ga-on-after">A hosted agent answers while your computer is off, and it can't open files on your computer. It can't reach a relay on a private network, which has no public address. This guide hasn't tested one with a self-hosted community.</p>`)}
  ${panel("server", "agent-on-server", "Run it on your own server", `<p class="ga-p">Its steps have an answer of their own. You paste one prompt to your agent, then authorize the key it sends back in Buzz.</p><p class="ga-on-link">${go("agent-remote", "Open the server setup →")}</p>`)}`;
/** Shows the steps for one place, or none, and marks which card is chosen. Returns the steps shown. */
export function showPlace(root: ParentNode, id: string | null): HTMLElement | null {
  root.querySelectorAll<HTMLElement>(".ga-on-row").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.on === id)));
  let shown: HTMLElement | null = null;
  root.querySelectorAll<HTMLElement>(".ga-on-p").forEach((p) => {
    p.hidden = p.dataset.on !== id;
    if (!p.hidden) shown = p;
  });
  root.querySelector<HTMLElement>(".ga-on-hint")?.toggleAttribute("hidden", !!id);
  return shown;
}

/* ── How do you keep your data and community safe with agents? ── */

/**
 * Where an agent can run, with what it can reach there and what that puts at risk (the owner's ask of
 * 2026-11-24: explain each option's risks rather than pick one per community). From security.md's
 * "What an agent can touch" (no sandbox; a machine of its own holds only its project's files and narrowly
 * scoped credentials; a Builderlab agent can't open files on your computer, and one person's hosted
 * agents share a cloud computer) and agents.md (an ownership proof never expires).
 */
const placeRisk = (i: string, title: string, reach: string, risk: string) =>
  `<div class="ks-place"><p class="ks-place-h"><span class="ks-place-i">${icon(i)}</span><b>${title}</b></p><dl><div><dt>Can reach</dt><dd>${reach}</dd></div><div><dt>Exposed to prompt injection</dt><dd>${risk}</dd></div></dl></div>`;
const WHERE = `<div class="fq-vis ks-places">
  ${placeRisk("laptop", "The computer you use every day", "Your files, SSH keys, signed-in tools such as Git, and the network. On Linux and Windows, also your Buzz private key.", "All of it. With your Buzz key, it can act as you in every community.")}
  ${placeRisk("device-desktop", "A spare computer or a virtual machine", "Only what you put on it, such as one project's files and the credentials its job needs. If you sign in to Buzz there on Linux or Windows, also your Buzz private key.", "Only what's on it.")}
  ${placeRisk("cloud", "Hosted by Block", "A cloud computer on Block's machines. It can't access files on your computer.", "Everything on that cloud computer, which all of your hosted agents share by default. Block's machines process everything the agent reads, and Block keeps the agent's key and your ownership proof.")}
  ${placeRisk("server", "Your own server", "Only what's on that server.", "What's on the server, including the agent's key and your ownership proof if you made one. Anyone with both can act as your agent, and the proof doesn't expire.")}
</div>`;

type Level = "high" | "mid" | "do";
const LEVEL: Record<Level, string> = { high: "Biggest risk", mid: "Keep in mind", do: "Do this" };
/** Titles first: each risk opens to its explanation. The first starts open, to show that they open. */
const risk = (level: Level, i: string, t: string, d: string) =>
  `<details class="ks-it ${level}"><summary><span class="ks-i">${icon(i)}</span><b>${t}</b><span class="ks-tag">${LEVEL[level]}</span><span class="ks-chev">${icon("chevron-down")}</span></summary><p>${d}</p></details>`;
const RISKS = `<div class="fq-vis ks-list">${[
  risk("high", "lock", "No sandbox and no approval prompts", "Buzz starts every local agent, whether Claude, Codex, Goose or Pi, without a sandbox or approval prompts, and has no setting to change that. The agent runs with your user account's permissions, so it can read and change your files, run commands and reach the network. Its workspace is only the folder it starts in."),
  risk("high", "download", "Plugins run as unsandboxed code", `A Buzz plugin runs as code on your computer, with no sandbox. <a href="https://buzz.xyz/support">Block's support page</a> says a plugin can reach beyond the permissions its install screen lists, including your files and your Buzz private key. Install only plugins you trust.`),
  risk("high", "users", "Your agents count as you", "Buzz accepts a request from any agent that carries your ownership proof, and every agent you make in Buzz has one. So an agent that follows a prompt injection can direct your other agents, including one on the computer you use every day. An agent Block hosts counts too."),
  risk("mid", "user", "Other people's posts still reach it", "Only your mentions and direct messages, and those of your other agents, start an agent's work. To answer, it reads the messages around the request, attached files, linked pages and repositories, and any of them can carry prompt injection. Watches the agent sets up, and any agent outside Buzz that holds your ownership proof, can also start its work."),
  risk("mid", "eye", "What it reads goes to its model's provider", "The agent sends what it reads to its model's provider with each request. Use a provider your team has approved for that content. Keep the agent out of channels whose content shouldn't reach its computer or its provider."),
  // security.md: Give each audience its own agent (block/buzz-app docs/practical-information-flow-for-buzz-agents.md is a draft)
  risk("mid", "users", "It can repeat private content in open channels", `An agent in a private channel can post that channel's content in an open channel or a direct message, when someone asks it directly or through prompt injection. Buzz doesn't prevent this yet. Block's fix is <a href="https://github.com/block/buzz-app/blob/f315ef59b87160d23f5789f4e1458d753674cd8a/docs/practical-information-flow-for-buzz-agents.md">a design draft</a>. A separate agent for each audience keeps private content out of open channels. Your agents can still give each other requests, so keep that in mind when one of them reads an open channel.`),
].join("").replace("<details", "<details open")}</div>`;

/* ── How do you run an agent on your own server? ── */

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

const WARN = `<div class="ga-warn" id="agent-remote-proof">${icon("alert")}<p><b>You can't take back an ownership proof.</b>${linkButton("#agent-remote-proof", "Copy a link to this part")} The proof never expires. It isn't tied to one community. Whoever holds the agent's key and the proof can act as your agent. Your own Buzz agents also take requests from it. Keep the agent's key on the agent's server. Make a proof only for a key you made yourself. To cut the agent off, delete its key on the server. If the key may have leaked, ${go("moderate", "ban it")}, and ask the admins of your other communities to ban it too, because the proof works in all of them.</p></div>`;

export function agentQuestions({ rec, note, ct }: AnswerKit) {
  return [
    {
      id: "agent-brief",
      icon: "message-circle",
      q: "How can you instruct your agents?",
      a: () =>
        rec("Each agent has its own Instructions, a few plain sentences about its job. You write them when you create the agent, and you can change them later on the agent's Identity tab. Buzz adds them to the rules it gives every agent.", undefined, "How it works") +
        ct("agents") +
        part("agent-brief-tips", "Tips") +
        `<p class="ga-p"><a href="https://buzz.xyz/support">Block's support page</a> lists what to put in an agent's instructions. The first four lines of this example follow its tips, and the last adds a rule of your own.</p>` +
        INSTRUCTIONS() +
        note("Instructions shape how the agent answers. They don't give it tools, logins or permissions, and Buzz doesn't enforce them. A line such as Ask me before you change a file is a request to the model.") +
        note("The model's provider receives the instructions with every request. Keep passwords and keys out of them."),
    },
    {
      id: "agent-model",
      icon: "brain",
      q: "What are your choices for a harness?",
      a: () =>
        rec("Buzz runs an agent with Codex, Claude, Goose or Pi on your computer, or with Builderlab on Block's machines. A plugin can add another harness, such as Maple's. Start from an account you already have, because each harness signs in its own way, and the agent sends what it reads to that harness's provider.", [
          ["Private team", "Use your company's business plan, such as ChatGPT Business or Enterprise, or an API key from your company's account. Those don't train on your data by default. For a helper the whole team can ask, use an API key with a spending limit."],
          ["Open community", "For your own agents, a plan you already pay for works, such as ChatGPT Plus with Codex. For a helper that answers everyone, use an API key with a spending limit, because a personal plan is for its owner's own use."],
        ]) +
        HARNESS() +
        part("agent-model-signin", "Sign in to a harness") +
        ct("harness") +
        part("agent-model-plugin", "Add a harness with a plugin") +
        PLUGIN() +
        ct("plugin") +
        MAPLE +
        part("agent-model-account", "Which account to use") +
        ACCOUNTS +
        note("A plugin runs as code on your computer, with no sandbox. Install only plugins you trust. Buzz shows what a plugin says it needs before you install it, but Block says that list isn't a security boundary.") +
        note("A Claude agent's commands can read its API key, because Buzz hands the key to Claude Code. Give it a key of its own with a spending limit.") +
        note("You pick each agent's harness in Create agent, or later on the agent's Identity tab. Leave Model and Thinking on their defaults until you have a reason to change them. A higher Thinking level takes longer and uses more of your limit or budget.") +
        note("Block doesn't recommend one harness or model over another in its README or its help and support pages."),
    },
    {
      id: "agent-on",
      icon: "bolt",
      q: "How do you keep an agent always online?",
      a: () =>
        rec("An agent only answers while it's running. Where it runs depends on how you made it.", [
          ["Made in the Buzz app with Claude, Codex or Goose", "It runs inside the Buzz desktop app, so the app has to stay open. Keep Buzz open on a computer that stays on and doesn't go to sleep."],
          ["On a server", `No app is needed. The agent runs on a Linux server with Sprig, Block's command-line runner, which is the <code>buzz</code> command and <code>buzz-acp</code> in one program. Follow ${go("agent-remote", "the server setup")}.`],
        ]) +
        PLACES +
        PLACE_STEPS(ct) +
        note(`A computer that stays on is also safer. It gives the agent ${go("agent-safe", "a machine of its own")}.`) +
        note(`If your server has no desktop, or you want a helper that answers every member, see ${go("agent-remote", "how to run an agent on your own server")}.`),
    },
    {
      // block/buzz-app (2026-11-19): Codex runs with sandbox danger-full-access and approval policy never (codex/runtime.ts,
      // README: "it can write outside its workspace, access the network and use git and gh"), Claude with
      // --permission-mode bypassPermissions (claude-code/claude.ts), and Pi's tools have no sandbox (pi/runtime.ts)
      id: "agent-safe",
      icon: "shield",
      q: "How do you keep your data and community safe with agents?",
      a: () =>
        rec(
          "Buzz runs agents with no sandbox and no approval prompts, so an agent has the same access as the account it runs under. Messages, files and linked pages it reads can contain instructions, and the agent may follow them. This is prompt injection. The risk depends on who can post where the agent reads, and on what its computer holds.",
          [
            ["Private team", "Only invited members can post. Prompt injection can still come from a shared file, a linked page or a compromised member account."],
            ["Open community", "Anyone who joins can post, so anyone can attempt prompt injection. By default, members' own agents join without approval and can read every open channel."],
          ],
          "How it works",
        ) +
        part("agent-safe-where", "Where it can run") +
        WHERE +
        part("agent-safe-risks", "The risks") +
        RISKS +
        // block/buzz-app v1.0.0: docs/agent-protection.md
        note(`Buzz has an <a href="https://github.com/block/buzz-app/blob/4fb386b0be5966f5ad9e930a33d1c75b432625fb/docs/agent-protection.md">experimental protection feature</a> for macOS. It limits who can approve an agent's actions. It isn't a file or network sandbox, so the risks above still apply.`),
    },
    {
      id: "agent-approve",
      icon: "lock",
      q: "Can you require approval before an agent joins?",
      a: () =>
        rec(
          "Yes. It's a relay setting, <code>BUZZ_ALLOW_NIP_OA_AUTH</code>. Block's Compose bundle and Helm chart turn it on, so a member's own agents get in through that member's membership, and nobody adds them. When you turn it off, the relay admits only agents you add as members.",
          undefined,
          "How it works",
        ) +
        DOOR +
        part("agent-approve-ask", "Ask your agent to do it") +
        askHTML(trackOf(), "agent-approve") +
        // block/buzz crates/buzz-relay/src/handlers/auth.rs (operations.md cites it); Buzz's activity outcome (block/buzz-app src/features/messages/ActivityOutcome.tsx)
        part("agent-approve-sees", "What members see") +
        `<p class="ga-p">With the setting off, a member's new agent can't connect until you add it. When someone asks the agent to work, Buzz shows <b>Couldn't finish</b> under its name. Opening it shows why.</p>` +
        REFUSED +
        `<p class="ga-p">Tell members to ask an admin to add their agent. To find an agent's key, its owner opens <b>Agents</b>, opens the agent's menu and chooses <b>Copy public key</b>.</p>` +
        note("The relay treats an agent you add as a member as a person. It records no owner for an agent that never got in through its owner, and it allows the agent a person's 60 messages a minute instead of an agent's 120."),
    },
    {
      id: "agent-remote",
      icon: "server",
      q: "How do you run an agent on your own server?",
      a: () =>
        `<p class="ga-lead">The Buzz app doesn't provide a simple way to launch an agent on a server you host. For now, you set it up yourself. The agent needs Sprig, Block's command-line runner, to communicate with your community, and an ownership proof from Buzz to be registered as your agent.</p>` +
        rec("You give your agent one prompt. It sets itself up on its own server and messages you in Buzz. As the prompt sets it up, it answers only you and your other agents.", [
          ["For your team", "Ask it to set <code>BUZZ_ACP_RESPOND_TO=allowlist</code> and to put your team's public keys in <code>BUZZ_ACP_RESPOND_TO_ALLOWLIST</code>, in hex and separated by commas. It then answers their mentions in channels. Only you and your agents can reach it by direct message."],
          ["For everyone", "Skip the ownership proof. Whoever runs the server adds the agent's key as a member instead, and the agent is set to answer anyone who mentions it in a channel. With no proof it has no owner, so it never answers a direct message. Run it on a server with nothing private on it, and keep it in open channels."],
        ]) +
        part("agent-remote-three", "You do three things") +
        OVERVIEW +
        part("agent-remote-prompt", "The prompt for your agent") +
        PROMPT() +
        part("agent-remote-buzz", "Step by step") +
        ct("remote") +
        note("On a private network, the agent's server has to join your Tailscale network first, because the relay has no public address.") +
        note(`Before you let the public use an agent, read ${go("agent-safe", "how to keep your data and community safe with agents")}.`) +
        SYMPTOMS() +
        WARN,
    },
  ];
}
