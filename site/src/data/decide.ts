/**
 * Four questions that pick a setup, or say why it's too early for one.
 * - Upkeep is asked before hardware: every setup here is a server someone looks after (block/buzz
 *   VISION_SOVEREIGN.md, "What You Give Up": "Someone has to keep it running").
 * - Where it runs picks the skill's setup. "Something else" gets the closest one and what the guide
 *   doesn't cover; "Nobody yet" gets a local test, and Block's hosting with its catch (block/buzz#6803).
 * - Reach is the other real fork: a private network hides the relay, but every device needs
 *   Tailscale, phones included.
 * Each result says why it fits, what you need, what you give up and a rough monthly cost.
 * Prices read 2026-11-06: DigitalOcean's 4 GB Basic Droplet is $24 a month, its weekly backups 20% more,
 * a load balancer $12 and volumes $0.10 a GiB (the chart's four quickstart volumes come to 34 GiB).
 * Tailscale's Personal plan is free for non-commercial use, up to 6 users, and Standard is $8 a user a
 * month; a tailnet on a company's own domain counts as business use (tailscale.com/pricing, kb/1251).
 */
import type { OwnMode, Path, Reach, Track } from "../lib/values";

const issue = (n: number) => `<a href="https://github.com/block/buzz/issues/${n}">#${n}</a>`;

export type QuestionId = "use" | "owner" | "where" | "reach";
export type Answers = Partial<Record<QuestionId, string>>;

export interface Question {
  id: QuestionId;
  /** the fieldset's legend */
  text: string;
  /** shown under the options until one is picked */
  hint: string;
  /** hint: what picking it means, shown once picked; when: who should pick it, on hover and focus */
  options: { id: string; label: string; hint: string; when: string }[];
}

export const QUESTIONS: Question[] = [
  {
    id: "use",
    text: "What is it for?",
    hint: "A test can't become your community later: a server starts a new one.",
    options: [
      {
        id: "try",
        label: "Trying it myself",
        hint: "A local test: Docker on this computer, with no server or domain.",
        when: "Pick this to try Buzz before you choose a server. Nothing carries over.",
      },
      {
        id: "team",
        label: "People will use it",
        hint: "A server with a permanent address, HTTPS and backups.",
        when: "Pick this if a team or a community will use it. Set up the permanent address and backups from the start.",
      },
    ],
  },
  {
    id: "owner",
    text: "Who will look after it?",
    hint: "Someone backs it up every week and upgrades it every month, with an agent.",
    options: [
      {
        id: "us",
        label: "One of us",
        hint: "They run the backups and upgrades with an agent, and step in when something breaks.",
        when: "Pick this if someone will own the server and has time for it every month.",
      },
      {
        id: "nobody",
        label: "Nobody yet",
        hint: "Then it's too early for a server of your own.",
        when: "Pick this if nobody has time to look after a server yet.",
      },
    ],
  },
  {
    id: "where",
    text: "Where will it run?",
    hint: "Each setup runs Block's own install: its Compose bundle on a server, or its Helm chart on a cluster.",
    options: [
      {
        id: "rent",
        label: "A server we rent",
        hint: "A VPS. The provider runs the hardware, and you run the OS, Docker and backups.",
        when: "Pick this for full control without owning hardware.",
      },
      {
        id: "own",
        label: "A machine we own",
        hint: "An x86 Linux machine you run, such as a mini PC or a VM on one.",
        when: "Pick this if the data must stay on hardware you own.",
      },
      {
        id: "cluster",
        label: "Our Kubernetes cluster",
        hint: "Block's Helm chart, on a cluster your team already runs.",
        when: "Pick this only if your team already runs a cluster. Your agent can add an ingress and cert-manager.",
      },
      {
        id: "other",
        label: "Something else",
        hint: "Such as a Raspberry Pi, a NAS's own apps or an app platform. You'll see the closest setup.",
        when: "Pick this if none of these fits.",
      },
    ],
  },
  {
    id: "reach",
    text: "Who can reach it?",
    hint: "Either way, only members can read or post. Any member can open a file whose link they have.",
    options: [
      {
        id: "invite",
        label: "Anyone we invite",
        hint: "A public address with HTTPS. Any device can connect, but only members can read or post.",
        when: "Pick this if members join from anywhere with nothing extra to install, as in an open-source community.",
      },
      {
        id: "private",
        label: "Only our private network",
        hint: "Tailscale only: the relay has no public address. Every device needs Tailscale, phones included.",
        when: "Pick this if only devices on your Tailscale network should reach it. Not for a community anyone can join.",
      },
    ],
  },
];

export interface Setup {
  name: string;
  /** the values that open this setup's guide, as the cards' own picks set them */
  set: { path: Path; ownMode?: OwnMode; reach?: Reach };
  why: string;
  /** before starting */
  need: string;
  give: string;
  /** a rough monthly cost */
  cost: string;
  note?: string;
}

const TAILSCALE = "Tailscale is free for non-commercial use, up to 6 people. A company pays from $8 a person.";
const DROPLET = "About $24 for 4 GB on DigitalOcean, with 20% more for its backups";
const VOLUMES = "About $3.40 for the four storage volumes on DigitalOcean.";
const CHART = "It's the chart's evaluation profile, and you restore backups with your own tools.";

