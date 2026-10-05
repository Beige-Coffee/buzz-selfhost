# Run Your Own Buzz (guide site)

An interactive, single-page guide to self-hosting a Buzz relay. White page, Buzz chartreuse as the accent. It opens with a scroll-driven story (one pinned drawing of a mini Buzz app: Block-hosted, then self-hosted, then where the data lives, then the app dissolving into its source). Then a picker for a VPS, Railway or your own hardware; the pick rebuilds the rest of the page as that path's guide, with the values panel pinned beside the steps on wide screens.

```bash
npm install
npm run dev     # http://localhost:5186
npm run build   # static output in dist/
```

- `index.html`: all prose; blocks with `data-tracks` show only for those paths. `src/scenes/`: `story.ts` (the scroll story), `paths.ts` (the picker), `decide.ts` ("Weigh the tradeoffs": six questions, a live ranking of all seven setups with reasons, and a best fit with its tradeoffs and runner-up; the rules live in `src/data/decide.ts`), `practices.ts` (best practices, each with sources), `panel.ts`, `setup.ts`, `joinmock.ts`, `buzzapp.ts`; `retired/` holds earlier widgets, excluded from the build. Styles: `src/styles/main.css` (older stylesheets in `styles/retired/`). `src/lib/values.ts`: the chosen path and the reader's values (npub to hex, templating).
- `src/data/steps.ts`: the setup steps per track as data: commands, checks, failure fixes. Tracks: `vps` and `vps-private`, `own-public`, `own-private` and `practice`, `railway`, and `k8s`. A path (VPS, Railway, your hardware, Kubernetes) plus who can reach it (public, Tailscale only, or practice) picks the track.
- Page order: hero, the story (`#how`), Limits (`#not-yet`, before anyone picks a path), where to run it, the guide, Day two, best practices, footer. `src/lib/nav.ts` is the header's section nav: it appears once the headline scrolls away, follows the section being read, and lands jumps on each section's label. `src/lib/permalink.ts` adds copy-a-link buttons to section headings and steps; a step link (`#path=vps&to=step-clone`) opens that path's step-by-step guide at that step.
- Two ways through the guide, switched at the top of the guide and of Day two (`scenes/mode.ts`): **With an agent** (the default) and **Step by step**. Agent mode (`scenes/agent.ts`, content in `src/data/agent.ts`) installs the `self-host-buzz` skill, fills a prompt from the panel, and replays what a run looks like. Blocks with class `mode-agent` or `mode-steps` show in one mode only.
- The skill is served from its one source, `../skills/self-host-buzz/SKILL.md`, at `skills/self-host-buzz/SKILL.md` (a small plugin in `vite.config.ts`: a dev middleware, and a copy in `dist/`). The install command and the in-page viewer both use that path, so the page always hands out the file that was tested.
- Design tokens, stepper and base styles are copied from `~/code/buzz-changes` (itself from `~/code/buzz-edu`).
- Every command and expected output on the page was run end to end on 2026-09-30 (see `../tests/README.md`). Steps that weren't say so on the page: the Railway custom domain, Docker Desktop on a Mac, and the Buzz Desktop join. After changing a command, rerun `../tests/smoke.sh`.
- Facts are pinned to block/buzz main at commit 53a1210 (2026-09-30). Re-check the MinIO workaround (block/buzz#7880, #7875) before publishing.
