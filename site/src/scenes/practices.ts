import { isPrivate, onValues, trackOf, type Track } from "../lib/values";

/**
 * Best practices, each tied to a source: Buzz's own deploy files and code, and standard operations
 * guidance (Docker, Let's Encrypt, CISA).
 */
interface Practice {
  id: string;
  tag: "Setup" | "Access" | "Operations";
  title: string;
  why: string;
  do: string;
  /** replacement "do" text on Railway, where run.sh and Caddy don't exist */
  doRailway?: string;
  /** replacements on a private (Tailscale) server, and on Kubernetes */
  private?: Partial<Pick<Practice, "title" | "why" | "do">>;
  k8s?: Partial<Pick<Practice, "title" | "why" | "do">>;
  tracks?: Track[];
  sources: [string, string][];
}

const GH = "https://github.com/block/buzz/blob/main";

const PRACTICES: Practice[] = [
  {
    id: "url",
    tag: "Setup",
    title: "Pick the permanent URL before anyone joins",
    why: "The relay keys the community on the exact <code>RELAY_URL</code>. A new URL is a new, empty community, and everything in the old one stays behind.",
    do: "Use a domain you control, not a generated one, and set <code>RELAY_URL</code> once.",
    doRailway: "Attach your own domain before inviting anyone, instead of the <code>*.up.railway.app</code> address.",
    private: { do: "Pick the Tailscale name you'll keep, and set <code>RELAY_URL</code> once. Renaming the machine or the network changes the URL." },
    sources: [
      ["block/buzz#6803", "https://github.com/block/buzz/issues/6803"],
    ],
  },
  {
    id: "keys",
    tag: "Setup",
    title: "Give two people the keys",
    why: "The relay key is the community's permanent identity, and the owner is the one member who can't be removed. If one maintainer holds them alone, the community depends on that person.",
    do: "Keep the relay key, the owner key and <code>.env</code> in an encrypted vault two maintainers can open. Never in the repo or in chat; <code>.env</code> is git-ignored for that reason.",
    sources: [
      [".gitignore", `${GH}/.gitignore`],
    ],
    k8s: { do: "Keep the relay key (in the <code>buzz-relay</code> Secret), the owner key and your values file in an encrypted vault two maintainers can open. Never in the repo or in chat." },
  },
  {
    id: "pin",
    tag: "Setup",
    title: "Pin the version",
    why: "<code>.env.example</code> ships <code>:main</code>, which changes with every merge, and the relay migrates the database each time it starts.",
    do: "Set <code>BUZZ_IMAGE</code> to a <code>sha-</code> tag. Upgrade on purpose: back up, check out the new tag's commit in <code>buzz/</code>, change the tag, then <code>./run.sh upgrade</code>.",
    doRailway: "The template pins a July image, from before file reads required membership. Move it to a current <code>sha-</code> tag right after deploying, then upgrade on purpose, after a backup.",
    k8s: { do: "Set <code>image.tag</code> in your values: the chart's default image dates from June 2026. Upgrade on purpose: back up, change the tag, then <code>helm upgrade</code>." },
    sources: [
      [".env.example", `${GH}/deploy/compose/.env.example`],
      ["deploy/compose README", `${GH}/deploy/compose/README.md`],
    ],
  },
  {
    id: "ports",
    tag: "Access",
    title: "Only 80 and 443 face the internet",
    why: "Docker publishes container ports around <code>ufw</code>, so a firewall rule doesn't close a published port. The Caddy overlay removes the relay's port 3000, and Let's Encrypt needs port 80 to issue certificates.",
    do: "Start, restart and upgrade with <code>BUZZ_COMPOSE_TLS=true</code>. Allow SSH from your own IP only.",
    private: {
      title: "Nothing faces the internet",
      why: "On a private network the relay needs no public ports. Docker publishes container ports around <code>ufw</code>, so binding the relay to localhost is what keeps it off the internet.",
      do: "Set <code>BUZZ_HTTP_PORT=127.0.0.1:3000</code>, serve it with <code>tailscale serve</code>, and check from outside that 80, 443 and 3000 are closed.",
    },
    k8s: {
      title: "Only the ingress faces the internet",
      why: "The chart's Service is <code>ClusterIP</code>, so the relay is reachable only through your ingress, where TLS ends.",
      do: "Keep <code>service.type</code> at <code>ClusterIP</code> and expose the relay through the ingress with a certificate.",
    },
    tracks: ["vps", "vps-private", "own-public", "own-private", "practice", "k8s", "k8s-private"],
    sources: [
      ["Docker and ufw", "https://docs.docker.com/engine/network/packet-filtering-firewalls/"],
      ["Let's Encrypt challenges", "https://letsencrypt.org/docs/challenge-types/"],
    ],
  },
  {
    id: "closed",
    tag: "Access",
    title: "Keep membership closed",
    why: "The bundle ships with both auth settings on, so only keys on the member list can read or write.",
    do: "Leave <code>BUZZ_REQUIRE_AUTH_TOKEN</code> and <code>BUZZ_REQUIRE_RELAY_MEMBERSHIP</code> on. Add people by public ID, one at a time, and make admins only of the people who run the relay.",
    k8s: { do: "Leave <code>relay.requireAuthToken</code> and <code>relay.requireRelayMembership</code> on, as the chart ships them. Add people by public ID, and make admins only of the people who run the relay." },
    sources: [
      [".env.example", `${GH}/deploy/compose/.env.example`],
      ["run.sh", `${GH}/deploy/compose/run.sh`],
    ],
  },
  {
    id: "agents",
    tag: "Access",
    title: "Give every agent its own key and membership",
    why: "Agents are members with their own keys and audit trail. The relay turns away a key that isn't a member (<code>relay_membership_required</code>), and a reply that mentions a non-member fails, so an agent missing a membership can go quiet.",
    do: "One key per agent, added as a member of each channel it answers in. Never give an agent a person's key.",
    sources: [
      ["Buzz README", "https://github.com/block/buzz#stuff-you-do-in-buzz"],
      ["buzz-relay api/mod.rs", `${GH}/crates/buzz-relay/src/api/mod.rs`],
    ],
  },
  {
    id: "backup",
    tag: "Operations",
    title: "Back up four things, and prove the restore",
    why: "Postgres, the file bucket, the git volume and <code>.env</code> hold everything. CISA's 3-2-1 rule: three copies, on two kinds of storage, one off-site. A backup counts once it has been restored.",
    do: "Snapshot the four together with the relay stopped, encrypt them, keep one copy off the server, and restore to a spare machine once.",
    doRailway: "Dump Postgres and copy the bucket with <code>railway run</code>, keep one copy off Railway, and restore once into an empty database.",
    k8s: { do: "With the quickstart profile, dump Postgres through <code>kubectl exec</code> and keep the relay's Secret; in production, use your managed services' backups. Keep one copy off the cluster, and restore once." },
    sources: [
      ["run.sh backup-hint", `${GH}/deploy/compose/run.sh`],
      ["CISA: 3-2-1", "https://www.cisa.gov/sites/default/files/publications/data_backup_options.pdf"],
    ],
  },
  {
    id: "patch",
    tag: "Operations",
    title: "Keep the OS patched",
    why: "Ubuntu Server installs security updates by itself from the first boot, but it doesn't reboot for a new kernel, so those wait until someone does.",
    do: "Leave <code>unattended-upgrades</code> on. When <code>/var/run/reboot-required</code> exists, reboot in a quiet hour; the relay's containers start again with Docker.",
    tracks: ["vps", "vps-private", "own-public", "own-private"],
    sources: [["Ubuntu: automatic updates", "https://ubuntu.com/server/docs/how-to/software/automatic-updates/"]],
  },
  {
    id: "watch",
    tag: "Operations",
    title: "Watch it from outside",
    why: "A relay can be down for everyone while the server looks fine from the inside. The relay answers <code>/_liveness</code> while it's up.",
    do: "Have a monitor outside your network request <code>/_liveness</code> every minute and alert someone when it fails.",
    private: { do: "Run a monitor on your private network that requests <code>/_liveness</code> every minute and alerts someone when it fails." },
    sources: [["compose.yml health checks", `${GH}/deploy/compose/compose.yml`]],
  },
];

