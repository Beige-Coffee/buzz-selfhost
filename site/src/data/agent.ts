/**
 * The agent path, per track: what to have ready, the prompt to paste, and what to expect.
 * "What to expect" is not a transcript: an agent's own screen looks different. It lists, in order, what the
 * agent does on its own and where it stops for the reader, as the skill's reference files
 * (skills/self-host-buzz/references) tell the agent to: compose.md, kubernetes.md, railway.md.
 * Text may contain {{KEYS}} from values.ts and simple inline HTML.
 */
import type { Track } from "../lib/values";

export type ExpectIcon = "ask" | "agent" | "key" | "join" | "phone" | "dns" | "clock" | "lock";
export interface Expect {
  who: "agent" | "you";
  icon: ExpectIcon;
  t: string;
  /** shown on the reader's own rows; the agent's rows show their title only */
  d: string;
  /** labelled "It asks you" rather than "You" */
  ask?: boolean;
  /** a step that doesn't always happen */
  note?: "optional" | "if needed";
}

export interface AgentTrack {
  /** what the reader does before asking, a bold name first; `warn` and `more` fold out under it */
  ready: { t: string; warn?: { label: string; t: string }; more?: { label: string; t: string } }[];
  prompt: string;
  expect: Expect[];
}

type Ready = AgentTrack["ready"][number];
// Buzz 1.0 publishes only prereleases, so its /releases/latest is a 404
const DESKTOP = "https://github.com/block/buzz-app/releases";
const ALIASES = "https://github.com/block/buzz/pull/5410";