export const SETUPS: Record<Track, Setup> = {
  practice: {
    name: "A local test",
    set: { path: "own", ownMode: "practice" },
    why: "Try Buzz on this computer before you choose a server.",
    need: "Docker on this Mac or Linux computer, with ports 80 and 443 free.",
    give: "Only this computer can reach it, so phones can't pair. Nothing carries over: a server starts a new community.",
    cost: "Free.",
  },
  vps: {
    name: "A VPS",
    set: { path: "vps", ownMode: "public", reach: "public" },
    why: "Your data and the relay's key are stored on a server you control. The provider runs the hardware.",
    need: "Ubuntu 24.04 on x86 with 4 GB of RAM and 20 GB of disk, ports 80 and 443 open, and a domain.",
    give: "You run updates, backups and upgrades, with your agent.",
    cost: `${DROPLET}, plus a domain.`,
  },
  "vps-private": {
    name: "A VPS on a private network",
    set: { path: "vps", ownMode: "public", reach: "private" },
    why: "Your data and the relay's key are stored on a server you control, and only devices on your Tailscale network reach it.",
    need: "Ubuntu 24.04 on x86 with 4 GB of RAM and 20 GB of disk, nothing open to the internet but SSH, and Tailscale on every device.",
    give: `Every member runs Tailscale, phones included, and a phone runs one VPN at a time. The Tailscale name is the community's address for good ${issue(4952)}.`,
    cost: `${DROPLET}. ${TAILSCALE}`,
  },
  "own-public": {
    name: "Your hardware",
    set: { path: "own", ownMode: "public", reach: "public" },
    why: "Your data, the relay's key and the backups are stored on hardware you own.",
    need: "An x86 machine with Ubuntu 24.04, 4 GB of RAM and 20 GB of disk. Ports 80 and 443 forwarded to it, with nothing else using them. A domain, and a fixed home IP or dynamic DNS.",
    give: "Power, network and disks are yours. Some internet providers block incoming traffic (CGNAT).",
    cost: "Power, plus a domain.",
    note: "Only your team joining? A private network needs no router changes.",
  },
  "own-private": {
    name: "Your hardware on a private network",
    set: { path: "own", ownMode: "public", reach: "private" },
    why: "Your data, the relay's key and the backups are stored on hardware you own, with no router changes.",
    need: "An x86 machine with Ubuntu 24.04, 4 GB of RAM and 20 GB of disk, and Tailscale on every device.",
    give: "Power, network and disks are yours. Every member runs Tailscale, phones included, and the Tailscale name is the address for good.",
    cost: `Power. ${TAILSCALE}`,
  },
  k8s: {
    name: "Kubernetes",
    set: { path: "k8s", reach: "public" },
    why: "Runs beside your other services, on a cluster you already operate. The guide installs one relay, with Postgres, Redis and files in the cluster.",
    need: "x86 nodes, <code>kubectl</code> and <code>helm</code>, a default StorageClass, an ingress and cert-manager or your OK to add them, and a domain pointed at the load balancer.",
    give: `${CHART} Install with Helm, not Argo CD or Flux: they replace the relay key.`,
    cost: `${VOLUMES} Add $12 for a load balancer if your agent adds an ingress.`,
  },
  "k8s-private": {
    name: "Kubernetes on a private network",
    set: { path: "k8s", reach: "private" },
    why: "Runs beside your other services, on a cluster you already operate, with no load balancer and nothing public.",
    need: "x86 nodes, <code>kubectl</code> and <code>helm</code>, a default StorageClass, and an OAuth client for Tailscale's Kubernetes operator, which your agent installs.",
    give: `Every device needs Tailscale, and phones can't pair on this setup yet. ${CHART}`,
    cost: `${VOLUMES} ${TAILSCALE}`,
    note: "Members on phones? A VPS on a private network pairs them.",
  },
};

/** "Nobody yet": a server needs someone, so this says so, with a local test meanwhile. */
export const OWNER = {
  name: "Find an owner first",
  why: "Every setup here is a server someone looks after: a backup every week and an upgrade every month, with your agent.",
  hosted: `Block hosts communities at <a href="https://buzz.xyz">buzz.xyz</a>, but a community there can't move to your own server later ${issue(6803)}.`,
  test: "Want to try Buzz meanwhile? A local test on this computer is free, and only you can reach it.",
  go: "Try a local test",
};

/** "Something else": what the guide leaves out, shown above the closest setup. */
export const NOT_COVERED = `This guide doesn't cover ARM machines such as a Raspberry Pi, a NAS's own apps, a Mac or Windows computer as the server, or app platforms such as Railway, Fly.io or Render. It also leaves out managed Postgres, Redis or S3, VPNs other than Tailscale, more than one relay, and moving a community from buzz.xyz ${issue(6803)}.`;

/** A setup, the closest setup to one the guide doesn't cover, or an owner to find first. */
export type Outcome = { kind: "setup" | "closest"; track: Track } | { kind: "owner" };

/** Questions an earlier answer has decided. They dim, and keep their answers for when they count again. */
export function dimmed(a: Answers): QuestionId[] {
  if (a.use === "try") return ["owner", "where", "reach"];
  if (a.owner === "nobody") return ["where", "reach"];
  return [];
}

/** What these answers pick, or null while a question that counts is open. */
export function pick(a: Answers): Outcome | null {
  if (a.use === "try") return { kind: "setup", track: "practice" };
  if (a.use !== "team") return null;
  if (a.owner === "nobody") return { kind: "owner" };
  if (a.owner !== "us" || !a.reach) return null;
  const priv = a.reach === "private";
  switch (a.where) {
    case "rent":
      return { kind: "setup", track: priv ? "vps-private" : "vps" };
    case "own":
      return { kind: "setup", track: priv ? "own-private" : "own-public" };
    case "cluster":
      return { kind: "setup", track: priv ? "k8s-private" : "k8s" };
    case "other":
      return { kind: "closest", track: priv ? "vps-private" : "vps" };
    default:
      return null;
  }
}
