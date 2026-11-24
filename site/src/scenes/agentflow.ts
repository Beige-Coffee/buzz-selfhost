import maya from "../assets/avatars/maya.svg";
import ops from "../assets/avatars/ops.webp";
import reviewer from "../assets/avatars/reviewer.webp";
// the marks Buzz shows for each harness (block/buzz-app src/shared/design-system/icons/HarnessLogos.tsx); Claude's and
// Builderlab's live in members.ts so moderation.ts can use them without importing this file
import codexMark from "../assets/harness/codex.svg";
import gooseMark from "../assets/harness/goose.svg";
import { app, CLAUDE_MARK, communityNav, MK_BL, settingsModal, sidebar, ti, type Flow } from "./members";
import { ADDRESS, connect, keyImport, welcome } from "./identity";
import { joinCard } from "./joinmock";

/**
 * Where an agent's instructions go, as Buzz 1.0.5 shows it (captured 2026-11-23): Agents, with a tile
 * for each agent (its picture, name and model), then the agent's own panel beside the list, on its
 * Identity tab: Harness, Model and Thinking, then Instructions. The pictures are from Buzz's own avatar
 * packs; the names and the instructions are illustrative (the skill's example, agents.md).
 */
const tile = (img: string, name: string, tint: string, on = false) =>
  `<div class="ax-card ${tint}${on ? " hot" : ""}"><i class="ax-more">•••</i><img src="${img}" alt=""><b>${name}</b><span class="ax-chip">${CLAUDE_MARK}sonnet${ti("chevron-down")}</span></div>`;
const INSTRUCTIONS_TEXT = "You help the Riverbend Tool Library volunteers in this community. Answer questions about opening hours and loans from the files in this workspace.";
/** The agent's panel, on its Identity tab. */
const pane = `<div class="ax-pane">
  <p class="ax-pane-h"><span class="ax-tabchip"><img src="${ops}" alt="">Ops${ti("x")}</span></p>
  <div class="ax-pane-hero peach"><img src="${ops}" alt=""><b>Ops</b><p><span class="ax-btn">Message</span><span class="ax-btn sq">•••</span></p></div>
  <p class="ax-ptabs"><b>Identity</b><span>Memory</span><span>Activity</span><span>Attention</span><span>Settings</span></p>
  <div class="ax-rows">
    <p>Harness<span class="ax-pick">${CLAUDE_MARK}Claude${ti("chevron-down")}</span></p>
    <p>Model<span class="ax-pick">${CLAUDE_MARK}sonnet${ti("chevron-down")}</span></p>
    <p>Thinking<span class="ax-pick">High${ti("chevron-down")}</span></p>
  </div>
  <p class="ax-lab">Instructions</p>
  <p class="ax-box hot">${INSTRUCTIONS_TEXT}</p>
</div>`;
const agentsPage = (open: boolean, menu = false) =>
  app(
    "agents",
    `<div class="ax-split${open ? " open" : ""}">
    <div class="ax-page">
      <p class="ax-h">${ti("robot")}Agents</p>
      <div class="ax-tabs"><b>Your agents</b><span>Your teams</span><span>Marketplace</span><em>New agent${ti("chevron-down")}</em></div>
      <div class="ax-grid">${tile(ops, "Ops", "peach", !open && !menu)}${tile(reviewer, "Reviewer", "sky")}</div>
      ${menu ? `<div class="ax-menu"><p class="hot">${ti("plus")}Create a new agent</p><p>${ti("download")}Import an agent</p></div>` : ""}
    </div>
    ${open ? `${pane}<span class="ax-callout">Write or paste your instructions here</span>` : ""}
  </div>`,
  );


/**
 * Settings, Agent setup, where each harness signs in, as Buzz 1.0.5 shows it (captured 2026-11-23):
 * Harness defaults with Builderlab, Claude, Codex and Goose, then Agent behavior; Claude's own dialog
 * (an API key, or the Claude CLI's own sign-in and Refresh) and Goose's (pick a provider). The Codex row
 * is drawn signed in, with the default model the capture showed; signed out it shows Sign in. For Keep
 * this Mac awake, the page is shown scrolled to Agent behavior, set to Always (its options are Off, While
 * agents work and Always: block/buzz-app src/app/AgentSettings.tsx).
 */
