/**
 * The agent path, per track: what to have ready, the prompt to paste, and what to expect.
 * "What to expect" is not a transcript: an agent's own screen looks different. It lists, in order, what the
 * agent does on its own and where it stops for the reader, as the skill's reference files
 * (skills/self-host-buzz/references) tell the agent to: compose.md and kubernetes.md.
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

// the skill's scripts run where the agent runs: python3, bash and curl (SKILL.md compatibility: macOS
// or Linux). The agent works as root on the server, so its approval prompts are the reader's brake.
const AGENT: Ready = {
  t: "<b>A coding agent</b> on your Mac or Linux computer: Claude Code, Codex or Goose. Windows isn't covered yet.",
  more: {
    label: "What it needs",
    t: "The skill runs scripts on your computer with <code>python3</code>, <code>bash</code> and <code>curl</code>. Most Linux systems have all three; install any that's missing. On a Mac, if <code>python3</code> asks you to install developer tools, run <code>xcode-select --install</code> first. Use a capable model: small, fast models tend to stop after every step. Keep your agent's approval prompts on, since it runs commands with admin rights, and keep cloud tokens it doesn't need off this computer.",
  },
};
// Buzz 1.0's releases are all previews (v0.7.0-preview.N): signed for macOS 12 or later on Apple Silicon
// and Intel (Intel from 247.1, block/buzz-app#1825), an unsigned installer for Windows, deb and AppImage for Linux
const APP: Ready = {
  t: "<b>Buzz</b> on the computer you'll use it on. You join from it once the relay runs.",
  more: {
    label: "Where to get it",
    t: `Download it from <a href="${DESKTOP}">Block's releases page</a>, for a Mac with macOS 12 or later (Apple Silicon or Intel), Windows or Linux. Every release there is a preview, and the newest is at the top. The Windows installer isn't signed yet, so Windows warns before it runs.`,
  },
};
// decision 2: the skill's scripts/new-identity.py makes the owner's key on this computer and prints only
// its npub. Buzz 1.0 makes a key only with a Builderlab account (block/buzz-app#2579), which can back it
// up with Block (#2325); Settings opens only once first run ends, so that route quits before a community.
const OWNER_KEY: Ready = {
  t: "<b>Your key</b>, your identity in Buzz. The skill makes it and shows its npub, your public ID, which makes you the owner.",
  more: {
    label: "How it works",
    t: "The skill makes the key on this computer, in a file only you can read, and shows only its npub. Save the key in your password manager: you need it to join from Buzz and to use Buzz on another computer. Already have a key in Buzz? Type its npub into the Running on box: it's in <b>Settings</b>, <b>Identity</b> (press ⌘, or Ctrl+, on Windows and Linux). The other way to get a key is a Builderlab account, which is Block's: Block can keep a copy of the key, and creating the account asks for your details. For that, choose <b>Create account</b> on Buzz's first screen. When Buzz asks for a community, quit it, open it again, choose <b>Continue without signing in</b> and copy your npub from Settings, Identity.",
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
/**
 * Buzz 1.0's first run (block/buzz-app#2579): Other options finds a community by its address, then a
 * self-hosted one offers Use an existing key (an nsec, pasted or a dropped file) or Sign in with
 * Builderlab. Later communities come from the community button's Join a community.
 */
const JOIN_IN = (url: string) =>
  `On Buzz's first screen, choose <b>Other options</b>, paste ${url} and choose <b>Continue</b>. Then choose <b>Use an existing key</b> and paste your key, or drop its file there. With a Builderlab account, choose <b>Sign in with Builderlab</b> instead. Already in a community? It's <b>Join a community</b>, under the community button.`;
