# Test runs

Every recorded run, newest first. Script runs save their own `.log` here (see [Logs](../README.md#logs)).
Agent runs are cold tests: an agent given only the skill folder sets Buzz up, and its file has the
agent's report on top and every command it ran below.

The scripted runs of Sep 30 and Oct 1 came before logging, so only their pass counts survive, in
[../README.md](../README.md). The agent runs below were copied out of Claude Code's session history
on Oct 5, with secrets masked.

| When (PDT) | Run | Relay version | Result |
|---|---|---|---|
| Oct 5 12:40 | [Goose with DeepSeek: private network, then add a member](2026-10-05-1240-crossagent-goose-deepseek-private-vps.md) | `sha-fd885b5` | Passed in one go, in 8 minutes, all commands on its own server. About $0.23. |
| Oct 5 12:28 | [Codex: private network, then add a member](2026-10-05-1228-crossagent-codex-private-vps.md) | `sha-fd885b5` | Passed, in 10 minutes. Long steps outlived its 30-second command tool; it waited and reran the checks. |
| Oct 5 12:14 | [Private network: first attempts](2026-10-05-1214-crossagent-private-first-attempts.md) | | A runner bug gave both agents an empty server address. Codex stopped and asked; Goose with Gemini used the cloud token on disk and changed a firewall without asking. Gemini then kept stopping after each step. |
| Oct 5 11:57 | [Codex: public VPS, then add a member](2026-10-05-1157-crossagent-codex-public-vps.md) | `sha-7f6ffd5` | Passed, in about 4 minutes. Its two false failures came from running checks alongside their steps. |
| Oct 5 11:57 | [Goose with Gemini: public VPS, then add a member](2026-10-05-1157-crossagent-goose-public-vps.md) | `sha-7f6ffd5` | The install passed; it stopped before the second request and finished it when told to continue. About $0.17. |
| Oct 5 10:43 | [Script: VPS, with phone pairing](2026-10-05-1043-vps-sha-d1b7da4.log) | `sha-d1b7da4`, then `sha-8746bfe` | 85 of 85, through a backup, restore and upgrade. An iPhone then paired and posted. |
| Oct 5 10:43 | [Script: private network, with phone pairing](2026-10-05-1043-private-sha-8746bfe.log) | `sha-8746bfe` | 52 of 52. An iPhone then paired and posted over Tailscale. |
| Oct 1 15:40 | [Final pass: Kubernetes, private network](2026-10-01-1540-agent-final-pass-kubernetes-private-network.md) | `sha-d1b7da4` | Passed. `buzz` was taken on the tailnet, so it used `buzz-team`. |
| Oct 1 15:39 | [Final pass: Kubernetes, public](2026-10-01-1539-agent-final-pass-kubernetes-public.md) | `sha-d1b7da4` | Passed. |
| Oct 1 15:25 | [Final pass: VPS install, backup, upgrade](2026-10-01-1525-agent-final-pass-vps-install-backup-upgrade.md) | `sha-83aab8c`, then `sha-d1b7da4` | Passed. Flagged the owner npub question. |
| Oct 1 15:25 | [Final pass: VPS on a private network](2026-10-01-1525-agent-final-pass-vps-on-private-network.md) | `sha-d1b7da4` | Passed. The auth-key command worked as written. |
| Oct 1 15:25 | [Final pass: Railway, deploy and add a member](2026-10-01-1525-agent-final-pass-railway-deploy-and-member.md) | `sha-788b3c0`, then `sha-d1b7da4` | Passed. Most of its 4.5 hours was waiting on the user. |
| Oct 1 15:25 | [Final pass: local test on a Mac](2026-10-01-1525-agent-final-pass-local-test-on-mac.md) | `sha-d1b7da4` | Passed. Flagged the owner npub question. |
| Oct 1 15:10 | [Railway](2026-10-01-1510-agent-cold-test-railway.md) | `sha-d1b7da4` | Passed, in 4 minutes 15 seconds. |
| Oct 1 14:54 | [Kubernetes, private network](2026-10-01-1454-agent-cold-test-kubernetes-private-network.md) | `sha-d1b7da4` | Passed. Used `buzz-team`. |
| Oct 1 14:11 | [VPS on a private network](2026-10-01-1411-agent-cold-test-private-network-vps.md) | `sha-16839a0` | Passed, with four follow-ups for the user. |
| Oct 1 13:40 | [Back up and upgrade](2026-10-01-1340-agent-cold-test-back-up-and-upgrade.md) | `sha-83aab8c`, then `sha-16839a0` | Passed. |
| Oct 1 13:14 | [Revised skill: public VPS](2026-10-01-1314-agent-validate-revised-skill-public-vps.md) | `sha-83aab8c` | Passed, 5 of 5 checks. |
| Oct 1 13:03 | [Local test on a Mac](2026-10-01-1303-agent-cold-agent-install-local-test-on-mac.md) | `sha-83aab8c` | Passed. |
| Oct 1 13:02 | [Railway](2026-10-01-1302-agent-cold-agent-install-railway.md) | `sha-788b3c0` | Blocked: the Railway account was at its project limit. |
| Oct 1 13:00 | [Kubernetes](2026-10-01-1300-agent-cold-agent-install-kubernetes.md) | `sha-83aab8c` | Passed. |
| Oct 1 12:55 | [Public VPS](2026-10-01-1255-agent-cold-agent-install-public-vps.md) | `sha-83aab8c` | Passed. |
| Sep 30 18:05 | [Kubernetes](2026-09-30-1805-agent-cold-install-on-kubernetes-from-skill.md) | `sha-965fe1d` | Passed. Found gaps around the relay key and backups. |
| Sep 30 18:04 | [Private relay](2026-09-30-1804-agent-cold-install-private-relay-from-skill.md) | `sha-965fe1d` | Passed on the first try. |
| Sep 30 16:15 | [Second public VPS install](2026-09-30-1615-agent-second-cold-install-from-the-skill.md) | `sha-53a1210` | Passed. Found a silent failure in the backup steps. |
| Sep 30 16:00 | [First public VPS install](2026-09-30-1600-agent-cold-install-buzz-from-the-skill.md) | `sha-53a1210` | Passed after three workarounds. |

Each finding went back into the skill. To add new agent runs, see [Logs](../README.md#logs).
