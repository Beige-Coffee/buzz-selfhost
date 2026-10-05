# Self-hosting Buzz

An agent skill, a guide and end-to-end tests for running your own [Buzz](https://github.com/block/buzz)
relay: on a VPS, your own hardware, a private Tailscale network, Railway or Kubernetes.

- **Guide:** https://buzz-selfhost.vercel.app
- **Skill:** [`skills/self-host-buzz`](skills/self-host-buzz), in the open [Agent Skills](https://agentskills.io)
  format. Install it into Claude Code, Codex, Goose or another agent:
  ```bash
  npx skills add Beige-Coffee/buzz-selfhost --skill self-host-buzz
  ```
- **Tests:** [`tests/`](tests) runs the skill's commands on real servers, and
  [`tests/runs/`](tests/runs) keeps every recorded run.
- **Site:** [`site/`](site) renders the skill's own steps, so the guide and the skill stay in step.

A test version, not official Block documentation. Licensed under [Apache-2.0](LICENSE).