// the skill's scripts run where the agent runs: python3, bash and curl (SKILL.md compatibility)
const AGENT: Ready = {
  t: "<b>A coding agent</b> on your Mac or Linux computer: Claude Code, Codex or Goose.",
  more: {
    label: "What it needs",
    t: "The skill runs scripts on your computer with <code>python3</code>, <code>bash</code> and <code>curl</code>. Most Linux systems have all three; install any that's missing. On a Mac, if <code>python3</code> asks you to install developer tools, run <code>xcode-select --install</code> first. Use a capable model: small, fast models tend to stop after every step.",
  },
};
// Buzz 1.0 shows the npub in Settings, Identity (before any community, only ⌘, opens Settings); Buzz 0.X on its
// Join a community screen. Buzz 1.0 doesn't back the private key up.
const NPUB: Ready = {
  t: "<b>Buzz and your npub</b>, your public ID in Buzz. It starts with <code>npub1</code>.",
  more: {
    label: "How to get them",
    t: `Download Buzz for a Mac with Apple Silicon, Windows or Linux from <a href="${DESKTOP}">Block's releases page</a>: the newest release is at the top. Open it and choose <b>Create a new identity</b>, or keep one you already have. Press ⌘, (Ctrl+, on Windows and Linux) to open <b>Settings</b>, then choose <b>Identity</b> and copy <b>Nostr address (npub)</b>. Before you've joined a community, that shortcut is the only way into Settings. The relay makes this npub the community's owner, so copy it from the Buzz you'll keep using. On the same page, choose <b>Copy private key</b> and save it in your password manager: Buzz doesn't back it up, and you need it to use this identity on another computer.`,
  },
};
// a first connection asks to trust the fingerprint, which an agent's shell can't answer (SKILL.md, SSH to a server)
const SSH = (machine: string, address: string): Ready => ({
  t: `<b>SSH access</b> to the ${machine} with a key, as root or a user with passwordless <code>sudo</code>.`,
  more: {
    label: "Connect once yourself first",
    t: `Before you ask your agent, run <code>ssh &lt;user&gt;@&lt;${address}&gt; true</code> in your own terminal. The first time, SSH asks whether to trust the ${machine}'s fingerprint: type <b>yes</b>. Your agent can't answer that question, so its first connection would fail. If the command also asks for a passphrase, or needs a key file (AWS gives you a <code>.pem</code> file), run <code>chmod 400 &lt;key file&gt;</code> and <code>ssh-add &lt;key file&gt;</code> first, so your agent can use the key without asking.`,
  },
});
/** The address is the community's for good (block/buzz#4952): say so where the reader picks it, and why. */
const FOREVER = (what: string, extra = ""): { label: string; t: string } => ({
  label: `The ${what} can't be changed later`,
  t: `Buzz stores your community under this exact address. If you switch to a different ${what} later, the relay starts a new, empty community there, and your messages, channels and members stay behind at the old address.${extra ? ` ${extra}` : ""} An open pull request to Buzz, <a href="${ALIASES}">block/buzz#5410</a>, would let a community answer on a second address, but it isn't merged. Until it is, pick one you're happy to keep.`,
});
/** The A record: where it points, and what breaks it (Cloudflare's proxy, a stray AAAA record, a cached old address). */
const DNS = (target: string, when = "Add the record before you ask your agent, and before you open the address anywhere") => ({
  label: "How to add the A record",
  t: `Open the DNS settings wherever your domain is managed: your registrar, Cloudflare or similar. Add an A record whose name is the part before your domain (<code>buzz</code> for <code>buzz.example.org</code>) and whose value is ${target}. On Cloudflare, set Proxy status to <b>DNS only</b>. If the name has an AAAA record that isn't the server's, delete it. ${when}: if the name pointed somewhere before, such as a wildcard record or a parked page, your computer can keep the old address for 30 minutes or more. No domain yet? Buy one from any registrar, or use a subdomain of a domain you own.`,
});
/** The clouds people name, and each one's catch. A private server opens no ports, so it skips those. */
const CLOUDS = (open: boolean) => ({
  label: "Which server to rent",
  t: `<dl class="ag-clouds">
    <dt>DigitalOcean</dt><dd>A Basic Droplet with 4 GB of RAM.${open ? " Its IP address doesn't change, and nothing blocks ports 80 and 443 unless you add a Cloud Firewall." : ""}</dd>
    <dt>Hetzner</dt><dd>A CX or CPX server (x86), not CAX (ARM), with 4 GB of RAM. Keep its IPv4 address when you create it: GitHub, where the install downloads from, has no IPv6.</dd>
    <dt>AWS</dt><dd>An x86 instance with 4 GB of RAM, such as <code>t3.medium</code>, not Graviton (<code>t4g</code>). Set its storage to 20 GB; the default is 8.${open ? " In its security group, allow HTTP and HTTPS. Attach an Elastic IP, or the address changes whenever the instance stops." : ""} You log in as <code>ubuntu</code>.</dd>
    <dt>Google Cloud</dt><dd>An x86 machine with 4 GB of RAM, such as <code>e2-medium</code>. Make its boot disk 20 GB; the default is 10.${open ? " Tick Allow HTTP traffic and Allow HTTPS traffic, and reserve a static external IP address." : ""}</dd>
  </dl>`,
});

// compose.md 2P and kubernetes.md P1: the reader does these in the Tailscale admin console
const PRIVATE_READY: Ready[] = [
  { t: "<b>HTTPS on in Tailscale</b>: in the admin console, <b>DNS</b>, then <b>Enable HTTPS</b>. It lists the relay's name in public certificate logs." },
  {
    t: "<b>A Tailscale auth key</b> in a file only you can read.",
    more: {
      label: "How to make it",
      t: "In the Tailscale admin console, open <b>Settings</b>, <b>Keys</b>, and create an auth key with <b>Ephemeral</b> off, since an ephemeral machine is removed from your network when it goes offline, and <b>Pre-approved</b> on if your tailnet requires device approval. A tag from your access policy on the key keeps the server from dropping off when its key expires. Save it to a file and run <code>chmod 600 &lt;file&gt;</code>.",
    },
  },
];
const TS_HERE: Ready = { t: "<b>Tailscale on this computer</b>, signed in to the same tailnet. Your agent checks the relay from here, and you join from here." };
const TS_NAME: Ready = {
  t: "<b>The relay's Tailscale name</b>, like <code>buzz.your-tailnet.ts.net</code>.",
  warn: FOREVER("name", "Renaming the machine or your tailnet later changes it too, and a private community can't add a public address later."),
};