/** A practice as it reads on this track. */
const view = (p: Practice, t: Track) => {
  const o = t === "k8s" || t === "k8s-private" ? p.k8s : isPrivate(t) ? p.private : undefined;
  return {
    title: o?.title ?? p.title,
    why: o?.why ?? p.why,
    do: t === "railway" && p.doRailway ? p.doRailway : (o?.do ?? p.do),
  };
};

/** Two columns that grow on their own, so opening a practice moves only its column. */
const columns = <T>(list: T[]): T[][] => [list.slice(0, Math.ceil(list.length / 2)), list.slice(Math.ceil(list.length / 2))];

export function mountPractices(host: HTMLElement): void {
  host.classList.add("practices");

  const visible = () => {
    const t = trackOf();
    return PRACTICES.filter((p) => !p.tracks || p.tracks.includes(t));
  };

  const render = () => {
    const t = trackOf();
    const list = visible();
    const row = (p: Practice) => {
      const v = view(p, t);
      return `<li class="bp-row" data-id="${p.id}">
        <details class="bp-d">
          <summary><span class="bp-title">${v.title}</span><span class="bp-tag">${p.tag}</span></summary>
          <div class="bp-more">
            <p class="bp-do"><b>Do</b><span>${v.do}</span></p>
            <p class="bp-why">${v.why}</p>
            <p class="bp-src">${p.sources.map(([label, href]) => `<a href="${href}">${label}</a>`).join("")}</p>
          </div>
        </details>
      </li>`;
    };
    host.innerHTML = `<div class="bp-cols">${columns(list).map((col) => `<ol class="bp-grid">${col.map(row).join("")}</ol>`).join("")}</div>`;
  };

  let track = trackOf();
  render();
  onValues(() => {
    if (trackOf() !== track) {
      track = trackOf();
      render();
    }
  });
}
