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

const AGENT = { t: "An agent that runs commands on your computer, such as Claude Code, Goose or Codex." };
// Buzz Desktop shows the npub on its Join a community screen, under "Joining a private community?", and in Settings.
const NPUB = {
  t: "Your npub, your public ID in Buzz, in the npub field on this page.",
  more: {
    label: "Where to find it",
    t: "In Buzz Desktop, open <b>Join a community</b> and copy it from <b>Joining a private community?</b> It starts with <code>npub1</code>. It makes you the community's owner, which can't be changed later, so copy it from the Buzz Desktop you'll use.",
  },
};
const SSH = { t: "SSH access with a key, not a password, as root or a user with sudo." };

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
      { t: "A server: Ubuntu 24.04 on x86 (not ARM), 4 GB of RAM, a fixed IP, and ports 80 and 443 open. AWS, Google Cloud, DigitalOcean or Hetzner.", goto: "compose-1" },
      SSH,
      { t: "An A record for <code>{{DOMAIN}}</code> with the server's IP.", goto: "compose-2" },
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
      SSH,
      { t: "Ports 80 and 443 forwarded to it, and <code>{{DOMAIN}}</code> pointing at your home IP.", goto: "compose-2" },
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
      { t: "A server: Ubuntu 24.04 on x86 (not ARM) with 4 GB of RAM, and no ports open. AWS, Google Cloud, DigitalOcean or Hetzner.", goto: "compose-1" },
      SSH,
      ...PRIVATE_READY,
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my server, reachable only on our Tailscale network. It's a fresh Ubuntu 24.04 VPS; SSH in as <user>@<server IP>. Tailscale name: buzz. A Tailscale auth key is in <key file>. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join a community screen.",
    expect: PRIVATE,
  },
  "own-private": {
    ready: [{ t: "An Ubuntu 24.04 machine on x86 (not ARM) with 4 GB of RAM.", goto: "compose-1" }, SSH, ...PRIVATE_READY, NPUB, AGENT],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my own machine, reachable only on our Tailscale network. It runs Ubuntu 24.04; SSH in as <user>@<machine address>. Tailscale name: buzz. A Tailscale auth key is in <key file>. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join a community screen.",
    expect: PRIVATE,
  },
  // kubernetes.md: confirm the URL (SKILL.md rule 4), step 1 (costs), 2 (DNS), 3 and 4 (install), 5 (the key), 6 (checks)
  k8s: {
    ready: [
      { t: "A cluster, with <code>kubectl</code> and <code>helm</code> pointed at it.", goto: "kubernetes-1" },
      { t: "An ingress controller and cert-manager, or your go-ahead to add them.", goto: "kubernetes-1" },
      { t: "A domain you can point at the ingress.", goto: "kubernetes-2" },
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
      { t: "A Railway account. A trial fits one relay." },
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

/** Operations, as prompts. */
export const DAY_TWO_PROMPTS: Record<string, { prompt: string; note: string }[]> = {
  people: [{ prompt: "Add npub1… as a member.", note: "It checks the npub, adds it, and confirms it in the member list." }],
  backup: [
    {
      prompt: "Back up the relay.",
      note: "It stops the relay for about half a minute, checks the backup isn't empty, then asks you how to encrypt it and where the off-machine copy goes.",
    },
    { prompt: "Restore the relay from the backup.", note: "It asks first: a restore replaces the data." },
  ],
  upgrade: [
    {
      prompt: "Back up the relay, then upgrade it to the newest image.",
      note: "It picks the newest tag that has an image, moves the deploy bundle and the relay to it together, and checks the relay answers afterwards.",
    },
  ],
};