// compose.md step 6, kubernetes.md step 5: the reader prints the key in their own terminal, never in the conversation
const KEY = (cmd: string, where = ""): Expect => ({
  who: "you",
  icon: "key",
  t: "Save the relay key",
  d: `Run the <code>${cmd}</code> command it gives you in your own terminal${where}, and save the key in your password manager. It's your community's permanent identity.`,
});
const SSH_KEY = KEY("ssh");
const KUBE_KEY = KEY("kubectl", ", with the same <code>KUBECONFIG</code>");
const INSTALL: Expect = {
  who: "agent",
  icon: "agent",
  t: "Installs Docker and Buzz",
  d: "Block's Compose bundle. It writes the passwords and the relay key on the server without printing them.",
};
const JOIN = (d: string): Expect => ({ who: "you", icon: "join", t: "Join from Buzz", d });
/** Buzz 1.0's first screen joins the first community; after that, the community button's Join a community does. */
const JOIN_IN = (what: string) => `Paste ${what} into <b>Join a community</b>: on Buzz's first screen, or from the community button at the top right.`;
const JOIN_AT = (url: string) => JOIN(JOIN_IN(`<code>${url}</code>`));
const TS_JOIN = JOIN(`With Tailscale on, paste <code>{{RELAY_URL}}</code> into <b>Join a community</b>: on Buzz's first screen, or from the community button at the top right.`);
const PHONE = (d: string): Expect => ({ who: "you", icon: "phone", t: "Pair your phone", d, note: "optional" });
// Buzz 1.0's Pair mobile asks the phone for a six-digit code; notifications need the phone app 0.25 or later
const PAIR =
  "On your computer: <b>Settings</b>, <b>Pair mobile</b>. On your phone: <b>Add community</b>, scan the code, and type the six digits. An iPhone with Buzz 0.25 or later then gets notifications for direct messages and mentions, through Block's gateway, which never sees a message. Android gets none yet.";
const QUICKSTART = "Its quickstart profile: Postgres, Redis and file storage inside the cluster.";
/** kubernetes.md: the quickstart is the chart's evaluation profile, and GitOps tools rotate its generated relay key. */
const QUICKSTART_NOTE = {
  label: "Before a team relies on it",
  t: "Your agent installs the chart's quickstart profile, which Block calls an evaluation profile: Postgres, Redis and file storage run in the cluster, one of each. For a team, back it up, or use managed Postgres, Redis and S3 with the chart's production profile. Don't manage the release with Argo CD or Flux: they rotate the generated relay key, which changes your community's identity.",
};

// compose.md, server mode: confirm the URL and ports (SKILL.md rules 2 and 4), steps 1 to 5, the key (6), then 7 to 11
const SERVER: Expect[] = [
  { who: "you", ask: true, icon: "ask", t: "Confirm the domain", d: "It asks you to confirm <code>{{DOMAIN}}</code>, which can't be changed later, and that the server takes connections on ports 80 and 443 from the internet." },
  INSTALL,
  SSH_KEY,
  { who: "agent", icon: "agent", t: "Starts the relay and checks it", d: "It checks HTTPS, joining and chats, notifications, the closed ports, and that you're the owner." },
  JOIN_AT("{{RELAY_URL}}"),
  PHONE(PAIR),
];

// compose.md, private mode: join the tailnet (2P), key expiry only without a tag, confirm the name before step 8
const PRIVATE: Expect[] = [
  { who: "agent", icon: "agent", t: "Joins your Tailscale network", d: "It signs the server in with the auth key from your file, without printing the key." },
  {
    who: "you",
    icon: "clock",
    t: "Turn off key expiry",
    d: "Only if your auth key has no tag: in the admin console, the server's menu, <b>Disable key expiry</b>. Otherwise it drops off your network when the key expires.",
    note: "if needed",
  },
  { who: "you", ask: true, icon: "ask", t: "Confirm the name", d: "It asks you to confirm <code>{{DOMAIN}}</code>, which can't be changed later." },
  INSTALL,
  SSH_KEY,
  { who: "agent", icon: "agent", t: "Starts the relay and checks it", d: "It checks HTTPS through Tailscale, joining and chats, notifications, that no ports are open to the internet, and that you're the owner." },
  TS_JOIN,
  PHONE(`${PAIR} Your phone needs Tailscale on.`),
];

