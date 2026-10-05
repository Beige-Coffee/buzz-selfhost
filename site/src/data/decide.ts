/**
 * Three questions that pick a setup.
 * - The deciding tradeoff is Buzz's own: running infrastructure costs time or money, so how much you run
 *   yourself trades control for upkeep (block/buzz VISION_SOVEREIGN.md, "What You Give Up").
 * - Reach is the other real fork: a private network hides the relay, but every device needs the VPN,
 *   phones included.
 * - Experience isn't asked: an agent with the skill does the setup and the upkeep.
 * Results come from the tested paths; where an answer pair has no tested setup, the closest one says so.
 */
import type { OwnMode, Path, Reach, Track } from "../lib/values";

const issue = (n: number) => `<a href="https://github.com/block/buzz/issues/${n}">#${n}</a>`;

export type QuestionId = "trial" | "run" | "reach";
export type Answers = Partial<Record<QuestionId, string>>;

export interface Question {
  id: QuestionId;
  text: string;
  /** shown until an option is picked */
  hint: string;
  /** hint: what picking it means; when: who should pick it, shown on hover */
  options: { id: string; label: string; hint: string; when: string }[];
}

export const QUESTIONS: Question[] = [
  {
    id: "trial",
    text: "Environment",
    hint: "Local tests run on ws://127.0.0.1:3000 and don't migrate to a server.",
    options: [
      { id: "trial", label: "Local test", hint: "Docker on your laptop. No domain, no TLS.", when: "Choose this to see Buzz work before you commit to a server. Nothing carries over." },
      { id: "real", label: "Production", hint: "A server with a permanent URL, TLS and backups.", when: "Choose this if a team will use it. It needs its permanent URL and backups from day one." },
    ],
  },
  {
    id: "run",
    text: "Infrastructure",
    hint: "Who operates the machine: you, a provider, or a platform.",
    options: [
      { id: "all", label: "Own hardware", hint: "You operate the machine: power, network, disks and backups.", when: "Choose this if the data must stay on machines you own, and you can keep one running." },
      { id: "server", label: "Rented VPS", hint: "The provider runs the hardware. You run the OS, Docker and backups.", when: "Choose this for full control of the software without owning hardware. The most tested path." },
      { id: "little", label: "Managed platform", hint: "Railway runs and restarts the containers. You run backups and upgrades.", when: "Choose this if nobody wants to maintain a server. You give up control of the machines for less upkeep." },
      { id: "cluster", label: "Existing Kubernetes", hint: "Block's Helm chart on your cluster, behind your ingress.", when: "Choose this if your team already runs a cluster with an ingress controller and cert-manager." },
    ],
  },
  {
    id: "reach",
    text: "Network access",
    hint: "Both require membership to read or post.",
    options: [
      { id: "public", label: "Public internet", hint: "A public hostname with TLS. Every client connects, including the phone app.", when: "Choose this if members join from anywhere, with nothing extra to install. Access still requires membership." },
      { id: "private", label: "Private network (VPN)", hint: "Tailscale only, no public ports. Every device runs Tailscale, phones included.", when: "Choose this if only devices on your VPN should reach it." },
    ],
  },
];

export interface Result {
  name: string;
  set: { path: Path; ownMode?: OwnMode; reach?: Reach };
  why: string;
  trade: string[];
}

export const RESULTS: Record<Track, Result> = {
  vps: {
    name: "A VPS",
    set: { path: "vps", ownMode: "public", reach: "public" },
    why: "Data and keys on a server you control. The provider handles the hardware.",
    trade: ["You run OS updates, Docker and backups.", "About $24 a month for 4 GB."],
  },
  "vps-private": {
    name: "A VPS on a private network",
    set: { path: "vps", ownMode: "public", reach: "private" },
    why: "A server you control, with no public ports.",
    trade: ["Every device runs Tailscale, phones included.", `The Tailscale name stays the address for good ${issue(4952)}.`],
  },
  "own-public": {
    name: "Your hardware",
    set: { path: "own", ownMode: "public", reach: "public" },
    why: "Data, keys and backups on hardware you own.",
    trade: ["You handle power, network and disks.", "Ports 80 and 443 forwarded; some ISPs block inbound traffic (CGNAT)."],
  },
  "own-private": {
    name: "Your hardware on a private network",
    set: { path: "own", ownMode: "public", reach: "private" },
    why: "Hardware you own, with no public ports.",
    trade: ["You handle power, network and disks.", "Every device runs Tailscale, phones included."],
  },
  railway: {
    name: "Railway",
    set: { path: "railway" },
    why: "The lowest operations load: Railway runs and restarts the containers.",
    trade: ["Data and the relay key are on Railway.", "The relay has no volume: git repositories are lost on redeploy."],
  },
  k8s: {
    name: "Kubernetes",
    set: { path: "k8s", reach: "public" },
    why: "Runs on the cluster you already operate, with room for replicas.",
    trade: [`Pin <code>image.tag</code> and override the MinIO image ${issue(7880)}.`, "An ingress, certificates and a domain at its load balancer."],
  },
  "k8s-private": {
    name: "Kubernetes on a private network",
    set: { path: "k8s", reach: "private" },
    why: "The cluster you already operate, with no load balancer and nothing public.",
    trade: ["Tailscale's operator, with an OAuth client you create.", "Every device runs Tailscale; phone pairing isn't tested here yet."],
  },
  practice: {
    name: "Local test",
    set: { path: "own", ownMode: "practice" },
    why: "Docker on your laptop: free, and nothing leaves the machine.",
    trade: ["Reachable only from localhost.", "Nothing migrates: a server means a new URL and a new community."],
  },
};

/** The setup for these answers, or null until there are enough of them. */
export function pick(a: Answers): { track: Track; note?: string } | null {
  if (a.trial === "trial") return { track: "practice" };
  if (!a.run || !a.reach) return null;
  const priv = a.reach === "private";
  switch (a.run) {
    case "all":
      return { track: priv ? "own-private" : "own-public" };
    case "server":
      return { track: priv ? "vps-private" : "vps" };
    case "little":
      return priv ? { track: "vps-private", note: "Railway has no private option; this is the closest tested setup." } : { track: "railway" };
    case "cluster":
      return { track: priv ? "k8s-private" : "k8s" };
    default:
      return null;
  }
}