const MK_CODEX = `<img class="as-mk" src="${codexMark}" alt="">`;
const MK_GOOSE = `<img class="as-mk" src="${gooseMark}" alt="">`;
const setupNav = communityNav("Agent setup", false);
const agentSetup = (spot: "" | "claude" | "goose" | "awake") => `<section class="mb-page as-page">
  ${
    spot === "awake"
      ? ""
      : `<h5>Agent setup</h5>
  <p class="as-h">Harness defaults</p>
  <div class="as-card">
    <p class="as-row">${MK_BL}<b>Builderlab</b><span class="as-btn">Edit configuration</span></p>
    <p class="as-row">${CLAUDE_MARK}<b>Claude</b><span class="as-btn${spot === "claude" ? " hot" : ""}">Add Claude API key</span></p>
    <p class="as-row">${MK_CODEX}<b>Codex</b><span class="as-def">Default model<span class="ax-pick">${MK_CODEX}GPT-6.2-Sol · Default <em>Automatic</em>${ti("chevron-down")}</span></span></p>
    <p class="as-row">${MK_GOOSE}<b>Goose</b><span class="as-btn${spot === "goose" ? " hot" : ""}">Set up Goose</span></p>
  </div>`
  }
  <p class="as-h">Agent behavior</p>
  <div class="as-card">
    <p class="as-row2"><span><b>Remember mentioned agents</b><small>Keep the same agents selected for your next message in this channel or thread.</small></span><i class="as-tog"></i></p>
    <p class="as-row2"><span><b>Keep this Mac awake</b><small>So agents can keep answering. Closing the lid still puts it to sleep.</small></span><span class="ax-pick${spot === "awake" ? " hot" : ""}">${spot === "awake" ? "Always" : "Off"}${ti("chevron-down")}</span></p>
  </div>
</section>`;
const claudeKey = `<div class="mb-dlg as-dlg">
  <div class="mb-dlg-h"><b>${CLAUDE_MARK}Claude</b><span class="mb-x">${ti("x")}</span></div>
  <p class="as-p">Buzz can help you configure your Claude setup with an API key, or use the Claude CLI to configure your own connection and refresh Buzz. Create a key at console.anthropic.com and paste it below.</p>
  <p class="as-lab">Anthropic API key</p>
  <p class="as-in"><span></span><em>Save</em></p>
  <p class="as-note">Your key will be stored securely on this computer.</p>
  <div class="as-foot"><span class="mb-btn hot">Refresh</span><span class="mb-btn">Cancel</span></div>
</div>`;
const gooseSetup = `<div class="mb-dlg as-dlg">
  <div class="mb-dlg-h"><b>${MK_GOOSE}Goose</b><span class="mb-x">${ti("x")}</span></div>
  <p class="as-lab">Provider</p>
  <p class="as-sel hot">Choose a provider${ti("chevron-down")}</p>
  <div class="as-foot"><span class="mb-btn">Close</span><span class="mb-btn off">Save defaults</span></div>
</div>`;

export const harnessFlows: Flow[] = [
  {
    id: "setup",
    label: "Sign in to a harness",
    steps: [
      { k: "Open Agent setup", t: "Open <b>Settings</b> and choose <b>Agent setup</b>. Under <b>Harness defaults</b>, each harness shows what it still needs. Codex shows <b>Sign in</b> until you sign in with your ChatGPT plan. After that, it shows its default model.", frame: settingsModal(setupNav, agentSetup("")) },
      { k: "Claude: sign in or add a key", t: "Choose <b>Add Claude API key</b>. If Claude Code is signed in on this computer, such as with your Claude plan, choose <b>Refresh</b>. Buzz then uses that sign-in, and you don't need a key. To sign in first, run <code>claude auth login</code> in a terminal. Without a sign-in, paste a key from console.anthropic.com and choose <b>Save</b>.", frame: settingsModal(setupNav, agentSetup(""), claudeKey) },
      { k: "Goose: pick a provider", t: "Choose <b>Set up Goose</b>. Pick a provider, such as OpenRouter or Ollama for a model on your own computer, and paste its key if it needs one. Then choose <b>Save defaults</b>.", frame: settingsModal(setupNav, agentSetup(""), gooseSetup) },
    ],
  },
];

