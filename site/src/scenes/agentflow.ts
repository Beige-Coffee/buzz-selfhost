import maya from "../assets/avatars/maya.svg";
import ops from "../assets/avatars/ops.webp";
import { ti, type Flow } from "./members";

/**
 * Starting an agent in Buzz 1.0, as a click-through of its own screens, in light mode. Drawn from
 * block/buzz-app (2026-10-28): the Agents page and its New agent menu (src/bundled/agents/AgentsPage.tsx),
 * Create agent (src/bundled/agents/AgentCreateDialog.tsx and docs/assets/readme/create-agent.png; its
 * menu's Import an agent shows only when there's one to import, so it's left out),
 * checked against the app running in a browser with sample data. The agent's picture is one of Buzz's
 * own avatar packs; names and messages are illustrative.
 */

/** The app's top bar with Agents open. */
const top = `<div class="mb-top">
  <span class="mb-track">${ti("messages")}Messages<span class="ax-on">${ti("robot")}Agents</span><span>${ti("bolt")}Workflows</span></span>
  <span class="mb-comm">Y</span><span class="mb-me"><img src="${maya}" alt=""><i></i></span>
</div>`;

/** Agents: Your agents, Your teams and Marketplace, with New agent and its menu. */
const agentsPage = (menu: boolean) => `<div class="mb-app">
  ${top}
  <div class="mb-app-body"><div class="mb-app-main ax-page">
    <p class="ax-h">${ti("robot")}Agents</p>
    <div class="ax-tabs"><b>Your agents</b><span>Your teams</span><span>Marketplace</span><em class="${menu ? "" : "hot"}">New agent${ti("chevron-down")}</em></div>
    <div class="ax-empty"><span class="ax-tile">${ti("plus")}</span><span class="ax-tile ghost"></span><span class="ax-tile ghost"></span></div>
    ${menu ? `<div class="ax-menu"><p class="hot">${ti("plus")}Create a new agent</p></div>` : ""}
  </div></div>
</div>`;

/** Create agent: its picture and name, the harness and model, optional instructions. */
const create = `<div class="mb-shade"></div>
<div class="mb-dlg ax-dlg">
  <div class="mb-dlg-h"><b>Create agent</b><span class="mb-x">${ti("x")}</span></div>
  <div class="ax-hero"><img src="${ops}" alt=""><b>Ops</b></div>
  <div class="ax-rows">
    <p>Harness<span class="ax-pick">Claude${ti("chevron-down")}</span></p>
    <p>Model<span class="ax-pick">Sonnet 5.5 · Default${ti("chevron-down")}</span></p>
  </div>
  <p class="ax-lab">Instructions <em>Optional</em></p>
  <p class="ax-text">Check each release's notes before it ships.</p>
  <div class="ax-go"><span class="id-ob-main hot">Create agent</span></div>
</div>`;

/** The agent at work in a channel: mentioned by its owner, it answers as itself. */
const channel = `<div class="mb-app">
  ${top}
  <div class="mb-app-body"><div class="mb-app-main ax-chan">
    <p class="ax-chan-h">${ti("hash")}release</p>
    <div class="ax-msg"><img src="${maya}" alt=""><div><b>Maya <time>10:02</time></b><p><span class="ax-at">@Ops</span> can you check the release notes?</p></div></div>
    <div class="ax-msg"><img class="sq" src="${ops}" alt=""><div><b>Ops <i>Agent</i> <time>10:03</time></b><p>Checked. Two links were broken; both are fixed in the draft.</p></div></div>
    <p class="ax-comp">Message #release</p>
  </div></div>
</div>`;

export const agentFlows: Flow[] = [
  {
    id: "agents",
    label: "Start an agent",
    steps: [
      { k: "Open Agents", t: "Choose <b>Agents</b> at the top, then <b>New agent</b>.", frame: agentsPage(false) },
      { k: "Create a new agent", t: "Choose <b>Create a new agent</b> in the menu.", frame: agentsPage(true) },
      { k: "Pick its harness and model", t: "Name it, pick the harness (Claude, Codex, Goose or Pi) and the model, then <b>Create agent</b>. It gets its own key, vouched for by you.", frame: create },
      { k: "Use it in a channel", t: "Mention it where you need it. The relay lets it in through your membership, so nobody adds it as a member.", frame: channel },
    ],
  },
];

