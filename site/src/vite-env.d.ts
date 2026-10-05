/// <reference types="vite/client" />

/** The skill's steps, parsed from its Markdown at build time (build/skill.ts). */
declare module "virtual:skill-steps" {
  const data: import("../build/skill").SkillData;
  export default data;
}
