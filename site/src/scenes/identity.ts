import maya from "../assets/avatars/maya.svg";
import ops from "../assets/avatars/ops.webp";
import { BACK, joinCard, onboardingStep } from "./joinmock";
import { communityNav, CURSOR, invite, QR, settings, settingsModal, ti, type Flow } from "./members";
import { banFrame } from "./moderation";

/**
 * A person's identity in Buzz 1.0, as click-throughs of its own screens, in light mode. Drawn from
 * block/buzz-app as released in v1.0.0: the account-first first run (#2579:
 * src/features/identity/Welcome.tsx, OnboardingBees.tsx, IdentitySetup.module.css, ConnectChoice.tsx,
 * KeyImport.tsx, and CommunityUrlField.tsx through joinmock.ts), Settings (src/app/settings-sections.ts),
 * Identity (src/app/IdentitySettings.tsx) and Pair mobile with Codes match (#1597:
 * src/bundled/pairing/PairingSettings.tsx). The terminal runs nak (github.com/fiatjaf/nak), the open-source
 * Nostr tool, and never shows a key. The password manager and the devices are generic, not any product.
 */

const NPUB = "npub1qm…8k3a";
/** The new key after a lost device: the npub whoever runs the server adds, unless an admin sends a link. */
const NEW_NPUB = "npub1qk3f8w…7x2a";
/** nak, the open-source Nostr command-line tool that makes the key (tested with v0.22.3). */
const NAK = "https://github.com/fiatjaf/nak";

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
export const welcome = `<div class="j1-win id-wel">
  <div class="id-bees" aria-hidden="true">${BEES}</div>
  <div class="b1-lights" aria-hidden="true"><i></i><i></i><i></i></div>
  <svg class="id-word" viewBox="0 0 300 96" aria-hidden="true"><text x="150" y="74" text-anchor="middle" filter="url(#buzz-grain)">Buzz</text></svg>
  <p class="id-tag">Your people, your agents, one place.</p>
  <div class="id-wel-btns"><span class="j1-go">Create account</span><span class="id-glass">Sign in</span><span class="id-ghost hot">Other options</span></div>
  ${CURSOR}
</div>`;

/** Connect to your community: the found address, then Sign in with Builderlab or Use an existing key. */
export const connect = onboardingStep(`<h4 class="j1-h">Connect to your community</h4>
  <p class="j1-sub">Sign in to your Builderlab account with email, or use an existing private key to continue.</p>
  <p class="id-host"><span>B</span>buzz.yourteam.org</p>
  <div class="id-pick"><span class="j1-go">Sign in with Builderlab</span><span class="j1-btn hot">Use an existing key</span></div>
  <div class="j1-acts">${BACK}</div>`);

/** Enter your private key: the key pasted, its npub shown under the field, then Continue with this key. */
export const keyImport = onboardingStep(
  `<h4 class="j1-h">Enter your private key</h4>
  <p class="j1-sub">Paste your private key to sign in to Buzz. You can also select or drop a text file with your key.</p>
  <p class="j1-lab">Private key (nsec)</p>
  <div class="id-key"><span class="j1-input">••••••••••••••••••••••••${ti("eye")}</span><span class="j1-btn">Browse</span></div>
  <p class="id-pub">Public identity: <code>${NPUB}</code></p>
  <div class="j1-acts">${BACK}<span class="j1-go hot">Continue with this key</span></div>`,
);

/**
 * nak on the person's own computer: the key goes into a file only they can read, and only the npub prints
 * (tested 2026-11-23 with nak v0.22.3: the file is mode 600, holds the nsec, and a second run won't overwrite it).
 */
const keyScript = (npub = NPUB) => `<div class="id-term">
  <p class="id-term-h"><i></i><i></i><i></i><span>your computer</span></p>
  <pre><span class="p">$</span> brew install nak
<span class="p">$</span> (set -C; umask 077; nak key generate \\
    | nak encode nsec > ~/buzz-identity.key) \\
    &amp;&amp; nak key public < ~/buzz-identity.key \\
    | nak encode npub
<b>${npub}</b></pre>
</div>`;

