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
import { join } from "node:path";
import { Marked } from "marked";

export type Track = "vps" | "vps-private" | "own-public" | "own-private" | "practice" | "railway" | "k8s" | "k8s-private";
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
export interface SkillData {
  steps: SkillStep[];
  fixes: SkillFix[];
  ops: SkillOp[];
}

const SERVER: Track[] = ["vps", "own-public"];
const PRIVATE: Track[] = ["vps-private", "own-private"];
const LOCAL: Track[] = ["practice"];
const COMPOSE: Track[] = [...SERVER, ...PRIVATE, ...LOCAL];
const K8S: Track[] = ["k8s", "k8s-private"];
export const TRACKS: Track[] = [...COMPOSE, "railway", ...K8S];

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
  "railway.md": () => ["railway"],
};

/** The skill's shell variables, as the page's panel fills them in. */
const VARS: [RegExp, string][] = [
  [/\$\{TAG#sha-\}/g, "{{COMMIT}}"],
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

function toHTML(markdown: string): string {
  let text = markdown;
  for (const [re, key] of VARS) text = text.replace(re, key);
  // issue references outside code become links
  text = text.replace(/(^|[\s(])block\/buzz#(\d+)/g, "$1[block/buzz#$2](https://github.com/block/buzz/issues/$2)");
  return (md.parse(text) as string)
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
      return [{ id: `${name}-${title.toLowerCase().replace(/\W+/g, "-")}`, title, tracks: rule(modes, false, where), optional: true, html: toHTML(blockMarkdown(b)) }];
    }
    const html = toHTML(blockMarkdown(b));
    if (!title || !html) fail(`${where}: empty title or body`);
    return [{ id: `${name}-${b.num}`, title, tracks: rule(modes, b.num.includes("P"), where), html }];
  });
}

/** SKILL.md's "## 3. Check it" and "## 4. Join": the end of every setup. */
function skillSections(dir: string): SkillStep[] {
  const text = readFileSync(join(dir, "SKILL.md"), "utf8");
  return [...text.matchAll(/^## (\d+)\. (.+)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)]
    .filter((m) => m[1] === "3" || m[1] === "4")
    .map((m) => ({ id: `skill-${m[1]}`, title: m[2].replace(/, for every setup$/, "").trim(), tracks: [...TRACKS], html: toHTML(m[3]) }));
}

/** troubleshooting.md's table. A row's prefix, like `Railway:`, limits it to that setup. */
function fixes(dir: string): SkillFix[] {
  const rows = readFileSync(join(dir, "references", "troubleshooting.md"), "utf8")
    .split("\n")
    .filter((l) => l.startsWith("| ") && !/^\| (Symptom|---)/.test(l));
  return rows.map((row) => {
    const cells = row.slice(2, -2).split(" | ");
    if (cells.length !== 2) fail(`troubleshooting.md: a row without two cells: ${row.slice(0, 60)}`);
    const [symptom, fix] = cells;
    const tracks: Track[] = /^(Railway:|`railway )/.test(symptom)
      ? ["railway"]
      : /^Kubernetes or Compose:/.test(symptom)
        ? [...COMPOSE, ...K8S]
        : /^Kubernetes:/.test(symptom)
          ? K8S
          : /^Private:/.test(symptom)
            ? PRIVATE
            : /^Local:/.test(symptom)
              ? LOCAL
              : [...TRACKS];
    return { tracks, symptom: md.parseInline(symptom) as string, fix: md.parseInline(fix) as string };
  });
}

/** operations.md: a section per setup, a bold-titled bullet per task. */
const OP_SECTIONS: Record<string, Track[]> = { "Docker Compose": COMPOSE, Railway: ["railway"], Kubernetes: K8S };
const OP_KINDS: Record<string, OpKind> = { "add a member": "people", agents: "people", "back up": "backup", restore: "restore", upgrade: "upgrade" };

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
      // the skill's own rule: drop the flag in private and local modes, which the page's {{RUN}} does per setup
      if (name === "Docker Compose") markdown = markdown.replace(/BUZZ_COMPOSE_TLS=true \.\/run\.sh/g, "{{RUN}}");
      out.push({ tracks, kind, title, html: toHTML(markdown) });
    }
    for (const kind of ["people", "backup", "upgrade"] as OpKind[])
      if (!out.some((o) => o.kind === kind && o.tracks === tracks)) fail(`operations.md ${name}: no ${kind} task`);
  }
  return out;
}

export function parseSkill(dir: string): SkillData {
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
  return { steps, fixes: fixes(dir), ops: ops(dir) };
}

// `node build/skill.ts` prints each setup's steps, to see what the page will show
if (import.meta.url === `file://${process.argv[1]}`) {
  const data = parseSkill(join(import.meta.dirname, "../../skills/self-host-buzz"));
  for (const t of TRACKS) {
    const list = data.steps.filter((s) => s.tracks.includes(t));
    console.log(`${t} (${list.length}): ${list.map((s) => `${s.id}${s.optional ? "*" : ""}`).join(" ")}`);
  }
  console.log(`fixes: ${data.fixes.length}`);
  for (const t of TRACKS) console.log(`ops ${t}: ${data.ops.filter((o) => o.tracks.includes(t)).map((o) => `${o.kind}/${o.title}`).join(", ")}`);
}
