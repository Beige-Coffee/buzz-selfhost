/**
 * The agent path, per track: what to have ready, the prompt to paste, and what to expect.
 * "What to expect" is not a transcript: an agent's own screen looks different. It lists, in order, what the
 * agent does on its own and where it stops for the reader, as the skill's reference files
 * (skills/self-host-buzz/references) tell the agent to: compose.md, kubernetes.md, railway.md.
 * Text may contain {{KEYS}} from values.ts and simple inline HTML.
 */
import type { Track } from "../lib/values";

export type ExpectIcon = "ask" | "agent" | "key" | "join" | "phone" | "dns" | "clock";
export interface Expect {
  who: "agent" | "you";
  icon: ExpectIcon;
  t: string;
  d: string;
  /** labelled "It asks you" rather than "You" */
  ask?: boolean;
  /** a step that doesn't always happen */
  note?: "optional" | "if needed";
}

export interface AgentTrack {
  /** what the reader does before asking; `goto` opens that step in the step-by-step view; `more` folds out under it */
  ready: { t: string; goto?: string; more?: { label: string; t: string } }[];
  prompt: string;
  expect: Expect[];
}

type Ready = AgentTrack["ready"][number];
const DESKTOP = "https://github.com/block/buzz/releases/latest";

// the skill's scripts run where the agent runs: python3, bash and curl (SKILL.md compatibility)
const AGENT: Ready = {
  t: "An agent that runs commands on a Mac or Linux computer, such as Claude Code, Codex or Goose.",
  more: {
    label: "What it needs there",
    t: "<code>python3</code>, <code>bash</code> and <code>curl</code>, which Linux has. On a Mac, if <code>python3</code> asks for developer tools, install them with <code>xcode-select --install</code>. Pick a capable model: small, fast ones tend to stop after every step.",
  },
};
// Buzz Desktop shows the npub on its Join a community screen, under "Joining a private community?", and in Settings.
const NPUB: Ready = {
  t: `Buzz Desktop, and your npub from it in the npub field on this page. <a class="ag-get" href="${DESKTOP}">Get Buzz Desktop ↗</a>`,
  more: {
    label: "Where to find it",
    t: "Buzz Desktop is on Block's releases page, for Mac, Linux and Windows. Open it, choose <b>Join a community</b>, and copy your npub from <b>Joining a private community?</b> It starts with <code>npub1</code>. It makes you the community's owner, which can't be changed later, so copy it from the Buzz Desktop you'll use.",
  },
};
// a first connection asks to trust the server's fingerprint, which an agent's shell can't answer
const SSH = (address: string): Ready => ({
  t: "SSH access with a key, as root or a user whose sudo doesn't ask for a password.",
  more: {
    label: "Connect once yourself first",
    t: `Run <code>ssh &lt;user&gt;@&lt;${address}&gt;</code> in your own terminal and answer <b>yes</b> when it asks about the server's fingerprint. Your agent can't answer that question. If the command needs anything else from you, like a passphrase or a key file (AWS gives you a <code>.pem</code>), add the key to your SSH agent first: <code>ssh-add &lt;key file&gt;</code>.`,
  },
});
/** The A record, where it points, and what breaks it: Cloudflare's proxy and a stray AAAA record. */
const DNS = (target: string) => ({
  label: "Adding it",
  t: `Where your domain's DNS is managed, add an A record for <code>{{DOMAIN}}</code> with ${target}. On Cloudflare, set it to <b>DNS only</b>, not Proxied. If the name has an AAAA record, delete it. New records usually work within minutes. No domain yet? Buy one from any registrar, or use a subdomain of one you have.`,
});
/** The clouds people name, and each one's catch. A private server opens no ports, so it skips those. */
const CLOUDS = (open: boolean) => ({
  label: "On AWS, Google Cloud, DigitalOcean or Hetzner",
  t: `<dl class="ag-clouds">
    <dt>DigitalOcean</dt><dd>A Basic Droplet with 4 GB.${open ? " Its IP stays fixed, and nothing blocks 80 and 443 unless you add a Cloud Firewall." : ""}</dd>
    <dt>Hetzner</dt><dd>A CX or CPX server, which is x86, not CAX, which is ARM. Keep its IPv4 address: GitHub, where the install comes from, has no IPv6.</dd>
    <dt>AWS</dt><dd>An x86 instance with 4 GB, such as <code>t3.medium</code>, not Graviton (<code>t4g</code>).${open ? " Allow HTTP and HTTPS in its security group, and attach an Elastic IP, or the address changes when the instance stops." : ""} You log in as <code>ubuntu</code>.</dd>
    <dt>Google Cloud</dt><dd>An x86 machine with 4 GB, such as <code>e2-medium</code>.${open ? " Tick Allow HTTP traffic and Allow HTTPS traffic, and reserve a static external IP." : ""}</dd>
  </dl>`,
});

