import { BACK, joinCard, onboardingStep } from "./joinmock";
import { communityNav, CURSOR, invite, settings, settingsModal, ti, type Flow } from "./members";
import { skillURL } from "../lib/values";

/**
 * A person's identity in Buzz 1.0, as click-throughs of its own screens, in light mode. Drawn from
 * block/buzz-app as released in v1.0.0: the account-first first run (#2579:
 * src/features/identity/Welcome.tsx, OnboardingBees.tsx, IdentitySetup.module.css, ConnectChoice.tsx,
 * KeyImport.tsx, and CommunityUrlField.tsx through joinmock.ts), Settings (src/app/settings-sections.ts),
 * Identity (src/app/IdentitySettings.tsx) and Pair mobile with Codes match (#1597:
 * src/bundled/pairing/PairingSettings.tsx). The key script's terminal, the password manager and the
 * devices are generic, not any product, and the terminal never shows a key.
 */

const NPUB = "npub1qm…8k3a";
/** The new key after a lost device: the npub whoever runs the server adds, unless an admin sends a link. */
const NEW_NPUB = "npub1qk3f8w…7x2a";
/** This guide's key script, linked from the steps that use it, so a reader who skipped the skill can get it. */
const KEYMAKER = skillURL("scripts/new-identity.py");

/**
 * Buzz's first screen: the wordmark on Buzz's chartreuse among its bees, then Create account and Sign
 * in, for a Builderlab account, and Other options. The bees start where OnboardingBees.tsx places them.
 */
const BEES = Array.from({ length: 16 }, (_, i) => {
  const n = i + 1;
  const seed = (n * 0.7548776662) % 1;
  const x = (0.5 + n / 1.324717957244746) % 1;
  const y = (0.5 + n / 1.324717957244746 ** 2) % 1;
  return `<svg class="id-bee${i % 2 ? " lime" : ""}" style="left:${(x * 92).toFixed(1)}%;top:${(y * 90).toFixed(1)}%;transform:rotate(${Math.round(seed * 360 + 90)}deg)" viewBox="0 0 466 309"><use href="#bee"/></svg>`;
}).join("");
const welcome = `<div class="j1-win id-wel">
  <div class="id-bees" aria-hidden="true">${BEES}</div>
  <div class="b1-lights" aria-hidden="true"><i></i><i></i><i></i></div>
  <svg class="id-word" viewBox="0 0 300 96" aria-hidden="true"><text x="150" y="74" text-anchor="middle" filter="url(#buzz-grain)">Buzz</text></svg>
  <p class="id-tag">Your people, your agents, one place.</p>
  <div class="id-wel-btns"><span class="j1-go">Create account</span><span class="id-glass">Sign in</span><span class="id-ghost hot">Other options</span></div>
  ${CURSOR}
</div>`;

/** Connect to your community: the found address, then Sign in with Builderlab or Use an existing key. */
const connect = onboardingStep(`<h4 class="j1-h">Connect to your community</h4>
  <p class="j1-sub">Sign in to your Builderlab account with email, or use an existing private key to continue.</p>
  <p class="id-host"><span>B</span>buzz.yourteam.org</p>
  <div class="id-pick"><span class="j1-go">Sign in with Builderlab</span><span class="j1-btn hot">Use an existing key</span></div>
  <div class="j1-acts">${BACK}</div>`);

/** Enter your private key: the key pasted, its npub shown under the field, then Continue with this key. */
const keyImport = onboardingStep(
  `<h4 class="j1-h">Enter your private key</h4>
  <p class="j1-sub">Paste your private key to sign in to Buzz. You can also select or drop a text file with your key.</p>
  <p class="j1-lab">Private key (nsec)</p>
  <div class="id-key"><span class="j1-input">••••••••••••••••••••••••${ti("eye")}</span><span class="j1-btn">Browse</span></div>
  <p class="id-pub">Public identity: <code>${NPUB}</code></p>
  <div class="j1-acts">${BACK}<span class="j1-go hot">Continue with this key</span></div>`,
);

