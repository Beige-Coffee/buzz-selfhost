/**
 * The skill's Markdown, parsed into the guide's step-by-step view. The skill folder is the only
 * source: every command and check the page shows is what agents read and run, so the two can't
 * drift. Runs at build time (vite.config.ts) and fails the build when the files stop matching the
 * shape below, instead of quietly dropping steps.
 *
 * The shape, as the reference files write it:
 * - A step starts with `N. **Title.**` (a list item) or `**N. Title.**` (a paragraph). N may carry
 *   a P, as in `2P.` or `P2.`, for the private-network variant.
 * - Backticked modes in the title's parentheses, like (`server`) or (`private` and `local`), limit
 *   a step to those modes. Without them, a step applies to every mode its file covers.
 * - A bold paragraph that isn't a step ends the one before it. It becomes an optional step when
 *   its title carries modes, like **Optional hardening (`server`; …).**, and is skipped otherwise.
 */
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { Marked } from "marked";

export type Track = "vps" | "vps-private" | "own-public" | "own-private" | "practice" | "k8s" | "k8s-private";
export interface SkillStep {
  id: string;
  title: string;
  tracks: Track[];
  optional?: boolean;
  /** the step as HTML, with the skill's shell variables turned into the page's {{KEYS}} */
  html: string;
}
export interface SkillFix {
  tracks: Track[];
  symptom: string;
  fix: string;
}
/** An item from operations.md, as one of the page's operations cards shows it. */
export type OpKind = "people" | "backup" | "restore" | "upgrade";
export interface SkillOp {
  tracks: Track[];
  kind: OpKind;
  title: string;
  html: string;
}
/** A numbered step from agents.md: its bold title, then the rest as HTML, commands included. */
export interface AgentStep {
  title: string;
  html: string;
}
/**
 * agents.md, as the Agents answers in Running your relay show it (src/scenes/agents.ts). The page
 * draws its own pictures and says its own recommendations; the steps, commands, tables and the
 * example instruction come from here, so the page and the skill can't say different things.
 */
export interface SkillAgents {
  /** the example instruction, one sentence a line; the page names what each line is for */
  instruction: string[];
  /** Harness, You need, Runs on */
  harness: [string, string, string][];
  /** keeping an agent answering: a computer that stays on, with Buzz open */
  stayOn: AgentStep[];
  /** an agent on your own server */
  server: AgentStep[];
  /** the messages a client of your own sends: step, what to send */
  messages: [string, string][];
  /** symptom, cause and fix */
  symptoms: [string, string][];
}
export interface SkillData {
  steps: SkillStep[];
  fixes: SkillFix[];
  ops: SkillOp[];
  mobile: { title: string; html: string }[];
  agents: SkillAgents;
  /** where the step-by-step view has a reader download the skill, so its scripts run by that path */
  home: string;
  preparation: string;
  /**
   * the image the skill recommends, from SKILL.md's metadata (`tested-image`, `tested-digest` and
   * `tested-commit`, the block/buzz commit it was built from), and the Helm chart kubernetes.md installs
   */
  pin: { tag: string; digest: string; commit: string; chart: string };
}

const SERVER: Track[] = ["vps", "own-public"];
const PRIVATE: Track[] = ["vps-private", "own-private"];
const LOCAL: Track[] = ["practice"];
const COMPOSE: Track[] = [...SERVER, ...PRIVATE, ...LOCAL];
const K8S: Track[] = ["k8s", "k8s-private"];
export const TRACKS: Track[] = [...COMPOSE, ...K8S];

const fail = (msg: string): never => {
  throw new Error(`skill parser: ${msg}`);
};

/** Which tracks a step belongs to, per file: from its modes, or from whether it's a P step. */
const FILES: Record<string, (modes: string[], p: boolean, where: string) => Track[]> = {
  "compose.md": (modes, p, where) =>
    modes.length
      ? modes.flatMap((m) => ({ server: SERVER, private: PRIVATE, local: LOCAL })[m] ?? fail(`${where}: unknown mode \`${m}\``))
      : p
        ? PRIVATE
        : COMPOSE,
  // the private section replaces the public steps, so a P step is private and a plain one public
  "kubernetes.md": (_modes, p) => (p ? ["k8s-private"] : ["k8s"]),
};