/**
 * Create agent as Buzz 1.0.5 shows it (captured 2026-11-23), scrolled to its fields: the pictures, Name,
 * Harness, Model and Thinking (here the Builderlab harness the capture had chosen, with its note), then
 * Instructions, optional (Builderlab's form adds "Up to 20,000 characters.", which the Codex form doesn't have).
 *
 * With Codex, as Buzz 1.0.6 shows it (captured 2026-11-24): Codex's default model and thinking level, and
 * no note. The Harness menu from the same capture: Builderlab under Remote, then Claude, Codex and Goose
 * under Local. The menu opens above the picker, as it did there.
 */
type Harness = "builderlab" | "codex";
const HARNESS_MENU = (hot: Harness) => `<span class="ax-hmenu">
  <span class="ax-hmenu-g">Remote</span>
  <span class="ax-hmenu-i sel${hot === "builderlab" ? " hot" : ""}">${MK_BL}Builderlab${ti("check")}</span>
  <span class="ax-hmenu-g">Local</span>
  <span class="ax-hmenu-i">${CLAUDE_MARK}Claude</span>
  <span class="ax-hmenu-i${hot === "codex" ? " hot" : ""}">${MK_CODEX}Codex</span>
  <span class="ax-hmenu-i">${MK_GOOSE}Goose</span>
</span>`;
const createAgentDlg = (harness: Harness, spot: "" | "instructions" | "create", menu?: Harness) => `<div class="mb-shade"></div>
<div class="mb-dlg ax-new">
  <div class="mb-dlg-h"><b>Create agent</b><span class="mb-x">${ti("x")}</span></div>
  <div class="ax-new-hero"><span class="ax-new-pics">${[ops, reviewer, ops, reviewer, ops, reviewer, ops, reviewer].map((src) => `<img src="${src}" alt="">`).join("")}</span></div>
  <p class="ax-lab">Name</p>
  <p class="ax-new-in">Ops</p>
  <div class="ax-rows">
    <p>Harness<span class="ax-pick${menu ? " open" : ""}">${harness === "builderlab" ? `${MK_BL}Builderlab` : `${MK_CODEX}Codex`}${ti("chevron-down")}</span>${menu ? HARNESS_MENU(menu) : ""}</p>
    <p>Model<span class="ax-pick">${harness === "builderlab" ? "Kimi K3.1 Pro" : `${MK_CODEX}GPT-6.2-Sol · Default`}${ti("chevron-down")}</span></p>
    <p>Thinking<span class="ax-pick">${harness === "builderlab" ? "High" : "Low · Default"}${ti("chevron-down")}</span></p>
  </div>
  ${harness === "builderlab" ? `<p class="ax-note">Runs on your Builderlab account. Usage and billing are at <u>app.builderlab.xyz</u>.</p>` : ""}
  <p class="ax-lab">Instructions <em>Optional</em></p>
  <p class="ax-box${spot === "instructions" ? " hot" : ""}">${INSTRUCTIONS_TEXT}</p>
  ${harness === "builderlab" ? `<p class="ax-note">Up to 20,000 characters.</p>` : ""}
  <div class="ax-go"><span class="mb-btn dark${spot === "create" ? " hot" : ""}">Create agent</span></div>
</div>`;
const createAgent = createAgentDlg("builderlab", "instructions");
/** A dialog over the Agents page. */
const overAgents = (dialog: string) => app("agents", `<div class="ax-split"><div class="ax-page"><p class="ax-h">${ti("robot")}Agents</p></div></div>`, dialog);

