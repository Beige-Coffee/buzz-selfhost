import { bottomNav } from "./moderation";
import { settingsModal, ti, type Flow } from "./members";

/**
 * Adding a harness with a plugin, as Buzz 1.0.5 shows it (captured 2026-11-23): Settings, Plugins,
 * Manage plugins with its Add button, then Add a plugin with a repository's address. Maple's plugin
 * (github.com/MaplePrivacyLabs/buzz-maple-plugin) is the example: its README installs it this way, with
 * Find, then Install plugin after reviewing what it asks for. The icons are simplified.
 */
const tile = (tint: string, icon: string) => `<span class="pl-ic ${tint}">${ti(icon)}</span>`;
const feat = (tint: string, icon: string, name: string, sub: string, btn: string) =>
  `<div class="pl-card">${tile(tint, icon)}<b>${name}</b><small>${sub}</small><span class="mb-btn${btn === "Required" ? " pl-req" : ""}">${btn}</span></div>`;
const row = (tint: string, icon: string, name: string, sub: string, btn: string) =>
  `<div class="pl-row">${tile(tint, icon)}<span><b>${name}</b><small>${sub}</small></span><span class="mb-btn${btn === "Enable" ? " dark" : ""}">${btn}</span></div>`;

const managePlugins = (hot: boolean) => `<section class="mb-page pl-page">
  <div class="md-head"><h5>Manage plugins</h5><span class="mb-btn${hot ? " hot" : ""}">Add</span></div>
  <div class="pl-feat">
    ${feat("teal", "message-circle", "Channels", "Navigate channels and hold conversations in Buzz.", "Required")}
    ${feat("blue", "robot", "Agents", "Create, configure, and manage agents.", "Disable")}
    ${feat("pink", "user", "Profiles", "View member and agent profiles and recent activity.", "Disable")}
  </div>
  <div class="pl-tabs"><b>All plugins</b><span>Essentials</span><em>${ti("search")}Search plugins...</em></div>
  <p class="pl-sec">Communication <i>8</i></p>
  ${row("teal", "bell", "Activity", "Review conversation activity that needs your attention.", "Disable")}
  ${row("sky", "send", "Drafts &amp; sent", "Pick up messages you started, and see which of your sent messages got replies.", "Enable")}
</section>`;

const addPlugin = `<div class="mb-dlg pl-dlg">
  <div class="mb-dlg-h"><b>Add a plugin</b><span class="mb-x">${ti("x")}</span></div>
  <p class="as-p">Load built plugins containing manifest.json and plugin.js. Buzz doesn't build source code or run install scripts.</p>
  <div class="pl-add">
    <div class="pl-drop">${ti("folder-open")}<span>Drop a plugin folder here</span><span class="mb-btn">Browse</span></div>
    <div class="pl-form">
      <p class="as-lab">Git or GitHub repository</p>
      <p class="pl-in hot">https://github.com/MaplePrivacyLabs/buzz-maple-plugin</p>
      <p class="as-lab">Branch or tag (optional)</p>
      <p class="pl-in dim">Repository default</p>
      <p class="as-lab">Folder (optional)</p>
      <p class="pl-in dim">Whole repository</p>
      <span class="mb-btn pl-find">Find</span>
    </div>
  </div>
</div>`;

const nav = bottomNav("Manage plugins", false);

/** Which harness should you pick?: adding a harness that doesn't come with Buzz, as a plugin. */
export const pluginFlows: Flow[] = [
  {
    id: "plugin",
    label: "Add a harness plugin",
    steps: [
      { k: "Open Manage plugins", t: "Open <b>Settings</b> and scroll to <b>Plugins</b>. Choose <b>Manage plugins</b>, then <b>Add</b>.", frame: settingsModal(nav, managePlugins(true)) },
      { k: "Paste the plugin's repository", t: "Paste the plugin's address under <b>Git or GitHub repository</b>, such as Maple's, and choose <b>Find</b>. Leave the branch and folder blank unless the plugin's own instructions say otherwise. Buzz then shows what the plugin is allowed to do, such as start programs or read files. Check that, then choose <b>Install plugin</b> and turn the plugin on.", frame: settingsModal(nav, managePlugins(false), addPlugin) },
    ],
  },
];