// compose.md step 6, kubernetes.md step 5: the agent asks; the reader runs the command in their own terminal
const KEY: Expect = { who: "you", icon: "key", t: "Save the relay key", d: "Run the command it gives you in your own terminal, and put the key in your password manager. It never shows you the key." };
const INSTALL: Expect = { who: "agent", icon: "agent", t: "Installs Docker and Buzz", d: "and writes the keys. It never shows them." };
const JOIN = (d: string): Expect => ({ who: "you", icon: "join", t: "Join from Buzz Desktop", d });
const PHONE = (d: string): Expect => ({ who: "you", icon: "phone", t: "Pair your phone", d, note: "optional" });

// compose.md, server mode: confirm the URL and ports (SKILL.md rules 2 and 4), steps 1 to 5, the key (6), then 7 to 11
const SERVER: Expect[] = [
  { who: "you", ask: true, icon: "ask", t: "Confirm your permanent URL", d: "It asks whether <code>{{DOMAIN}}</code> is for good, with the server answering on ports 80 and 443. A different URL later starts an empty community." },
  INSTALL,
  KEY,
  { who: "agent", icon: "agent", t: "Starts the relay and checks it", d: "HTTPS, Buzz Desktop's connection, and that you're the owner." },
  JOIN("Paste <code>{{RELAY_URL}}</code> into Join a community."),
  PHONE("In Buzz Desktop, Settings, Mobile, scan the code with the Buzz app."),
];

// compose.md, private mode: join the tailnet (2P), key expiry only without a tag, confirm the name before step 8
const PRIVATE: Expect[] = [
  { who: "agent", icon: "agent", t: "Joins your Tailscale network", d: "with your auth key. It never shows it." },
  { who: "you", icon: "clock", t: "Turn off key expiry", d: "Only if your auth key has no tag: for this machine, in the Tailscale admin console.", note: "if needed" },
  { who: "you", ask: true, icon: "ask", t: "Confirm your permanent URL", d: "It asks whether <code>{{DOMAIN}}</code> is for good. A community can't add a public address later." },
  INSTALL,
  KEY,
  { who: "agent", icon: "agent", t: "Starts the relay and checks it", d: "and that nothing is public." },
  JOIN("With Tailscale on, paste <code>{{RELAY_URL}}</code> into Join a community."),
  PHONE("In Buzz Desktop, Settings, Mobile, scan the code with the Buzz app, with Tailscale on."),
];

const PRIVATE_READY = [
  { t: "A Tailscale account, with HTTPS turned on.", goto: "compose-2P" },
  { t: "A Tailscale auth key, not ephemeral, saved in a file only you can read.", goto: "compose-2P" },
];

