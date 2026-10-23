# Test runs

Every recorded run, newest first. Script runs save their own `.log` here (see [Logs](../README.md#logs)).
Agent runs are cold tests: an agent given only the skill folder sets Buzz up, and its file has the
agent's report on top and every command it ran below.

The scripted runs of Sep 30 and Oct 1 came before logging, so only their pass counts survive, in
[../README.md](../README.md). The agent runs below were copied out of Claude Code's session history
on Oct 5, with secrets masked.

| When (PDT) | Run | Relay version | Result |
|---|---|---|---|
| Oct 23 14:25 | [Railway: Block's template, deployed from the CLI](2026-10-23-1425-railway-template-check.md) | `sha-788b3c0`, then `sha-9e8c9fc` | The template still deploys, and every railway.md check passed. check-relay.sh failed only channel labels (`nip-cl`) on the template's image, and passed every line after the image update. $0.0002, then the project was deleted. |
| Oct 23 12:10 | [Script: local test at https://localhost, left running](2026-10-23-1210-local-sha-e8781ca.log) | `sha-e8781ca` | 51 of 51, then left running with a 7-day invite link, to join from Buzz 1.0 once the Mac trusts the local authority. |
| Oct 23 12:08 | [Script: local test at https://localhost on a Mac](2026-10-23-1208-local-sha-e8781ca.log) | `sha-e8781ca` | 52 of 52: Caddy's local authority, check-relay.sh with `CA_FILE`, the live connection with NIP-42, files, an invite link and a chat's label, then the skill's removal commands. |
| Oct 23 12:02 | [Script: VPS, a fresh install with Buzz 1.0's checks](2026-10-23-1202-vps-sha-e8781ca.log) | `sha-e8781ca` | 101 of 101, through a backup, a restore and an upgrade. An agent admitted through its owner posted in a chat that named it, without being added; the partition audit said `ok`. |
| Oct 23 11:54 | [Script: VPS, an upgrade from sha-30873ba to sha-e8781ca](2026-10-23-1154-vps-sha-30873ba.log) | `sha-30873ba`, then `sha-e8781ca` | 119 of 119. Channel labels, which Buzz 1.0's New chat needs, came with the upgrade; the partition audit said `degraded`, as expected from an image before 2026-10-20. |
| Oct 12 16:36 | [Script: VPS, an upgrade from MinIO to Silo, then going back by hand](2026-10-12-1636-vps-sha-9c6fa14.log) | `sha-9c6fa14`, then `sha-30873ba` | 108 of 108. Silo took over the MinIO volume: no object went missing, a file from before read back intact, and new uploads worked. The pre-upgrade backup then restored onto the old tag. |
| Oct 12 16:30 | [Script: VPS on a Silo bundle](2026-10-12-1630-vps-sha-30873ba.log) | `sha-30873ba` | 91 of 91, through a backup, a restore and an upgrade. Invite links worked. |
| Oct 12 16:23 | [Script: VPS, MinIO to Silo, first try](2026-10-12-1623-vps-sha-9c6fa14.log) | `sha-9c6fa14`, then `sha-30873ba` | 107 of 108: every upgrade check passed; a parse check of the test's own failed on a pipe race, fixed and rerun. |
| Oct 12 16:14 | [Script: VPS on a Silo bundle, first try, then a new owner by hand](2026-10-12-1614-vps-sha-30873ba.log) | `sha-30873ba` | 90 of 91: the test's file check picked a `_meta` record, fixed and rerun. By hand: a new `RELAY_OWNER_PUBKEY` became the owner and the old owner an admin. |
| Oct 12 15:50 | [Script, then by hand: the Umbrel package's two address options](2026-10-12-1550-umbrel-two-address-options.log) | `sha-16eb0b6` | Own domain 19 of 19; free Tailscale address 17 of 17 with a restart. The owner signed in to Tailscale, turned Funnel on, and joined from Desktop and a phone. |
| Oct 12 14:50 | [Script: the Umbrel package on ARM, in Docker Desktop on an Apple Silicon Mac](2026-10-12-1450-umbrel-arm64-mac.log) | `sha-16eb0b6` | 19 of 19, with umbrelOS's arm64 image and the relay's arm64 image. |
| Oct 12 14:05 | [Script: the Umbrel package on umbrelOS 1.7.4](2026-10-12-1405-umbrel-os-1.7.log) | `sha-16eb0b6` | 19 of 19, beside the 2.0 install on the same droplet. |
| Oct 12 13:50 | [Script: updating the Umbrel package through Umbrel](2026-10-12-1350-umbrel-update.log) | `sha-16eb0b6`, then `sha-30873ba` | 12 of 12: the message, the file, the settings and the member survived. |
| Oct 12 13:05 | [Script, then by hand: the Umbrel package with Buzz Desktop and a phone](2026-10-12-1305-umbrel-desktop-and-phone.log) | `sha-16eb0b6` | 19 of 19 on a fresh server, after an install-script fix. The owner joined from Desktop, added a member from Invites, and paired an iPhone; all posted. |
| Oct 9 14:30 | [Script: the Umbrel package on umbrelOS 2.0, through a Cloudflare quick tunnel](2026-10-09-1430-umbrel-cloudflare-quick-tunnel.log) | `sha-16eb0b6` | Passed: setup through the app's page, the relay checks, members, a file, and a restart through Umbrel. The first run's member checks failed on a script bug, fixed and rerun. |
| Oct 6 09:40 | [A brand-new user: DigitalOcean, a real domain, a non-root user](2026-10-06-0940-newcomer-digitalocean-real-domain.md) | `sha-9c6fa14` | Passed on the server in 7 minutes; the user's computer had the domain's old address cached. |
| Oct 5 13:08 | [Script: Kubernetes, with phone pairing](2026-10-05-1308-k8s-sha-fd885b5.log) | `sha-fd885b5` | 23 of 23, the pairing service reached at `/pair` through a second ingress. |
| Oct 5 12:50 | [Railway: phone pairing](2026-10-05-1250-railway-pairing.md) | `sha-fd885b5` | Passed, with the pairing service as a fifth service. Its start command had to be set outside the CLI. |
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
