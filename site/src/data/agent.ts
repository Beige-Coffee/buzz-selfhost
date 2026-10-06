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
  ready: { t: string; goto?: string; warn?: { label: string; t: string }; more?: { label: string; t: string } }[];
  prompt: string;
  expect: Expect[];
}

type Ready = AgentTrack["ready"][number];
const DESKTOP = "https://github.com/block/buzz/releases/latest";
const ALIASES = "https://github.com/block/buzz/pull/5410";

// the skill's scripts run where the agent runs: python3, bash and curl (SKILL.md compatibility)
const AGENT: Ready = {
  t: "A coding agent that runs commands on your Mac or Linux computer: Claude Code, Codex or Goose.",
  more: {
    label: "What the agent needs",
    t: "The skill runs scripts on your computer with <code>python3</code>, <code>bash</code> and <code>curl</code>. Linux has all three. On a Mac, if <code>python3</code> asks you to install developer tools, run <code>xcode-select --install</code> first. Use a capable model: small, fast models tend to stop after every step.",
  },
};
// Buzz Desktop shows the npub on its Join a community screen, under "Joining a private community?", and in Settings.
const NPUB: Ready = {
  t: "Buzz Desktop on your computer, and your npub typed into <b>Your npub</b> in the Running on box. Your npub is your public ID in Buzz: a long code that starts with <code>npub1</code>.",
  more: {
    label: "How to get them",
    t: `Download Buzz Desktop for Mac, Linux or Windows from <a href="${DESKTOP}">Block's releases page</a>. Open it, choose <b>Join a community</b>, and copy your npub from <b>Joining a private community?</b> The relay makes this npub the community's owner, and the owner can't be changed later, so copy it from the Buzz Desktop you'll keep using.`,
  },
};
// a first connection asks to trust the fingerprint, which an agent's shell can't answer (SKILL.md, SSH to a server)
const SSH = (machine: string, address: string): Ready => ({
  t: `SSH access to the ${machine} with a key, not a password, as root or as a user whose <code>sudo</code> doesn't ask for a password.`,
  more: {
    label: "Connect once yourself first",
    t: `Before you ask your agent, run <code>ssh &lt;user&gt;@&lt;${address}&gt; true</code> in your own terminal. The first time, SSH asks whether to trust the ${machine}'s fingerprint: type <b>yes</b>. Your agent can't answer that question, so its first connection would fail. If the command also asks for a passphrase, or needs a key file (AWS gives you a <code>.pem</code> file), run <code>ssh-add &lt;key file&gt;</code> first, so your agent can use the key without asking.`,
  },
});
/** The address is the community's for good (block/buzz#4952): say so where the reader picks it, and why. */
const FOREVER = (what: string, extra = ""): { label: string; t: string } => ({
  label: `The ${what} can't be changed later`,
  t: `Buzz stores your community under this exact address. If you switch to a different ${what} later, the relay starts a new, empty community there, and your messages, channels and members stay behind at the old address.${extra ? ` ${extra}` : ""} An open pull request to Buzz, <a href="${ALIASES}">block/buzz#5410</a>, would let a community answer on a second address, but it isn't merged. Until it is, pick a ${what} you're happy to keep.`,
});
/** The A record: where it points, and what breaks it (Cloudflare's proxy, a stray AAAA record, a cached old address). */
const DNS = (target: string) => ({
  label: "How to add the A record",
  t: `Open the DNS settings wherever your domain is managed: your registrar, Cloudflare or similar. Add an A record whose name is the part before your domain (<code>buzz</code> for <code>buzz.example.org</code>) and whose value is ${target}. On Cloudflare, set Proxy status to <b>DNS only</b>. If the name has an AAAA record, delete it. Add the record before you ask your agent, and before you open the address anywhere: if the name pointed somewhere before, such as a wildcard record or a parked page, your computer can keep the old address for 30 minutes or more. No domain yet? Buy one from any registrar, or use a subdomain of a domain you own.`,
});
/** The clouds people name, and each one's catch. A private server opens no ports, so it skips those. */
const CLOUDS = (open: boolean) => ({
  label: "Which server to rent on AWS, Google Cloud, DigitalOcean or Hetzner",
  t: `<dl class="ag-clouds">
    <dt>DigitalOcean</dt><dd>A Basic Droplet with 4 GB of RAM.${open ? " Its IP address doesn't change, and nothing blocks ports 80 and 443 unless you add a Cloud Firewall." : ""}</dd>
    <dt>Hetzner</dt><dd>A CX or CPX server (x86), not CAX (ARM), with 4 GB of RAM. Keep its IPv4 address when you create it: GitHub, where the install downloads from, has no IPv6.</dd>
    <dt>AWS</dt><dd>An x86 instance with 4 GB of RAM, such as <code>t3.medium</code>, not Graviton (<code>t4g</code>). Set its storage to 20 GB; the default is 8.${open ? " In its security group, allow HTTP and HTTPS. Attach an Elastic IP, or the address changes whenever the instance stops." : ""} You log in as <code>ubuntu</code>.</dd>
    <dt>Google Cloud</dt><dd>An x86 machine with 4 GB of RAM, such as <code>e2-medium</code>. Make its boot disk 20 GB; the default is 10.${open ? " Tick Allow HTTP traffic and Allow HTTPS traffic, and reserve a static external IP address." : ""}</dd>
  </dl>`,
});
const DOMAIN_LINE = "A domain for the community, typed into <b>Domain</b> in the Running on box";