/** The guide's key script on the person's own computer: it shows the npub and where the key is, never the key. */
const keyScript = (npub = NPUB) => `<div class="id-term">
  <p class="id-term-h"><i></i><i></i><i></i><span>your computer</span></p>
  <pre><span class="p">$</span> python3 new-identity.py
<b>${npub}</b>
/Users/maya/buzz-identity.key</pre>
</div>`;

/** Settings, Identity in v1.0.0: the Buzz ID card, or its private-key menu on the back. */
const nav = (open: string) => communityNav(open, false);
const identityPage = (copy: "npub" | "nsec") => `<section class="mb-page id-page">
  <h5>Identity</h5>
  <p class="mb-sub">Your identity is shared across communities.</p>
  <div class="id-badge${copy === "nsec" ? " back" : ""}">
    <span class="id-badge-more">${ti(copy === "nsec" ? "arrow-left" : "dots")}</span>
    ${copy === "npub" ? `<div class="id-badge-art"><b>M</b><strong>Buzz ID</strong></div>
    <p class="id-badge-label">PUBLIC KEY</p><div class="id-barcode" aria-hidden="true"></div>
    <div class="id-badge-pub"><code>${NPUB}</code><span class="id-ic hot" aria-label="Copy Buzz ID">${ti("copy")}</span></div>`
    : `<p class="id-badge-label">Your private key</p>
    <span class="id-input">nsec •••••••••••••••• ${ti("chevron-down")}</span>
    <div class="id-key-menu"><small>Private key</small><b class="hot">Copy</b><span>Reveal</span></div>
    <p class="mb-sub">This key is stored securely on this device.</p>
    <p class="mb-sub">Anyone with this key can act as you. Never share it.</p>`}
  </div>
  ${copy === "npub" ? `<div class="id-toast">${ti("check")}Buzz ID copied.</div>` : ""}
</section>`;

/** Settings, Mobile app, whose page is Pair mobile for a key kept off Builderlab (src/bundled/pairing/index.tsx, MobileApp.tsx), once the phone has scanned: the six digits and Codes match, beside Buzz's three steps. */
const pairPage = `<section class="mb-page id-pair">
  <h5>Pair mobile</h5>
  <p class="mb-sub">Connect the Buzz mobile app to this community. Pairing is secured with end-to-end encryption and a verification code.</p>
  <div class="id-pair-b">
    <div class="id-pair-code">
      <b>Verify the code on your phone</b>
      <span class="id-digits">482 913</span>
      <span class="mb-btn dark hot">Codes match</span>
      <span class="mb-btn">Cancel</span>
    </div>
    <ol>
      <li class="done"><span>${ti("check")}</span><div><b>Scan QR code</b><p>Open Buzz on your phone and choose Add community to scan the code shown here.</p></div></li>
      <li><span>2</span><div><b>Verify the code on your phone</b><p>If your phone asks for a code, enter these digits and finish confirming on your phone. If it shows a code, check that the digits match. Then choose Codes match here to send your Buzz identity.</p></div></li>
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
  <div class="id-dev">${laptop}<b>Computer</b><span>Disk encryption on</span><span>Screen lock on</span></div>
  <div class="id-dev">${phone}<b>Phone</b><span>Passcode on</span></div>
</div>`;

const ADDRESS = `<span class="typed">buzz.yourteam.org</span>`;

