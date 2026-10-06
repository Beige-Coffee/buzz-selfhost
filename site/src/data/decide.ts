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
    hint: "A local test runs at ws://127.0.0.1:3000 and can't be moved to a server later.",
    options: [
      { id: "trial", label: "Local test", hint: "Docker on your laptop. No domain, no TLS.", when: "Pick this to try Buzz before choosing a server. Nothing carries over." },
      { id: "real", label: "Production", hint: "A server with a permanent URL, TLS and backups.", when: "Pick this if a team will use it. Set the permanent URL and backups from the start." },
    ],
  },
  {
    id: "run",
    text: "Infrastructure",
    hint: "Who runs the machine: you, a hosting provider, or a platform.",
    options: [
      { id: "all", label: "Own hardware", hint: "You run the machine: power, network, disks, backups.", when: "Pick this if the data must stay on hardware you own." },
      { id: "server", label: "Rented VPS", hint: "The provider runs the hardware. You run the OS, Docker and backups.", when: "Pick this for full control without owning hardware. The most tested setup." },
      { id: "little", label: "Managed platform", hint: "Railway runs the containers. You run backups and upgrades.", when: "Pick this if nobody wants to maintain a server. Less control, less upkeep." },
      { id: "cluster", label: "Already run Kubernetes", hint: "Block's Helm chart on your cluster, behind your ingress.", when: "Pick this if your team already runs a cluster with an ingress controller and cert-manager." },
    ],
  },
  {
    id: "reach",
    text: "Network access",
    hint: "Either way, only members can read or post.",
    options: [
      { id: "public", label: "Public internet", hint: "A public URL with TLS. Any device can connect, including phones.", when: "Pick this if members join from anywhere with nothing extra to install." },
      { id: "private", label: "Private network (VPN)", hint: "Tailscale only, no public ports. Every device needs Tailscale, phones included.", when: "Pick this if only devices on your VPN should reach it." },
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
    why: "Your data and keys on a server you control. The provider runs the hardware.",
    trade: ["You run OS updates, Docker and backups.", "About $24 a month for 4 GB."],
  },
  "vps-private": {
    name: "A VPS on a private network",
    set: { path: "vps", ownMode: "public", reach: "private" },
    why: "A server you control, with no public ports.",
    trade: ["Every device needs Tailscale, phones included.", `The Tailscale name is the permanent address ${issue(4952)}.`],
  },
  "own-public": {
    name: "Your hardware",
    set: { path: "own", ownMode: "public", reach: "public" },
    why: "Data, keys and backups on hardware you own.",
    trade: ["You handle power, network and disks.", "Forward ports 80 and 443 on your router. Some ISPs block incoming traffic (CGNAT)."],
  },
  "own-private": {
    name: "Your hardware on a private network",
    set: { path: "own", ownMode: "public", reach: "private" },
    why: "Hardware you own, with no public ports.",
    trade: ["You handle power, network and disks.", "Every device needs Tailscale, phones included."],
  },
  railway: {
    name: "Railway",
    set: { path: "railway" },
    why: "The least upkeep: Railway runs and restarts the containers.",
    trade: ["Your data and the relay key live on Railway.", "The relay has no volume, so git repositories are lost on redeploy."],
  },
  k8s: {
    name: "Kubernetes",
    set: { path: "k8s", reach: "public" },
    why: "Runs on the cluster you already operate, and can scale to more replicas.",
    trade: [`Pin <code>image.tag</code> and override the MinIO image ${issue(7880)}.`, "Needs an ingress, TLS certificates and a domain pointed at the load balancer."],
  },
  "k8s-private": {
    name: "Kubernetes on a private network",
    set: { path: "k8s", reach: "private" },
    why: "The cluster you already operate, with no load balancer and nothing public.",
    trade: ["Needs Tailscale's Kubernetes operator and an OAuth client you create.", "Every device needs Tailscale. The skill doesn't set up phone pairing here."],
  },
  practice: {
    name: "Local test",
    set: { path: "own", ownMode: "practice" },
    why: "Docker on your laptop. Free, and nothing leaves the machine.",
    trade: ["Only this laptop can reach it.", "Nothing moves to a server: a server means a new URL and a new community."],
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
      return priv ? { track: "vps-private", note: "Railway has no private option. This is the closest tested setup." } : { track: "railway" };
    case "cluster":
      return { track: priv ? "k8s-private" : "k8s" };
    default:
      return null;
  }
}