// compose.md 2P and kubernetes.md P1: the reader does these in the Tailscale admin console
const PRIVATE_READY: Ready[] = [
  { t: "A Tailscale account with HTTPS turned on: in the Tailscale admin console, open <b>DNS</b> and choose <b>Enable HTTPS</b>.", goto: "compose-2P" },
  {
    t: "A Tailscale auth key, created in the admin console under <b>Settings</b>, <b>Keys</b>, with <b>Ephemeral</b> off, and saved to a file only you can read (<code>chmod 600 &lt;file&gt;</code>). An ephemeral machine is removed from your network when it goes offline.",
    goto: "compose-2P",
  },
];
const TS_NAME: Ready = {
  t: "The relay's name on your Tailscale network, typed into <b>Tailscale name</b> in the Running on box, like <code>buzz.your-tailnet.ts.net</code>.",
  warn: FOREVER("name", "Renaming the machine or your tailnet later changes it too, and a private community can't add a public address later."),
};

// compose.md step 6, kubernetes.md step 5: the reader prints the key in their own terminal, never in the conversation
const KEY = (how: string): Expect => ({
  who: "you",
  icon: "key",
  t: "Save the relay key",
  d: `The relay key is the community's permanent identity. ${how} It prints the key: save it in your password manager. Your agent never prints it.`,
});
const SSH_KEY = KEY("Run the <code>ssh</code> command your agent gives you in your own terminal, not in the chat.");
const KUBE_KEY = KEY("Run the <code>kubectl</code> command your agent gives you in your own terminal, with the same cluster access.");
const INSTALL: Expect = {
  who: "agent",
  icon: "agent",
  t: "Installs Docker and Buzz",
  d: "Docker from Docker's own repository, then Block's Compose bundle for Buzz. It writes the passwords and the relay key into a file on the server without printing them.",
};
const JOIN = (d: string): Expect => ({ who: "you", icon: "join", t: "Join from Buzz Desktop", d });
const JOIN_AT = (url: string) => JOIN(`In Buzz Desktop, choose <b>Join a community</b> and paste <code>${url}</code>.`);
const PHONE = (d: string): Expect => ({ who: "you", icon: "phone", t: "Pair your phone", d, note: "optional" });
const QUICKSTART = "the chart's quickstart profile: Postgres, Redis and file storage run inside the cluster, with one relay.";

// compose.md, server mode: confirm the URL and ports (SKILL.md rules 2 and 4), steps 1 to 5, the key (6), then 7 to 11
const SERVER: Expect[] = [
  { who: "you", ask: true, icon: "ask", t: "Confirm the domain", d: "It asks you to confirm <code>{{DOMAIN}}</code>, and that the server can be reached on ports 80 and 443. The domain can't be changed later." },
  INSTALL,
  SSH_KEY,
  { who: "agent", icon: "agent", t: "Starts the relay and checks it", d: "It checks HTTPS, that Buzz Desktop can connect, that ports 3000 and 5000 are closed to the internet, and that your npub is the owner." },
  JOIN_AT("{{RELAY_URL}}"),
  PHONE("In Buzz Desktop, open <b>Settings</b>, then <b>Mobile</b>, and scan the QR code with the Buzz app on your phone."),
];