export const identityFlows: Flow[] = [
  {
    id: "identity",
    label: "Set up an identity",
    steps: [
      { k: "Make your key", t: `Run this guide's <a href="${KEYMAKER}">key script</a> on your own computer. Don't run it on the server. The script saves your private key in a file that only you can read. It shows your npub and where the file is. It never shows the private key.`, frame: keyScript() },
      { k: "Choose Other options", t: "On Buzz's first screen, choose <b>Other options</b>. <b>Create account</b> and <b>Sign in</b> are for a Builderlab account. Builderlab is Block's service.", frame: welcome },
      { k: "Paste your community's address", t: "Paste your community's address into <b>Community address or invite link</b>. If an admin sent you an invite link, paste the link instead. Then choose <b>Continue</b>.", frame: joinCard(ADDRESS, true) },
      { k: "Use an existing key", t: "On the <b>Connect to your community</b> page, choose <b>Use an existing key</b>. <b>Sign in with Builderlab</b> would sign you in through Block's service.", frame: connect },
      { k: "Drop in your key file", t: "Drop the key file on the page, or choose <b>Browse</b> and pick the file. Check that <b>Public identity</b> shows your npub, then choose <b>Continue with this key</b> and <b>Join</b>. Enter your name under <b>Set up your profile</b>. If Buzz says the community needs an invite, nobody has added your npub yet.", frame: keyImport },
      { k: "Copy your private key", t: "Press ⌘, on a Mac or Ctrl+, on Windows and Linux to open <b>Settings</b>. You can also choose your profile picture, then <b>Settings</b>. Under <b>Buzz</b>, choose <b>Identity</b>. On the Buzz ID card, choose <b>More options</b>, the <b>…</b> button. Then choose the masked private key field and choose <b>Copy</b>.", frame: settingsModal(nav("Identity"), identityPage("nsec")) },
      { k: "Save it in your password manager", t: "Paste the key into your private vault in your password manager. Check that you can open the saved entry and get the key back. Don't use a clipboard tool that shares your clipboard or keeps a history of it. Clear the key from your clipboard when you're done. Then run <code>rm ~/buzz-identity.key</code> to delete the key file. Anyone who has this key can act as you.", frame: vault },
      { k: "Copy your npub to share", t: "On the front of the Buzz ID card, choose <b>Copy Buzz ID</b>, the copy icon next to your npub. Your npub is public. You can send it to people any way you like.", frame: settingsModal(nav("Identity"), identityPage("npub")) },
      { k: "Lock your devices", t: "Turn on disk encryption and a screen lock on your computer. Set a passcode on your phone.", frame: devices },
    ],
  },
];

/** A lost device: retire an exposed key for a new one, or sign in again with a safe one. */
const pairAgain = {
  k: "Pair the phone again",
  t: "On your computer, open <b>Settings</b> and choose <b>Mobile app</b>. On the phone, open Buzz, choose <b>Add community</b> and scan the code. If the phone asks for a code, type the six digits your computer shows. If the phone shows a code, check that the digits match. Then choose <b>Codes match</b> on your computer.",
  frame: settingsModal(nav("Mobile app"), pairPage),
};
export const lostFlows: Flow[] = [
  {
    id: "exposed",
    label: "The key is exposed",
    steps: [
      { k: "Remove the old key now", t: "An admin opens <b>Membership</b>, chooses the <b>…</b> button on the person's row, then chooses <b>Remove</b>. Buzz disconnects the old key right away. An invite link that hasn't expired would still let the old key back in.", frame: settings("remove") },
      { k: "Make a new key", t: `On the new device, make a new key with this guide's <a href="${KEYMAKER}">key script</a>. Don't use the copy you saved. Whoever has the old device has that key too.`, frame: keyScript(NEW_NPUB) },
      { k: "Get a new invite link", t: "An admin makes you a new link on the <b>Invite</b> tab in <b>Membership</b>. They set it to 1 use and to expire after 1 day, then send it to you. Or whoever runs the server can add the npub that the script showed you. The Buzz app can't add an npub itself.", frame: invite("copy", "1 day", "1") },
      { k: "Sign in with the new key", t: "On the new device's first screen, choose <b>Other options</b>. Paste the new invite link or the community's address, then choose <b>Continue</b>. Choose <b>Use an existing key</b> and drop in the new key file. Save the new key in your password manager and delete the file, as you did the first time. Then pair your phone again. Start your agents again from the new identity.", frame: connect },
    ],
  },
  {
    id: "safe",
    label: "The key is safe",
    steps: [
      { k: "Sign in with the saved copy", t: "On the new device's first screen, choose <b>Other options</b>. Paste the community's address and choose <b>Continue</b>. Then choose <b>Use an existing key</b>.", frame: connect },
      { k: "Paste the saved key", t: "Copy the key from your password manager and paste it into the field. Choose <b>Continue with this key</b>, then <b>Join</b>. You're still a member with the same key. Nobody has to add you again.", frame: keyImport },
      pairAgain,
    ],
  },
];