export const AGENT_TRACKS: Record<Track, AgentTrack> = {
  vps: {
    ready: [
      { t: "A server: Ubuntu 24.04 on x86 (not ARM), 4 GB of RAM, a fixed IP, and ports 80 and 443 open.", goto: "compose-1", more: CLOUDS(true) },
      SSH("server IP"),
      { t: "An A record for <code>{{DOMAIN}}</code> with the server's IP.", goto: "compose-2", more: DNS("the server's IPv4 address") },
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my server, public on the internet. It's a fresh Ubuntu 24.04 VPS; SSH in as <user>@<server IP>. Domain: {{DOMAIN}}. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join a community screen.",
    expect: SERVER,
  },
  "own-public": {
    ready: [
      { t: "An Ubuntu 24.04 machine on x86 (not ARM) with 4 GB of RAM and a fixed address on your network.", goto: "compose-1" },
      SSH("machine address"),
      { t: "Ports 80 and 443 forwarded to it, and <code>{{DOMAIN}}</code> pointing at your home IP.", goto: "compose-2", more: DNS("your home's public IPv4 address") },
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my own machine, public on the internet. It runs Ubuntu 24.04, and ports 80 and 443 are forwarded to it; SSH in as <user>@<machine address>. Domain: {{DOMAIN}}. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join a community screen.",
    expect: SERVER,
  },
  practice: {
    ready: [{ t: "Docker Desktop, running, with port 3000 free.", goto: "compose-1" }, NPUB, AGENT],
    prompt: "Use the self-host-buzz skill to set up a local test Buzz relay on this machine. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join a community screen.",
    // compose.md step 1: old buzz-prod volumes are removed only after asking; local tests skip the key copy
    expect: [
      { who: "you", ask: true, icon: "ask", t: "Remove an earlier test's data", d: "Only if an earlier test left its data behind.", note: "if needed" },
      { who: "agent", icon: "agent", t: "Writes the keys and starts the relay", d: "then checks it answers on this computer." },
      JOIN("Paste <code>ws://127.0.0.1:3000</code> into Join a community."),
    ],
  },
  "vps-private": {
    ready: [
      { t: "A server: Ubuntu 24.04 on x86 (not ARM) with 4 GB of RAM, and no ports open.", goto: "compose-1", more: CLOUDS(false) },
      SSH("server IP"),
      ...PRIVATE_READY,
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my server, reachable only on our Tailscale network. It's a fresh Ubuntu 24.04 VPS; SSH in as <user>@<server IP>. Tailscale name: buzz. A Tailscale auth key is in <key file>. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join a community screen.",
    expect: PRIVATE,
  },
  "own-private": {
    ready: [{ t: "An Ubuntu 24.04 machine on x86 (not ARM) with 4 GB of RAM.", goto: "compose-1" }, SSH("machine address"), ...PRIVATE_READY, NPUB, AGENT],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my own machine, reachable only on our Tailscale network. It runs Ubuntu 24.04; SSH in as <user>@<machine address>. Tailscale name: buzz. A Tailscale auth key is in <key file>. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join a community screen.",
    expect: PRIVATE,
  },
  // kubernetes.md: confirm the URL (SKILL.md rule 4), step 1 (costs), 2 (DNS), 3 and 4 (install), 5 (the key), 6 (checks)
  k8s: {
    ready: [
      { t: "A cluster, with <code>kubectl</code> and <code>helm</code> pointed at it.", goto: "kubernetes-1" },
      { t: "An ingress controller and cert-manager, or your go-ahead to add them.", goto: "kubernetes-1" },
      { t: "A domain you can point at the ingress.", goto: "kubernetes-2", more: DNS("the ingress's address, which your agent gives you") },
      NPUB,
      AGENT,
    ],
    prompt: "Use the self-host-buzz skill to install Buzz on our Kubernetes cluster with Block's Helm chart. Domain: {{DOMAIN}}. Keep the values file in <folder>. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join a community screen.",
    expect: [
      { who: "you", ask: true, icon: "ask", t: "Confirm your permanent URL", d: "It asks whether <code>{{DOMAIN}}</code> is for good. A different URL later starts an empty community." },
      { who: "you", ask: true, icon: "ask", t: "Approve the costs", d: "Four data volumes, and a load balancer if it has to add Traefik and cert-manager." },
      { who: "you", icon: "dns", t: "Point your domain at the load balancer", d: "An A record for <code>{{DOMAIN}}</code>, or a CNAME on AWS, at the address it gives you." },
      { who: "agent", icon: "agent", t: "Installs Buzz with Block's Helm chart", d: "the tested quickstart profile." },
      { ...KEY, d: "Run the command it gives you in your own terminal, with the same cluster access, and put the key in your password manager." },
      { who: "agent", icon: "agent", t: "Checks it", d: "the certificate, and that you're the owner." },
      JOIN("Paste <code>{{RELAY_URL}}</code> into Join a community."),
    ],
  },
  // kubernetes.md, private network: P2 (operator), P3 (the name, confirmed), P4 (install), the key, checks
  "k8s-private": {
    ready: [
      { t: "A cluster, with <code>kubectl</code> and <code>helm</code> pointed at it. No ingress or load balancer needed.", goto: "kubernetes-P2" },
      { t: "Your tailnet set up: HTTPS on, two tags and a grant in the policy, and an OAuth client saved in two files.", goto: "kubernetes-P1" },
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to install Buzz on our Kubernetes cluster, reachable only on our Tailscale network. Name: {{DOMAIN}}. The OAuth client's ID and secret are in <ID file> and <secret file>. Keep the values file in <folder>. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join a community screen.",
    expect: [
      { who: "agent", icon: "agent", t: "Sets up Tailscale's operator", d: "with your OAuth client. It never shows it." },
      { who: "you", ask: true, icon: "ask", t: "Confirm your permanent URL", d: "It asks whether <code>wss://{{DOMAIN}}</code> is for good. Renaming the tailnet later changes it too." },
      { who: "agent", icon: "agent", t: "Installs Buzz with Block's Helm chart", d: "the tested quickstart profile." },
      { ...KEY, d: "Run the command it gives you in your own terminal, with the same cluster access, and put the key in your password manager." },
      { who: "agent", icon: "agent", t: "Checks it", d: "that nothing is public, and that you're the owner." },
      JOIN("With Tailscale on, paste <code>{{RELAY_URL}}</code> into Join a community."),
    ],
  },
  // railway.md: step 1 (name), 2 (deploy, CLI or the template page), 3 (the key), 4 (your domain), 5 (image), checks
  railway: {
    ready: [
      // railway.md: the template adds three services and a bucket; phone pairing (step 6) one more service
      { t: "A Railway account with room for three services and a storage bucket, and one more service for phone pairing." },
      { t: "The Railway CLI, logged in, if you want your agent to deploy for you." },
      { t: "Optionally, your own domain. Otherwise Railway names the relay." },
      NPUB,
      AGENT,
    ],
    prompt: "Use the self-host-buzz skill to set up Buzz on Railway with Block's template. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join a community screen.",
    expect: [
      { who: "you", ask: true, icon: "ask", t: "Choose the name", d: "Keep the <code>*.up.railway.app</code> name Railway assigns, or use your own domain. It's permanent once anyone joins." },
      { who: "you", ask: true, icon: "ask", t: "Approve the deploy", d: "With the Railway CLI, it asks before creating the project, which costs money. Without it, you deploy from Railway's template page, with the owner key it gives you." },
      { who: "you", icon: "key", t: "Save the relay key", d: "Copy <code>BUZZ_RELAY_PRIVATE_KEY</code> from the relay's Variables in Railway into your password manager." },
      { who: "you", icon: "dns", t: "Add your domain", d: "Only if you chose your own: in the relay's Settings, Networking, then the CNAME record Railway shows.", note: "if needed" },
      { who: "agent", icon: "agent", t: "Updates the image and checks it", d: "a current Buzz image, so files need a member's signature." },
      JOIN("At the address it gives you, in Join a community."),
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
  people: { name: "Add people", sub: "By their npub", ask: "add <their npub> as a member." },
  backup: { name: "Back up", sub: "Data, files and keys", ask: "back it up." },
  restore: { name: "Restore", sub: "From a backup", ask: "restore it from its backup." },
  upgrade: { name: "Upgrade", sub: "To a newer image", ask: "back it up, then upgrade it to the newest image." },
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
  steps: OpStep[];
  /** the skill has no steps for it on this setup: no prompt, only the why */
  manual?: boolean;
}
export type OpSetup = "compose" | "railway" | "k8s";
export const opSetup = (t: Track): OpSetup => (t === "railway" ? "railway" : t === "k8s" || t === "k8s-private" ? "k8s" : "compose");

const PEOPLE_WHY = "Members copy their public ID from Buzz Desktop's Join screen and send it to you. Self-hosted relays have no invite links yet.";
const UPGRADE_WHY = "Back up first: the relay migrates its database on start, so going back means restoring.";
const agent = (t: string): OpStep => ({ who: "agent", icon: "agent", t });
const asks = (t: string): OpStep => ({ who: "you", icon: "ask", t });
const PEOPLE: OpDetail = { why: PEOPLE_WHY, steps: [agent("Checks the npub is valid, then adds it"), agent("Confirms it's on the member list")] };

export const OP_DETAILS: Record<OpSetup, Record<OpTask, OpDetail>> = {
  compose: {
    people: PEOPLE,
    backup: {
      why: "Everything that can't be rebuilt, together. Restore once to prove it works.",
      steps: [
        asks("Asks before stopping the relay for about half a minute"),
        agent("Saves the database, files, git repos and .env"),
        agent("Checks the relay is back and the backup isn't empty"),
        asks("Asks how to encrypt it and where to keep a copy off the machine"),
      ],
    },
    restore: {
      why: "From the backup, on this machine or a new one.",
      steps: [asks("Asks first: it replaces the relay's data"), agent("Puts back the database, files, git repos and .env"), agent("Starts the relay again")],
    },
    upgrade: {
      why: UPGRADE_WHY,
      steps: [
        asks("Asks before the backup stops the relay"),
        agent("Moves the relay to the newest image, about 10 seconds offline"),
        agent("Checks the members are still there and the relay answers"),
      ],
    },
  },
  railway: {
    people: {
      why: PEOPLE_WHY,
      steps: [
        agent("Checks the npub is valid"),
        asks("The first time, asks to add an SSH key to your Railway account"),
        { who: "you", icon: "key", t: "The first time, you confirm Railway's host key in your own terminal" },
        agent("Adds it and confirms it's on the member list"),
      ],
    },
    backup: {
      why: "The database and the bucket, saved on this computer. It needs pg_dump 18 and the AWS CLI. Git repositories aren't kept on Railway.",
      steps: [agent("Saves a database dump and a copy of the bucket here"), agent("Uses each service's credentials without printing them")],
    },
    restore: {
      why: "From the backup on this computer.",
      steps: [asks("Asks first: it replaces the relay's data"), agent("Stops the relay, then restores the database and the bucket"), agent("Redeploys the relay")],
    },
    upgrade: {
      why: `${UPGRADE_WHY} Git repositories don't survive the redeploy.`,
      steps: [agent("Backs up the database and the bucket first"), agent("Points the relay, and phone pairing if you set it up, at the new image")],
    },
  },
  k8s: {
    people: PEOPLE,
    backup: {
      why: "With the quickstart profile: the database, the bucket, the git volume and the relay's Secret. In production, use your managed database's and bucket's own backups.",
      steps: [
        asks("Asks first. The relay keeps running."),
        agent("Saves all four in a folder only you can read"),
        agent("Checks the files aren't empty"),
        { who: "you", icon: "key", t: "Encrypt the copies: the Secret holds the relay key" },
      ],
    },
    restore: {
      why: "Restore the four files the backup saves with your own tools: the database dump, the bucket, the git volume and the relay's Secret.",
      steps: [],
      manual: true,
    },
    upgrade: {
      why: UPGRADE_WHY,
      steps: [asks("Asks before the backup"), agent("Sets the new image tag in the values file"), agent("Upgrades with Helm and waits until the relay is ready")],
    },
  },
};
