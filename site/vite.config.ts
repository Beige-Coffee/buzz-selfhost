import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { parseSkill } from "./build/skill";

/**
 * The agent skill, served from its one source so the page and the install command get the tested
 * files: every file under skills/self-host-buzz, plus the folder as one archive to install with.
 */
const SKILLS = fileURLToPath(new URL("../skills", import.meta.url));
const DIR = join(SKILLS, "self-host-buzz");
const ARCHIVE = "skills/self-host-buzz.tar.gz";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    if (name.startsWith(".") || name === "__pycache__") return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

/** The folder as a gzipped tar, unpacking to self-host-buzz/ with the scripts' modes kept. */
const archive = () =>
  execFileSync("tar", ["-czf", "-", "--exclude", ".*", "--exclude", "__pycache__", "-C", SKILLS, "self-host-buzz"], {
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });

const TYPES: Record<string, string> = { md: "text/markdown", py: "text/x-python", sh: "text/x-shellscript" };

/** The step-by-step view, parsed from the same files (build/skill.ts). */
const STEPS_ID = "virtual:skill-steps";

function skillFiles(): Plugin {
  return {
    name: "skill-files",
    resolveId(id) {
      return id === STEPS_ID ? `\0${STEPS_ID}` : undefined;
    },
    load(id) {
      return id === `\0${STEPS_ID}` ? `export default ${JSON.stringify(parseSkill(DIR))};` : undefined;
    },
    // an edit to the skill re-parses it and reloads the page
    handleHotUpdate({ file, server }) {
      if (!file.startsWith(DIR)) return;
      const mod = server.moduleGraph.getModuleById(`\0${STEPS_ID}`);
      if (mod) server.moduleGraph.invalidateModule(mod);
      server.ws.send({ type: "full-reload" });
      return [];
    },
    configureServer(server) {
      server.watcher.add(DIR);
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (url === `/${ARCHIVE}`) {
          res.setHeader("Content-Type", "application/gzip");
          res.setHeader("Cache-Control", "no-store");
          res.end(archive());
          return;
        }
        const path = files(DIR).find((f) => url === `/skills/${relative(SKILLS, f)}`);
        if (!path) return next();
        res.setHeader("Content-Type", `${TYPES[path.split(".").pop() ?? ""] ?? "text/plain"}; charset=utf-8`);
        res.setHeader("Cache-Control", "no-store");
        res.end(readFileSync(path));
      });
    },
    generateBundle() {
      for (const f of files(DIR)) this.emitFile({ type: "asset", fileName: `skills/${relative(SKILLS, f)}`, source: readFileSync(f) });
      this.emitFile({ type: "asset", fileName: ARCHIVE, source: archive() });
    },
  };
}

export default defineConfig({
  base: "./",
  server: { port: 5186, strictPort: true },
  plugins: [skillFiles()],
});