/**
 * Settings, Identity as Buzz 1.0.5 shows it (captured 2026-11-23): the Buzz ID card in a framed panel with
 * its … button. The front is the profile picture tinted chartreuse, with Buzz ID, then the public key's
 * barcode and npub. The back has the masked private key on a dark band, what the key is, and Remove from
 * device. The private key menu's items (Copy, Reveal) weren't opened in the capture.
 */
const nav = (open: string) => communityNav(open, false);
const identityPage = (copy: "npub" | "nsec") => `<section class="mb-page id-page">
  <h5 class="mb-big">Identity</h5>
  <p class="mb-sub">Your identity is shared across communities.</p>
  <div class="id-wrap">
    <span class="id-more">${ti(copy === "nsec" ? "arrow-left" : "dots")}</span>
    ${
      copy === "npub"
        ? `<div class="id-card"><i class="id-slot"></i>
      <div class="id-photo"><img src="${maya}" alt=""><span class="id-mini"><img src="${maya}" alt=""></span><strong>Buzz ID</strong></div>
      <div class="id-card-b"><p class="id-badge-label">PUBLIC KEY</p><div class="id-barcode" aria-hidden="true"></div>
      <div class="id-badge-pub"><code>${NPUB}</code><span class="id-ic hot" aria-label="Copy Buzz ID">${ti("copy")}</span></div></div>
    </div>`
        : `<div class="id-card back"><i class="id-slot"></i>
      <div class="id-band"><span class="id-nsec hot">nsec ••••••••••${ti("chevron-down")}</span></div>
      <div class="id-key-menu"><b class="hot">Copy</b><span>Reveal</span></div>
      <div class="id-card-b">
        <p class="id-k">Your private key</p>
        <p class="id-t">This key is stored securely on this device.</p>
        <p class="id-t">Save a copy from the private key menu to use this ID on another device. Lose every copy and you lose this ID.</p>
        <p class="id-warn">Anyone with this key can act as you. Never share it.</p>
        <span class="id-rm">Remove from device</span>
      </div>
    </div>`
    }
  </div>
  ${copy === "npub" ? `<div class="id-toast">${ti("check")}Buzz ID copied.</div>` : ""}
</section>`;

/**
 * Settings, Mobile app, whose page is Pair mobile for a key kept off Builderlab, as Buzz 1.0.5 shows it
 * (captured 2026-11-23): its QR code beside Buzz's three steps. The screens after the phone scans (the six
 * digits, then Phone paired) appear only during a live pairing and weren't captured, so the site says that
 * step in words rather than drawing it (owner's call, 2026-11-23).
 */