const JOIN_AT = (url: string) => JOIN(JOIN_IN(`<code>${url}</code>`));
const TS_JOIN = JOIN(`Turn Tailscale on. ${JOIN_IN("<code>{{RELAY_URL}}</code>")}`);
const PHONE = (d: string): Expect => ({ who: "you", icon: "phone", t: "Pair your phone", d, note: "optional" });
// the computer sends the identity only after Codes match (block/buzz-app#1597); notifications need the phone app 0.25 or later
const PAIR =
  "On your computer: <b>Settings</b>, <b>Pair mobile</b>. On your phone: <b>Add community</b>, then scan the code. Type the six digits if the phone asks, or check that they match, then choose <b>Codes match</b> on your computer. Pairing copies your key to the phone, so pair where nobody else can see your screen. An iPhone with Buzz 0.25 or later then gets notifications for direct messages and mentions through Block's gateway, which sees no message text. Android gets none yet.";
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
      APP,
      OWNER_KEY,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my server, public on the internet. It's a fresh Ubuntu 24.04 VPS; SSH in as <user>@<server IP>. Domain: {{DOMAIN}}. {{OWNER}} The skill is at {{SKILL_URL}}.",
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
      APP,
      OWNER_KEY,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my own machine, public on the internet. It runs Ubuntu 24.04, and ports 80 and 443 are forwarded to it; SSH in as <user>@<machine address>. Domain: {{DOMAIN}}. {{OWNER}} The skill is at {{SKILL_URL}}.",
    expect: SERVER,
  },
  practice: {
    ready: [{ t: "<b>Docker Desktop</b> on a Mac, or Docker on Linux, running, with nothing else using ports 80 and 443. On Windows, the local test isn't covered yet." }, APP, OWNER_KEY, AGENT],
    prompt: "Use the self-host-buzz skill to set up a local test Buzz relay on this machine. {{OWNER}} The skill is at {{SKILL_URL}}.",
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
      APP,
      OWNER_KEY,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my server, reachable only on our Tailscale network. It's a fresh Ubuntu 24.04 VPS; SSH in as <user>@<server IP>. Tailscale name: {{DOMAIN}}. A Tailscale auth key is in <key file>. {{OWNER}} The skill is at {{SKILL_URL}}.",
    expect: PRIVATE,
  },
  "own-private": {
    ready: [
      { t: "<b>A Linux machine you own</b>: Ubuntu 24.04, x86, 4 GB of RAM, 20 GB of disk." },
      SSH("machine", "machine address"),
      ...PRIVATE_READY,
      TS_HERE,
      TS_NAME,
      APP,
      OWNER_KEY,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my own machine, reachable only on our Tailscale network. It runs Ubuntu 24.04; SSH in as <user>@<machine address>. Tailscale name: {{DOMAIN}}. A Tailscale auth key is in <key file>. {{OWNER}} The skill is at {{SKILL_URL}}.",
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
      APP,
      OWNER_KEY,
      AGENT,
    ],
    prompt: "Use the self-host-buzz skill to install Buzz on our Kubernetes cluster with Block's Helm chart, public on the internet. Domain: {{DOMAIN}}. Keep the values file in <folder>. {{OWNER}} The skill is at {{SKILL_URL}}.",
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
      APP,
      OWNER_KEY,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to install Buzz on our Kubernetes cluster, reachable only on our Tailscale network. Name: {{DOMAIN}}. The OAuth client's ID and secret are in <ID file> and <secret file>. Keep the values file in <folder>. {{OWNER}} The skill is at {{SKILL_URL}}.",
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
};

/* ── a running relay: people, backups, restore, upgrades ── */
/*
 * Each prompt starts with which relay and how the agent reaches it, so it works in a new
 * conversation, then names the skill and the task. "What happens" follows operations.md, per setup.
 * <name> is a blank the reader fills in (lib/blanks.ts); {{DOMAIN}} comes from the Running on box.
 */
