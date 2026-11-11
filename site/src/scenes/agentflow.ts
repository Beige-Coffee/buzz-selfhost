import maya from "../assets/avatars/maya.svg";
import ops from "../assets/avatars/ops.webp";
import { app, ti, type Flow } from "./members";

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
      { k: "Open Agents", t: "Choose <b>Agents</b>, the robot in the dock, then <b>Create your first agent</b>. If you already have agents, choose <b>New agent</b>, then <b>Create a new agent</b>.", frame: agentsPage(false) },
      { k: "Pick its harness and model", t: "Name it, pick the harness, such as Claude, Codex or Goose, and the model, then <b>Create agent</b>. It gets its own key, vouched for by you.", frame: create },
      { k: "Use it in a channel", t: "Mention it where you need it. The relay lets it in through your membership, so nobody adds it as a member.", frame: channel },
    ],
  },
];
