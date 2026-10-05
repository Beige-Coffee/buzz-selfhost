/**
 * The setup steps: the skill's own Markdown, parsed at build time (build/skill.ts), so every
 * command and check on the page is what agents read and run. Edit the skill, not this file. Only
 * the first step and the join screen are the page's own.
 */
import skill from "virtual:skill-steps";
import type { Track } from "../lib/values";

export interface StepDef {
  id: string;
  title: string;
  tracks: Track[];
  badge?: string;
  /** the step as HTML, with {{KEYS}} the panel fills in */
  html: string;
  joinMock?: boolean;
}

export interface FixDef {
  tracks: Track[];
  symptom: string;
  fix: string;
}

const ALL: Track[] = ["vps", "vps-private", "own-public", "own-private", "practice", "railway", "k8s", "k8s-private"];

/** The skill's checks run its scripts; an agent already has them, a reader downloads them here. */
const GET_SKILL: StepDef = {
  id: "get-skill",
  title: "Get the skill",
  tracks: ALL,
  html: `<p>These are the skill's own steps, as your agent reads them, with your values from the panel filled in. Where they say "the user", that's you. The checks run the skill's scripts, so download it once:</p>
<pre class="cmd">mkdir -p ~/buzz-skill &amp;&amp; curl -fsSL {{SKILL_ARCHIVE}} | tar -xz -C ~/buzz-skill
SKILL=~/buzz-skill/self-host-buzz</pre>`,
};

export const STEPS: StepDef[] = [
  GET_SKILL,
  ...skill.steps.map((s) => ({ ...s, badge: s.optional ? "Optional" : undefined, joinMock: s.id === "skill-4" })),
];

export const FIXES: FixDef[] = skill.fixes;

/** operations.md's tasks, for the operations cards. */
export const OPS = skill.ops;
