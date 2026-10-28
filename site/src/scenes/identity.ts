import { communityNav, CURSOR, invite, settings, settingsModal, settingsNav, ti, type Flow } from "./members";

/**
 * A person's identity in Buzz 1.0, as click-throughs of its own screens, in light mode. Drawn from
 * block/buzz-app (2026-10-27): the first screen and "Use your existing identity"
 * (src/features/identity/IdentitySetup.tsx and its .module.css, public/shell-gradient.png), the profile
 * menu with no community yet (src/app/shell/ProfileButton.tsx), Settings with no community
 * (src/app/settings-sections.ts), Identity (src/app/IdentitySettings.tsx,
 * src/features/identity/PrivateKey.tsx) and Pair mobile, checked against the app running in a browser
 * with sample data. The password manager and the devices are generic, not any product.
 */

const NPUB = "npub1qm…8k3a";

/** Buzz's first screen, for someone without an earlier Buzz: Create a new identity leads. */
const firstScreen = (spot: "create" | "existing") => `<div class="id-ob ${spot}">
  <div class="b1-lights" aria-hidden="true"><i></i><i></i><i></i></div>
  <svg class="id-word" viewBox="0 0 300 96" aria-hidden="true"><text x="150" y="74" text-anchor="middle" filter="url(#buzz-grain)">Buzz</text></svg>
  <div class="id-ob-btns"><span class="id-ob-main${spot === "create" ? " hot" : ""}">Create a new identity</span><span class="id-ob-ghost${spot === "existing" ? " hot" : ""}">Use an existing key</span></div>
  ${CURSOR}
</div>`;

/** Use an existing key: paste the saved private key, then Import this identity. */
const importScreen = `<div class="id-ob id-import">
  <div class="b1-lights" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="id-imp">
    <h4>Use your existing identity</h4>
    <b>Private key (nsec)</b>
    <p>Copy this from Identity details in your old Buzz app. Never share it with anyone.</p>
    <span class="id-input">••••••••••••••••••••••••</span>
  </div>
  <span class="id-ob-main id-imp-go hot">Import this identity</span>
</div>`;

/** The app before any community, with the profile menu open: Settings works without one. */
const profileMenu = `<div class="mb-app">
  <div class="mb-top">
    <span class="mb-track">${ti("messages")}Messages<span>${ti("robot")}Agents</span><span>${ti("bolt")}Workflows</span></span>
    <span class="id-comms">Communities${ti("chevron-down")}</span><span class="mb-me id-me">${ti("user")}</span>
  </div>
  <div class="mb-app-body"><div class="mb-app-main id-empty"><p>Your channels, one conversation.</p><span></span><span class="short"></span></div></div>
  <div class="mb-pmenu">
    <div class="mb-pm-head"><span class="mb-pm-av id-me">${ti("user")}</span><span><b>Your profile</b></span></div>
    <p class="id-pm-note">Status updates are unavailable in this community.</p>
    <hr>
    <p>${ti("device-desktop")}Appearance<span class="mb-pm-more">${ti("chevron-right")}</span></p>
    <p>${ti("layout-grid")}Plugins</p>
    <p class="mb-pm-set">${ti("settings")}Settings</p>
    <hr>
    <p>${ti("message-circle")}Send feedback</p>
  </div>
  ${CURSOR}
</div>`;

/** Settings with no community yet: Personal space, Buzz and Plugins. */
const nav = settingsNav(
  [
    ["Personal space", [["user", "Profile"], ["device-mobile", "Pair mobile"]]],
    ["Buzz", [["shield", "Identity"], ["palette", "Appearance"], ["bell", "Notifications"], ["keyboard", "Shortcuts"], ["robot", "Agent setup"]]],
    ["Plugins", [["layout-grid", "Manage plugins"]]],
  ],
  "Identity",
);