export type OpTask = "backup" | "restore" | "upgrade";
export const OP_TASKS: Record<OpTask, { ask: string }> = {
  backup: { ask: "back it up." },
  restore: { ask: "restore it from its backup." },
  upgrade: { ask: "back it up, then upgrade it to the image the skill recommends." },
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
export type OpSetup = "compose" | "k8s";
export const opSetup = (t: Track): OpSetup => (t === "k8s" || t === "k8s-private" ? "k8s" : "compose");

const UPGRADE_WHY =
  "Back up first: the relay changes its database when it starts on a new image, so going back to the old one means restoring the backup, which loses anything posted after it.";
const agent = (t: string): OpStep => ({ who: "agent", icon: "agent", t });
const asks = (t: string): OpStep => ({ who: "you", icon: "ask", t });

/**
 * Backing up and restoring, as numbered steps for a person to run. `code` picks a command block from
 * the skill's own step (operations.md) by a command it contains, so the commands still come from the
 * skill, and a block added to the step doesn't shift the others.
 */
export interface FlowStep {
  t: string;
  d: string;
  code?: string;
}
const CHECK_BACK = "The relay check passes, and your messages, files and members are back.";
export const OP_FLOWS: Record<OpSetup, Partial<Record<"backup" | "restore", FlowStep[]>>> = {
  compose: {
    backup: [
      { t: "Run it where Buzz runs", d: "From <code>buzz/deploy/compose</code>. Members lose the connection for about half a minute.", code: "pg_dump" },
      { t: "Check it", d: "<code>ls -la ~/buzz-backup</code> shows four files, none of them empty, and Buzz reconnects." },
      {
        t: "Keep it safe",
        d: "It holds every secret. Encrypt it, for example with <code>gpg --symmetric</code>, keep a copy off the server, and keep the relay key where two people can open it.",
      },
    ],
    restore: [
      {
        t: "Clear the way",
        d: "On this server, stop Buzz and delete the data the backup replaces; if you upgraded since the backup, first move the bundle back to the backup's version. On a new server, skip this: stop the old one if it still runs, install Docker and get the bundle at the backup's version, with its edits, as the setup does, without starting Buzz, and point your domain at the new server.",
        code: "volume rm",
      },
      {
        t: "Put the backup back",
        d: "From <code>buzz/deploy/compose</code>, with the backup in <code>~/buzz-backup</code>. First, <code>docker volume ls -q --filter name=buzz-prod_buzz-postgres-data</code> must print nothing; if it prints a name, this server still has its data, so stop. The block prints <code>restored</code> and starts Buzz only if the database was empty and the backup went in whole.",
        code: "pg_restore",
      },
      { t: "Check it", d: CHECK_BACK },
    ],
  },
  k8s: {
    backup: [
      { t: "Run it", d: "With <code>kubectl</code> connected to the cluster, in a folder only you can read. The relay keeps running.", code: "pg_dump" },
      { t: "Check it", d: "Four files, none of them empty." },
      { t: "Keep it safe", d: "The Secret file holds the relay key. Encrypt the copies, keep one off this computer, and keep the relay key where two people can open it." },
    ],
  },
};

export const OP_DETAILS: Record<OpSetup, Record<OpTask, OpDetail>> = {
  compose: {
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
        asks("Asks you to rename open channels that share a name, if any: the new image won't start with them"),
        agent("Moves the relay to the image the skill recommends, about 10 seconds offline"),
        agent("Turns on phone notifications, if the relay predates them"),
        agent("Checks the members are still there and the relay answers"),
      ],
    },
  },
  k8s: {
    backup: {
      why: "With the quickstart profile, saves the database, the file bucket, the git volume and the relay's Secret, which holds the relay key. In production, use your managed database's and bucket's own backups.",
    },
    restore: {
      why: "Restore the four files the backup saves with your own tools: the database dump, the bucket, the git volume and the relay's Secret.",
      manual: true,
    },
    upgrade: {
      why: UPGRADE_WHY,
      steps: [asks("Asks before the backup"), agent("Sets the image the skill recommends in the values file"), agent("Upgrades with Helm and waits until the relay is ready")],
    },
  },
};