// compose.md, private mode: join the tailnet (2P), key expiry only without a tag, confirm the name before step 8
const PRIVATE: Expect[] = [
  { who: "agent", icon: "agent", t: "Joins your Tailscale network", d: "It installs Tailscale on the server and signs it in with the auth key from your file, without printing the key." },
  {
    who: "you",
    icon: "clock",
    t: "Turn off key expiry",
    d: "Only if your auth key has no tag. In the Tailscale admin console, open the server's menu and choose <b>Disable key expiry</b>. Otherwise the server drops off your network when its key expires.",
    note: "if needed",
  },
  { who: "you", ask: true, icon: "ask", t: "Confirm the name", d: "It asks you to confirm <code>{{DOMAIN}}</code>, the server's name on your Tailscale network. The name can't be changed later." },
  INSTALL,
  SSH_KEY,
  { who: "agent", icon: "agent", t: "Starts the relay and checks it", d: "It checks HTTPS through Tailscale, that Buzz Desktop can connect, that your npub is the owner, and that no ports are open to the internet." },
  JOIN("With Tailscale running on your computer, choose <b>Join a community</b> in Buzz Desktop and paste <code>{{RELAY_URL}}</code>."),
  PHONE("With Tailscale running on your phone, open <b>Settings</b>, then <b>Mobile</b>, in Buzz Desktop, and scan the QR code with the Buzz app."),
];