type Spot = "key" | "npub";
/** Settings, Identity: the two public keys, then the private key with its two buttons. */
const identityPage = (spot: Spot) => `<section class="mb-page id-page">
  <h5>Identity</h5>
  <p class="mb-sub">Your identity is shared across communities. Public keys are safe to share.</p>
  <div class="id-group">
    <div class="id-row"><span><b>Public key (hex)</b><code>3f9c0a52…07e81b</code></span><span class="id-ic">${ti("copy")}</span></div>
    <div class="id-row"><span><b>Nostr address (npub)</b><code>${NPUB}</code></span><span class="id-ic${spot === "npub" ? " hot" : ""}">${ti("copy")}</span></div>
  </div>
  <div class="id-group id-form">
    <b>Private key (nsec)</b>
    <p class="mb-sub">Anyone with this key can act as you. Never share it.</p>
    <span class="id-input">••••••••••••••••</span>
    <div class="id-btns"><span class="mb-btn">Reveal private key</span><span class="mb-btn${spot === "key" ? " hot" : ""}">Copy private key</span></div>
    ${spot === "key" ? `<p class="id-status">Private key copied. Keep it somewhere safe; your clipboard now contains it.</p>` : ""}
  </div>
  ${spot === "npub" ? `<div class="id-toast">${ti("check")}Nostr address copied.</div>` : ""}
</section>`;

