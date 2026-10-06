# Working in buzz-selfhost

A guide site, an agent skill and end-to-end tests for self-hosting Buzz
([block/buzz](https://github.com/block/buzz)). Read this first, then the doc for your task.

## Layout

- `skills/self-host-buzz/`: the skill, in the open [Agent Skills](https://agentskills.io) format.
  It's the source of truth for every command and check.
- `site/`: the guide at https://buzz-selfhost.vercel.app (Vite and vanilla TypeScript).
  `site/build/skill.ts` parses the skill's Markdown at build time, so the site's step-by-step view
  is the skill itself: change commands in the skill, never in the site.
- `tests/`: smoke tests that run the skill's commands on real servers. `tests/runs/` keeps every
  run, script and agent, with secrets masked; `tests/README.md` has the results by date.
- [`docs/decisions.md`](docs/decisions.md): what was decided for the site and the skill, and why.
- [`docs/research.md`](docs/research.md): what the tests, the agent runs and the upstream research
  found, including the open Buzz issues the site links to.

## Build, check, deploy

- Site: `cd site && npm install && npm run build`. Preview with the `buzz-selfhost` launch
  configuration (port 5186).
- Skill: `node site/build/skill.ts` (from `site/`) confirms the site can still parse it and prints
  the steps per setup; the build fails if the skill's shape breaks. Validate the skill against the
  standard with `skills-ref validate skills/self-host-buzz`.
- Deploy: `cd site && npm run deploy` builds locally and uploads to Vercel (Vercel's own build
  can't see `../skills`). Only when the repo owner asks.
- Tests need real servers, keys and money: never run them unless asked. `tests/README.md` says how.

## Rules

- Public text, on the site and in the skill: no em dashes, and avoid filler such as "just" and
  "simply". Short, plain sentences. The site is minimalist: a white page with a chartreuse accent.
- This repo is public. Commit no secrets, keys, email addresses, tailnet names or internal company
  details. `python3 tests/lib/redact.py --private` masks them in logs.
- Never print a secret. The skill's rule 1 applies to you too.
- Ask before anything that costs money, publishes, deploys or changes an account.
- Two agents at once: split by folder (`site/` for one, `skills/` and `tests/` for the other), and
  give the second its own git worktree (`git worktree add ../buzz-selfhost-<name> <branch>`).
  Never switch branches in a folder another agent is using.
- Commit messages end with the co-author line your harness asks for. Commit signing is off for
  this repo.
