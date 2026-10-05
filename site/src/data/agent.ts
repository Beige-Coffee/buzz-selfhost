/**
 * The agent path, per track: what to have ready, the prompt to paste, and what a run looks like.
 * Run lines follow the cold installs of 2026-09-30 and 2026-10-01 (an agent given only the skill).
 * Text may contain {{KEYS}} from values.ts and simple inline HTML.
 */
import type { Track } from "../lib/values";

export type RunLine =
  | { k: "you"; t: string }
  | { k: "ok"; n: string; t: string; d: string }
  | { k: "ask"; t: string }
  | { k: "turn"; t: string };

export interface AgentTrack {
  /** what the reader does before asking; `goto` opens that step in the step-by-step view */
  ready: { t: string; goto?: string }[];
  prompt: string;
  run: RunLine[];
}

const AGENT = { t: "An agent that can run shell commands, such as Claude Code, Goose or Codex." };
const NPUB = { t: "Your npub from Buzz Desktop's Join screen, in the panel. It makes you the owner." };
const SERVER_RUN = (where: string): RunLine[] => [
  { k: "you", t: `Use the self-host-buzz skill to set up a Buzz relay ${where}…` },
  { k: "ok", n: "", t: "Inputs", d: "npub checksum good · image {{TAG}}" },
  { k: "ask", t: "Is {{DOMAIN}} the permanent URL? A different one later starts an empty community. The server will answer on ports 80 and 443." },
  { k: "you", t: "Yes." },
  { k: "ok", n: "1", t: "Server", d: "x86_64 · 3.8 GiB · first boot done" },
  { k: "ok", n: "2", t: "DNS and ports", d: "{{DOMAIN}} points here · 80 and 443 open" },
  { k: "ok", n: "3", t: "Docker", d: "Compose v5.5.1" },
  { k: "ok", n: "4–9", t: "Bundle and keys", d: "checked out at the image's commit · relay key written to .env, never shown" },
  { k: "ok", n: "10", t: "Start", d: "5 containers up in about 40 s" },
  { k: "ok", n: "11", t: "Checks", d: "https · WebSocket · Desktop allowed · port 3000 closed · you're the owner" },
  { k: "turn", t: "Copy the relay key into your password manager, with the command I'll give you." },
  { k: "turn", t: "Join from Buzz Desktop: {{RELAY_URL}}" },
];

const PRIVATE_RUN = (where: string): RunLine[] => [
  { k: "you", t: `Use the self-host-buzz skill to set up a Buzz relay ${where}, on our Tailscale network only…` },
  { k: "ok", n: "", t: "Inputs", d: "npub checksum good · image {{TAG}}" },
  { k: "ok", n: "1", t: "Server", d: "x86_64 · 3.8 GiB · first boot done" },
  { k: "ok", n: "2P", t: "Tailnet", d: "joined with your auth key, never shown · {{DOMAIN}} · HTTPS on" },
  { k: "ask", t: "Is {{DOMAIN}} the permanent URL? A community can't add a public address later." },
  { k: "you", t: "Yes." },
  { k: "ok", n: "3–9", t: "Docker and keys", d: "relay key written to .env, never shown · relay on 127.0.0.1 only" },
  { k: "ok", n: "10", t: "Start", d: "4 containers healthy in about 45 s" },
  { k: "ok", n: "10P", t: "Serve", d: "HTTPS on the private network" },
  { k: "ok", n: "11", t: "Checks", d: "you're the owner · public ports 80, 443, 3000 closed" },
  { k: "turn", t: "Turn off key expiry for this machine in the Tailscale admin console." },
  { k: "turn", t: "Copy the relay key into your password manager, with the command I'll give you." },
  { k: "turn", t: "Join from Buzz Desktop, on the private network: {{RELAY_URL}}" },
];

