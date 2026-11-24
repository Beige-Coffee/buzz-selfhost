/**
 * Three questions that pick a setup.
 * - What it's for: a local test, or a server. Neither a test nor a community on Block's hosting can
 *   move to a server later (block/buzz#6803), so the hint says so up front.
 * - No upkeep question (owner's call, 2026-11-23): the guide is for the technical person who will
 *   run it. Each result's "You give up" says they run updates, backups and upgrades.
 * - Where it runs picks the skill's setup. "Something else" gets the closest one and what the guide
 *   doesn't cover. "Block's servers" (owner's call, 2026-11-24) is for someone who wants no
 *   infrastructure: Builderlab, Block's hosted service. Its card sends them to Block's own guide.
 * - How people connect is the other real fork: over the internet (a team or an open community) or
 *   only through a VPN, which hides the relay but puts Tailscale on every device, phones included.
 * Each result says why it fits, what you need, what you give up and a rough monthly cost.
 * Prices read 2026-11-06: DigitalOcean's 4 GB Basic Droplet is $24 a month, its weekly backups 20% more,
 * a load balancer $12 and volumes $0.10 a GiB (the chart's four quickstart volumes come to 34 GiB).
 * Tailscale's Personal plan is free for non-commercial use, up to 6 users, and Standard is $8 a user a
 * month; a tailnet on a company's own domain counts as business use (tailscale.com/pricing, kb/1251).
 */
import type { OwnMode, Path, Reach, Track } from "../lib/values";

const issue = (n: number) => `<a href="https://github.com/block/buzz/issues/${n}">#${n}</a>`;

export type QuestionId = "use" | "where" | "reach";
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
    hint: `A test or a community hosted on Builderlab can't move to your server later. A server starts a new one ${issue(6803)}.`,
    options: [
      {
        id: "try",
        label: "Trying it myself",
        hint: "A local test: Docker on this computer, with no server or domain.",
        when: "Pick this to try Buzz before you choose a server. A server starts a new community.",
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
    id: "where",
    text: "Where will it run?",
    hint: "Each setup runs Block's own install: its Compose bundle on a server, or its Helm chart on a cluster.",
    options: [
      {
        id: "rent",
        label: "A server you rent",
        hint: "A VPS. The provider runs the hardware, and you run the OS, Docker and backups.",
        when: "Pick this for full control without owning hardware.",
      },
      {
        id: "own",
        label: "A machine you own",
        hint: "An x86 Linux machine you run, such as a mini PC or a VM on one.",
        when: "Pick this if the data must stay on hardware you own.",
      },
      {
        id: "cluster",
        label: "Your Kubernetes cluster",
        hint: "Block's Helm chart, on a cluster your team already runs.",
        when: "Pick this only if your team already runs a cluster. Your agent can add an ingress and cert-manager.",
      },
      {
        id: "block",
        label: "Block's servers",
        hint: "Builderlab, Block's hosted service, runs the relay for you. Your messages and files live on Block's servers, where Block can read them, as any server's operator can.",
        when: "Pick this if you don't want to run any infrastructure and you're fine with Block holding your data.",
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
    text: "How will people connect?",
    hint: "Either way, only members can read or post. Any member can open a file whose link they have.",
    options: [
      {
        id: "invite",
        label: "Over the internet",
        hint: "For a team or an open community. Anyone with an invite joins from any device, with nothing to install.",
        when: "Pick this if members join from anywhere, as in an open-source community.",
      },
      {
        id: "private",
        label: "Only through your VPN",
        hint: "Tailscale. The relay has no public address, and every device needs Tailscale, phones included. Suits a private team, not a community.",
        when: "Pick this if only devices on your Tailscale network should reach it.",
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
const DROPLET = "About $24 for 4 GB on DigitalOcean, with 20% more for weekly backups";
const VOLUMES = "About $3.40 for the four storage volumes on DigitalOcean.";
const CHART = "It's the chart's evaluation profile, and you restore backups with your own tools.";

export const SETUPS: Record<Track, Setup> = {
  practice: {
    name: "A local test",
    set: { path: "own", ownMode: "practice" },
    why: "Try Buzz on this computer before you choose a server.",
    need: "Docker on this Mac or Linux computer, with ports 80 and 443 free.",
    give: "Only this computer can reach it, so phones can't pair. A server starts a new community; you can reuse your identity.",
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
    give: `${CHART} Use Helm for this generated-secret quickstart. Argo CD and Flux need stable, externally managed secrets; the upstream chart supports that advanced path.`,
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

/** "Something else": what the guide leaves out, shown above the closest setup. */
export const NOT_COVERED = `This guide doesn't cover ARM machines such as a Raspberry Pi, a NAS's own apps, a Mac or Windows computer as the server, or app platforms such as Fly.io or Render. It also leaves out managed Postgres, Redis or S3, VPNs other than Tailscale, more than one relay, and moving a community from buzz.xyz ${issue(6803)}.`;

/**
 * Block's servers: what Block's own pages say (buzz.xyz/support, read 2026-11-24). Hosted communities
 * are made in the Buzz app or on Builderlab's Communities page, and the pricing page starts free and
 * charges for use. A hosted community can't move to a relay of your own (block/buzz#6803).
 */
export const HOSTED = {
  name: "Builderlab",
  why: "Block runs the relay for you on its servers, and you set up nothing.",
  need: `A Builderlab account. You create the community in the Buzz app or on <a href="https://app.builderlab.xyz/buzz">Builderlab's Communities page</a>.`,
  give: `Your messages, files and members live on Block's servers, under Block's hosted terms. Block can read them, as any server's operator can. A hosted community can't move to your own server later ${issue(6803)}.`,
  cost: `Free to start, then you pay for what you use, as <a href="https://buzz.xyz/pricing">Block's pricing page</a> lists.`,
  note: "This guide covers running your own relay. Block's guide covers hosted communities.",
  link: "https://buzz.xyz/support#hosted-community",
};

/** A setup, the closest setup to one the guide doesn't cover, or Block's hosting. */
export type Outcome = { kind: "setup" | "closest"; track: Track } | { kind: "hosted" };

/** Questions an earlier answer has decided. They dim, and keep their answers for when they count again. */
export function dimmed(a: Answers): QuestionId[] {
  if (a.use === "try") return ["where", "reach"];
  // a hosted community is always on the internet
  return a.where === "block" ? ["reach"] : [];
}

/** What these answers pick, or null while a question that counts is open. */
export function pick(a: Answers): Outcome | null {
  if (a.use === "try") return { kind: "setup", track: "practice" };
  if (a.use === "team" && a.where === "block") return { kind: "hosted" };
  if (a.use !== "team" || !a.reach) return null;
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