export const AGENT_TRACKS: Record<Track, AgentTrack> = {
  vps: {
    ready: [
      { t: "A rented server: Ubuntu 24.04, x86 (not ARM), 4 GB of RAM, 20 GB of disk, a fixed public IP address, and ports 80 and 443 open to the internet.", goto: "compose-1", more: CLOUDS(true) },
      SSH("server", "server IP"),
      { t: `${DOMAIN_LINE}, with an A record pointing at the server's IP address.`, goto: "compose-2", warn: FOREVER("domain"), more: DNS("the server's public IPv4 address") },
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my server, public on the internet. It's a fresh Ubuntu 24.04 VPS; SSH in as <user>@<server IP>. Domain: {{DOMAIN}}. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join a community screen.",
    expect: SERVER,
  },
  "own-public": {
    ready: [
      { t: "A Linux machine you own: Ubuntu 24.04, x86 (not ARM), 4 GB of RAM, 20 GB of disk, and a fixed address on your home network.", goto: "compose-1" },
      SSH("machine", "machine address"),
      { t: "Your router forwarding ports 80 and 443 to the machine.", goto: "compose-2" },
      { t: `${DOMAIN_LINE}, with an A record pointing at your home's public IP address.`, warn: FOREVER("domain"), more: DNS("your home's public IPv4 address") },
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my own machine, public on the internet. It runs Ubuntu 24.04, and ports 80 and 443 are forwarded to it; SSH in as <user>@<machine address>. Domain: {{DOMAIN}}. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join a community screen.",
    expect: SERVER,
  },
  practice: {
    ready: [{ t: "Docker Desktop installed and running on this computer, with nothing else using port 3000.", goto: "compose-1" }, NPUB, AGENT],
    prompt: "Use the self-host-buzz skill to set up a local test Buzz relay on this machine. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join a community screen.",
    // compose.md step 1: old buzz-prod volumes are removed only after asking; local tests skip the key copy
    expect: [
      {
        who: "you",
        ask: true,
        icon: "ask",
        t: "Remove an earlier test's data",
        d: "If an earlier local test left Docker volumes whose names start with <code>buzz-prod</code>, it asks before deleting them: they keep the old database password.",
        note: "if needed",
      },
      { who: "agent", icon: "agent", t: "Writes the keys and starts the relay", d: "Then it checks the relay answers at <code>ws://127.0.0.1:3000</code> on this computer." },
      JOIN_AT("ws://127.0.0.1:3000"),
    ],
  },
  "vps-private": {
    ready: [
      { t: "A rented server: Ubuntu 24.04, x86 (not ARM), 4 GB of RAM and 20 GB of disk. It needs no ports open to the internet.", goto: "compose-1", more: CLOUDS(false) },
      SSH("server", "server IP"),
      ...PRIVATE_READY,
      TS_NAME,
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my server, reachable only on our Tailscale network. It's a fresh Ubuntu 24.04 VPS; SSH in as <user>@<server IP>. Tailscale name: buzz. A Tailscale auth key is in <key file>. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join a community screen.",
    expect: PRIVATE,
  },
  "own-private": {
    ready: [
      { t: "A Linux machine you own: Ubuntu 24.04, x86 (not ARM), 4 GB of RAM and 20 GB of disk.", goto: "compose-1" },
      SSH("machine", "machine address"),
      ...PRIVATE_READY,
      TS_NAME,
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my own machine, reachable only on our Tailscale network. It runs Ubuntu 24.04; SSH in as <user>@<machine address>. Tailscale name: buzz. A Tailscale auth key is in <key file>. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join a community screen.",
    expect: PRIVATE,
  },
  // kubernetes.md: confirm the URL (SKILL.md rule 4), step 1 (costs), 2 (DNS), 3 and 4 (install), 5 (the key), 6 (checks)
  k8s: {
    ready: [
      { t: "A Kubernetes cluster, with <code>kubectl</code> and <code>helm</code> on your computer connected to it.", goto: "kubernetes-1" },
      { t: "An ingress controller and cert-manager in the cluster. If it has neither, your agent can install Traefik and cert-manager once you approve the cost of a load balancer.", goto: "kubernetes-1" },
      {
        t: `${DOMAIN_LINE}. Your agent gives you the load balancer's address to point it at.`,
        goto: "kubernetes-2",
        warn: FOREVER("domain"),
        more: DNS("the load balancer address your agent gives you (on AWS, the load balancer has a name instead: add a CNAME record to it)"),
      },
      NPUB,
      AGENT,
    ],
    prompt: "Use the self-host-buzz skill to install Buzz on our Kubernetes cluster with Block's Helm chart. Domain: {{DOMAIN}}. Keep the values file in <folder>. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join a community screen.",
    expect: [
      { who: "you", ask: true, icon: "ask", t: "Confirm the domain", d: "It asks you to confirm <code>{{DOMAIN}}</code>. The domain can't be changed later." },
      { who: "you", ask: true, icon: "ask", t: "Approve the costs", d: "The quickstart profile's four storage volumes, and a load balancer if it has to install Traefik and cert-manager." },
      {
        who: "you",
        icon: "dns",
        t: "Point your domain at the load balancer",
        d: "Add an A record for <code>{{DOMAIN}}</code> with the address it gives you. On AWS, the load balancer has a name instead of an address: add a CNAME record to it.",
      },
      { who: "agent", icon: "agent", t: "Installs Buzz with Block's Helm chart", d: `With ${QUICKSTART}` },
      KUBE_KEY,
      { who: "agent", icon: "agent", t: "Checks it", d: "It checks the HTTPS certificate, and that your npub is the owner." },
      JOIN_AT("{{RELAY_URL}}"),
    ],
  },
  // kubernetes.md, private network: P2 (operator), P3 (the name, confirmed), P4 (install), the key, checks
  "k8s-private": {
    ready: [
      { t: "A Kubernetes cluster, with <code>kubectl</code> and <code>helm</code> on your computer connected to it. It doesn't need an ingress controller or a load balancer.", goto: "kubernetes-P2" },
      {
        t: "Your Tailscale network prepared in the admin console: HTTPS turned on, the tags <code>tag:k8s-operator</code> and <code>tag:k8s</code> in the access policy, and an OAuth client whose ID and secret are saved in two files only you can read.",
        goto: "kubernetes-P1",
      },
      TS_NAME,
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to install Buzz on our Kubernetes cluster, reachable only on our Tailscale network. Name: {{DOMAIN}}. The OAuth client's ID and secret are in <ID file> and <secret file>. Keep the values file in <folder>. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join a community screen.",
    expect: [
      { who: "agent", icon: "agent", t: "Sets up Tailscale's Kubernetes operator", d: "It installs the operator in the cluster with your OAuth client, without printing its secret." },
      { who: "you", ask: true, icon: "ask", t: "Confirm the name", d: "It asks you to confirm <code>wss://{{DOMAIN}}</code>. The name can't be changed later, and renaming your tailnet would change it too." },
      { who: "agent", icon: "agent", t: "Installs Buzz with Block's Helm chart", d: `With ${QUICKSTART}` },
      KUBE_KEY,
      { who: "agent", icon: "agent", t: "Checks it", d: "It checks that no ports are open to the internet, and that your npub is the owner." },
      JOIN("With Tailscale running on your computer, choose <b>Join a community</b> in Buzz Desktop and paste <code>{{RELAY_URL}}</code>."),
    ],
  },
  // railway.md: step 1 (name), 2 (deploy, CLI or the template page), 3 (the key), 4 (your domain), 5 (image), checks
  railway: {
    ready: [
      // railway.md: the template adds three services and a bucket; phone pairing (step 6) one more service
      { t: "A Railway account on a plan with room for three services and a storage bucket, plus one more service for phone pairing." },
      { t: "Optional: the Railway CLI installed and logged in (<code>railway login</code>), so your agent can deploy for you. Without it, you deploy from Railway's template page yourself." },
      {
        t: "Optional: your own domain, typed into <b>Domain</b> in the Running on box. Without one, the community's address is the <code>*.up.railway.app</code> name Railway assigns.",
        warn: FOREVER("address"),
      },
      NPUB,
      AGENT,
    ],
    prompt: "Use the self-host-buzz skill to set up Buzz on Railway with Block's template. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join a community screen.",
    expect: [
      { who: "you", ask: true, icon: "ask", t: "Choose the address", d: "Keep the <code>*.up.railway.app</code> name Railway assigns, or use your own domain. Whichever you choose can't be changed once anyone joins." },
      {
        who: "you",
        ask: true,
        icon: "ask",
        t: "Approve the deploy",
        d: "With the Railway CLI, it asks before creating the project, which Railway bills for. Without the CLI, you deploy from Railway's template page, pasting the owner key your agent gives you (your npub in hex).",
      },
      {
        who: "you",
        icon: "key",
        t: "Save the relay key",
        d: "The relay key is the community's permanent identity. In Railway, open the relay service, then <b>Variables</b>, and copy <code>BUZZ_RELAY_PRIVATE_KEY</code> into your password manager.",
      },
      {
        who: "you",
        icon: "dns",
        t: "Add your domain",
        d: "Only if you chose your own domain: in the relay service's <b>Settings</b>, under <b>Networking</b>, add it, then create the CNAME record Railway shows wherever your DNS is managed.",
        note: "if needed",
      },
      { who: "agent", icon: "agent", t: "Updates the image and checks it", d: "Railway's template starts an older Buzz image, so it moves the relay to a current one, where reading uploaded files requires a member's signature." },
      JOIN("In Buzz Desktop, choose <b>Join a community</b> and paste the address your agent gives you."),
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

const PEOPLE_WHY = "Each new member installs Buzz Desktop and sends you their npub, from <b>Join a community</b>, under <b>Joining a private community?</b> Self-hosted relays have no invite links yet.";
const UPGRADE_WHY = "Back up first: the relay changes its database when it starts on a new image, so going back to the old one means restoring the backup.";
const agent = (t: string): OpStep => ({ who: "agent", icon: "agent", t });
const asks = (t: string): OpStep => ({ who: "you", icon: "ask", t });
const PEOPLE: OpDetail = { why: PEOPLE_WHY, steps: [agent("Checks the npub is valid, then adds it"), agent("Confirms it's on the member list")] };

export const OP_DETAILS: Record<OpSetup, Record<OpTask, OpDetail>> = {
  compose: {
    people: PEOPLE,
    backup: {
      why: "Saves the database, uploaded files, git repositories and the <code>.env</code> file (passwords and the relay key) together. Restore it once to prove it works.",
      steps: [
        asks("Asks before stopping the relay for about half a minute"),
        agent("Saves the database, files, git repos and .env"),
        agent("Checks the relay is back and the backup isn't empty"),
        asks("Asks how to encrypt it and where to keep a copy off the machine"),
      ],
    },
    restore: {
      why: "Puts a backup back, on this server or a new one. It replaces the relay's current data.",
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
      why: "Saves the database and the file bucket to this computer, which needs <code>pg_dump</code> 18 and the AWS CLI installed. Git repositories aren't kept on Railway.",
      steps: [agent("Saves a database dump and a copy of the bucket here"), agent("Uses each service's credentials without printing them")],
    },
    restore: {
      why: "Puts the backup on this computer back into Railway. It replaces the relay's current data.",
      steps: [asks("Asks first: it replaces the relay's data"), agent("Stops the relay, then restores the database and the bucket"), agent("Redeploys the relay")],
    },
    upgrade: {
      why: `${UPGRADE_WHY} Git repositories are lost when Railway redeploys the relay.`,
      steps: [agent("Backs up the database and the bucket first"), agent("Points the relay, and phone pairing if you set it up, at the new image")],
    },
  },
  k8s: {
    people: PEOPLE,
    backup: {
      why: "With the quickstart profile, saves the database, the file bucket, the git volume and the relay's Secret, which holds the relay key. In production, use your managed database's and bucket's own backups.",
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