export const AGENT_TRACKS: Record<Track, AgentTrack> = {
  vps: {
    ready: [
      { t: "A fresh Ubuntu 24.04 server on x86 with 4 GB of RAM, that you can reach over SSH.", goto: "compose-1" },
      { t: "An A record for <code>{{DOMAIN}}</code> pointing at it.", goto: "compose-2" },
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my server. It's a fresh Ubuntu 24.04 VPS; reach it over SSH at {{DOMAIN}}. Domain: {{DOMAIN}}. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join screen. Mode: server.",
    run: SERVER_RUN("on my server"),
  },
  "own-public": {
    ready: [
      { t: "An Ubuntu 24.04 machine on x86 with 4 GB of RAM and a fixed address on your network.", goto: "compose-1" },
      { t: "Ports 80 and 443 forwarded to it, and <code>{{DOMAIN}}</code> pointing at your home IP.", goto: "compose-2" },
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my own machine. It runs Ubuntu 24.04, ports 80 and 443 are forwarded to it, and I reach it over SSH at {{DOMAIN}}. Domain: {{DOMAIN}}. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join screen. Mode: server.",
    run: SERVER_RUN("on my own machine"),
  },
  practice: {
    ready: [{ t: "Docker Desktop, running, and port 3000 free.", goto: "compose-1" }, NPUB, AGENT],
    prompt: "Use the self-host-buzz skill to set up a local test Buzz relay on this machine. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join screen. Mode: local.",
    run: [
      { k: "you", t: "Use the self-host-buzz skill to set up a local test Buzz relay on this machine…" },
      { k: "ok", n: "", t: "Inputs", d: "npub checksum good · image {{TAG}}" },
      { k: "ok", n: "1", t: "Machine", d: "Docker running · port 3000 free · no old data" },
      { k: "ok", n: "4–9", t: "Bundle and keys", d: "relay key written to .env, never shown · relay on 127.0.0.1 only" },
      { k: "ok", n: "10", t: "Start", d: "4 containers healthy" },
      { k: "ok", n: "11", t: "Checks", d: "ws://127.0.0.1:3000 answers · you're the owner" },
      { k: "turn", t: "Join from Buzz Desktop: ws://127.0.0.1:3000" },
    ],
  },
  "vps-private": {
    ready: [
      { t: "A fresh Ubuntu 24.04 server on x86 with 4 GB of RAM, that you can reach over SSH. No other ports open.", goto: "compose-1" },
      { t: "A Tailscale account to run the private network, with HTTPS turned on (admin console, DNS, Enable HTTPS).", goto: "compose-2P" },
      { t: "A Tailscale auth key, not ephemeral, saved in a file only you can read (admin console, Settings, Keys).", goto: "compose-2P" },
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my server, reachable only on our Tailscale network. It's a fresh Ubuntu 24.04 VPS; reach it over SSH at <server address>. Tailscale name: buzz. A Tailscale auth key is in <key file>. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join screen. Mode: private.",
    run: PRIVATE_RUN("on my server"),
  },
  "own-private": {
    ready: [
      { t: "An Ubuntu 24.04 machine on x86 with 4 GB of RAM. No router changes.", goto: "compose-1" },
      { t: "A Tailscale account to run the private network, with HTTPS turned on (admin console, DNS, Enable HTTPS).", goto: "compose-2P" },
      { t: "A Tailscale auth key, not ephemeral, saved in a file only you can read (admin console, Settings, Keys).", goto: "compose-2P" },
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to set up a Buzz relay on my own machine, reachable only on our Tailscale network. It runs Ubuntu 24.04; reach it over SSH at <machine address>. Tailscale name: buzz. A Tailscale auth key is in <key file>. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join screen. Mode: private.",
    run: PRIVATE_RUN("on my own machine"),
  },
  k8s: {
    ready: [
      { t: "A Kubernetes cluster, with <code>kubectl</code> and <code>helm</code> pointed at it.", goto: "kubernetes-1" },
      { t: "An ingress controller and cert-manager, or the commands to add them.", goto: "kubernetes-1" },
      { t: "A domain you can point at the ingress.", goto: "kubernetes-2" },
      NPUB,
      AGENT,
    ],
    prompt: "Use the self-host-buzz skill to install Buzz on our Kubernetes cluster with Block's Helm chart. Domain: {{DOMAIN}}. Keep the values file in <folder>. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join screen.",
    run: [
      { k: "you", t: "Use the self-host-buzz skill to install Buzz on our Kubernetes cluster…" },
      { k: "ok", n: "", t: "Inputs", d: "npub checksum good · image {{TAG}}" },
      { k: "ask", t: "The cluster has no ingress controller or cert-manager. Add Traefik and cert-manager? Its load balancer and the data volumes cost money." },
      { k: "you", t: "Go ahead." },
      { k: "ok", n: "1", t: "Cluster", d: "ingress class traefik · issuer letsencrypt ready" },
      { k: "ask", t: "Point an A record for {{DOMAIN}} at the load balancer's IP. Done?" },
      { k: "you", t: "Done." },
      { k: "ok", n: "2", t: "DNS", d: "{{DOMAIN}} points at the load balancer" },
      { k: "ok", n: "3", t: "Values", d: "image pinned · MinIO swapped · Desktop allowed" },
      { k: "ok", n: "4", t: "Install", d: "5 pods ready in about 80 s" },
      { k: "turn", t: "Copy the relay key into your password manager, with the command I'll give you." },
      { k: "ok", n: "6", t: "Checks", d: "certificate from Let's Encrypt · you're the owner · relay ports closed on the node" },
      { k: "turn", t: "Join from Buzz Desktop: {{RELAY_URL}}" },
    ],
  },
  "k8s-private": {
    ready: [
      { t: "A Kubernetes cluster, with <code>kubectl</code> and <code>helm</code> pointed at it. No ingress controller or load balancer needed.", goto: "kubernetes-P2" },
      { t: "Your tailnet prepared: HTTPS on, two tags and a grant in the policy, and an OAuth client saved in two files.", goto: "kubernetes-P1" },
      NPUB,
      AGENT,
    ],
    prompt:
      "Use the self-host-buzz skill to install Buzz on our Kubernetes cluster, reachable only on our Tailscale network. Name: {{DOMAIN}}. The OAuth client's ID and secret are in <ID file> and <secret file>. Keep the values file in <folder>. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join screen.",
    run: [
      { k: "you", t: "Use the self-host-buzz skill to install Buzz on our Kubernetes cluster, on our Tailscale network only…" },
      { k: "ok", n: "", t: "Inputs", d: "npub checksum good · image {{TAG}}" },
      { k: "ok", n: "P1", t: "Tailnet", d: "OAuth files readable by you only, no newline" },
      { k: "ok", n: "P2", t: "Operator", d: "OAuth client in a Secret, never shown · signed in · ingress class tailscale" },
      { k: "ok", n: "P3", t: "Name", d: "{{DOMAIN}} is free" },
      { k: "ask", t: "Is wss://{{DOMAIN}} the permanent URL? Renaming the tailnet later changes it too." },
      { k: "you", t: "Yes." },
      { k: "ok", n: "P4", t: "Values and install", d: "Tailscale's ingress · 5 pods ready in about 90 s" },
      { k: "turn", t: "Copy the relay key into your password manager, with the command I'll give you." },
      { k: "ok", n: "P6", t: "Checks", d: "ingress named {{DOMAIN}} · nothing public · you're the owner" },
      { k: "turn", t: "Join from Buzz Desktop, on the private network: {{RELAY_URL}}" },
    ],
  },
  railway: {
    ready: [
      { t: "A Railway account. A trial fits one relay: the template adds 3 services and a bucket." },
      { t: "The Railway CLI, logged in with <code>railway login</code>, if your agent should deploy for you. Otherwise it walks you through the template page." },
      { t: "Optionally, a domain you can add a CNAME record to. Otherwise the relay keeps the name Railway assigns." },
      NPUB,
      AGENT,
    ],
    prompt: "Use the self-host-buzz skill to set up Buzz on Railway with Block's template. Owner: {{OWNER_NPUB}}, copied from Buzz Desktop's Join screen.",
    run: [
      { k: "you", t: "Use the self-host-buzz skill to set up Buzz on Railway…" },
      { k: "ok", n: "", t: "Inputs", d: "npub checksum good · image {{TAG}}" },
      { k: "ask", t: "Keep the *.up.railway.app name Railway assigns, or use your own domain? It's permanent once anyone joins." },
      { k: "you", t: "Railway's name." },
      { k: "ask", t: "Deploying creates a Railway project on your account. Go ahead?" },
      { k: "you", t: "Go ahead." },
      { k: "ok", n: "2", t: "Deploy", d: "relay, Postgres, Redis and a bucket · status SUCCESS" },
      { k: "ok", n: "3", t: "Settings", d: "URL and owner right · relay key 64 characters, never shown" },
      { k: "turn", t: "Copy BUZZ_RELAY_PRIVATE_KEY from the relay's Variables into your password manager." },
      { k: "ok", n: "5", t: "Image", d: "{{TAG}} · files now need a member's signature" },
      { k: "ok", n: "", t: "Checks", d: "https · WebSocket · Desktop allowed" },
      { k: "turn", t: "Join from Buzz Desktop at the wss:// address I give you, on up.railway.app." },
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