/** Settings, Pair mobile: the code to scan, beside the three steps Buzz lists. */
const qr = (() => {
  // a made-up code: a finder square in three corners, a quiet gap around each, and a fixed scatter between
  const finder = (x: number, y: number, ox: number, oy: number) => {
    const dx = x - ox;
    const dy = y - oy;
    if (dx < -1 || dy < -1 || dx > 7 || dy > 7) return null;
    if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return false;
    return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
  };
  let cells = "";
  for (let y = 0; y < 21; y++)
    for (let x = 0; x < 21; x++) {
      const f = finder(x, y, 0, 0) ?? finder(x, y, 14, 0) ?? finder(x, y, 0, 14);
      const on = f ?? (x * 31 + y * 17 + x * y * 7) % 11 < 5;
      if (on) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  return `<svg class="id-qr" viewBox="-1 -1 23 23" shape-rendering="crispEdges" aria-hidden="true">${cells}</svg>`;
})();
const pairPage = `<section class="mb-page id-pair">
  <h5>Pair mobile</h5>
  <p class="mb-sub">Connect the Buzz mobile app to this community. Pairing is secured with end-to-end encryption and a verification code.</p>
  <div class="id-pair-b">
    <div class="id-pair-code">${qr}</div>
    <ol>
      <li><span>1</span><div><b>Scan QR code</b><p>Open Buzz on your phone and choose Add community to scan the code shown here.</p></div></li>
      <li><span>2</span><div><b>Enter code on your phone</b><p>After scanning, enter the six-digit code shown on this desktop into your phone.</p></div></li>
      <li><span>3</span><div><b>Pair your mobile app</b><p>Your mobile app will connect after you verify the code.</p></div></li>
    </ol>
  </div>
</section>`;

/** A password manager, any brand: the person's own item, the key pasted in. */
const vault = `<div class="id-vault">
  <div class="id-vault-side">
    <p class="id-vault-t">${ti("lock")}Passwords</p>
    <p class="on">${ti("key")}Buzz identity</p>
    <p>${ti("at")}Email</p>
    <p>${ti("device-desktop")}Laptop</p>
  </div>
  <div class="id-vault-item">
    <h6>Buzz identity</h6>
    <div class="id-field"><small>Name</small><span>Maya, work identity</span></div>
    <div class="id-field hot"><small>Private key (nsec)</small><span>••••••••••••••••</span><em>Pasted</em></div>
    <div class="id-field"><small>Nostr address (npub)</small><span class="mono">${NPUB}</span></div>
    <span class="mb-btn dark id-save">Save</span>
  </div>
</div>`;

const laptop = `<svg viewBox="0 0 120 84" aria-hidden="true"><rect x="16" y="6" width="88" height="58" rx="6"/><path d="M4 74h112l-6 6H10z"/><rect class="id-lockbody" x="49" y="31" width="22" height="17" rx="3"/><path class="id-lockarc" d="M53 31v-5a7 7 0 0 1 14 0v5"/></svg>`;
const phone = `<svg viewBox="0 0 60 96" aria-hidden="true"><rect x="6" y="4" width="48" height="88" rx="9"/><path d="M24 12h12"/><rect class="id-lockbody" x="19" y="44" width="22" height="17" rx="3"/><path class="id-lockarc" d="M23 44v-5a7 7 0 0 1 14 0v5"/></svg>`;
const devices = `<div class="id-devs">
  <div class="id-dev">${laptop}<b>Computer</b><span>${ti("check")}Disk encryption on</span><span>${ti("check")}Screen lock on</span></div>
  <div class="id-dev">${phone}<b>Phone</b><span>${ti("check")}Passcode on</span></div>
</div>`;

export const identityFlows: Flow[] = [
  {
    id: "identity",
    label: "Set up an identity",
    steps: [
      { k: "Create a new identity", t: "On Buzz's first screen, choose <b>Create a new identity</b>. Buzz keeps its key in your computer's secure storage.", frame: firstScreen("create") },
      { k: "Open Settings", t: "Your profile icon at the top right, then <b>Settings</b>. Or press ⌘, (Ctrl+, on Windows and Linux).", frame: profileMenu, loop: true },
      { k: "Copy the private key", t: "Under <b>Buzz</b>, choose <b>Identity</b>, then <b>Copy private key</b>.", frame: settingsModal(nav, identityPage("key")) },
      { k: "Save it in your password manager", t: "Paste it into your own item, then copy something else so it leaves your clipboard. Anyone with this key can act as you.", frame: vault },
      { k: "Send your npub to an admin", t: "On the same page, copy your <b>Nostr address (npub)</b> and send it to an admin, who adds you. It's public, so any channel works.", frame: settingsModal(nav, identityPage("npub")) },
      { k: "Lock your devices", t: "Turn on disk encryption and a screen lock on your computer, and a passcode on your phone.", frame: devices },
    ],
  },
];

/** A lost device: retire an exposed key for a new identity, or bring a safe one back. */
const pairAgain = { k: "Pair the phone again", t: "<b>Settings</b>, <b>Pair mobile</b>. On the phone, <b>Add community</b>, scan the code, and type the six digits.", frame: settingsModal(communityNav("Pair mobile"), pairPage) };
export const lostFlows: Flow[] = [
  {
    id: "exposed",
    label: "The key is exposed",
    steps: [
      { k: "Remove the old key now", t: "An admin opens <b>Membership</b>, the <b>…</b> on the person's row, then <b>Remove</b>. Whoever has the device can't get in with it anymore.", frame: settings("remove") },
      { k: "Create a new identity", t: "On the new device, <b>Create a new identity</b>. Not the saved copy: whoever has the old device has that key too.", frame: firstScreen("create") },
      { k: "Send the new npub", t: "<b>Settings</b>, <b>Identity</b>, copy <b>Nostr address (npub)</b>, and send it to an admin.", frame: settingsModal(nav, identityPage("npub")) },
      { k: "An admin adds it", t: "<b>Membership</b>, <b>Invite members</b>, paste the npub, <b>Add member</b>. Then pair the phone again, and start their agents again from the new identity.", frame: settings("", invite("add")) },
    ],
  },
  {
    id: "safe",
    label: "The key is safe",
    steps: [
      { k: "Use an existing key", t: "On the new device's first screen, <b>Use an existing key</b>. With a Block account, <b>Restore from backup</b> appears here too.", frame: firstScreen("existing") },
      { k: "Paste the saved key", t: "Paste the private key from the password manager, then <b>Import this identity</b>. Same identity, nothing for an admin to do.", frame: importScreen },
      pairAgain,
    ],
  },
];
