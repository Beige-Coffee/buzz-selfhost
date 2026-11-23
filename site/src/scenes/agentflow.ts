import maya from "../assets/avatars/maya.svg";
import ops from "../assets/avatars/ops.webp";
import { app, communityNav, settingsModal, ti, type Flow } from "./members";

/**
 * Starting an agent in Buzz 1.0, as a click-through of its own screens, in light mode. Drawn from
 * block/buzz-app as released in v1.0.0: the window with Agents open in its dock (#2626,
 * members.ts), the Agents page and its New agent menu (src/bundled/agents/AgentsPage.tsx), and Create
 * agent (src/bundled/agents/AgentCreateDialog.tsx with the Claude harness's model, thinking and
 * instructions; its first-agent tile and the existing-agent toolbar menu).
 * The agent's picture is one of Buzz's own avatar packs; names and messages are illustrative.
 */

/** Agents: Your agents, Your teams and Marketplace, with New agent and its menu. */
const agentsPage = (menu: boolean) =>
  app(
    "agents",
    `<div class="ax-page">
    <p class="ax-h">${ti("robot")}Agents</p>
    <div class="ax-tabs"><b>Your agents</b><span>Your teams</span><span>Marketplace</span>${menu ? `<em>New agent${ti("chevron-down")}</em>` : ""}</div>
    <div class="ax-empty"><span class="ax-tile ax-start hot">${ti("plus")}<b>Create your first agent</b></span><span class="ax-tile ax-start">${ti("robot")}<b>Explore the marketplace</b></span></div>
    ${menu ? `<div class="ax-menu"><p class="hot">${ti("plus")}Create a new agent</p><p>${ti("download")}Import an agent</p></div>` : ""}
  </div>`,
  );

/** Create agent: its picture and name, the harness, model and thinking, optional instructions. */
const create = `<div class="mb-shade"></div>
<div class="mb-dlg ax-dlg">
  <div class="mb-dlg-h"><b>Create agent</b><span class="mb-x">${ti("x")}</span></div>
  <div class="ax-hero"><img src="${ops}" alt=""><b>Ops</b></div>
  <div class="ax-rows">
    <p>Harness<span class="ax-pick">Claude${ti("chevron-down")}</span></p>
    <p>Model<span class="ax-pick">Sonnet 5.5 · Default${ti("chevron-down")}</span></p>
    <p>Thinking<span class="ax-pick">Automatic · Default${ti("chevron-down")}</span></p>
  </div>
  <p class="ax-lab">Instructions <em>Optional</em></p>
  <p class="ax-text">Check each release's notes before it ships.</p>
  <div class="ax-go"><span class="mb-btn dark hot">Create agent</span></div>
</div>`;

/** The agent at work in a channel: mentioned by its owner, it answers as itself. */
const channel = app(
  "messages",
  `<div class="ax-chan">
    <p class="ax-chan-h"><span class="mb-stack"><img src="${maya}" alt=""></span>release</p>
    <div class="ax-msg"><img src="${maya}" alt=""><div><b>Maya <time>10:02</time></b><p><span class="ax-at">@Ops</span> can you check the release notes?</p></div></div>
    <div class="ax-msg"><img class="sq" src="${ops}" alt=""><div><b>Ops <i>Agent</i> <time>10:03</time></b><p>Checked. Two links were broken; both are fixed in the draft.</p></div></div>
    <p class="ax-comp">Message #release</p>
  </div>`,
);

export const agentFlows: Flow[] = [
  {
    id: "agents",
    label: "Start an agent",
    steps: [
      { k: "Open Agents", t: "Choose <b>Agents</b>, the robot in the dock. Then choose <b>Create your first agent</b>. If you already have agents, choose <b>New agent</b> and then <b>Create a new agent</b>.", frame: agentsPage(false) },
      { k: "Pick its harness and model", t: "Give the agent a name. Pick a harness, such as Claude, Codex or Goose, and pick a model. Then choose <b>Create agent</b>. The agent gets its own key, and Buzz marks it as yours with an ownership proof.", frame: create },
      { k: "Use it in a channel", t: "Mention the agent in the channel where you need it. The relay lets the agent in through your membership. Nobody has to add it as a member.", frame: channel },
    ],
  },
];

/* ── An agent on your own server: the owner's side ── */

/**
 * Running an agent on your own server, as tested on 2026-11-19 (agents.md, "Run an agent on your own
 * server"): your agent shows its new key, you authorize it in Settings, Security (block/buzz-app
 * src/app/ExternalIdentityAuthorization.tsx at 5a21469, its labels and confirmation as Buzz 1.0.5 shows
 * them), then answer the direct message the agent opens. Buzz 1.0.5 won't start a new message to an
 * agent it doesn't run (NewMessage.tsx), so the agent writes first. The key is shortened, never real.
 */
const AGENT_HEX = "557ddc54…9ce1";
/**
 * The reader's own chat with their agent, as a chat window that fills the frame (the owner's pick of
 * 2026-11-20 over a terminal): the prompt pasted, then its key, then the proof pasted back.
 */
type ChatStage = "prompt" | "key" | "proof";
const bubble = (who: "you" | "agent", text: string, on = false) =>
  `<div class="rs-b ${who}${on ? " on" : ""}"><span>${who === "you" ? "You" : "Your agent"}</span><p>${text}</p></div>`;