export const AGENT_TRACKS: Record<Track, AgentTrack> = {
  vps: {
    ready: [
      { t: "<b>A server</b>: Ubuntu 24.04, x86, 4 GB of RAM, 20 GB of disk, ports 80 and 443 open.", more: CLOUDS(true) },
      SSH("server", "server IP"),
      { t: "<b>A domain</b> with an A record pointing at the server.", warn: FOREVER("domain"), more: DNS("the server's public IPv4 address") },
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my server, public on the internet. It's a fresh Ubuntu 24.04 VPS; SSH in as <user>@<server IP>. Domain: {{DOMAIN}}. Owner: {{OWNER_NPUB}}, copied from Buzz's Settings, Identity.",
    expect: SERVER,
  },
  "own-public": {
    ready: [
      { t: "<b>A Linux machine you own</b>: Ubuntu 24.04, x86, 4 GB of RAM, 20 GB of disk, a fixed address on your home network." },
      SSH("machine", "machine address"),
      {
        t: "<b>Port forwarding</b>: your router sends ports 80 and 443 to the machine.",
        more: {
          label: "If it doesn't work",
          t: "Many home internet providers share one public address among customers (CGNAT), and then no port forwarding reaches you. Ask your provider for a public IPv4 address, or use a VPS or a private network instead.",
        },
      },
      { t: "<b>A domain</b> with an A record pointing at your home's public IP address.", warn: FOREVER("domain"), more: DNS("your home's public IPv4 address") },
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my own machine, public on the internet. It runs Ubuntu 24.04, and ports 80 and 443 are forwarded to it; SSH in as <user>@<machine address>. Domain: {{DOMAIN}}. Owner: {{OWNER_NPUB}}, copied from Buzz's Settings, Identity.",
    expect: SERVER,
  },
  practice: {
    ready: [{ t: "<b>Docker Desktop</b>, or Docker on Linux, running, with nothing else using ports 80 and 443." }, NPUB, AGENT],
    prompt: "Use the self-host-buzz skill to set up a local test Buzz relay on this machine. Owner: {{OWNER_NPUB}}, copied from Buzz's Settings, Identity.",
    // compose.md step 1: old buzz-prod volumes are removed only after asking; local tests skip the key copy.
    // Step 12: Buzz 1.0 joins only https and wss, so the reader trusts Caddy's local authority, with their password.
    expect: [
      {
        who: "you",
        ask: true,
        icon: "ask",
        t: "Remove an earlier test's data",
        d: "If an earlier local test left Docker volumes starting with <code>buzz-prod</code>, it asks before deleting them.",
        note: "if needed",
      },
      { who: "agent", icon: "agent", t: "Writes the keys and starts the relay", d: "At <code>https://localhost</code>, through Caddy, the web server in Buzz's bundle. Phones can't pair with a local test." },
      {
        who: "you",
        icon: "lock",
        t: "Trust the local certificate",
        d: "Run the <code>sudo</code> command it gives you in your own terminal: Buzz joins only addresses your computer trusts. Your computer then accepts any certificate made with this test's authority, whose key stays in Docker on this computer, until you remove it; your agent gives you the commands.",
      },
      JOIN_AT("wss://localhost"),
    ],
  },
  "vps-private": {
    ready: [
      { t: "<b>A server</b>: Ubuntu 24.04, x86, 4 GB of RAM, 20 GB of disk. Nothing open to the internet but SSH.", more: CLOUDS(false) },
      SSH("server", "server IP"),
      ...PRIVATE_READY,
      TS_HERE,
      TS_NAME,
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my server, reachable only on our Tailscale network. It's a fresh Ubuntu 24.04 VPS; SSH in as <user>@<server IP>. Tailscale name: {{DOMAIN}}. A Tailscale auth key is in <key file>. Owner: {{OWNER_NPUB}}, copied from Buzz's Settings, Identity.",
    expect: PRIVATE,
  },
  "own-private": {
    ready: [
      { t: "<b>A Linux machine you own</b>: Ubuntu 24.04, x86, 4 GB of RAM, 20 GB of disk." },
      SSH("machine", "machine address"),
      ...PRIVATE_READY,
      TS_HERE,
      TS_NAME,
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my own machine, reachable only on our Tailscale network. It runs Ubuntu 24.04; SSH in as <user>@<machine address>. Tailscale name: {{DOMAIN}}. A Tailscale auth key is in <key file>. Owner: {{OWNER_NPUB}}, copied from Buzz's Settings, Identity.",
    expect: PRIVATE,
  },
  // kubernetes.md: confirm the URL (SKILL.md rule 4), step 1 (costs), 2 (DNS), 3 and 4 (install), 5 (the key), 6 (checks)
  k8s: {
    ready: [
      {
        t: "<b>A Kubernetes cluster</b> with x86 nodes, and <code>kubectl</code> and <code>helm</code> on this computer connected to it, with the same <code>KUBECONFIG</code> for every command.",
        more: QUICKSTART_NOTE,
      },
      { t: "<b>An ingress controller and cert-manager.</b> If either is missing, your agent can install Traefik, cert-manager or both, once you approve a load balancer's cost." },
      {
        t: "<b>A domain.</b> Your agent gives you the address to point it at.",
        warn: FOREVER("domain"),
        more: DNS("the load balancer address your agent gives you (on AWS, the load balancer has a name instead: add a CNAME record to it)", "Add it when your agent gives you the address, and don't open the address anywhere before that"),
      },
      NPUB,
      AGENT,
    ],
    prompt: "Use the self-host-buzz skill to install Buzz on our Kubernetes cluster with Block's Helm chart, public on the internet. Domain: {{DOMAIN}}. Keep the values file in <folder>. Owner: {{OWNER_NPUB}}, copied from Buzz's Settings, Identity.",
    expect: [
      { who: "you", ask: true, icon: "ask", t: "Confirm the domain", d: "It asks you to confirm <code>{{DOMAIN}}</code>, which can't be changed later." },
      { who: "you", ask: true, icon: "ask", t: "Approve the costs", d: "Four storage volumes, and a load balancer if it installs Traefik and cert-manager." },
      { who: "you", icon: "dns", t: "Point your domain at the load balancer", d: "An A record for <code>{{DOMAIN}}</code> to the address it gives you; on AWS, a CNAME record to its name." },
      { who: "agent", icon: "agent", t: "Installs Buzz with Block's Helm chart", d: QUICKSTART },
      KUBE_KEY,
      { who: "agent", icon: "agent", t: "Checks it", d: "It checks the HTTPS certificate, and that you're the owner." },
      JOIN_AT("{{RELAY_URL}}"),
      PHONE(PAIR),
    ],
  },
  // kubernetes.md, private network: P2 (operator), P3 (the name, confirmed), P4 (install), the key, checks
  "k8s-private": {
    ready: [
      {
        t: "<b>A Kubernetes cluster</b> with x86 nodes, and <code>kubectl</code> and <code>helm</code> on this computer connected to it, with the same <code>KUBECONFIG</code> for every command. No ingress or load balancer needed.",
        more: QUICKSTART_NOTE,
      },
      {
        t: "<b>Tailscale, prepared</b>: HTTPS on, two tags in the access policy, and an OAuth client whose ID and secret are in two files only you can read.",
        more: {
          label: "What to set up",
          t: "In the Tailscale admin console: <b>DNS</b>, <b>Enable HTTPS</b>, which lists the relay's name in public certificate logs. In the access policy's <code>tagOwners</code>: <code>tag:k8s-operator</code> owned by <code>autogroup:admin</code>, and <code>tag:k8s</code> owned by <code>tag:k8s-operator</code>; unless your policy allows everything, also a grant from <code>autogroup:member</code> to <code>tag:k8s</code> on <code>tcp:443</code>. Then an OAuth client with Write on Services, Devices and Auth Keys, tagged <code>tag:k8s-operator</code>. Save its ID and its secret in two files only you can read, with no newline at the end, which would break the sign-in: <code>printf '%s' '&lt;value&gt;' &gt; &lt;file&gt;</code>.",
        },
      },
      { t: "<b>Tailscale on this computer</b>, on the same tailnet and using Tailscale's DNS. Your agent checks the relay from here, and you join from here." },
      TS_NAME,
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to install Buzz on our Kubernetes cluster, reachable only on our Tailscale network. Name: {{DOMAIN}}. The OAuth client's ID and secret are in <ID file> and <secret file>. Keep the values file in <folder>. Owner: {{OWNER_NPUB}}, copied from Buzz's Settings, Identity.",
    expect: [
      { who: "agent", icon: "agent", t: "Sets up Tailscale's Kubernetes operator", d: "With your OAuth client, without printing its secret." },
      { who: "you", ask: true, icon: "ask", t: "Confirm the name", d: "It asks you to confirm <code>wss://{{DOMAIN}}</code>, which can't be changed later; renaming your tailnet would change it too." },
      { who: "you", ask: true, icon: "ask", t: "Approve the costs", d: "The quickstart profile's four storage volumes, and a Tailscale seat for each member on paid plans." },
      { who: "agent", icon: "agent", t: "Installs Buzz with Block's Helm chart", d: QUICKSTART },
      KUBE_KEY,
      { who: "agent", icon: "agent", t: "Checks it", d: "It checks that no ports are open to the internet, and that you're the owner." },
      TS_JOIN,
    ],
  },
  // railway.md: step 1 (name), 2 (deploy, CLI or the template page), 3 (the key), 4 (your domain), 5 (image), 7 (notifications), checks
  railway: {
    ready: [
      // railway.md: the template adds three services and a bucket; phone pairing (step 6) one more service
      { t: "<b>A Railway account</b> on a plan with room for four services and a storage bucket." },
      { t: "<b>The Railway CLI</b>, installed and logged in (<code>railway login</code>). Your agent runs every step after the deploy with it." },
      {
        t: "<b>Optional: your own domain.</b> Without one, the address is the <code>*.up.railway.app</code> name Railway gives you.",
        warn: FOREVER("address"),
      },
      NPUB,
      AGENT,
    ],
    prompt: "Use the self-host-buzz skill to set up Buzz on Railway with Block's template. Owner: {{OWNER_NPUB}}, copied from Buzz's Settings, Identity.",
    expect: [
      { who: "you", ask: true, icon: "ask", t: "Choose the address", d: "Railway's <code>*.up.railway.app</code> name, or your own domain. It can't be changed once anyone joins." },
      {
        who: "you",
        ask: true,
        icon: "ask",
        t: "Approve the deploy",
        d: "It asks before creating the project, which Railway bills for. Or you deploy from Railway's template page with the owner key it gives you, then run <code>railway link</code> in a new folder and pick the project.",
      },
      {
        who: "you",
        icon: "key",
        t: "Save the relay key",
        d: "In Railway, the relay service, <b>Variables</b>: copy <code>BUZZ_RELAY_PRIVATE_KEY</code> into your password manager. It's your community's permanent identity.",
      },
      {
        who: "you",
        icon: "dns",
        t: "Add your domain",
        d: "Only with your own domain: the relay service's <b>Settings</b>, <b>Networking</b>, then the CNAME record Railway shows.",
        note: "if needed",
      },
      {
        who: "agent",
        icon: "agent",
        t: "Updates the image and checks it",
        d: "It moves the relay off the template's July image, on which anyone with a file's link can open it and Buzz can't start chats, then adds phone pairing and notifications.",
      },
      {
        who: "you",
        icon: "phone",
        t: "Set the pairing service's start command",
        d: "In Railway, open the <b>buzz-pair</b> service, <b>Settings</b>, <b>Deploy</b>, and set Custom Start Command to <code>/usr/local/bin/buzz-pair-relay</code>.",
      },
      JOIN(JOIN_IN("the address your agent gives you")),
      PHONE(PAIR),
    ],
  },
};

/* ── a running relay: people, backups, restore, upgrades ── */
/*
 * Each prompt starts with which relay and how the agent reaches it, so it works in a new
 * conversation, then names the skill and the task. "What happens" follows operations.md, per setup.
 * <name> is a blank the reader fills in (lib/blanks.ts); {{DOMAIN}} comes from the Running on box.
 */
export type OpTask = "people" | "backup" | "restore" | "upgrade";
export const OP_ORDER: OpTask[] = ["people", "backup", "restore", "upgrade"];
export const OP_TASKS: Record<OpTask, { name: string; sub: string; ask: string }> = {
  people: { name: "Add people", sub: "In Buzz's settings", ask: "add <their npub> as a member." },
  backup: { name: "Back up", sub: "Commands you run", ask: "back it up." },
  restore: { name: "Restore", sub: "Commands you run", ask: "restore it from its backup." },
  upgrade: { name: "Upgrade", sub: "With your agent", ask: "back it up, then upgrade it to the newest image." },
};

const SSH_VPS = "My Buzz relay is at {{DOMAIN}}. It's a VPS; SSH in as <user>@<server IP>.";
const SSH_OWN = "My Buzz relay is at {{DOMAIN}}. It runs on my own machine; SSH in as <user>@<machine address>.";
const KUBE = "My Buzz relay is at {{DOMAIN}}. It runs on our Kubernetes cluster; the values file is in <folder>.";
/** The start of every operations prompt: which relay, and how the agent reaches it. */
export const OP_WHERE: Record<Track, string> = {
  vps: SSH_VPS,
  "vps-private": SSH_VPS,
  "own-public": SSH_OWN,
  "own-private": SSH_OWN,
  practice: "My Buzz relay is a local test on this machine.",
  // every railway command acts on the project linked to the folder it runs in (railway.md)
  railway: "My Buzz relay runs on Railway; its project is linked in <folder>.",
  k8s: KUBE,
  "k8s-private": KUBE,
};

/** One row of "What happens": the agent on its own (gray), or a stop for the reader (chartreuse). */
export interface OpStep {
  who: "agent" | "you";
  icon: ExpectIcon;
  t: string;
}
export interface OpDetail {
  why: string;
  /** What happens, for the task your agent does: upgrades */
  steps?: OpStep[];
  /** the skill has no steps for it on this setup: no prompt, only the why */
  manual?: boolean;
}
export type OpSetup = "compose" | "railway" | "k8s";
export const opSetup = (t: Track): OpSetup => (t === "railway" ? "railway" : t === "k8s" || t === "k8s-private" ? "k8s" : "compose");

const PEOPLE_WHY = "The owner and admins add people in Buzz itself, by npub or with an invite link.";
const UPGRADE_WHY = "Back up first: the relay changes its database when it starts on a new image, so going back to the old one means restoring the backup.";
const agent = (t: string): OpStep => ({ who: "agent", icon: "agent", t });
const asks = (t: string): OpStep => ({ who: "you", icon: "ask", t });
const PEOPLE: OpDetail = { why: PEOPLE_WHY };

/**
 * Backing up and restoring, as numbered steps for a person to run. `code` picks a command block from
 * the skill's own step (operations.md), so the commands still come from the skill.
 */
export interface FlowStep {
  t: string;
  d: string;
  code?: number;
}
const CHECK_BACK = "The relay check passes, and your messages, files and members are back.";
export const OP_FLOWS: Record<OpSetup, Partial<Record<"backup" | "restore", FlowStep[]>>> = {
  compose: {
    backup: [
      { t: "Run it where Buzz runs", d: "From <code>buzz/deploy/compose</code>. Members lose the connection for about half a minute.", code: 0 },
      { t: "Check it", d: "<code>ls -la ~/buzz-backup</code> shows four files, none of them empty, and Buzz reconnects." },
      {
        t: "Keep it safe",
        d: "It holds every secret. Encrypt it, for example with <code>gpg --symmetric</code>, keep a copy off the server, and keep the relay key where two people can open it.",
      },
    ],
    restore: [
      {
        t: "Clear the way",
        d: "On this server, stop Buzz and delete the data the backup replaces; if you upgraded since the backup, first move the bundle back to the backup's version. On a new server, skip this: install Docker and get the bundle at the backup's version, with its edits, as the setup does, without starting Buzz.",
        code: 0,
      },
      { t: "Put the backup back", d: "From <code>buzz/deploy/compose</code>, with the backup in <code>~/buzz-backup</code>.", code: 1 },
      { t: "Check it", d: CHECK_BACK },
    ],
  },
  railway: {
    backup: [
      { t: "Run it on this computer", d: "In the folder linked to the Railway project. It needs <code>pg_dump</code> 18 and the AWS CLI.", code: 0 },
      { t: "Check it", d: "<code>buzz.dump</code> and the <code>buzz-bucket</code> folder are here, and neither is empty." },
      {
        t: "Keep it safe",
        d: "Encrypt the copies and keep one off this computer. The relay key is in Railway's variables: keep it where two people can open it.",
      },
    ],
    restore: [
      { t: "Put the backup back", d: "In the folder with <code>buzz.dump</code> and <code>buzz-bucket</code>. It stops the relay, empties the database, restores it and the bucket, then redeploys.", code: 0 },
      { t: "Check it", d: CHECK_BACK },
    ],
  },
  k8s: {
    backup: [
      { t: "Run it", d: "With <code>kubectl</code> connected to the cluster, in a folder only you can read. The relay keeps running.", code: 0 },
      { t: "Check it", d: "Four files, none of them empty." },
      { t: "Keep it safe", d: "The Secret file holds the relay key. Encrypt the copies, keep one off this computer, and keep the relay key where two people can open it." },
    ],
  },
};

export const OP_DETAILS: Record<OpSetup, Record<OpTask, OpDetail>> = {
  compose: {
    people: PEOPLE,
    backup: {
      why: "Saves the database, uploaded files, git repositories and the <code>.env</code> file, with the passwords and the relay key, into one folder.",
    },
    restore: {
      why: "Puts a backup back, on this server or a new one. It replaces the relay's current data.",
    },
    upgrade: {
      why: UPGRADE_WHY,
      steps: [
        asks("Asks before the backup stops the relay"),
        agent("Moves the relay to the newest image, about 10 seconds offline"),
        agent("Turns on phone notifications, if the relay predates them"),
        agent("Checks the members are still there and the relay answers"),
      ],
    },
  },
  railway: {
    people: PEOPLE,
    backup: {
      why: "Saves the database and the file bucket to this computer. The bucket holds the uploaded files and the git repositories.",
    },
    restore: {
      why: "Puts the backup on this computer back into Railway, and replaces the relay's current data.",
    },
    upgrade: {
      why: UPGRADE_WHY,
      steps: [agent("Backs up the database and the bucket first"), agent("Points the relay, and phone pairing if you set it up, at the new image")],
    },
  },
  k8s: {
    people: PEOPLE,
    backup: {
      why: "With the quickstart profile, saves the database, the file bucket, the git volume and the relay's Secret, which holds the relay key. In production, use your managed database's and bucket's own backups.",
    },
    restore: {
      why: "Restore the four files the backup saves with your own tools: the database dump, the bucket, the git volume and the relay's Secret.",
      manual: true,
    },
    upgrade: {
      why: UPGRADE_WHY,
      steps: [asks("Asks before the backup"), agent("Sets the new image tag in the values file"), agent("Upgrades with Helm and waits until the relay is ready")],
    },
  },
};