const PAIR_PAGE = `<section class="mb-page id-pair">
  <h5>Pair mobile</h5>
  <p class="mb-sub">Connect the Buzz mobile app to this community. Pairing is secured with end-to-end encryption and a verification code.</p>
  <div class="id-pair-b">
    <div class="id-pair-qr"><div class="id-qr-box">${QR}<span class="id-qr-logo"><svg viewBox="0 0 466 309" aria-hidden="true"><use href="#bee"/></svg></span></div><span class="mb-btn">Copy pairing code</span></div>
    <ol>
      <li><span>1</span><div><b>Scan QR code</b><p>Open Buzz on your phone and choose Add community to scan the code shown here.</p></div></li>
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


/**
 * The phone's side of pairing, drawn from screenshots of the App Store's Buzz app (2026-11-23): the
 * Messages screen with its community menu, Switch community, Add a community, then either joining at
 * once (a community on its own server) or Builderlab's sign-in, its emailed code and the key backup
 * (a community Block hosts). Names, the email and the npub are placeholders.
 */
const PHONE_STATUS = `<p class="ph-stat"><b>9:41</b><span><i></i><i></i><i></i></span></p>`;
const phoneScreen = (screen: string, cls = "") => `<div class="pr-scene"><div class="ph"><div class="ph-scr${cls}">${PHONE_STATUS}${screen}</div></div></div>`;
const PH_SWAP = `<svg class="tb-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h15M15 5l4 4-4 4M20 15H5M9 11l-4 4 4 4"/></svg>`;
const PH_LOOK = `<svg class="tb-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7a5 5 0 1 0 5 5M3 3l18 18M12 2v1.5M4.9 4.9l1 1M2 12h1.5"/></svg>`;
const phHome = (menu: boolean) =>
  phoneScreen(`<div class="ph-home">
    <p class="ph-h">Messages${menu ? "" : `<span class="ph-tr"><span class="ph-circ">${ti("bell")}</span><span class="ph-circ ph-comm">Y</span></span>`}</p>
    <p class="ph-chips"><b class="on">All</b><b>Solo</b><b>Team</b></p>
    <p class="ph-sec">Solo</p><p class="ph-muted">No chats yet</p>
    <p class="ph-sec">Team</p>
    <p class="ph-grp">Channels${ti("chevron-down")}<span>•••</span></p>
    <p class="ph-row"><i>#</i>general</p><p class="ph-row"><i>#</i>release</p>
    <p class="ph-grp">DMs${ti("chevron-down")}<span>•••</span></p>
    <p class="ph-row"><img src="${ops}" alt="">Helper</p>
    <div class="ph-bar"><span class="ph-circ">${ti("search")}</span><span class="ph-new">${ti("plus")}New</span><span class="ph-circ"><img src="${maya}" alt=""></span></div>
  </div>${
    menu
      ? `<div class="ph-menu"><p class="hot">${PH_SWAP}Switch community</p><hr><p>${ti("robot")}Agents</p><p>${PH_LOOK}Appearance</p><p>${ti("settings")}Settings</p></div>`
      : ""
  }`);
const phTile = (letter: string, name: string, on = false) => `<div class="ph-tile"><span class="ph-av">${letter}${on ? `<em>${ti("check")}</em>` : ""}</span><b>${name}</b></div>`;
const phSwitch = phoneScreen(`<p class="ph-top"><span class="ph-circ">${ti("x")}</span><span class="ph-pill">Edit</span></p>
  <div class="ph-grid">${phTile("Y", "yourteam", true)}${phTile("O", "oss-project")}${phTile("B", "buzz")}<div class="ph-tile hot-tile"><span class="ph-av plus hot">${ti("plus")}</span><b>Add Community</b></div></div>`);
const phAdd = phoneScreen(`<p class="ph-top"><span class="ph-circ">${ti("arrow-left")}</span></p>
  <p class="ph-t">Add a community</p><p class="ph-s">Scan a QR code or enter a community link.</p>
  <div class="ph-foot"><span class="ph-btn dark hot">Scan a QR code</span><span class="ph-btn">Enter a community link</span></div>`);
const phJoining = phoneScreen(`<div class="ph-join"><span class="ph-av big">Y</span><i class="ph-spin"></i></div>`);
/** Builderlab's pages open in a sheet over Buzz, with their address at the top. */
const bl = (host: string, body: string) =>
  phoneScreen(`<div class="ph-web"><p class="ph-web-h"><span class="ph-circ">${ti("x")}</span><b>${host}</b><span class="ph-circ">${ti("layout-sidebar")}</span></p><div class="ph-web-b"><span class="ph-bl">B</span>${body}</div></div>`, " dim");
const phSignIn = bl("login.builderlab.xyz", `<p class="ph-t">Sign in to Builderlab <span>to continue to <svg viewBox="0 0 466 309" aria-hidden="true"><use href="#bee"/></svg> Buzz</span></p>
  <p class="ph-lab">Email</p><span class="ph-in hot">maya@example.com</span>
  <p class="ph-row2"><u>Create account</u><span class="ph-btn small dark">Continue</span></p>`);
const phCode = bl("login.builderlab.xyz", `<p class="ph-t">We've emailed you a verification code.</p>
  <p class="ph-s">Enter the code sent to m***@example.com.</p>
  <p class="ph-lab">Verification code</p><p class="ph-boxes hot">${[..."482913"].map((d) => `<i>${d}</i>`).join("")}</p>
  <p class="ph-s">Didn't receive the code? <b>Resend</b></p>
  <p class="ph-row2"><span></span><span class="ph-btn small dark">Continue</span></p>`);
const phBackup = phoneScreen(`<p class="ph-top"><span class="ph-circ">${ti("arrow-left")}</span></p>
  <p class="ph-t">Back up your secret key?</p>
  <p class="ph-s">Allow Builderlab to link this identity to your account and upload an encrypted copy of your secret key (nsec) to app.builderlab.xyz? Builderlab can decrypt this backup. Anyone signed in to this account can recover the key and use your identity, including on self-hosted relays. Joining requires a backup.</p>
  <p class="ph-acct">Receiving account: maya@example.com</p>
  <div class="ph-foot"><span class="ph-btn dark hot">Back up and continue</span><span class="ph-link">Cancel setup</span><span class="ph-link">Sign out</span></div>`);

const phContinue = bl("app.builderlab.xyz", `<p class="ph-t">Continue to Buzz</p>
  <p class="ph-s">Sign in to Buzz as maya@example.com.</p>
  <p class="ph-row2"><span></span><span class="ph-btn small dark hot">Continue to Buzz</span></p>
  <p class="ph-s ph-gap">Not you? <u>Use a different account</u></p>`);

/** The computer's side: Pair mobile's QR code, with the code check after the scan in words. */
const onComputer = (after: string) => ({
  k: "Open Mobile app in Settings",
  t: `In the Buzz desktop app, open the community you want on your phone. Press ⌘, on a Mac or Ctrl+, on Windows and Linux to open <b>Settings</b>. Then choose <b>Mobile app</b>. The <b>Pair mobile</b> page shows a QR code for your phone to scan. After the scan, check the code. If your phone asks for a code, type the six digits your computer shows. If it shows a code, check that the digits match, then choose <b>Codes match</b> on your computer. ${after} Pair where nobody else can see your screen, because pairing copies your private key to the phone.`,
  frame: settingsModal(nav("Mobile app"), PAIR_PAGE),
});

/** The phone's side, up to the code: the community menu, Switch community, Add a community. */
const P_START = [
  { k: "Open Switch community", t: "In the Buzz app on your phone, tap your community's picture at the top right. Then tap <b>Switch community</b>.", frame: phHome(true) },
  { k: "Tap Add Community", t: "Tap <b>Add Community</b>. On a phone that hasn't joined a community yet, Buzz opens <b>Add a community</b> by itself.", frame: phSwitch },
  { k: "Scan the QR code", t: "Tap <b>Scan a QR code</b> and point the camera at the QR code on your computer. Then check the code. If the phone asks for a code, type the six digits your computer shows. If it shows a code, check that it matches the one on your computer.", frame: phAdd },
];

/** Pairing a phone, from the computer's side or the phone's, for a self-hosted community or a Builderlab one. */
export const pairFlows: Flow[] = [
  {
    id: "computer-own",
    view: "computer",
    label: "Self-hosted community",
    steps: [onComputer("Your computer then sends your identity to the phone, and the phone joins the community by itself.")],
  },
  {
    id: "computer-builderlab",
    view: "computer",
    label: "Builderlab community",
    steps: [onComputer("Your computer then sends your identity to the phone. The phone asks you to sign in to Builderlab before it joins.")],
  },
  {
    id: "phone-own",
    view: "phone",
    label: "Self-hosted community",
    steps: [
      ...P_START,
      { k: "The phone joins", t: "When the codes match, the phone joins the community by itself. There's nothing else to do.", frame: phJoining },
      { k: "Your community opens", t: "The community opens on the phone, with its channels and direct messages.", frame: phHome(false) },
    ],
  },
  {
    id: "phone-builderlab",
    view: "phone",
    label: "Builderlab community",
    steps: [
      ...P_START,
      { k: "Sign in to Builderlab", t: "For a community Block hosts, the phone then asks you to sign in to Builderlab, Block's account service. Enter your account's email and tap <b>Continue</b>.", frame: phSignIn },
      { k: "Enter the emailed code", t: "Type the six-digit code Builderlab emails you and tap <b>Continue</b>.", frame: phCode },
      { k: "Continue to Buzz", t: "Check that the email is yours and tap <b>Continue to Buzz</b>.", frame: phContinue },
      { k: "Back up your secret key", t: "Buzz asks to back up your secret key with Builderlab. A Builderlab community requires this backup, and Builderlab can decrypt it. Tap <b>Back up and continue</b>.", frame: phBackup },
      { k: "The phone joins", t: "The phone joins the community.", frame: phJoining },
      { k: "Your community opens", t: "The community opens on the phone, with its channels and direct messages.", frame: phHome(false) },
    ],
  },
];

const laptop = `<svg viewBox="0 0 120 84" aria-hidden="true"><rect x="16" y="6" width="88" height="58" rx="6"/><path d="M4 74h112l-6 6H10z"/><rect class="id-lockbody" x="49" y="31" width="22" height="17" rx="3"/><path class="id-lockarc" d="M53 31v-5a7 7 0 0 1 14 0v5"/></svg>`;
const phone = `<svg viewBox="0 0 60 96" aria-hidden="true"><rect x="6" y="4" width="48" height="88" rx="9"/><path d="M24 12h12"/><rect class="id-lockbody" x="19" y="44" width="22" height="17" rx="3"/><path class="id-lockarc" d="M23 44v-5a7 7 0 0 1 14 0v5"/></svg>`;
const devices = `<div class="id-devs">
  <div class="id-dev">${laptop}<b>Computer</b><span>Disk encryption on</span><span>Screen lock on</span></div>
  <div class="id-dev">${phone}<b>Phone</b><span>Passcode on</span></div>