const chat = (stage: ChatStage) => `<div class="rs-bub">
  <p class="rs-bub-h"><i></i><i></i><i></i><span>Your chat with your agent</span></p>
  <div class="rs-bub-b">${
    stage === "prompt"
      ? bubble("you", "Connect yourself to my Buzz community, so I can talk to you there. Keep running on this machine. …", true) + bubble("agent", "On it. Installing Sprig.")
      : bubble("agent", `Sprig installed, my key made. My public key: <b>${AGENT_HEX}</b>. Stopped: paste the ownership proof.`) +
        (stage === "proof" ? bubble("you", `<code>["auth","d3a8…71f0","","9c1e…44b2"]</code>`, true) + bubble("agent", "Proof saved. Running, and I messaged you in Buzz.") : "")
  }<p class="rs-bub-in">Message your agent${stage === "key" ? "<i>|</i>" : ""}</p></div>
</div>`;
/** Settings, Security: Authorize external identity, with the key pasted, or with the proof it made. */
const security = (proof: boolean) => `<section class="mb-page rs-page">
  <h5>Security</h5>
  ${proof ? "" : `<p class="mb-sub">Tools paired on this device, and applications you authorize to act as you.</p>`}
  <p class="rs-h">Authorize external identity</p>
  ${proof ? "" : `<p class="mb-sub">For an application that keeps its own agent key. Only authorize a public key you recognize.</p>`}
  <p class="rs-lab">Application public key (hex)</p>
  <span class="j1-input"><span class="mono">${AGENT_HEX}</span></span>
  <span class="mb-btn dark${proof ? "" : " hot"}">Authorize identity</span>
  ${proof ? `<p class="rs-lab">Ownership proof</p><span class="rs-proof">["auth","d3a8…71f0","","9c1e…44b2"]</span><span class="mb-btn hot">Copy ownership proof</span>` : ""}
</section>`;
const securityNav = communityNav("Security", false);
/** The confirmation, in Buzz's words: what the key can do, and its npub. */
const authorize = `<div class="mb-shade on-modal"></div>
<div class="mb-dlg small">
  <b class="mb-alert-t">Authorize this identity?</b>
  <p class="mb-sub">The holder of this key can act as your agent, including directing your Buzz coding agents to run commands as you. This permission has no time or event-kind limits.</p>
  <p class="rs-lab">Application identity (npub)</p>
  <span class="rs-proof">npub124mac4…y7rk</span>
  <div class="mb-alert-b"><span class="mb-btn">Cancel</span><span class="mb-btn dark hot">Authorize this key</span></div>
</div>`;
/** Messages with the agent's direct message open: it wrote first, you answer, it replies. */
const dmSide = `<div class="mb-side">
  <p class="mb-srow">${ti("bell")}Activity</p>
  <p class="mb-seg"><i><b>All</b><b>Solo</b><b class="on">Team</b></i><span>${ti("plus")}</span></p>
  <p class="mb-side-g">Channels</p>
  <p class="mb-srow">${ti("hash")}general</p>
  <p class="mb-srow">${ti("hash")}release</p>
  <p class="mb-side-g">Direct messages</p>
  <p class="mb-srow on">${ti("robot")}Helper</p>
</div>`;
const dm = app(
  "messages",
  `<div class="ax-chan">
    <p class="ax-chan-h">${ti("robot")}Helper</p>
    <div class="ax-msg"><img class="sq" src="${ops}" alt=""><div><b>Helper <i>Agent</i> <time>3:00</time></b><p>Helper is online.</p></div></div>
    <div class="ax-msg"><img src="${maya}" alt=""><div><b>Maya <time>3:01</time></b><p>What's the server's hostname?</p></div></div>
    <div class="ax-msg"><img class="sq" src="${ops}" alt=""><div><b>Helper <i>Agent</i> <time>3:01</time></b><p>It's remote-agent-1, with 1 GB of memory.</p></div></div>
    <p class="ax-comp hot">Message Helper</p>
  </div>`,
  "",
  dmSide,
);

export const remoteFlows: Flow[] = [
  {
    id: "remote",
    label: "Your part",
    steps: [
      { k: "Paste the prompt to your agent", t: "Fill in the blanks in the prompt above and choose <b>Copy prompt</b>. Then paste the prompt into the chat you use with your agent.", frame: chat("prompt") },
      { k: "Copy its key", t: "Your agent sets itself up on its server. It then replies in your chat with its public key. Copy that key.", frame: chat("key") },
      { k: "Paste the key in Security", t: "In Buzz, open <b>Settings</b> and choose <b>Security</b> under <b>Buzz</b>. Under <b>Authorize external identity</b>, paste the key and choose <b>Authorize identity</b>.", frame: settingsModal(securityNav, security(false)) },
      { k: "Authorize this key", t: "Buzz shows the key's npub and asks you to confirm. Check the npub, then choose <b>Authorize this key</b>. The proof never expires. Do this only for a key you made.", frame: settingsModal(securityNav, security(false), authorize) },
      { k: "Copy the proof", t: "Buzz shows the ownership proof. Choose <b>Copy ownership proof</b>.", frame: settingsModal(securityNav, security(true)) },
      { k: "Paste it back to your agent", t: "Go back to your chat with the agent and paste the proof there. The agent finishes setting itself up in a minute or two.", frame: chat("proof") },
      { k: "It messages you in Buzz", t: "When the agent is done, it sends you a direct message in Buzz. Reply to that message to check that the agent works. The agent writes first because Buzz can't start a new message to it yet. To use the agent in a channel, mention it there and choose <b>Invite</b>.", frame: dm },
    ],
  },
];