/** How can you instruct your agents?: where the instructions go, for an agent you have or a new one. */
export const agentFlows: Flow[] = [
  {
    id: "agents",
    label: "An agent you have",
    steps: [
      { k: "Open the agent", t: "Choose <b>Agents</b>, the robot in the dock. Then choose the agent.", frame: agentsPage(false) },
      { k: "Write them in Instructions", t: "The agent's panel opens on its <b>Identity</b> tab. Type a few plain sentences in the <b>Instructions</b> box, below Harness, Model and Thinking. Then choose <b>Save</b>.", frame: agentsPage(true) },
    ],
  },
  {
    id: "new",
    label: "A new agent",
    steps: [
      { k: "Create a new agent", t: "Choose <b>Agents</b>, the robot in the dock. Choose <b>New agent</b>, then <b>Create a new agent</b>.", frame: agentsPage(false, true) },
      { k: "Write them in Instructions", t: "Give the agent a name and pick its harness. Then type a few plain sentences in <b>Instructions</b>, below Harness, Model and Thinking. A Builderlab agent's instructions can be up to 20,000 characters. Choose <b>Create agent</b>.", frame: overAgents(createAgent) },
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
/**
 * Settings, Security as Buzz 1.0.5 shows it (captured 2026-11-23): Paired command-line tools, then
 * Authorize external identity in its own card, with its subtitle as Buzz 1.0.6 words it (ExternalIdentityAuthorization.tsx). With the proof made, the page is shown scrolled to it
 * (that state comes from AgentAuthorization's source; it wasn't captured).
 */
const security = (proof: boolean, scrolled = true) => `<section class="mb-page rs-page">
  ${
    scrolled
      ? ""
      : `<h5 class="mb-big">Security</h5>
  <p class="mb-sub">Tools paired on this device, and applications you authorize to act as you.</p>
  <p class="rs-h">Paired command-line tools</p>
  <div class="rs-card rs-empty">${ti("lock")}<b>No paired tools</b><span>Run buzz auth desktop pair in a terminal to let a command-line tool use Buzz as you.</span></div>`
  }
  <p class="rs-h">Authorize external identity</p>
  ${proof ? "" : `<p class="mb-sub">Use this for an application that keeps its own agent key. Only authorize a public key you recognize. This ownership proof has no time or event-kind limits.</p>`}
  <div class="rs-card">
    <p class="rs-lab">Application public key (hex)</p>
    <span class="j1-input"><span class="mono">${AGENT_HEX}</span></span>
    <p class="rs-help">Copy this public key from the application's identity settings.</p>
    <span class="mb-btn dark${proof ? "" : " hot"}">Authorize identity</span>
    ${proof ? `<p class="rs-lab">Ownership proof</p><span class="rs-proof">["auth","d3a8…71f0","","9c1e…44b2"]</span><span class="mb-btn hot">Copy ownership proof</span>` : ""}
  </div>
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
const dmSide = sidebar("", `<p class="mb-srow on">${ti("robot")}Helper</p>`);
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

/**
 * How do you keep an agent always online?: the steps for each place an agent can run, chosen from the
 * answer's cards (the owner's ask of 2026-11-24). The words follow agents.md's "Keep an agent answering"
 * (the build checks the sentences they rest on, AGENTS_SAYS), and Builderlab's own README for an agent
 * Block hosts (block/buzz-app src/bundled/builderlab/README.md, 2026-11-19): Builderlab under Remote in
 * the Harness menu, Sign in beside Harness when signed out, then Create agent and Let's go. Buzz's first
 * screens come from the identity click-through, which draws them from block/buzz-app v1.0.0.
 */
const HARNESS_LINK = `<a href="#operations" data-q-link="agent-model">your choices for a harness</a>`;
const newAgent = (t: string) => ({ k: "Create a new agent", t, frame: agentsPage(false, true) });
const AWAKE = settingsModal(setupNav, agentSetup("awake"));

export const onLaptopFlows: Flow[] = [
  {
    id: "laptop",
    label: "Your laptop",
    steps: [
      newAgent("Choose <b>Agents</b>, the robot in the dock. Choose <b>New agent</b>, then <b>Create a new agent</b>. In a community with no agents yet, choose <b>Create your first agent</b>."),
      { k: "Pick a harness under Local", t: `Open the <b>Harness</b> menu. Pick Claude, Codex or Goose under <b>Local</b>, so the agent runs on this computer. Builderlab, under <b>Remote</b>, is an agent Block hosts. Each harness signs in its own way. See ${HARNESS_LINK}.`, frame: overAgents(createAgentDlg("builderlab", "", "codex")) },
      { k: "Name it and create it", t: "Give the agent a name, and add instructions if you want to. Then choose <b>Create agent</b>.", frame: overAgents(createAgentDlg("codex", "create")) },
      { k: "Keep your Mac awake", t: "Open <b>Settings</b> and choose <b>Agent setup</b>. Under <b>Agent behavior</b>, set <b>Keep this Mac awake</b> to <b>Always</b>. With <b>While agents work</b>, the Mac can sleep after the agents finish, and they stop answering. Closing the lid still puts it to sleep, so keep the lid up and Buzz open. On Linux or Windows, turn off sleep in the system's own settings.", frame: AWAKE },
    ],
  },
];

export const onStayFlows: Flow[] = [
  {
    id: "stay",
    label: "A computer that stays on",
    steps: [
      { k: "Install Buzz there", t: "Install Buzz on the computer that stays on. Buzz is a desktop app for macOS, Linux and Windows. Claude and Codex agents need macOS or Linux. Open Buzz and choose <b>Other options</b>.", frame: welcome },
      { k: "Paste your community's address", t: "Paste your community's address into <b>Community address or invite link</b>. Then choose <b>Continue</b>.", frame: joinCard(ADDRESS, true) },
      { k: "Use an existing key", t: "On the <b>Connect to your community</b> page, choose <b>Use an existing key</b>. If you use a Builderlab account, choose <b>Sign in with Builderlab</b> instead.", frame: connect },
      { k: "Sign in as yourself", t: "Paste the copy of your private key that you saved, then choose <b>Continue with this key</b>. An agent answers only its owner, so this computer has to use your identity. If you have no copy, open <b>Settings</b> and choose <b>Identity</b> on the computer you already use. Choose <b>More options</b> on the Buzz ID card, then the masked private key field and <b>Copy</b>.", frame: keyImport },
      newAgent("On that computer, choose <b>Agents</b>, then <b>New agent</b> and <b>Create a new agent</b>. Buzz keeps an agent's key on the computer where you create it, and the agent runs there. Your other computers list it as <b>On another device</b>."),
      { k: "Pick a local harness and create it", t: `In the <b>Harness</b> menu, pick Claude, Codex or Goose under <b>Local</b>. Give the agent a name, then choose <b>Create agent</b>. See ${HARNESS_LINK}.`, frame: overAgents(createAgentDlg("codex", "create")) },
      { k: "Keep the computer awake", t: "On a Mac, open <b>Settings</b> and choose <b>Agent setup</b>. Under <b>Agent behavior</b>, set <b>Keep this Mac awake</b> to <b>Always</b>. Buzz has this setting on Macs only. On Linux or Windows, turn off sleep in the system's own settings.", frame: AWAKE },
    ],
  },
];

export const onHostedFlows: Flow[] = [
  {
    id: "hosted",
    label: "Hosted by Block",
    steps: [
      newAgent("Choose <b>Agents</b>, the robot in the dock. Choose <b>New agent</b>, then <b>Create a new agent</b>. In a community with no agents yet, choose <b>Create your first agent</b>."),
      { k: "Pick Builderlab under Remote", t: "Open the <b>Harness</b> menu and pick <b>Builderlab</b> under <b>Remote</b>. If you're signed out of Builderlab, choose the small <b>Sign in</b> button beside Harness. Buzz opens Builderlab's sign-in in your browser.", frame: overAgents(createAgentDlg("builderlab", "", "builderlab")) },
      { k: "Create it", t: "Pick a model and a thinking level, and add instructions if you want to. Then choose <b>Create agent</b>. Read the introduction Buzz shows, then choose <b>Let's go</b>.", frame: overAgents(createAgentDlg("builderlab", "create")) },
    ],
  },
];