/**
 * The skill's folder on a reader's computer: its first step on the page downloads it here, and the
 * skill's `$SKILL` becomes this path, so its scripts run from any shell.
 */
const HOME = "~/buzz-skill";

/** The skill's shell variables, as the page's panel fills them in. */
const VARS: [RegExp, string][] = [
  [/\$SKILL\b/g, `${HOME}/self-host-buzz`],
  [/\$DIGEST\b/g, "{{DIGEST}}"],
  [/\$COMMIT\b/g, "{{COMMIT}}"],
  [/\$TAG\b/g, "{{TAG}}"],
  [/\$DOMAIN\b/g, "{{DOMAIN}}"],
  [/\$HOST\b/g, "{{HOST}}"],
  [/\$RELAY_URL\b/g, "{{RELAY_URL}}"],
  [/\$ORIGIN\b/g, "{{HTTP_ORIGIN}}"],
  [/\$OWNER_HEX\b/g, "{{OWNER_HEX}}"],
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const md = new Marked({
  gfm: true,
  renderer: {
    // the page's own command style, which gets a copy button
    code({ text, escaped }) {
      return `<pre class="cmd">${escaped ? text : esc(text)}</pre>\n`;
    },
  },
});

/** Keep coverage limits visible; translate internal metadata wording for readers. */
function presentation(markdown: string): string {
  return markdown.replace(/the `tested-image` tag in SKILL\.md's header/g, "the image the skill recommends");
}

/**
 * The site launches with Buzz 1.0 and calls it "Buzz". The skill's notes for Buzz 0.X, older phone
 * apps and bundles from before Silo (2026-10-07) stay in the skill, for agents on older setups, and
 * come out of the text here. A phrase's spaces match any line break, as the skill's Markdown wraps.
 */
const phrase = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"), "g");
// compose.md step 9's edit for bundles from before Silo: a whole list item, its commands included
const MINIO_EDIT = /^ *- \*\*MinIO images\.\*\*[\s\S]*?(?=^ *- \*\*)/m;
const CURRENT: [RegExp, string][] = [
  // compose.md
  [phrase("Up to two edits to tracked files"), "Edits to tracked files"],
  [phrase(" The CORS line also admits Buzz 0.X, which calls the relay's HTTP API from `tauri://localhost` (`http://tauri.localhost` on Windows); without them, joining from Buzz 0.X fails with `Load failed` (block/buzz#2872). Buzz 1.0 makes those calls from the app itself, so CORS doesn't affect it."), ""],
  [phrase("(the file store, Silo or MinIO)"), "(the file store, Silo)"],
  // kubernetes.md
  [phrase(", let Buzz 0.X in (block/buzz#2872; Buzz 1.0 doesn't need it)"), ""],
  // SKILL.md, Check it and Join
  [phrase("lets Buzz 0.X in (CORS), "), ""],
  [phrase(" In Buzz 0.X, paste the same address into its Join a community screen."), ""],
  [phrase("(Settings, Identity in Buzz 1.0)"), "(Settings, Identity)"],
  [phrase(" In Buzz 0.X, the same things are in Settings, Invites."), ""],
  [phrase("`Relay request failed (403)` in Buzz 1.0, or `Not a member yet` in Buzz 0.X, means"), "`Relay request failed (403)` means"],
  [phrase(" (Buzz 0.X: Settings, Mobile)"), ""],
  [phrase(" (older phones show a code to compare instead)"), ""],
  // operations.md
  [phrase("from the Buzz app: in Buzz 1.0, Settings, Identity,"), "from the Buzz app: Settings, Identity,"],
  [phrase('; in Buzz 0.X, the Join screen.'), '.'],
  [phrase(" (Buzz 0.X: Settings, Invites)"), ""],
  [phrase(" or one of Buzz 0.X's"), ""],
  [phrase(" The file store's volume keeps MinIO's name with Silo too, so the commands are the same for every tag."), ""],
  [phrase(" (half a minute when the upgrade swaps MinIO for Silo)"), ""],
  [/\s+From a tag before 2026-10-07 to a later one,[\s\S]*?describes\.\s+Either way, list/g, " List"],
  [phrase(" on a bundle from 2026-10-07 on"), ""],
  // troubleshooting.md
  [phrase("(Buzz 1.0: Settings, Identity)"), "(Settings, Identity)"],
  [phrase("; Buzz 0.X needs it byte for byte"), ""],
  [phrase(", or Buzz 0.X: `Not a member yet`"), ""],
  [phrase(" A local test at `ws://127.0.0.1:3000`, from before compose.md's local mode moved to `wss://localhost`, only takes Buzz 0.X."), ""],
  [phrase(", or Buzz 0.X `WebSocket connection failed: HTTP error: 404 Not Found`"), ""],
  // "Buzz 1.0" is the only Buzz the page covers, so it says "Buzz". A full version, such as 1.0.0, stays.
  [/Buzz 1\.0(?![.\d])/g, "Buzz"],
];
// troubleshooting.md rows that are only about Buzz 0.X, a preview build from before 1.0.0, or a bundle from before Silo
const OLD_ROWS = /^\| (Pull fails for `quay\.io\/minio|Buzz 0\.X can't join|An older Buzz preview:|After an upgrade to a Silo bundle|Docker warns `The requested image's platform)/;
// what the site must never show; a new note in the skill like these needs a rule above
const OLD = /Buzz 0\.X|Buzz 1\.0(?![.\d])|older phones|before 2026-10-07|2026-10-07 on|MinIO for Silo|Silo or MinIO|quay\.io\/minio/;

function current(markdown: string): string {
  return markdown
    .replace(MINIO_EDIT, "")
    .split(/(```[\s\S]*?```)/)
    .map((part, i) => (i % 2 ? part : CURRENT.reduce((t, [re, to]) => t.replace(re, to), part)))
    .join("");
}

/**
 * A link between the skill's files, as the page has them: operations.md is the Running your relay
 * section, troubleshooting.md the step view's "If a step fails" list, compose.md and kubernetes.md the
 * step view itself, and any other file the copy the site serves. `from` is the folder of the file the
 * link is in. Any other Markdown file has no place on the page, so it fails the build.
 */
const PAGE: Record<string, string> = {
  "references/operations.md": "#operations",
  "references/security.md": "#security",
  "references/manual.md": "#commands",
  "references/mobile.md": "#to=fq-tab-notifications&q=notifications",
  "references/troubleshooting.md": "#fixes",
  "references/compose.md": "#commands",
  "references/kubernetes.md": "#commands",
  // agents.md is six answers in Running your relay: the first leads to the others
  "references/agents.md": "#to=fq-tab-agents&q=agents",
  "references/agents.md#run-an-agent-on-your-own-server": "#to=fq-tab-agent-remote&q=agent-remote",
};
function pageLink(href: string, from: string): string {
  if (/^([a-z]+:|#)/.test(href)) return href;
  const path = posix.normalize(posix.join(from, href.replace(/#.*$/, "")));
  // a link to a section that has a place of its own on the page goes there
  const fragment = href.match(/#.+$/)?.[0];
  if (fragment && `${path}${fragment}` in PAGE) return PAGE[`${path}${fragment}`];
  if (path in PAGE) return PAGE[path];
  if (path.endsWith(".md") || path.startsWith("..")) fail(`a link to ${href} from ${from || "SKILL.md"}: add it to PAGE in build/skill.ts`);
  return `skills/self-host-buzz/${path}`;
}
const links = (html: string, from: string) => html.replace(/<a href="([^"]+)"/g, (_, href: string) => `<a href="${pageLink(href, from)}"`);

const vars = (text: string) => VARS.reduce((t, [re, key]) => t.replace(re, key), text);

function toHTML(markdown: string, from: string): string {
  let text = vars(current(presentation(markdown)));
  // issue references outside code become links
  text = text.replace(/(^|[\s(])block\/buzz#(\d+)/g, "$1[block/buzz#$2](https://github.com/block/buzz/issues/$2)");
  return links(md.parse(text) as string, from)
    // a check is "Check:" or "Check, on the server:"; "Check the npub first" is an instruction
    .replace(/<p>Check(?=[:,])/g, '<p class="chk">Check')
    .replace(/<a href="http/g, '<a rel="noopener" href="http')
    .trim();
}

/** "DNS and ports (`server`)." → title "DNS and ports", modes ["server"]. */
function readTitle(raw: string): { title: string; modes: string[] } {
  const modes: string[] = [];
  const title = raw
    .replace(/\s*\(([^)]*)\)/g, (group, inner: string) => {
      const found = [...inner.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      modes.push(...found);
      return found.length ? "" : group;
    })
    .replace(/[.:]\s*$/, "")
    .trim();
  return { title, modes };
}

interface Block {
  kind: "step" | "note";
  num: string;
  titleRaw: string;
  rest: string;
  body: string[];
}

const LIST_STEP = /^(\d+P?)\. \*\*(.+?)\*\*(.*)$/;
const PARA_STEP = /^\*\*(P?\d+)\. (.+?)\*\*(.*)$/;
const NOTE = /^\*\*([^*]+?)\*\*(.*)$/;

function blocks(markdown: string): Block[] {
  const out: Block[] = [];
  let cur: Block | null = null;
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    else if (!fenced) {
      const step = line.match(LIST_STEP) ?? line.match(PARA_STEP);
      const note = step ? null : line.match(NOTE);
      if (step || note || /^#/.test(line)) {
        if (cur) out.push(cur);
        cur = step
          ? { kind: "step", num: step[1], titleRaw: step[2], rest: step[3], body: [] }
          : note
            ? { kind: "note", num: "", titleRaw: note[1], rest: note[2], body: [] }
            : null;
        continue;
      }
    }
    cur?.body.push(line);
  }
  if (cur) out.push(cur);
  return out;
}

/** What follows a bold title, then the lines under it without their list indent. */
function joinRest(restRaw: string, lines: string[], capitalize = false): string {
  let rest = restRaw.trim();
  if (/^[,;]/.test(rest) || capitalize) rest = rest.replace(/^[,;]\s*/, "").replace(/^\w/, (c) => c.toUpperCase());
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length), 99);
  const body = lines.map((l) => l.slice(Math.min(indent, l.match(/^ */)![0].length))).join("\n");
  return `${rest}\n${body}`.trim();
}
const blockMarkdown = (b: Block) => joinRest(b.rest, b.body);

function fileSteps(dir: string, file: string): SkillStep[] {
  const rule = FILES[file];
  const name = file.replace(/\.md$/, "");
  return blocks(readFileSync(join(dir, "references", file), "utf8")).flatMap((b): SkillStep[] => {
    const { title, modes } = readTitle(b.titleRaw);
    const where = `${file} ${b.num || title}`;
    if (b.kind === "note") {
      if (!modes.length) return [];
      return [{ id: `${name}-${title.toLowerCase().replace(/\W+/g, "-")}`, title, tracks: rule(modes, false, where), optional: true, html: toHTML(blockMarkdown(b), "references") }];
    }
    const html = toHTML(blockMarkdown(b), "references");
    if (!title || !html) fail(`${where}: empty title or body`);
    return [{ id: `${name}-${b.num}`, title, tracks: rule(modes, b.num.includes("P"), where), html }];
  });
}

/** SKILL.md's "## 3. Check it" and "## 4. Join": the end of every setup. */
function skillSections(dir: string): SkillStep[] {
  const text = readFileSync(join(dir, "SKILL.md"), "utf8");
  return [...text.matchAll(/^## (\d+)\. (.+)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)]
    .filter((m) => m[1] === "3" || m[1] === "4")
    .map((m) => ({ id: `skill-${m[1]}`, title: m[2].replace(/, for every setup$/, "").trim(), tracks: [...TRACKS], html: toHTML(m[3], "") }));
}

/** troubleshooting.md's table. A row's prefix, like `Kubernetes:`, limits it to that setup. */
function fixes(dir: string): SkillFix[] {
  const rows = readFileSync(join(dir, "references", "troubleshooting.md"), "utf8")
    .split("\n")
    .filter((l) => l.startsWith("| ") && !/^\| (Symptom|---)/.test(l) && !OLD_ROWS.test(l));
  return rows.map((row) => {
    const cells = row.slice(2, -2).split(" | ");
    if (cells.length !== 2) fail(`troubleshooting.md: a row without two cells: ${row.slice(0, 60)}`);
    const [symptom, fix] = cells;
    const tracks: Track[] = /^Kubernetes or Compose:/.test(symptom)
      ? [...TRACKS]
      : /^Kubernetes:/.test(symptom)
        ? K8S
        : /^Private:/.test(symptom)
          ? PRIVATE
          : /^Local:/.test(symptom)
            ? LOCAL
            : /^Own hardware, public:/.test(symptom)
              ? (["own-public"] as Track[])
              : [...TRACKS];
    const inline = (cell: string) => links(md.parseInline(vars(current(presentation(cell)))) as string, "references");
    return { tracks, symptom: inline(symptom), fix: inline(fix) };
  });
}

/** operations.md: a section per setup, a bold-titled bullet per task. */
const OP_SECTIONS: Record<string, Track[]> = { "Docker Compose": COMPOSE, Kubernetes: K8S };
const OP_KINDS: Record<string, OpKind> = { "add a member": "people", "local agents": "people", "back up": "backup", restore: "restore", upgrade: "upgrade" };

function ops(dir: string): SkillOp[] {
  const text = readFileSync(join(dir, "references", "operations.md"), "utf8");
  const out: SkillOp[] = [];
  for (const sec of text.matchAll(/^## (.+)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)) {
    const name = sec[1].trim();
    const tracks = OP_SECTIONS[name] ?? fail(`operations.md: unknown section "${name}"`);
    for (const item of sec[2].split(/\n(?=- )/).filter((b) => b.startsWith("- "))) {
      const head = item.match(/^- \*\*(.+?)\*\*(.*)/) ?? fail(`operations.md ${name}: a bullet without a bold title: ${item.slice(0, 50)}`);
      const title = head[1].replace(/[.:]\s*$/, "").trim();
      const kind = OP_KINDS[title.toLowerCase()] ?? fail(`operations.md ${name}: unknown task "${title}"`);
      let markdown = joinRest(head[2], item.split("\n").slice(1), true);
      // the skill's own rule: drop the flag in private mode, which the page's {{RUN}} does per setup
      if (name === "Docker Compose") markdown = markdown.replace(/BUZZ_COMPOSE_TLS=true \.\/run\.sh/g, "{{RUN}}");
      out.push({ tracks, kind, title, html: toHTML(markdown, "references") });
    }
    for (const kind of ["people", "backup", "upgrade"] as OpKind[])
      if (!out.some((o) => o.kind === kind && o.tracks === tracks)) fail(`operations.md ${name}: no ${kind} task`);
  }
  return out;
}

/**
 * The reference sections the page places by name: mobile.md's, which the phones answer shows or
 * folds by title (src/scenes/faq.ts). A rename or a move there is an edit here and in the scene.
 */
const SECTIONS: Record<string, string[]> = {
  "mobile.md": ["Use Block's gateway", "Turn notifications on", "Pair a phone", "Test with the phone locked", "What Block and Apple see", "Android", "Run your own gateway"],
};

/** Reader-facing reference sections share their source with the installed skill. */
function referenceSections(dir: string, file: string): { title: string; html: string }[] {
  const text = readFileSync(join(dir, "references", file), "utf8");
  const sections = [...text.matchAll(/^## (.+)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)]
    .map((s) => ({ title: s[1].trim(), html: toHTML(s[2], "references") }));
  const titles = sections.map((s) => s.title).join(" | ");
  if (titles !== SECTIONS[file].join(" | ")) fail(`${file}: the page expects the sections "${SECTIONS[file].join(" | ")}", and found "${titles}"`);
  return sections;
}

/**
 * The Security section states two practices in its own words and links to security.md for the rest
 * (src/scenes/security.ts). Each of its claims rests on one of these sentences, so if the skill stops
 * saying one, the build stops until the page is changed to match.
 */
const SECURITY_SAYS = [
  "with no sandbox and no approval prompts",
  "give agents a machine of their own",
  "share there only what you would publish",
  "Any member can read an open channel",
  "A private community needs the same care with less urgency",
];
function securityClaims(dir: string): void {
  const text = readFileSync(join(dir, "references", "security.md"), "utf8").replace(/\s+/g, " ");
  for (const claim of SECURITY_SAYS) if (!text.includes(claim)) fail(`security.md no longer says "${claim}", which the Security section rests on: change src/scenes/security.ts to match, then SECURITY_SAYS in build/skill.ts`);
}

/**
 * agents.md's sections, by title, as the Agents answers place them (src/scenes/agents.ts). The
 * answers' own words rest on the sentences in AGENTS_SAYS, so if the skill stops saying one, the
 * build stops until the page is changed to match.
 */
const AGENT_SECTIONS = [
  "Tell an agent its job",
  "Pick a harness and model",
  "Keep an agent answering",
  "Run an agent on your own server",
  "The messages",
  "When it shows as a person, or never answers",
];
const AGENTS_SAYS = [
  "They don't give it tools, logins or permissions",
  "neither it nor Block's help and support pages recommend one over another",
  "A local agent answers only while Buzz is open on its computer and that computer is awake",
  "Buzz 1.0 has no built-in way to do this",
  "A bot added as a member with no proof on its profile shows as a person",
  "It has no expiry",
  "has no way to revoke one",
  "It isn't tied to one community either",
  "the owner's own Buzz agents take requests from it",
  "Removing the owner from the community cut off all of the owner's agents in the test",
  "It answers only its owner unless started with `--respond-to anyone` or an allowlist",
  "Buzz shows it as an agent, with no owner, and nothing it does acts for you",
  "it keeps messages to the channel brief",
];
/** A Markdown table's rows, header and rule left out, as inline HTML cells. */
function tableRows(markdown: string, cells: number, where: string): string[][] {
  // the header row, then the rule row (|---|), then the rows
  const rows = markdown.split("\n").filter((l) => l.startsWith("|")).slice(1).filter((l) => !/^\|[\s|:-]+\|$/.test(l));
  if (!rows.length) fail(`${where}: no table`);
  return rows.map((row) => {
    const out = row.slice(2, -2).split(" | ");
    if (out.length !== cells) fail(`${where}: a row without ${cells} cells: ${row.slice(0, 60)}`);
    return out.map((cell) => links(md.parseInline(vars(current(presentation(cell)))) as string, "references"));
  });
}
function agents(dir: string): SkillAgents {
  const text = readFileSync(join(dir, "references", "agents.md"), "utf8");
  const said = text.replace(/\s+/g, " ");
  for (const claim of AGENTS_SAYS) if (!said.includes(claim)) fail(`agents.md no longer says "${claim}", which the Agents answers rest on: change src/scenes/agents.ts to match, then AGENTS_SAYS in build/skill.ts`);
  const sections = new Map([...text.matchAll(/^## (.+)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)].map((s) => [s[1].trim(), s[2]]));
  if ([...sections.keys()].join(" | ") !== AGENT_SECTIONS.join(" | ")) fail(`agents.md: the page expects the sections "${AGENT_SECTIONS.join(" | ")}", and found "${[...sections.keys()].join(" | ")}"`);
  const section = (title: string) => sections.get(title)!;
  const numbered = (title: string, count: number): AgentStep[] => {
    const out = blocks(section(title))
      .filter((b) => b.kind === "step")
      .map((b) => ({ title: md.parseInline(readTitle(b.titleRaw).title) as string, html: toHTML(blockMarkdown(b), "references") }));
    if (out.length !== count) fail(`agents.md "${title}": the page shows ${count} numbered steps, and found ${out.length}`);
    return out;
  };
  // the page names what each line of the example is for, so it needs exactly these five
  const example = section("Tell an agent its job").match(/```text\n([\s\S]*?)```/)?.[1].trim().split("\n") ?? fail('agents.md "Tell an agent its job": no ```text example');
  if (example.length !== 5) fail(`agents.md: the example instruction has ${example.length} lines, and the page labels five`);
  return {
    instruction: example,
    harness: tableRows(section("Pick a harness and model"), 3, "agents.md harness table") as [string, string, string][],
    stayOn: numbered("Keep an agent answering", 4),
    server: numbered("Run an agent on your own server", 7),
    messages: tableRows(section("The messages"), 2, "agents.md messages table") as [string, string][],
    symptoms: tableRows(section("When it shows as a person, or never answers"), 2, "agents.md symptoms table") as [string, string][],
  };
}

export function parseSkill(dir: string): SkillData {
  securityClaims(dir);
  const steps = [...Object.keys(FILES).flatMap((f) => fileSteps(dir, f)), ...skillSections(dir)];
  const ids = new Set<string>();
  for (const s of steps) {
    if (ids.has(s.id)) fail(`two steps with the id ${s.id}`);
    ids.add(s.id);
  }
  if (steps.filter((s) => s.id.startsWith("skill-")).length !== 2) fail("SKILL.md lost section 3 or 4");
  for (const t of TRACKS) {
    const n = steps.filter((s) => s.tracks.includes(t)).length;
    if (n < 5) fail(`only ${n} steps for ${t}`);
  }
  const meta = (key: string) => readFileSync(join(dir, "SKILL.md"), "utf8").match(new RegExp(`^  ${key}: *"?([^"\\s]+)"?$`, "m"))?.[1];
  const tag = meta("tested-image");
  const digest = meta("tested-digest");
  const commit = meta("tested-commit");
  if (!tag || !digest) fail("SKILL.md's metadata needs tested-image and tested-digest: every setup installs that image");
  // a release tag such as 0.3.0 doesn't name its commit, so the bundle's checkout comes from here
  if (!commit || !/^[0-9a-f]{40}$/.test(commit)) fail("SKILL.md's metadata needs tested-commit, the 40-character block/buzz commit tested-image was built from");
  if (/^sha-/.test(tag!) && !commit!.startsWith(tag!.slice(4))) fail(`tested-commit ${commit} is not the commit ${tag} names`);
  // every chart version kubernetes.md and operations.md name must be the same one
  const charts = new Set(
    ["kubernetes.md", "operations.md"].flatMap((f) => [...readFileSync(join(dir, "references", f), "utf8").matchAll(/charts\/buzz --version (\S+)/g)].map((m) => m[1])),
  );
  if (charts.size !== 1) fail(`the skill installs ${charts.size ? [...charts].join(" and ") : "no"} chart version: the page shows one`);
  const chart = [...charts][0];
  const data = { steps, fixes: fixes(dir), ops: ops(dir), mobile: referenceSections(dir, "mobile.md"), agents: agents(dir), home: HOME, preparation: toHTML(readFileSync(join(dir, "references", "manual.md"), "utf8").replace(/^# .*\n/, ""), "references"), pin: { tag: tag!, digest: digest!, commit: commit!, chart } };
  const agentText = [...data.agents.stayOn, ...data.agents.server].map((x) => x.html).concat(data.agents.instruction, data.agents.harness.flat(), data.agents.messages.flat(), data.agents.symptoms.flat());
  for (const text of [...data.steps.map((x) => x.html), ...data.ops.map((x) => x.html), ...data.fixes.flatMap((x) => [x.symptom, x.fix]), ...agentText]) {
    const old = text.match(OLD);
    if (old) fail(`the site would show "${old[0]}": add a rule to CURRENT in build/skill.ts (${text.replace(/<[^>]+>/g, "").slice(0, 80)})`);
  }
  return data;
}

// `node build/skill.ts` prints each setup's steps, to see what the page will show
if (import.meta.url === `file://${process.argv[1]}`) {
  const data = parseSkill(join(import.meta.dirname, "../../skills/self-host-buzz"));
  for (const t of TRACKS) {
    const list = data.steps.filter((s) => s.tracks.includes(t));
    console.log(`${t} (${list.length}): ${list.map((s) => `${s.id}${s.optional ? "*" : ""}`).join(" ")}`);
  }
  console.log(`fixes: ${data.fixes.length}`);
  console.log(`pin: ${data.pin.tag}@${data.pin.digest}`);
  console.log(`commit: ${data.pin.commit}`);
  console.log(`chart: ${data.pin.chart}`);
  for (const t of TRACKS) console.log(`ops ${t}: ${data.ops.filter((o) => o.tracks.includes(t)).map((o) => `${o.kind}/${o.title}`).join(", ")}`);
  const a = data.agents;
  console.log(`agents: ${a.instruction.length} instruction lines, ${a.harness.length} harnesses, ${a.stayOn.length} stay-on steps, ${a.server.length} server steps, ${a.messages.length} messages, ${a.symptoms.length} symptoms`);
}