</div>`;

export const ADDRESS = `<span class="typed">buzz.yourteam.org</span>`;

export const identityFlows: Flow[] = [
  {
    id: "identity",
    label: "Set up an identity",
    steps: [
      { k: "Make your key", t: `On your own computer, not the server, install <a href="${NAK}">nak</a>, the open-source Nostr command-line tool, with <code>brew install nak</code>. Then run the command below this click-through. It saves your private key in <code>~/buzz-identity.key</code>, a file only you can read, and it shows only your npub.`, frame: keyScript() },
      { k: "Choose Other options", t: "On Buzz's first screen, choose <b>Other options</b>. <b>Create account</b> and <b>Sign in</b> are for a Builderlab account. Builderlab is Block's service.", frame: welcome },
      { k: "Paste your community's address", t: "Paste your community's address into <b>Community address or invite link</b>. If an admin sent you an invite link, paste the link instead. Then choose <b>Continue</b>.", frame: joinCard(ADDRESS, true) },
      { k: "Use an existing key", t: "On the <b>Connect to your community</b> page, choose <b>Use an existing key</b>. <b>Sign in with Builderlab</b> would sign you in through Block's service.", frame: connect },
      { k: "Drop in your key file", t: "Drop the key file on the page, or choose <b>Browse</b> and pick the file. Check that <b>Public identity</b> shows your npub, then choose <b>Continue with this key</b> and <b>Join</b>. Enter your name under <b>Set up your profile</b>. If Buzz says the community needs an invite, nobody has added your npub yet.", frame: keyImport },
      { k: "Copy your private key", t: "Press ⌘, on a Mac or Ctrl+, on Windows and Linux to open <b>Settings</b>. You can also choose your profile picture, then <b>Settings</b>. Under <b>Buzz</b>, choose <b>Identity</b>. On the Buzz ID card, choose <b>More options</b>, the <b>…</b> button. Then choose the masked private key field and choose <b>Copy</b>. Buzz tries to clear it from your clipboard after a minute, so paste it soon.", frame: settingsModal(nav("Identity"), identityPage("nsec")) },
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
  frame: settingsModal(nav("Mobile app"), PAIR_PAGE),
};
export const lostFlows: Flow[] = [
  {
    id: "exposed",
    label: "The key is exposed",
    steps: [
      { k: "Ban the old key now", t: "The owner or a moderator opens <b>Settings</b>, <b>Moderation</b>, <b>Communities</b>, chooses the community and bans the old key from <b>Actions</b>. A ban disconnects the key and keeps it out even with a live invite link. On a private network, Kubernetes or a local test, the owner or an admin bans it with the <code>buzz</code> command line instead.", get frame() { return banFrame(); } },
      { k: "Make a new key", t: `On the new device, make a new key with <a href="${NAK}">nak</a>. Don't use the copy you saved. Whoever has the old device has that key too.`, frame: keyScript(NEW_NPUB) },
      { k: "Get a new invite link", t: "An admin makes you a new link on the <b>Invite</b> tab in <b>Membership</b>. They set it to 1 use and to expire after 1 day, then send it to you. Or whoever runs the server can add the npub that nak showed you. The Buzz app can't add an npub itself.", frame: invite("copy", "1 day", "1") },
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
